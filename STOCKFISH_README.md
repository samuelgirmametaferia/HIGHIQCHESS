This project can optionally use a browser-compatible Stockfish engine (stockfish.js / stockfish.wasm) for stronger hints.

Why you need this
- The repository includes a lightweight wrapper `stockfish-wrapper.js` that will try to create a WebWorker from `stockfish.js` and speak UCI.
- Browsers cannot download or execute native binaries directly; you must provide a JS/WASM build of Stockfish.

How to get a browser build
1. Easiest: Download a prebuilt stockfish.js (and stockfish.wasm) from the official Stockfish JS releases or from projects that package it for the browser. Example sources:
   - https://github.com/niklasf/stockfish.wasm (releases include `stockfish.js` + `stockfish.wasm`)
   - https://github.com/chenowethlab/stockfish-js (older builds)

2. Place the files
   - Copy `stockfish.js` (and optionally `stockfish.wasm`) to the project root: `f:\backup\Desktop\Minesweeper\stockfish.js`.
   - If the build uses `stockfish.wasm`, ensure `stockfish.js` references it with the correct relative path (same folder recommended).

3. Usage
   - In the app UI, check the "Use Stockfish" checkbox and set a reasonable depth (6-12).
   - If Stockfish is present, the hint button will query it and show suggested moves.

Notes
- I cannot ship the binary in this repo for you, but the wrapper and FEN serializer are now in place to consume any browser build you provide.
- If you want, tell me the URL of a specific `stockfish.js` you trust and I can add instructions to download it locally, or I can add a small script to validate the engine file after you place it.

Security
- Only use builds you trust. Running arbitrary JS files as workers has security implications.

If you'd like, I can add a small validation endpoint (simple UI) that checks the engine is responding to `uci` and `isready` commands after you add the file.
