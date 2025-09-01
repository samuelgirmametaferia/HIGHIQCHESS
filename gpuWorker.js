// gpuWorker.js (module worker)
// This worker receives a message { id, size, iterations, workgroupSize }
// It constructs the input buffer, runs computeIterative from GPUutil, and
// posts back { id, success, backend, timeMs, checksum, result: ArrayBuffer }

import { computeIterative } from './GPUutil.js';

self.addEventListener('message', async (ev) => {
  const data = ev.data;
  const id = data && data.id;
  if(!data || typeof id === 'undefined') return;
  try{
    const size = Math.max(0, Number(data.size) || 0);
    const iterations = Math.max(1, Number(data.iterations) || 20);
    const workgroupSize = Math.max(1, Number(data.workgroupSize) || 64);

    // build input array
    const arr = new Float32Array(size);
    for(let i=0;i<size;i++) arr[i] = Math.sin(i) * 0.5 + (i % 7) * 0.13;

    const res = await computeIterative(arr, { iterations, workgroupSize });

    // ensure result is an ArrayBuffer we can transfer
    let buffer = null;
    if(res && res.result && res.result.buffer){
      buffer = res.result.buffer;
    } else if(res && Array.isArray(res.result)){
      buffer = (new Float32Array(res.result)).buffer;
    }

    self.postMessage({ id, success: true, backend: res.backend, timeMs: res.timeMs, checksum: res.checksum, result: buffer }, buffer ? [buffer] : []);
  }catch(err){
    self.postMessage({ id, success: false, error: err && err.message ? err.message : String(err) });
  }
});
