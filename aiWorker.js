import { findBestMove } from './AI.js';

// Module worker: listens for messages to compute the best move with a time limit
self.addEventListener('message', async (ev) => {
    const d = ev.data;
    if(!d || !d.id) return;
    const id = d.id;
    try{
        const board = d.board;
        const color = d.color;
        const depth = typeof d.depth === 'number' ? d.depth : 2;
        const timeLimitMs = typeof d.timeLimitMs === 'number' ? d.timeLimitMs : 800;
        // run findBestMove with time limit option and progress callback
        const move = await findBestMove(board, color, depth, { timeLimitMs,
            onProgress: (progress)=>{
                // post intermediate best-so-far result
                try{ self.postMessage({ id, progress }); }catch(e){}
            }
        });
        self.postMessage({ id, success: true, move });
    }catch(err){
        self.postMessage({ id, success: false, error: err && err.message ? err.message : String(err) });
    }
});
