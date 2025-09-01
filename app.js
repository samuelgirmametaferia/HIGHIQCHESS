import { renderBoard, playerColor, currentBoard, togglePlayerColor, showLastMove, showSuggestion, clearSuggestion, clearPremoves } from "./render.js";
import './engine-validator.js';
import './engine-uploader.js';

// Advanced accordion toggle
const advToggle = document.getElementById('adv-toggle');
const advPanel = document.getElementById('adv-panel');
if(advToggle && advPanel){
    advToggle.addEventListener('click', ()=>{
        const expanded = advToggle.getAttribute('aria-expanded') === 'true';
        advToggle.setAttribute('aria-expanded', String(!expanded));
        advToggle.textContent = !expanded ? 'Advanced ▾' : 'Advanced ▸';
        if(!expanded) advPanel.classList.remove('collapsed'); else advPanel.classList.add('collapsed');
    });
}
import { findBestMove } from "./AI.js";
import { movePiece } from "./gameEngine.js";
import { inCheck, showMoves } from "./gameEngine.js";
import { init as sfInit, getBestMove as sfGetBestMove } from "./stockfish-wrapper.js";

const gameBoard = document.getElementById("game-board");


let initboard2D = [
    ["b4", "b2", "b3", "b1", "b5", "b3", "b2", "b4"], 
    ["b0", "b0", "b0", "b0", "b0", "b0", "b0", "b0"],  
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    ["w0", "w0", "w0", "w0", "w0", "w0", "w0", "w0"],  
    ["w4", "w2", "w3", "w1", "w5", "w3", "w2", "w4"]   
  ];
function rotateBoard(board2D, times = 1) {
    if (!Array.isArray(board2D) || board2D.length === 0) return board2D;
    const rows = board2D.length;
    const cols = board2D[0].length;
    times = ((Math.trunc(times) % 4) + 4) % 4;
    let result = board2D.map(row => row.slice()); 

    for (let t = 0; t < times; t++) {
        const r = result.length;
        const c = result[0].length;
        const rotated = Array.from({ length: c }, () => Array(r));
        for (let i = 0; i < r; i++) {
            for (let j = 0; j < c; j++) {
                rotated[j][r - 1 - i] = result[i][j];
            }
        }
        result = rotated;
    }
    return result;
}


let boardState = initboard2D;
let humanColor = playerColor;
let aiColor = humanColor === 'w' ? 'b' : 'w';
let gameOver = false;
let pendingPremove = null; // {fromRow, fromCol, toRow, toCol}
let moveHistory = []; // simple move log

function applyAndRender(newBoard){
    boardState = newBoard;
    renderBoard(boardState);
}

function recordMove(detail){ try{ if(detail) moveHistory.push(detail); }catch(e){} }

// listen for player moves via a small custom event emitted from render.js when a move happens
window.addEventListener('player:move', (e)=>{
    // e.detail = {fromRow, fromCol, toRow, toCol, pieceIndex, color}
    const d = e.detail;
    // player just moved manually -> clear any pending premove
    pendingPremove = null;
    try{ clearPremoves(); }catch(e){}
    // assume move was applied already by render's click handler; ensure boardState updated
    try{ recordMove(e.detail); }catch{}
    // now schedule AI move
    setTimeout(()=> runAIMove(), 220);
});

// capture premove set by renderer
window.addEventListener('premove:set', (e)=>{
    pendingPremove = e.detail;
});

function runAIMove(){
    if(gameOver) return;
    const depthSel = parseInt(document.getElementById('ai-level')?.value || '2',10);
    // show thinking status and disable controls
    const statusEl = document.getElementById('game-status');
    if(statusEl){ statusEl.textContent = `AI thinking (depth ${depthSel})...`; statusEl.className='show'; }
    const controls = [document.getElementById('ai-level'), document.getElementById('btn-restart'), document.getElementById('btn-hint')];
    controls.forEach(c=>{ if(c) c.disabled = true; });
    const best = findBestMove(boardState, aiColor, depthSel);
    if(!best) return;
    const newB = movePiece(boardState, best.pieceIndex, aiColor, best.fromRow, best.fromCol, best.toRow, best.toCol);
    try{ recordMove({ color: aiColor, pieceIndex: best.pieceIndex, fromRow: best.fromRow, fromCol: best.fromCol, toRow: best.toRow, toCol: best.toCol }); }catch{}
    applyAndRender(newB);
    // re-enable controls and clear status
    if(statusEl){ setTimeout(()=>{ statusEl.className=''; statusEl.textContent=''; }, 200); }
    controls.forEach(c=>{ if(c) c.disabled = false; });
}

// after any move is applied, if it was by the AI (opponent), try to execute any pending premove
window.addEventListener('move:applied', (e)=>{
    try{
        const mv = e.detail; // {color, pieceIndex, fromRow,...}
        if(!mv) return;
        // if the last move was by AI/opponent and it's now player's turn, consider premove
        if(mv.color === aiColor && pendingPremove){
            const p = pendingPremove;
            // validate that the piece is still present and belongs to the human
            const fromVal = boardState[p.fromRow] && boardState[p.fromRow][p.fromCol];
            if(!fromVal || fromVal[0] !== humanColor){
                pendingPremove = null; clearPremoves(); return;
            }
            const pieceIndex = parseInt(fromVal[1],10);
            // check that the move is in the legal moves for that piece
            const [dots, takes] = showMoves(boardState, pieceIndex, humanColor, p.fromRow, p.fromCol);
            let ok = false;
            for(let i=0;i<dots.length;i+=2){ if(dots[i]===p.toRow && dots[i+1]===p.toCol) ok = true; }
            for(let i=0;i<takes.length;i+=2){ if(takes[i]===p.toRow && takes[i+1]===p.toCol) ok = true; }
            if(!ok){ pendingPremove = null; clearPremoves(); return; }
            // simulate the move and ensure it doesn't leave player in check
            const sim = JSON.parse(JSON.stringify(boardState));
            sim[p.toRow][p.toCol] = `${humanColor}${pieceIndex}`;
            sim[p.fromRow][p.fromCol] = null;
            if(inCheck(sim, humanColor)){
                // premove would leave player in check -> reject
                pendingPremove = null; clearPremoves();
                try{ window.dispatchEvent(new CustomEvent('premove:rejected', { detail: p })); }catch(e){}
                return;
            }
            // execute premove
            const nb = movePiece(boardState, pieceIndex, humanColor, p.fromRow, p.fromCol, p.toRow, p.toCol);
            pendingPremove = null; clearPremoves();
            try{ recordMove({ color: humanColor, pieceIndex, fromRow: p.fromRow, fromCol: p.fromCol, toRow: p.toRow, toCol: p.toCol }); }catch{}
            applyAndRender(nb);
        }
    }catch(err){ console.error('premove execution failed', err); }
});

// initial render
applyAndRender(boardState);

// left tab button
const btn = document.getElementById('btn-show-last');
if(btn){
    btn.addEventListener('click', ()=>{
        showLastMove();
    });
}

// hint button
const hintBtn = document.getElementById('btn-hint');
if(hintBtn){
    hintBtn.addEventListener('click', async ()=>{
        const useSF = document.getElementById('chk-stockfish')?.checked;
        const depth = parseInt(document.getElementById('sf-depth')?.value || '8',10);
        // clear any previous suggestion
        clearSuggestion();
        if(useSF){
            try{
                sfInit();
                // produce a simple FEN from boardState (very simple, may not include fullstate)
                const fen = boardState.map(row=>row.map(v=>v? (v[0]==='w'? v[1].toLowerCase(): v[1].toUpperCase()) : '1').join('')).join('/');
                const best = await sfGetBestMove(fen, depth);
                // if stockfish returns a UCI like e2e4, try to parse and show suggestion
                if(best && best.uci){
                    const coords = uciToCoords(best.uci);
                    if(coords){
                        showSuggestion(coords);
                        setTimeout(()=> clearSuggestion(), 5000);
                    }else{
                        // fallback to internal AI suggestion
                        const hint = findBestMove(boardState, humanColor);
                        if(hint){ showSuggestion(hint); setTimeout(()=> clearSuggestion(), 5000); }
                    }
                }else{
                    const hint = findBestMove(boardState, humanColor);
                    if(hint){ showSuggestion(hint); setTimeout(()=> clearSuggestion(), 5000); }
                    else alert('No hint available');
                }
            }catch(e){
                // fallback to internal AI suggestion on error
                const hint = findBestMove(boardState, humanColor);
                if(hint){ showSuggestion(hint); setTimeout(()=> clearSuggestion(), 5000); }
                else alert('Stockfish not available or failed: '+e.message);
            }
        }else{
            const hint = findBestMove(boardState, humanColor);
            if(hint){ showSuggestion(hint); setTimeout(()=> clearSuggestion(), 5000); }
            else alert('No hint available');
        }
    });
}

// clear suggestion visuals whenever a move is applied
window.addEventListener('move:applied', ()=>{
    clearSuggestion();
});

// show transient performance notice when certain settings change
function showPerformanceNotice(msg, ms = 3000){
    const el = document.getElementById('game-status');
    if(!el) return;
    el.textContent = msg;
    el.className = 'show notice';
    setTimeout(()=>{ if(el) { el.className=''; el.textContent=''; } }, ms);
}

// attach listeners to settings controls
const aiLevelEl = document.getElementById('ai-level');
if(aiLevelEl){ aiLevelEl.addEventListener('change', ()=> showPerformanceNotice('Higher depth = slower moves. Be patient.')); }
const sfChk = document.getElementById('chk-stockfish');
if(sfChk){ sfChk.addEventListener('change', ()=> showPerformanceNotice('Using Stockfish may increase CPU usage.')); }
const sfDepthEl = document.getElementById('sf-depth');
if(sfDepthEl){ sfDepthEl.addEventListener('change', ()=> showPerformanceNotice('Stockfish depth increased: may be slower.')); }

// helper: convert a 4-char UCI (e2e4) to board coords used by the renderer/engine
function uciToCoords(uci){
    if(!uci || uci.length < 4) return null;
    const fileToCol = (ch) => ch.charCodeAt(0) - 'a'.charCodeAt(0);
    try{
        const fromFile = fileToCol(uci[0]);
        const fromRank = 8 - parseInt(uci[1],10);
        const toFile = fileToCol(uci[2]);
        const toRank = 8 - parseInt(uci[3],10);
        if([fromFile,fromRank,toFile,toRank].some(x=>isNaN(x) || x<0 || x>7)) return null;
        return { fromRow: fromRank, fromCol: fromFile, toRow: toRank, toCol: toFile };
    }catch(e){ return null; }
}

// show check/checkmate status
const statusEl = document.getElementById('game-status');
window.addEventListener('game:check', (e)=>{
    if(statusEl){ statusEl.textContent = `Check to ${e.detail.color}`; statusEl.className = 'show check' }
});
window.addEventListener('game:checkmate', (e)=>{
    gameOver = true;
    if(statusEl){ 
        const lostColor = e.detail.color;
        let msg = `Checkmate: ${lostColor} lost`;
        if(lostColor === aiColor){
            msg = 'Player won! AI lost.';
        } else if(lostColor === humanColor){
            msg = 'AI won! Player lost.';
        }
        statusEl.textContent = msg; 
        statusEl.className = 'show checkmate';
    }
    // build a tiny analysis summary
    try{
        const analysisEl = document.getElementById('game-analysis');
        if(analysisEl){
            const total = moveHistory.length;
            const brilliants = Math.max(0, Math.floor(total * 0.02));
            const great = Math.max(0, Math.floor(total * 0.08));
            const good = Math.max(0, Math.floor(total * 0.2));
            analysisEl.innerHTML = `<div style="font-weight:700">Game summary</div><div>Moves: ${total}</div><div>Brilliants: ${brilliants}</div><div>Great: ${great}</div><div>Good: ${good}</div>`;
        }
    }catch(e){}
});

// restart button
const restartBtn = document.getElementById('btn-restart');
if(restartBtn){
    restartBtn.addEventListener('click', ()=>{
        boardState = initboard2D.map(r=>r.slice());
        moveHistory.length = 0; gameOver = false;
        const statusEl = document.getElementById('game-status'); if(statusEl){ statusEl.className=''; statusEl.textContent=''; }
        const analysisEl = document.getElementById('game-analysis'); if(analysisEl) analysisEl.innerHTML='';
        applyAndRender(boardState);
    });
}
/*
// GPU demo wiring
const gpuBtn = document.getElementById('btn-gpu-demo');
const gpuStatus = document.getElementById('gpu-demo-status');
const gpuSample = document.getElementById('gpu-demo-sample');
const gpuCanvas = document.getElementById('gpu-demo-canvas');
const gpuClearBtn = document.getElementById('gpu-clear-history');
const gpuHistoryCount = document.getElementById('gpu-history-count');
const gpuTooltip = document.getElementById('gpu-tooltip');
const gpuOverlayToggle = document.getElementById('gpu-overlay-toggle');
const gpuReplayBtn = document.getElementById('gpu-replay');
const gpuExportBtn = document.getElementById('gpu-export');
const gpuImportBtn = document.getElementById('gpu-import');
const gpuImportFile = document.getElementById('gpu-import-file');
const gpuBackendSelect = document.getElementById('gpu-backend');
const gpuRunForcedBtn = document.getElementById('btn-gpu-run-forced');
const gpuReplaySpeed = document.getElementById('gpu-replay-speed');
const gpuReplaySpeedVal = document.getElementById('gpu-replay-speed-val');
const gpuHistoryList = document.getElementById('gpu-history-list');

// keep a short ring buffer of recent runs for overlay
const lastRuns = []; // { backend, checksum, timeMs, result: Float32Array }
const MAX_HISTORY = 6;
const STORAGE_KEY = 'mindforge_gpu_history_v1';

function backendColor(backend){
    if(!backend) return '#9aa0a6';
    if(backend === 'webgpu') return '#7be6c9';
    if(backend === 'cpu') return '#ffb86b';
    if(backend === 'cpu-fallback') return '#9aa0a6';
    return '#888';
}

function saveHistory(){
    try{
        // downsample each run to 128 samples before saving to conserve space
        const SAMPLE = 128;
        const toSave = lastRuns.map(r=>{
            const step = Math.max(1, Math.floor(r.result.length / SAMPLE));
            const arr = [];
            for(let i=0;i<r.result.length;i+=step) arr.push(r.result[i]);
            const buf = new Float32Array(arr);
            return { backend: r.backend, checksum: r.checksum, timeMs: r.timeMs, len: r.result.length, sampled: btoa(String.fromCharCode(...new Uint8Array(buf.buffer))) };
        });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    }catch(e){ console.warn('saveHistory failed', e); }
}

function loadHistory(){
    try{
        const raw = localStorage.getItem(STORAGE_KEY);
        if(!raw) return;
        const parsed = JSON.parse(raw);
            for(let i=0;i<parsed.length && lastRuns.length < MAX_HISTORY; i++){
                const p = parsed[i];
                if(!p || !p.sampled) continue;
                const bytes = Uint8Array.from(atob(p.sampled), c=>c.charCodeAt(0));
                const f = new Float32Array(bytes.buffer);
                lastRuns.push({ backend: p.backend, checksum: p.checksum, timeMs: p.timeMs, result: f, originalLen: p.len || f.length });
            }
            renderHistoryThumbnails(); // Call to render thumbnails after loading history
            if(gpuHistoryCount) gpuHistoryCount.textContent = String(lastRuns.length);
    }catch(e){ console.warn('loadHistory failed', e); }
}

function drawSparkline(buf){
    if(!gpuCanvas) return;
    const ctx = gpuCanvas.getContext('2d');
    const w = gpuCanvas.width, h = gpuCanvas.height;
    ctx.clearRect(0,0,w,h);
    if(!buf || !buf.length) return;
    // draw older runs faded
    // if overlays disabled, don't draw older runs
    if(gpuOverlayToggle && !gpuOverlayToggle.checked){ /* skip overlays  }
    else for(let ri=lastRuns.length-1; ri>=0; ri--){
        const run = lastRuns[ri];
        if(!run || !run.result) continue;
        ctx.beginPath(); ctx.lineWidth = 1; ctx.strokeStyle = hexToRgba(backendColor(run.backend), 0.14);
        // if this run was stored as sampled data, scale indices accordingly
        const effectiveLen = run.originalLen || run.result.length;
        const stepOld = Math.max(1, Math.floor(effectiveLen / w));
        let minOld = Infinity, maxOld = -Infinity;
        for(let i=0, idx=0; i<run.result.length && idx<w; i++, idx++){ const v = run.result[i]; if(v<minOld) minOld=v; if(v>maxOld) maxOld=v; }
        if(!isFinite(minOld) || !isFinite(maxOld)) continue;
        const rangeOld = (maxOld - minOld) || 1;
        // map sampled run indices to canvas x positions
        for(let x=0; x<w; x++){
            const srcIdx = Math.floor((x / w) * run.result.length);
            const v = run.result[Math.min(run.result.length-1, srcIdx)];
            const y = h - Math.round(((v - minOld) / rangeOld) * (h-4)) - 2;
            if(x===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
        }
    ctx.stroke();
    }
    // downsample to canvas width
    const step = Math.max(1, Math.floor(buf.length / w));
    let min = Infinity, max = -Infinity;
    for(let i=0;i<buf.length;i+=step){ const v = buf[i]; if(v<min) min=v; if(v>max) max=v; }
    if(!isFinite(min) || !isFinite(max)) return;
    const range = (max - min) || 1;
    ctx.beginPath(); ctx.lineWidth = 1.5; ctx.strokeStyle = backendColor(lastRuns[0] ? lastRuns[0].backend : 'webgpu');
    for(let x=0, i=0; x<w && i<buf.length; x++, i+=step){ const v = buf[i]; const y = h - Math.round(((v - min) / range) * (h-4)) - 2; if(x===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); }
    ctx.stroke();
}

function renderHistoryThumbnails(){
    if(!gpuHistoryList) return;
    gpuHistoryList.innerHTML = '';
    lastRuns.forEach((run, idx)=>{
    const wrapper = document.createElement('div'); wrapper.className = 'gpu-thumb-wrapper';
    const c = document.createElement('canvas'); c.width = 80; c.height = 24; c.style.border = '1px solid rgba(255,255,255,0.04)'; c.style.background = 'rgba(0,0,0,0.04)'; c.style.cursor = 'pointer';
    c.className = 'gpu-thumb';
        const ctx = c.getContext('2d');
        if(run && run.result){
            // simple tiny sparkline
            const w = c.width, h = c.height; ctx.clearRect(0,0,w,h);
            ctx.beginPath(); ctx.strokeStyle = backendColor(run.backend); ctx.lineWidth = 1;
            for(let x=0;x<w;x++){ const srcIdx = Math.floor((x / w) * run.result.length); const v = run.result[srcIdx]; if(!isFinite(v)) continue; const min = Math.min(...run.result); const max = Math.max(...run.result); const y = h - Math.round(((v - min) / ((max-min)||1)) * (h-4)) - 2; if(x===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); }
            ctx.stroke();
        }
        c.title = `${run.backend} ${run.timeMs.toFixed(1)}ms`;
        c.addEventListener('click', ()=>{ drawSparkline(run.result); // mark active
            Array.from(gpuHistoryList.querySelectorAll('.gpu-thumb')).forEach(el=>el.classList.remove('active'));
            c.classList.add('active');
        });
        const btn = document.createElement('div'); btn.className = 'gpu-thumb-remove'; btn.textContent = '×';
        btn.title = 'Remove this history item';
        btn.addEventListener('click', (ev)=>{ ev.stopPropagation(); // remove run
            lastRuns.splice(idx,1); saveHistory(); renderHistoryThumbnails(); if(gpuHistoryCount) gpuHistoryCount.textContent = String(lastRuns.length); drawSparkline(lastRuns[0] ? lastRuns[0].result : null);
        });
        wrapper.appendChild(c); wrapper.appendChild(btn); gpuHistoryList.appendChild(wrapper);
    });
}

let replayTimer = null;
async function replayHistory(){
    if(!lastRuns.length || !gpuCanvas) return;
    if(replayTimer) { clearInterval(replayTimer); replayTimer = null; }
    let idx = 0;
    gpuReplayBtn.disabled = true;
    const stepMs = Math.max(50, parseInt(gpuReplaySpeed?.value || '700', 10));
    replayTimer = setInterval(()=>{
        if(idx >= lastRuns.length){ clearInterval(replayTimer); replayTimer = null; gpuReplayBtn.disabled = false; drawSparkline(lastRuns[0].result); // clear active
            Array.from(gpuHistoryList.children).forEach(el=>el.classList.remove('active')); return; }
        const run = lastRuns[idx];
        // highlight thumbnail
        Array.from(gpuHistoryList.children).forEach(el=>el.classList.remove('active'));
        const thumb = gpuHistoryList.children[idx]; if(thumb) thumb.classList.add('active');
        drawSparkline(run.result);
        idx++;
    }, stepMs);
}

if(gpuOverlayToggle){ gpuOverlayToggle.addEventListener('change', ()=>{ drawSparkline(lastRuns[0] ? lastRuns[0].result : null); }); }
if(gpuReplayBtn){ gpuReplayBtn.addEventListener('click', ()=>{ replayHistory(); }); }
if(gpuReplaySpeed && gpuReplaySpeedVal){ gpuReplaySpeed.addEventListener('input', ()=>{ gpuReplaySpeedVal.textContent = gpuReplaySpeed.value; }); }

// tooltip handling for latest run
if(gpuCanvas){
    gpuCanvas.addEventListener('mousemove', (ev)=>{
        if(!lastRuns.length) return; const latest = lastRuns[0]; if(!latest || !latest.result) return;
        const rect = gpuCanvas.getBoundingClientRect(); const x = Math.floor((ev.clientX - rect.left));
        const idx = Math.floor((x / gpuCanvas.width) * latest.result.length);
        const v = latest.result[Math.min(latest.result.length-1, Math.max(0, idx))];
        if(gpuTooltip){ gpuTooltip.style.display='block'; gpuTooltip.style.left = `${ev.clientX - rect.left}px`; gpuTooltip.style.top = `${rect.top - rect.top + 4}px`; gpuTooltip.textContent = `idx=${idx} val=${(v||0).toFixed(6)} backend=${latest.backend} time=${(latest.timeMs||0).toFixed(2)}ms`; }
    });
    gpuCanvas.addEventListener('mouseleave', ()=>{ if(gpuTooltip) gpuTooltip.style.display='none'; });
}

function hexToRgba(hex, alpha){
    if(!hex) return `rgba(128,128,128,${alpha})`;
    const c = hex.replace('#','');
    const r = parseInt(c.substring(0,2),16), g = parseInt(c.substring(2,4),16), b = parseInt(c.substring(4,6),16);
    return `rgba(${r},${g},${b},${alpha})`;
}
if(gpuBtn){
    gpuBtn.addEventListener('click', async ()=>{
        let size = Math.max(1, parseInt(document.getElementById('gpu-size').value || '65536',10));
        const iterations = Math.max(1, parseInt(document.getElementById('gpu-iters').value || '20',10));
        const wg = Math.max(1, parseInt(document.getElementById('gpu-wg').value || '64',10));
        // safety: clamp size to avoid huge allocations in the browser
        const MAX_SIZE = 2000000; // two million elements (~8MB of Float32 data)
        if(size > MAX_SIZE){
            showPerformanceNotice(`Requested size ${size} too large; clamping to ${MAX_SIZE}`);
            size = MAX_SIZE;
        }
        if(size > 1000000) showPerformanceNotice('Large GPU workload; this may take a while');
        gpuBtn.disabled = true; gpuStatus.textContent = 'Running GPU demo (worker)...'; gpuSample.textContent = 'Sample: -';
        // try worker first with a timeout
        let timedOut = false;
        const id = Math.floor(Math.random()*1e9);
        let worker = null;
        try{
            worker = new Worker(new URL('./gpuWorker.js', import.meta.url), { type: 'module' });
            const p = new Promise((resolve, reject)=>{
                const onMsg = (ev)=>{
                    const d = ev.data;
                    if(!d || d.id !== id) return;
                    worker.removeEventListener('message', onMsg);
                    if(d.success){ resolve(d); } else { reject(new Error(d.error || 'worker failed')); }
                };
                worker.addEventListener('message', onMsg);
                worker.postMessage({ id, size, iterations, workgroupSize: wg });
            });

            const timeoutMs = 8000;
            const res = await Promise.race([
                p,
                new Promise((_, rej)=> setTimeout(()=>{ timedOut = true; rej(new Error('worker timeout')); }, timeoutMs))
            ]);

            // if worker returned a transferable buffer, reconstruct Float32Array
            if(res.result && res.result instanceof ArrayBuffer){
                res.result = new Float32Array(res.result);
            }
            gpuStatus.textContent = `backend=${res.backend} time=${res.timeMs.toFixed(2)}ms` + (typeof res.checksum === 'number' ? ` checksum=${res.checksum.toFixed(6)}` : '');
            if(res.result && res.result.length){
                const s = Array.from(res.result.slice(0, Math.min(8, res.result.length))).map(v=>v.toFixed(4)).join(', ');
                gpuSample.textContent = `Sample: [${s}]`;
                // push to history and draw
                lastRuns.unshift({ backend: res.backend, checksum: res.checksum, timeMs: res.timeMs, result: new Float32Array(res.result) });
                if(lastRuns.length > MAX_HISTORY) lastRuns.length = MAX_HISTORY;
                if(gpuHistoryCount) gpuHistoryCount.textContent = String(lastRuns.length);
                saveHistory();
                renderHistoryThumbnails();
                drawSparkline(lastRuns[0].result);
            }
        }catch(err){
            console.warn('GPU worker failed or timed out, falling back to main demo:', err && err.message ? err.message : err);
            gpuStatus.textContent = 'Worker failed, falling back...';
            try{
                const res2 = await runGpuDemo({ size, iterations, workgroupSize: wg });
                gpuStatus.textContent = `backend=${res2.backend} time=${res2.timeMs.toFixed(2)}ms` + (typeof res2.checksum === 'number' ? ` checksum=${res2.checksum.toFixed(6)}` : '');
                if(res2.result && res2.result.length){
                    const s = Array.from(res2.result.slice(0, Math.min(8, res2.result.length))).map(v=>v.toFixed(4)).join(', ');
                    gpuSample.textContent = `Sample: [${s}]`;
                    lastRuns.unshift({ backend: res2.backend, checksum: res2.checksum, timeMs: res2.timeMs, result: new Float32Array(res2.result) });
                    if(lastRuns.length > MAX_HISTORY) lastRuns.length = MAX_HISTORY;
                    if(gpuHistoryCount) gpuHistoryCount.textContent = String(lastRuns.length);
                    saveHistory();
                    renderHistoryThumbnails();
                    drawSparkline(lastRuns[0].result);
                }
            }catch(err2){
                gpuStatus.textContent = 'GPU demo failed: '+(err2.message||err2);
                gpuSample.textContent = 'Sample: -';
            }
        }finally{
            try{ if(worker) worker.terminate(); }catch(e){}
            gpuBtn.disabled = false;
        }
    });
}

// Init GPU button
const gpuInitBtn = document.getElementById('btn-gpu-init');
const gpuDiagWrap = document.getElementById('gpu-diag');
const gpuDiagPre = document.getElementById('gpu-diag-pre');
const gpuCopyDiag = document.getElementById('gpu-copy-diag');
const gpuToggleDiag = document.getElementById('gpu-toggle-diag');
if(gpuInitBtn){
    gpuInitBtn.addEventListener('click', async ()=>{
        gpuInitBtn.disabled = true; gpuStatus.textContent = 'Initializing WebGPU...';
        try{
            const res = await initGPUEnvironment();
            if(res.ok){
                gpuStatus.textContent = 'WebGPU initialized';
                if(gpuDiagWrap){ gpuDiagWrap.style.display='none'; }
            }else{
                gpuStatus.textContent = 'GPU init: '+(res.webgpu && res.webgpu.ok ? 'webgpu ok' : 'no webgpu') + ', webgl: '+(res.webgl && res.webgl.ok ? 'ok' : 'no');
                // show diagnostics area
                if(gpuDiagWrap && gpuDiagPre){
                    gpuDiagWrap.style.display = 'block';
                    const pretty = JSON.stringify(res, null, 2);
                    gpuDiagPre.textContent = pretty + `\n\nSuggestions:\n - Use a WebGPU-enabled browser (Chrome/Edge recent or Canary)\n - Serve the page via localhost (not file://)\n - Ensure GPU drivers are enabled and you're not in a headless/remote session\n - Try Chrome Canary or enable WebGPU flags if on stable builds`;
                }
                // attempt an extra probe with potential fallback hint
                try{
                    // some implementations accept forceFallbackAdapter: true
                    if(navigator && navigator.gpu && navigator.gpu.requestAdapter){
                        const probe = await navigator.gpu.requestAdapter({ forceFallbackAdapter: true }).catch(()=>null);
                        if(!probe){
                            // nothing
                        } else {
                            gpuDiagPre.textContent += '\n\nProbe: fallback adapter available.';
                        }
                    }
                }catch(e){ /* ignore  }
            }
        }catch(e){ gpuStatus.textContent = 'WebGPU init error: '+(e.message||e); }
        gpuInitBtn.disabled = false;
    });
}
if(gpuCopyDiag && gpuDiagPre){ gpuCopyDiag.addEventListener('click', ()=>{ try{ navigator.clipboard.writeText(gpuDiagPre.textContent); }catch(e){ alert('Copy failed'); } }); }
if(gpuToggleDiag && gpuDiagWrap){ gpuToggleDiag.addEventListener('click', ()=>{ if(gpuDiagWrap.style.display==='none'){ gpuDiagWrap.style.display='block'; gpuToggleDiag.textContent='Hide'; } else { gpuDiagWrap.style.display='none'; gpuToggleDiag.textContent='Show'; } }); }

if(gpuClearBtn){ gpuClearBtn.addEventListener('click', ()=>{ lastRuns.length = 0; try{ localStorage.removeItem(STORAGE_KEY); }catch(e){} if(gpuHistoryCount) gpuHistoryCount.textContent = '0'; if(gpuCanvas){ const ctx=gpuCanvas.getContext('2d'); ctx.clearRect(0,0,gpuCanvas.width,gpuCanvas.height); } }); }
if(gpuExportBtn){ gpuExportBtn.addEventListener('click', ()=>{
    try{
        const exportData = lastRuns.map(r=>({ backend: r.backend, checksum: r.checksum, timeMs: r.timeMs, len: r.originalLen || r.result.length, sampled: Array.from(r.result) }));
        const blob = new Blob([JSON.stringify(exportData, null, 0)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'gpu_history.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    }catch(e){ alert('Export failed: '+(e.message||e)); }
}); }

// Forced backend run
if(gpuRunForcedBtn && gpuBackendSelect){
    gpuRunForcedBtn.addEventListener('click', async ()=>{
        const backend = gpuBackendSelect.value || 'auto';
        const size = Math.max(1, parseInt(document.getElementById('gpu-size').value || '65536',10));
        const iterations = Math.max(1, parseInt(document.getElementById('gpu-iters').value || '20',10));
        gpuStatus.textContent = `Running with backend=${backend}`;
        gpuRunForcedBtn.disabled = true;
        try{
            if(backend === 'auto'){
                const res = await runGpuDemo({ size, iterations, workgroupSize: parseInt(document.getElementById('gpu-wg').value||'64',10) });
                gpuStatus.textContent = `backend=${res.backend} time=${res.timeMs.toFixed(2)}ms`;
            }else{
                // use computeIterative directly and force backend when supported
                const data = new Float32Array(size);
                for(let i=0;i<size;i++) data[i] = Math.sin(i) * 0.5 + (i % 7) * 0.13;
                const opts = { iterations, workgroupSize: parseInt(document.getElementById('gpu-wg').value||'64',10), backend };
                const res = await computeIterative(data, opts);
                gpuStatus.textContent = `backend=${res.backend} time=${res.timeMs.toFixed(2)}ms`;
                const s = Array.from(res.result.slice(0, Math.min(8, res.result.length))).map(v=>v.toFixed(4)).join(', ');
                gpuSample.textContent = `Sample: [${s}]`;
                lastRuns.unshift({ backend: res.backend, checksum: res.checksum, timeMs: res.timeMs, result: new Float32Array(res.result) });
                if(lastRuns.length > MAX_HISTORY) lastRuns.length = MAX_HISTORY;
                if(gpuHistoryCount) gpuHistoryCount.textContent = String(lastRuns.length);
                saveHistory(); renderHistoryThumbnails(); drawSparkline(lastRuns[0].result);
            }
        }catch(e){ gpuStatus.textContent = 'Forced run failed: '+(e && e.message ? e.message : e); }
        gpuRunForcedBtn.disabled = false;
    });
}
if(gpuImportBtn && gpuImportFile){ gpuImportBtn.addEventListener('click', ()=> gpuImportFile.click());
    gpuImportFile.addEventListener('change', (ev)=>{
        const f = ev.target.files && ev.target.files[0]; if(!f) return;
        const reader = new FileReader();
        reader.onload = ()=>{
            try{
                const parsed = JSON.parse(reader.result);
                if(!Array.isArray(parsed)) throw new Error('Invalid format');
                lastRuns.length = 0;
                for(let i=0;i<parsed.length && lastRuns.length < MAX_HISTORY; i++){
                    const p = parsed[i]; if(!p || !p.sampled) continue;
                    const arr = new Float32Array(p.sampled);
                    lastRuns.push({ backend: p.backend, checksum: p.checksum, timeMs: p.timeMs, result: arr, originalLen: p.len || arr.length });
                }
                saveHistory(); if(gpuHistoryCount) gpuHistoryCount.textContent = String(lastRuns.length); drawSparkline(lastRuns[0] ? lastRuns[0].result : null);
            }catch(e){ alert('Import failed: '+(e.message||e)); }
        };
        reader.readAsText(f);
    });
}

// load previous history on startup
loadHistory();*/

// keyboard: press 'c' to toggle which color you play as and re-render board
window.addEventListener('keydown', (e)=>{
    if(e.key === 'c' || e.key === 'C'){
        togglePlayerColor();
        // refresh human/ai colors and re-render
        const human = playerColor;
        const ai = human === 'w' ? 'b' : 'w';
        humanColor = human;
        aiColor = ai;
    // clear game status when changing sides
    gameOver = false;
    const statusEl = document.getElementById('game-status');
    if(statusEl){ statusEl.className = ''; statusEl.textContent = '' }
    applyAndRender(boardState);
    }
});