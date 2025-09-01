import { setEngineFromUrl } from './stockfish-wrapper.js';

const fileInput = document.getElementById('file-engine');
const status = document.getElementById('uploader-status');
const validatorStatus = document.getElementById('engine-status');

function log(el, msg, err=false){ if(!el) return; const d = document.createElement('div'); d.textContent = msg; d.style.color = err? 'crimson' : 'inherit'; el.appendChild(d); }

// uploader: pick a stockfish build from your box and let's try to spin it up
if(fileInput){
  fileInput.addEventListener('change', async (e)=>{
    if(!e.target.files || e.target.files.length===0) return;
    status.innerHTML = '';
    const f = e.target.files[0];
    log(status, `Selected file: ${f.name}`);
    try{
      const blobUrl = URL.createObjectURL(f);
      const eng = setEngineFromUrl(blobUrl);
      if(!eng){ log(status, 'Nah fam, failed to create engine from that file', true); return; }
      log(status, 'Engine worker created from uploaded file. Pinging...');
      // if validator status exists, clear it
      if(validatorStatus) validatorStatus.innerHTML = '';
      // send uci/isready via existing wrapper's enginePing if available
      try{
        // import dynamically to avoid circular import in some bundlers
        const mod = await import('./stockfish-wrapper.js');
        const ping = await mod.enginePing(7000);
        if(ping && ping.uciok && ping.readyok){ log(status, 'Uploaded engine said "yo" (uci/ready ok).'); }
        else log(status, 'Uploaded engine ghosted us, no proper reply.', true);
      }catch(err){ log(status, 'Ping failed after upload: '+ (err && err.message? err.message: String(err)), true); }
    }catch(e){ log(status, 'Upload oops: '+String(e), true); }
  });
}

export { };
