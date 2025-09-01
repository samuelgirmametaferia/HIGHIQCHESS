// GPUutil.js
// Lightweight WebGPU compute helper for iterative per-element transforms.
// Exports:
// - supportsWebGPU(): boolean
// - computeIterative(inputFloat32Array, { iterations, workgroupSize }) => { result: Float32Array, timeMs, backend }
// - runDemo(): example runner that logs timings
//
// Notes: If WebGPU is unavailable, a CPU fallback runs the same iterative kernel.

// ...long helpful comments to make this file pleasantly verbose for reading and tinkering...

export async function supportsWebGPU(){
    return typeof navigator !== 'undefined' && !!navigator.gpu;
}

// Check for WebGL2 + float render target support
export async function supportsWebGL(){
    try{
        if(typeof document === 'undefined') return false;
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2');
        if(!gl) return false;
        const ext = gl.getExtension('EXT_color_buffer_float');
        if(!ext) return false;
        return true;
    }catch(e){ return false; }
}

// Combined initializer that reports availability of WebGPU and WebGL, useful for diagnostics UI
export async function initGPUEnvironment(){
    const out = { webgpu: null, webgl: null, prefer: null };
    try{
        const wgpu = await initWebGPU();
        out.webgpu = wgpu;
        if(wgpu && wgpu.ok) out.prefer = 'webgpu';
    }catch(e){ out.webgpu = { ok: false, error: e && e.message ? e.message : String(e) }; }
    try{
        const wglOk = await supportsWebGL();
        out.webgl = { ok: !!wglOk };
        if(!out.prefer && wglOk) out.prefer = 'webgl';
    }catch(e){ out.webgl = { ok: false, error: e && e.message ? e.message : String(e) }; }
    if(!out.prefer) out.prefer = 'cpu';
    return out;
}

async function initAdapterDevice(){
    if(!navigator || !navigator.gpu) throw new Error('WebGPU not supported in this environment');
    // cache adapter/device for repeated calls
    if(initAdapterDevice._cached && initAdapterDevice._cached.device) return initAdapterDevice._cached;
    const tried = [];
    const diag = { navigatorGpu: !!navigator.gpu, userAgent: (navigator && navigator.userAgent) ? navigator.userAgent : 'unknown', platform: (navigator && navigator.platform) ? navigator.platform : 'unknown' };
    const prefs = [ { powerPreference: 'high-performance' }, { powerPreference: 'low-power' }, {} ];
    let lastErr = null;
    for(const opt of prefs){
        try{
            tried.push(opt);
            const adapter = await navigator.gpu.requestAdapter(opt);
            if(!adapter){ lastErr = new Error('requestAdapter returned null for options: '+JSON.stringify(opt)); continue; }
            // if we got an adapter, request a device
            try{
                const device = await adapter.requestDevice();
                const cached = { adapter, device, queue: device.queue, tried, diag };
                initAdapterDevice._cached = cached;
                return cached;
            }catch(devErr){ lastErr = devErr; continue; }
        }catch(err){ lastErr = err; continue; }
    }
    // nothing worked
    const msg = lastErr ? (lastErr.message || String(lastErr)) : 'No available adapters.';
    const e = new Error('Failed to get GPU adapter. ' + msg + ' (tried: ' + JSON.stringify(tried) + ')');
    e.diagnostics = diag;
    e.tried = tried;
    throw e;
}

// convenience initializer to warm and cache the adapter/device
export async function initWebGPU(){
    try{
    const r = await initAdapterDevice();
    return { ok: true, backend: 'webgpu', adapter: !!r.adapter, details: { tried: r.tried || [], diag: r.diag || null } };
    }catch(err){
    // include diagnostics when available
    const out = { ok: false, error: err && err.message ? err.message : String(err) };
    if(err && err.diagnostics) out.diagnostics = err.diagnostics;
    if(err && err.tried) out.tried = err.tried;
    return out;
    }
}

// Build WGSL shader for iterative per-element computation. It reads and writes a storage buffer
// containing f32 data and uses a uniform buffer to get length and iteration count.
function buildShaderWGSL(workgroupSize){
    return `
struct Uniforms { n : u32; iters : u32; };
@group(0) @binding(1) var<uniform> uniforms : Uniforms;

struct Data { numbers: array<f32>; };
@group(0) @binding(0) var<storage, read_write> data : Data;

@compute @workgroup_size(${workgroupSize})
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let idx : u32 = gid.x;
  if (idx >= uniforms.n) { return; }
  var v : f32 = data.numbers[idx];
  // iterate the tiny kernel 'iters' times; this is deliberately simple but demonstrates looping
  var i : u32 = 0u;
  loop {
    if (i >= uniforms.iters) { break; }
    // a small non-linear transform mixing multiply and sin to be non-trivial
    v = v * 0.97 + sin(v) * 0.03;
    i = i + 1u;
  }
  data.numbers[idx] = v;
}
`;
}

// CPU fallback kernel: performs identical iterations in JS.
function cpuIterate(input, iterations){
    const out = new Float32Array(input.length);
    for(let i=0;i<input.length;i++){
        let v = input[i];
        for(let it=0; it<iterations; it++){
            v = v * 0.97 + Math.sin(v) * 0.03;
        }
        out[i] = v;
    }
    return out;
}

// WebGL2 fallback: perform iterative per-element compute using a ping-pong fragment shader.
async function runWebGLCompute(arr, iterations){
    if(typeof document === 'undefined') throw new Error('No DOM available for WebGL');
    const n = arr.length;
    // create offscreen canvas
    const canvas = document.createElement('canvas');
    // size textures to hold n elements in RGBA texels (store value in R channel)
    const texW = Math.ceil(Math.sqrt(n));
    const texH = Math.ceil(n / texW);
    canvas.width = texW; canvas.height = texH;
    const gl = canvas.getContext('webgl2');
    if(!gl) throw new Error('WebGL2 not available');
    // require float render/read support
    if(!gl.getExtension('EXT_color_buffer_float')) throw new Error('EXT_color_buffer_float not supported');

    function compileShader(type, src){
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)){
            const msg = gl.getShaderInfoLog(s);
            gl.deleteShader(s);
            throw new Error('Shader compile failed: '+msg);
        }
        return s;
    }

    const vs = `#version 300 es
    in vec2 a_pos;
    out vec2 v_uv;
    void main(){ v_uv = (a_pos + 1.0) * 0.5; gl_Position = vec4(a_pos,0.0,1.0); }
    `;
    const fs = `#version 300 es
    precision highp float;
    uniform sampler2D u_tex;
    in vec2 v_uv;
    out vec4 outColor;
    void main(){
        float v = texture(u_tex, v_uv).r;
        v = v * 0.97 + sin(v) * 0.03;
        outColor = vec4(v, 0.0, 0.0, 1.0);
    }
    `;
    const prog = gl.createProgram();
    const s1 = compileShader(gl.VERTEX_SHADER, vs);
    const s2 = compileShader(gl.FRAGMENT_SHADER, fs);
    gl.attachShader(prog, s1); gl.attachShader(prog, s2); gl.linkProgram(prog);
    if(!gl.getProgramParameter(prog, gl.LINK_STATUS)){
        const msg = gl.getProgramInfoLog(prog);
        throw new Error('Program link failed: '+msg);
    }
    // quad
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const posBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    const posData = new Float32Array([-1,-1, 1,-1, -1,1, 1,1]);
    gl.bufferData(gl.ARRAY_BUFFER, posData, gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    // prepare textures
    function createTex(){
        const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, texW, texH, 0, gl.RGBA, gl.FLOAT, null);
        return t;
    }
    const texA = createTex();
    const texB = createTex();
    // upload initial data into texA (RGBA, store value in R)
    const buf = new Float32Array(texW * texH * 4);
    for(let i=0;i<n;i++){ buf[i*4] = arr[i]; buf[i*4+1]=0; buf[i*4+2]=0; buf[i*4+3]=1; }
    gl.bindTexture(gl.TEXTURE_2D, texA);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0,0, texW, texH, gl.RGBA, gl.FLOAT, buf);

    const fbo = gl.createFramebuffer();
    const start = performance.now();
    let src = texA, dst = texB;
    gl.viewport(0,0,texW,texH);
    gl.useProgram(prog);
    const uTexLoc = gl.getUniformLocation(prog, 'u_tex');
    for(let it=0; it<iterations; it++){
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, dst, 0);
        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if(status !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Framebuffer incomplete: '+status);
        // bind src to unit 0
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src);
        gl.uniform1i(uTexLoc, 0);
        gl.bindVertexArray(vao);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        // swap
        const ttmp = src; src = dst; dst = ttmp;
    }
    // read back from src (contains latest)
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, src, 0);
    const readBuf = new Float32Array(texW * texH * 4);
    gl.readPixels(0,0,texW,texH, gl.RGBA, gl.FLOAT, readBuf);
    const end = performance.now();
    // extract first n R values
    const out = new Float32Array(n);
    for(let i=0;i<n;i++) out[i] = readBuf[i*4];
    // checksum
    let checksum = 0.0; for(let i=0;i<out.length;i++) checksum += out[i];
    return { result: out, timeMs: end - start, backend: 'webgl', checksum };
}

// Main entry: computeIterative
// input: Float32Array or array-like numbers
// opts: { iterations = 20, workgroupSize = 64, device (optional) }
export async function computeIterative(input, opts = {}){
    const iterations = typeof opts.iterations === 'number' ? opts.iterations : 20;
    const workgroupSize = typeof opts.workgroupSize === 'number' ? opts.workgroupSize : 64;
    const arr = (input instanceof Float32Array) ? input : new Float32Array(input);
    const n = arr.length;
    const forcedBackend = typeof opts.backend === 'string' ? opts.backend.toLowerCase() : null;

    // If caller requested a forced backend, honour it
    if(forcedBackend === 'cpu'){
        const start = performance.now();
        const res = cpuIterate(arr, iterations);
        const end = performance.now();
        let checksum = 0.0; for(let i=0;i<res.length;i++) checksum += res[i];
        return { result: res, timeMs: end - start, backend: 'cpu-forced', checksum };
    }
    if(forcedBackend === 'webgl'){
        try{
            return await runWebGLCompute(arr, iterations);
        }catch(e){
            // if forced but fails, fall back to CPU
            console.warn('Forced WebGL failed, falling back to CPU:', e && e.message ? e.message : e);
            const start = performance.now();
            const res = cpuIterate(arr, iterations);
            const end = performance.now();
            let checksum = 0.0; for(let i=0;i<res.length;i++) checksum += res[i];
            return { result: res, timeMs: end - start, backend: 'cpu-fallback', checksum };
        }
    }
    if(forcedBackend === 'webgpu'){
        if(!(typeof navigator !== 'undefined' && navigator.gpu)){
            throw new Error('WebGPU not available to force');
        }
        // otherwise proceed to regular WebGPU path below
    }

    // Try WebGPU
    if(typeof navigator !== 'undefined' && navigator.gpu){
        try{
            const start = performance.now();
            const { device, queue } = opts.device ? { device: opts.device, queue: opts.device.queue } : await initAdapterDevice();

            // create storage buffer (read_write)
            const bytes = arr.byteLength;
            const storageBuffer = device.createBuffer({
                size: bytes,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
            });

            // upload initial data
            queue.writeBuffer(storageBuffer, 0, arr.buffer, arr.byteOffset, arr.byteLength);

            // uniform buffer for n and iterations (two u32 = 8 bytes, align to 16 for safety)
            const uniformBuf = device.createBuffer({
                size: 16,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            const uniformArray = new Uint32Array([n, iterations]);
            // create an ArrayBuffer of 16 bytes and set first 8 bytes
            const ubuf = new ArrayBuffer(16);
            new Uint32Array(ubuf).set(uniformArray, 0);
            queue.writeBuffer(uniformBuf, 0, ubuf);

            // shader & pipeline
            const shaderCode = buildShaderWGSL(workgroupSize);
            const module = device.createShaderModule({ code: shaderCode });
            const pipeline = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'main' } });

            // bind group
            const bindGroup = device.createBindGroup({
                layout: pipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: storageBuffer } },
                    { binding: 1, resource: { buffer: uniformBuf } }
                ]
            });

            // command encoder, compute pass
            const encoder = device.createCommandEncoder();
            const pass = encoder.beginComputePass();
            pass.setPipeline(pipeline);
            pass.setBindGroup(0, bindGroup);
            const x = Math.ceil(n / workgroupSize);
            pass.dispatchWorkgroups(x);
            pass.end();

            // copy result to a read buffer
            const readBuffer = device.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
            encoder.copyBufferToBuffer(storageBuffer, 0, readBuffer, 0, bytes);
            const commands = encoder.finish();
            queue.submit([commands]);

            // ensure submitted work completes before measuring
            if(device && typeof device.queue !== 'undefined' && device.queue.onSubmittedWorkDone){
                try{ await device.queue.onSubmittedWorkDone(); }catch(e){}
            }

            // map and read
            await readBuffer.mapAsync(GPUMapMode.READ);
            const mapped = readBuffer.getMappedRange();
            const result = new Float32Array(mapped.slice(0));
            readBuffer.unmap();
            const end = performance.now();
            // simple checksum: sum of all elements (float32)
            let checksum = 0.0;
            for(let i=0;i<result.length;i++) checksum += result[i];
            return { result, timeMs: end - start, backend: 'webgpu', checksum };
        }catch(err){
            // try WebGL fallback, then CPU
            console.warn('WebGPU compute failed, trying WebGL fallback then CPU if needed:', err.message || err);
            try{
                const webglRes = await runWebGLCompute(arr, iterations);
                return webglRes;
            }catch(wglErr){
                console.warn('WebGL fallback failed, falling back to CPU compute:', wglErr && wglErr.message ? wglErr.message : wglErr);
                const start = performance.now();
                const res = cpuIterate(arr, iterations);
                const end = performance.now();
                // checksum for CPU fallback
                let checksum = 0.0;
                for(let i=0;i<res.length;i++) checksum += res[i];
                return { result: res, timeMs: end - start, backend: 'cpu-fallback', checksum };
            }
        }
    }else{
        // no WebGPU: try WebGL then CPU
    try{
        const webgl = await runWebGLCompute(arr, iterations);
        return webgl;
    }catch(wglErr){
        const start = performance.now();
        const res = cpuIterate(arr, iterations);
        const end = performance.now();
        let checksum = 0.0;
        for(let i=0;i<res.length;i++) checksum += res[i];
        return { result: res, timeMs: end - start, backend: 'cpu', checksum };
    }
    }
}

// Convenience demo runner: generates data, runs computeIterative, logs timings and a small checksum.
export async function runDemo({ size = 1024*64, iterations = 20, workgroupSize = 64 } = {}){
    const data = new Float32Array(size);
    for(let i=0;i<size;i++) data[i] = Math.sin(i) * 0.5 + (i % 7) * 0.13;
    console.log(`GPUutil.runDemo: running size=${size}, iterations=${iterations}, wg=${workgroupSize}`);
    const res = await computeIterative(data, { iterations, workgroupSize });
    // tiny checksum
    let sum = 0.0;
    for(let i=0;i<res.result.length;i+=Math.max(1, Math.floor(res.result.length/16))){ sum += res.result[i]; }
    console.log(`backend=${res.backend} time=${res.timeMs.toFixed(2)}ms checksum=${sum.toFixed(6)}`);
    return res;
}

// End of GPUutil.js
