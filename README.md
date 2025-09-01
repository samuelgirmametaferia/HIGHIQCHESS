# MindForge (Minesweeper-derived demo)

Short: a small browser-based board/demo app with an AI opponent and a GPU compute 

## Quick start (serve locally)
Serve the folder over HTTP (some features require a proper origin):

PowerShell (Python):

```powershell
python -m http.server 8000
# then open http://localhost:8000 in a browser
```

Or with Node (if you have npm):

```powershell
npx http-server -p 8000
# or
npx serve -s . -l 8000
```
You can click Ctr+Grid in any two grids to make an arrow. Also you can premove with alt+piece then alt+grid

Open `http://localhost:8000` in a browser.

Recommended browsers for GPU compute:
- Chrome Canary or Edge (recent) for best WebGPU support.
- Stable Chrome/Edge may require enabling experimental flags.

## What you'll find in the UI
- Game board and basic AI opponent (controls in the left pane).


## How the GPU demo works (short)
- Primary path: WebGPU compute using WGSL and a storage buffer.
- Fallback: WebGL2 fragment shader that stores values in an RGBA32F texture and performs ping-pong rendering.
- Final fallback: pure JS CPU implementation.
- Files of interest:
  - `GPUutil.js` — compute utilities: `computeIterative`, `runDemo`, `initWebGPU`, `initGPUEnvironment`, `supportsWebGL`.
  - `app.js` — UI wiring for the demo and the game.
  - `index.html` — UI markup including the GPU controls and diagnostics area.

## For developers
- Force a backend programmatically:

```js
import { computeIterative } from './GPUutil.js';
const res = await computeIterative(myFloat32Array, { iterations: 20, backend: 'webgl' });
```

- Use `initGPUEnvironment()` to collect a small diagnostic object that includes whether WebGPU/WebGL are available and which is preferred.

## Troubleshooting
- "The powerPreference option is currently ignored..." — informational message from Chromium on Windows. It means the browser ignored the powerPreference hint and is not an error.
- "No available adapters." — means `navigator.gpu.requestAdapter()` returned null. Common causes:
  - Browser does not support WebGPU (try Chrome Canary / Edge Canary).
  - Page loaded via `file://` (use localhost HTTP server).
  - Running in a headless/remote VM or GPU disabled by OS/driver.
  - Outdated GPU drivers or blocked by enterprise policy.

If WebGPU is unavailable, the demo will attempt WebGL2 (if available) and finally CPU.

This project is under the MIT LICENSE.