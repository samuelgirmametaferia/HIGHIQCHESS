import { init as sfInit, getBestMove as sfGetBestMove, enginePing } from './stockfish-wrapper.js';

const statusEl = document.getElementById('engine-status');
const btn = document.getElementById('btn-check-engine');

function logStatus(msg, err=false){
  // tiny logger for the validator panel
  if(!statusEl) return;
  const p = document.createElement('div');
  p.textContent = msg;
  p.style.color = err ? 'crimson' : 'inherit';
  statusEl.appendChild(p);
}

async function checkEngine(){
  if(!btn) return;
  statusEl.innerHTML = '';
  logStatus('Checking for stockfish.js...');
  try{
    sfInit();
    logStatus('Told the engine to wake up. Pinging it (uci / isready)...');
    try{
      const ping = await enginePing(7000);
      if(ping && ping.uciok && ping.readyok){
        logStatus('Engine said "uciok" and "readyok" — cool. Trying a quick bestmove now...');
        const testFen = '8/8/8/8/8/8/8/8 w - - 0 1';
        try{
          const res = await sfGetBestMove(testFen, 4);
          logStatus('Engine spat a bestmove: '+ (res && res.uci ? res.uci : JSON.stringify(res)));
          logStatus('Looks like Stockfish is vibing. Try the Hint toggle.');
        }catch(e){
          logStatus('Ping worked but compute choked: '+e.message, true);
          logStatus('Usually means the build is the wrong flavor for the browser or it timed out.');
        }
      }else{
        logStatus('Engine ping didn’t reply with uciok/readyok — ghosted us.', true);
      }
    }catch(e){
      logStatus('Engine ping failed: '+ (e && e.message ? e.message : String(e)), true);
      logStatus('Ensure stockfish.js is a browser build (see STOCKFISH_README.md)');
    }
  }catch(e){
    logStatus('Stockfish initialization failed: '+ (e && e.message ? e.message : String(e)), true);
    logStatus('Ensure stockfish.js is copied to the app root and is a browser build (see STOCKFISH_README.md)');
  }
}

if(btn){ btn.addEventListener('click', checkEngine); }

export { checkEngine };
