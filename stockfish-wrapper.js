// lil' Stockfish hook-up. tries to spin up a Worker from stockfish.js if you got one
// exposes getBestMove(fen, depth) -> Promise<{ from,to,uci }> so we can ask for hints

import { boardToFEN } from "./fen.js";

let engine = null;
let ready = false;
let listeners = [];

function startEngine(){
  if(engine) return engine;
  try{
    // Try to create worker from stockfish.js located next to the app
    engine = new Worker('stockfish.js');
  }catch(e){
    try{
      // If Worker isn't available or file missing, try global Stockfish() factory
      if(typeof Stockfish === 'function'){
        engine = Stockfish();
      }
    }catch(e2){
      engine = null;
    }
  }
  if(!engine) return null;
  // engine chat handler
  engine.onmessage = (ev)=>{
    const text = ev.data && ev.data.data ? ev.data.data : ev.data;
    listeners.forEach(fn=>fn(text));
  };
  // init
  // kick its tires
  post('uci');
  post('isready');
  return engine;
}

// allow swapping in an engine from any URL (blob from your local upload, etc)
export function setEngineFromUrl(url){
  // terminate previous engine if any
  try{ if(engine && typeof engine.terminate === 'function') engine.terminate(); }catch(e){}
  engine = null;
  try{
    engine = new Worker(url);
  }catch(e){
    try{
      if(typeof Stockfish === 'function') engine = Stockfish();
    }catch(e2){ engine = null; }
  }
  if(!engine) return null;
  engine.onmessage = (ev)=>{
    const text = ev.data && ev.data.data ? ev.data.data : ev.data;
    listeners.forEach(fn=>fn(text));
  };
  // nudge it awake
  post('uci');
  post('isready');
  return engine;
}

function post(cmd){
  if(!engine) return;
  try{ engine.postMessage(cmd); }catch(e){ try{ engine.postMessage({type:'cmd',cmd}) }catch{} }
}

export function init(){
  startEngine();
}

// tiny ping: ask the engine to say 'uciok' and 'readyok' so we know it's alive
export function enginePing(timeoutMs = 5000){
  return new Promise((resolve,reject)=>{
    const eng = startEngine();
    if(!eng) return reject(new Error('no-engine'));
    let gotUciOk = false;
    let gotReady = false;
    const onmsg = (txt)=>{
      if(typeof txt !== 'string') return;
      const t = txt.trim();
      if(t === 'uciok') gotUciOk = true;
      if(t === 'readyok') gotReady = true;
      // some builds print id name ... capture that as progress
      if(gotUciOk && gotReady){ listeners = listeners.filter(l=>l!==onmsg); resolve({ uciok: true, readyok: true }); }
    };
    listeners.push(onmsg);
    try{ post('uci'); }catch(e){}
    // after uci, ask isready to ensure the engine is ready to compute
    setTimeout(()=>{ try{ post('isready'); }catch(e){} }, 200);
    const to = setTimeout(()=>{ listeners = listeners.filter(l=>l!==onmsg); reject(new Error('ping-timeout')); }, timeoutMs);
  });
}

export function getBestMove(fen, depth=8){
  return new Promise((resolve,reject)=>{
    // Accept either a board array or a FEN string
    let fenStr = fen;
    try{
      if(Array.isArray(fen)) fenStr = boardToFEN(fen, 'w');
    }catch(e){ /* fall through */ }
    if(!startEngine()) return reject(new Error('Stockfish not available'));
    let best = null;
    const onmsg = (txt)=>{
      if(typeof txt !== 'string') return;
      if(txt.startsWith('bestmove')){
        const parts = txt.split(' ');
        best = parts[1];
        listeners = listeners.filter(l=>l!==onmsg);
        resolve({ uci: best });
      }
    };
    listeners.push(onmsg);
    post(`position fen ${fenStr}`);
    post(`go depth ${depth}`);
    // timeout
    const to = setTimeout(()=>{ listeners = listeners.filter(l=>l!==onmsg); reject(new Error('stockfish timeout')) }, 5000 + depth*200);
    // also listen for engine errors
    listeners.push((txt)=>{ if(typeof txt==='string' && txt.toLowerCase().includes('error')){ clearTimeout(to); listeners = listeners.filter(l=>l!==onmsg); reject(new Error('stockfish error: '+txt)); } });
  });
}
