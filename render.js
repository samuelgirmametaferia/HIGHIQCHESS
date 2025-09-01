import { showMoves, movePiece} from "./gameEngine.js";
import { validSquare } from "./gameEngine.js";
import { inCheck, hasLegalMoves } from "./gameEngine.js";
let imgPull = ["./pieces/0.svg",
    "./pieces/1.svg",
    "./pieces/2.svg",
    "./pieces/3.svg",
    "./pieces/4.svg",
    "./pieces/5.svg",
    // 6 is not available in pieces/ — guard against out-of-range
    "./sprites/dot.svg",
    "./sprites/take.svg"];
let gameBoard = document.getElementById("game-board");
//I CAN'T BELIEVE I NEEED A FUNCTION FOR THIS.
/*
WE CAN'T ship this broken code
async function editPieces(url, glowColor) {

    const resUN = await fetch(url);
    let svgText = await resUN.text();
    //Thank you mozilla documentation
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgText, "image/svg+xml");

    const glow = svgDoc.querySelector("#glow feDropShadow");
    if (glow) {
        glow.setAttribute("flood-color", glowColor);
    }

    const serializer = new XMLSerializer();
    const newSVG = serializer.serializeToString(svgDoc.documentElement);

    const svgBase64 = btoa(newSVG);
    return `data:image/svg+xml;base64,${svgBase64}`;
}*/
let dotGraphics  = [];
let tiles = [];
export let playerColor = Math.random() > 0.5 ? "w" : "b";
let boardCols = 0;
export let currentBoard = null;
export function setPlayerColor(c){
    playerColor = c === 'w' ? 'w' : 'b';
}
export function togglePlayerColor(){
    playerColor = playerColor === 'w' ? 'b' : 'w';
}
export function renderBoard(board2D) {
    console.log("Rendering Board");
    gameBoard.innerHTML = "";
    tiles = [];
    boardCols = board2D[0]?.length ?? 0;
    const rows = board2D.length;
    const cols = boardCols;
    const rotated = (playerColor === 'b'); // ensure player's side is shown at bottom

    // Render in visual order (visY, visX). Map visual -> logical coords depending on rotation.
    for (let visY = 0; visY < rows; visY++) {
        for (let visX = 0; visX < cols; visX++) {
            const logicalY = rotated ? (rows - 1 - visY) : visY;
            const logicalX = rotated ? (cols - 1 - visX) : visX;

            const tile = document.createElement("div");
            tile.className = "tile";
            if ((visX + visY) % 2 === 0) {
                tile.style.backgroundColor = "rgb(56, 110, 50)";
            } else {
                tile.style.backgroundColor = "rgb(212, 212, 212)";
            }
            const pieceValue = board2D[logicalY][logicalX];
            if (pieceValue !== null && pieceValue !== undefined) {
                const piece = document.createElement("img");
                piece.classList.add("piece");
                const pieceIndex = parseInt(pieceValue[1], 10);
                // guard for out-of-range images
                piece.src = imgPull[pieceIndex] || imgPull[0];
                if (pieceValue[0] === playerColor) {
                    piece.classList.add("Player");
                } else {
                    piece.classList.add("AI");
                }

                if (pieceIndex < 7 && pieceValue[0] == playerColor) {
                    piece.addEventListener("click", evt => {
                        console.log(`Clicked on piece ${pieceValue} at (${logicalX}, ${logicalY})`);
                        // pass logical row (logicalY) then logical column (logicalX)
                        cleanDots();
                        renderDots(board2D, pieceIndex, logicalY, logicalX, pieceValue[0]);
                    });
                    // pointer-based drag support
                    piece.style.touchAction = 'none';
                    piece.addEventListener('pointerdown', startDrag);
                } else {
                    piece.addEventListener("click", evt => {
                        console.log(`Clicked on piece ${pieceValue} at (${logicalX}, ${logicalY})`);
                    });
                }
                tile.appendChild(piece);
            }
            tiles.push(tile);
            gameBoard.appendChild(tile);
        }
    }
    currentBoard = board2D;
    // populate coordinate labels
    const filesTop = document.getElementById('files-top');
    const filesBottom = document.getElementById('files-bottom');
    const ranksLeft = document.getElementById('ranks-left');
    const ranksRight = document.getElementById('ranks-right');
    if(filesTop && filesBottom && ranksLeft && ranksRight){
        const letters = 'abcdefgh'.slice(0, cols).split('');
        const numbers = Array.from({length: rows}, (_,i)=> (i+1).toString());
        const filesOrder = rotated ? letters.slice().reverse() : letters;
        filesTop.innerHTML = '';
        filesBottom.innerHTML = '';
        for(const f of filesOrder){ filesTop.innerHTML += `<div class="coord">${f}</div>`; filesBottom.innerHTML += `<div class="coord">${f}</div>` }
        ranksLeft.innerHTML = '';
        ranksRight.innerHTML = '';
        // ranks shown top->bottom (visual order)
        const ranksVisual = rotated ? numbers.slice().map(n=>n) : numbers.slice().reverse();
        for(const r of ranksVisual){ ranksLeft.innerHTML += `<div class="coord">${r}</div>`; ranksRight.innerHTML += `<div class="coord">${r}</div>` }
    }
    // redraw any planning arrows after the board is in the DOM
    setTimeout(()=> redrawPlans(), 10);
}

// ----- Planning arrows & premoves support -----
let _plans = []; // regular planning arrows [{fromRow, fromCol, toRow, toCol}]
let _premoves = []; // premove arrows [{fromRow, fromCol, toRow, toCol}]
let _planStart = null;
let _premoveStart = null;
let overlay = null;

function ensureOverlay(){
    if(overlay) return overlay;
    const wrap = document.querySelector('.board-wrap');
    if(!wrap) return null;
    overlay = document.getElementById('planning-overlay');
    if(!overlay){
        overlay = document.createElementNS('http://www.w3.org/2000/svg','svg');
        overlay.setAttribute('id','planning-overlay');
        overlay.setAttribute('class','planning-overlay');
        overlay.setAttribute('aria-hidden','true');
        overlay.style.position = 'absolute';
        overlay.style.left = '0';
        overlay.style.top = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.pointerEvents = 'none';
        wrap.appendChild(overlay);
    }
    return overlay;
}

function clearOverlayChildren(){
    const o = ensureOverlay(); if(!o) return; while(o.firstChild) o.removeChild(o.firstChild);
}

function redrawPlans(){
    const o = ensureOverlay(); if(!o) return;
    clearOverlayChildren();
    const rows = currentBoard ? currentBoard.length : 0;
    const cols = boardCols || (currentBoard && currentBoard[0] && currentBoard[0].length) || 8;
    // draw regular plans (green)
    for(const p of _plans){
        const fromVis = logicalToVisual(p.fromRow, p.fromCol, rows, cols);
        const toVis = logicalToVisual(p.toRow, p.toCol, rows, cols);
        if(fromVis && toVis){
            const fromTile = tiles[fromVis.index];
            const toTile = tiles[toVis.index];
            if(!fromTile || !toTile) continue;
            const fRect = fromTile.getBoundingClientRect();
            const tRect = toTile.getBoundingClientRect();
            const parentRect = o.getBoundingClientRect();
            const x1 = fRect.left + fRect.width/2 - parentRect.left;
            const y1 = fRect.top + fRect.height/2 - parentRect.top;
            const x2 = tRect.left + tRect.width/2 - parentRect.left;
            const y2 = tRect.top + tRect.height/2 - parentRect.top;
            const line = document.createElementNS('http://www.w3.org/2000/svg','line');
            line.setAttribute('x1', x1);
            line.setAttribute('y1', y1);
            line.setAttribute('x2', x2);
            line.setAttribute('y2', y2);
            line.setAttribute('stroke','rgba(0,255,160,0.9)');
            line.setAttribute('stroke-width','6');
            line.setAttribute('stroke-linecap','round');
            line.setAttribute('class','plan-arrow');
            // arrowhead marker for plans
            const defs = document.createElementNS('http://www.w3.org/2000/svg','defs');
            const marker = document.createElementNS('http://www.w3.org/2000/svg','marker');
            marker.setAttribute('id','arrowhead-plan');
            marker.setAttribute('viewBox','0 0 10 10');
            marker.setAttribute('refX','5');
            marker.setAttribute('refY','5');
            marker.setAttribute('markerWidth','6');
            marker.setAttribute('markerHeight','6');
            marker.setAttribute('orient','auto');
            const path = document.createElementNS('http://www.w3.org/2000/svg','path');
            path.setAttribute('d','M 0 0 L 10 5 L 0 10 z');
            path.setAttribute('fill','rgba(0,255,160,0.95)');
            marker.appendChild(path);
            defs.appendChild(marker);
            o.appendChild(defs);
            line.setAttribute('marker-end','url(#arrowhead-plan)');
            o.appendChild(line);
        }
    }
    // draw premoves (blue) so they are visually distinct and persist
    for(const p of _premoves){
        const fromVis = logicalToVisual(p.fromRow, p.fromCol, rows, cols);
        const toVis = logicalToVisual(p.toRow, p.toCol, rows, cols);
        if(fromVis && toVis){
            const fromTile = tiles[fromVis.index];
            const toTile = tiles[toVis.index];
            if(!fromTile || !toTile) continue;
            const fRect = fromTile.getBoundingClientRect();
            const tRect = toTile.getBoundingClientRect();
            const parentRect = o.getBoundingClientRect();
            const x1 = fRect.left + fRect.width/2 - parentRect.left;
            const y1 = fRect.top + fRect.height/2 - parentRect.top;
            const x2 = tRect.left + tRect.width/2 - parentRect.left;
            const y2 = tRect.top + tRect.height/2 - parentRect.top;
            const line = document.createElementNS('http://www.w3.org/2000/svg','line');
            line.setAttribute('x1', x1);
            line.setAttribute('y1', y1);
            line.setAttribute('x2', x2);
            line.setAttribute('y2', y2);
            line.setAttribute('stroke','rgba(60,160,255,0.95)');
            line.setAttribute('stroke-width','6');
            line.setAttribute('stroke-linecap','round');
            line.setAttribute('class','premove-arrow');
            const defs2 = document.createElementNS('http://www.w3.org/2000/svg','defs');
            const marker2 = document.createElementNS('http://www.w3.org/2000/svg','marker');
            marker2.setAttribute('id','arrowhead-premove');
            marker2.setAttribute('viewBox','0 0 10 10');
            marker2.setAttribute('refX','5');
            marker2.setAttribute('refY','5');
            marker2.setAttribute('markerWidth','6');
            marker2.setAttribute('markerHeight','6');
            marker2.setAttribute('orient','auto');
            const path2 = document.createElementNS('http://www.w3.org/2000/svg','path');
            path2.setAttribute('d','M 0 0 L 10 5 L 0 10 z');
            path2.setAttribute('fill','rgba(60,160,255,0.95)');
            marker2.appendChild(path2);
            defs2.appendChild(marker2);
            o.appendChild(defs2);
            line.setAttribute('marker-end','url(#arrowhead-premove)');
            o.appendChild(line);
        }
    }
}

function logicalToVisual(r,c,rows,cols){
    const rotated = (playerColor === 'b');
    const visY = rotated ? (rows - 1 - r) : r;
    const visX = rotated ? (cols - 1 - c) : c;
    const index = visY * cols + visX;
    return {visY, visX, index};
}

// handle ctrl+click planning in capture phase to intercept before piece click
document.addEventListener('click', function(evt){
    // planning (Ctrl) or premove (Alt)
    if(!(evt.ctrlKey || evt.altKey)) return;
    const tileEl = evt.target.closest && evt.target.closest('#game-board .tile');
    if(!tileEl) return;
    // intercept other handlers
    evt.stopPropagation();
    evt.preventDefault();
    const idx = tiles.indexOf(tileEl);
    if(idx < 0) return;
    const rows = currentBoard ? currentBoard.length : 0;
    const cols = boardCols || (currentBoard && currentBoard[0] && currentBoard[0].length) || 8;
    const visY = Math.floor(idx / cols);
    const visX = idx % cols;
    const rotated = (playerColor === 'b');
    const logicalY = rotated ? (rows - 1 - visY) : visY;
    const logicalX = rotated ? (cols - 1 - visX) : visX;
    if(evt.ctrlKey){
        // planning arrows
        if(!_planStart){
            _planStart = { row: logicalY, col: logicalX };
            const o = ensureOverlay(); if(o){ const circ = document.createElementNS('http://www.w3.org/2000/svg','circle'); circ.setAttribute('cx',0); circ.setAttribute('cy',0); circ.setAttribute('r',6); circ.setAttribute('class','plan-start-marker'); circ.setAttribute('fill','rgba(0,255,160,0.95)'); o.appendChild(circ); setTimeout(()=>{ try{ if(circ.parentNode) circ.parentNode.removeChild(circ); }catch{} },800); }
        } else {
            _plans.push({ fromRow: _planStart.row, fromCol: _planStart.col, toRow: logicalY, toCol: logicalX });
            _planStart = null;
            setTimeout(()=> redrawPlans(), 10);
        }
    } else if(evt.altKey){
        // premove arrows
        if(!_premoveStart){
            _premoveStart = { row: logicalY, col: logicalX };
            const o = ensureOverlay(); if(o){ const circ = document.createElementNS('http://www.w3.org/2000/svg','circle'); circ.setAttribute('cx',0); circ.setAttribute('cy',0); circ.setAttribute('r',6); circ.setAttribute('class','premove-start-marker'); circ.setAttribute('fill','rgba(60,160,255,0.95)'); o.appendChild(circ); setTimeout(()=>{ try{ if(circ.parentNode) circ.parentNode.removeChild(circ); }catch{} },800); }
        } else {
            const prem = { fromRow: _premoveStart.row, fromCol: _premoveStart.col, toRow: logicalY, toCol: logicalX };
            _premoveStart = null;
            // store and dispatch premove event
            _premoves.length = 0; _premoves.push(prem);
            try{ window.dispatchEvent(new CustomEvent('premove:set', { detail: prem })); }catch(e){}
            setTimeout(()=> redrawPlans(), 10);
        }
    }
}, true);

export function clearPlans(){ _plans.length = 0; _planStart = null; clearOverlayChildren(); }

export function addPremove(p){ _premoves.length = 0; _premoves.push(p); setTimeout(()=> redrawPlans(),10); }
export function clearPremoves(){ _premoves.length = 0; _premoveStart = null; setTimeout(()=> redrawPlans(),10); }

// redraw plans when board rerenders or window resizes
window.addEventListener('resize', ()=>{ setTimeout(()=> redrawPlans(), 50); });

// call redraw after each renderBoard run (simple timeout to ensure DOM ready)
const origRender = renderBoard;
// ...existing code...

function addDots(sR, sC,apieceIndex, color,pR, pC, take = false)
{
    // map logical coordinates (sR,sC) to visual tile index based on current player orientation
    const rows = currentBoard ? currentBoard.length : 0;
    const cols = boardCols;
    const rotated = (playerColor === 'b');
    const visY = rotated ? (rows - 1 - sR) : sR;
    const visX = rotated ? (cols - 1 - sC) : sC;
    const index = visY * cols + visX;
    const piece = document.createElement("img");
    const tile = tiles[index];
    piece.classList.add("piece");
    // dot and take graphics are expected to be the last two entries in imgPull
    const dotIndex = Math.max(0, imgPull.length - 2);
    const takeIndex = Math.max(0, imgPull.length - 1);
    const pieceIndex = take ? takeIndex : dotIndex;
    piece.src = imgPull[pieceIndex];
    // class should match semantics: 'dot' for move, 'take' for capture
    piece.classList.add(take ? "take" : "dot");
    piece.style.pointerEvents = "auto";
    piece.addEventListener("click", evt =>{
        console.log("Executing move", apieceIndex, pR, pC, "->", sR, sC);
        const newBoard = movePiece(currentBoard,apieceIndex,color,pR,pC,sR,sC);
        renderBoard(newBoard);
        // dispatch a small event so the app can run the AI turn
        try{
            const ev = new CustomEvent('player:move', { detail: { fromRow: pR, fromCol: pC, toRow: sR, toCol: sC, pieceIndex: apieceIndex, color } });
            window.dispatchEvent(ev);
        }catch(e){/* ignore on old browsers */}
    });

    tile.appendChild(piece);
    dotGraphics.push(piece);
    return piece;
}
function cleanDots() {
    for (const dot of dotGraphics) {
        if (dot && dot.parentNode) {
            dot.parentNode.removeChild(dot);
        }
    }
    dotGraphics.length = 0; 
}

export function renderDots(board2D, pieceIndex, currentRow, currentColumn, color) {
    let [dotArray, takeArray] = showMoves(board2D, pieceIndex, color, currentRow, currentColumn);

    for (let n = 0; n < Math.max(dotArray.length, takeArray.length); n += 2) {
        if (n < dotArray.length) {
            const r = dotArray[n];
            const c = dotArray[n + 1];
            addDots(r, c,pieceIndex,color,currentRow, currentColumn, false);
        }
        if (n < takeArray.length) {
            const r = takeArray[n];
            const c = takeArray[n + 1];
            addDots(r, c,pieceIndex,color,currentRow, currentColumn, true);
        }
    }
    console.log("DOTS:", dotArray);
    console.log("TAKES:", takeArray);
}

let _lastMove = null;
window.addEventListener('move:applied', (e)=>{
    _lastMove = e.detail;
    const info = document.getElementById('last-move-info');
    if(info){
        info.innerHTML = `<div class="highlight">Last: ${_lastMove.color}${_lastMove.pieceIndex} ${_lastMove.fromRow},${_lastMove.fromCol} → ${_lastMove.toRow},${_lastMove.toCol}</div>`;
    }
});

// when any move is applied, clear premoves if opponent moved
window.addEventListener('move:applied', (e)=>{
    try{
        const mv = e.detail;
        // if the move was by AI (opponent of playerColor), clear premoves
        const opp = mv && mv.color ? mv.color : null;
        if(opp){
            // clear premoves whenever a move is applied (enemy progressed the game)
            clearPremoves();
            // also clear planning arrows when the game advances
            clearPlans();
        }
    }catch(e){}
});
export function getPremoves(){ return _premoves.slice(); }

// validate premove before executing: listen for 'player:move' or a custom pre-execute event
window.addEventListener('premove:attempt', (e)=>{
    // e.detail = { fromRow,fromCol,toRow,toCol, color }
    const p = e.detail;
    try{
        // simulate move on a clone and check if it results in own king in check
        const cb = currentBoard;
        if(!cb) return;
        const sim = JSON.parse(JSON.stringify(cb));
        const color = p.color;
        sim[p.toRow][p.toCol] = `${color}${sim[p.fromRow][p.fromCol] ? sim[p.fromRow][p.fromCol][1] : '0'}`;
        sim[p.fromRow][p.fromCol] = null;
        if(inCheck(sim, color)){
            // invalid premove: would leave king in check
            try{ window.dispatchEvent(new CustomEvent('premove:rejected', { detail: p })); }catch(e){}
            return;
        }
        // accepted
        try{ window.dispatchEvent(new CustomEvent('premove:accepted', { detail: p })); }catch(e){}
    }catch(err){ console.error(err); }
});

export function showLastMove(){
    if(!_lastMove) return;
    // clear previous highlights
    const tilesEls = document.querySelectorAll('#game-board .tile');
    tilesEls.forEach(t=>{t.classList.remove('prev-from','prev-to')});
    // compute visual indices for from/to
    const rows = currentBoard ? currentBoard.length : 0;
    const cols = boardCols;
    const rotated = (playerColor === 'b');
    const visFromY = rotated ? (rows - 1 - _lastMove.fromRow) : _lastMove.fromRow;
    const visFromX = rotated ? (cols - 1 - _lastMove.fromCol) : _lastMove.fromCol;
    const visToY = rotated ? (rows - 1 - _lastMove.toRow) : _lastMove.toRow;
    const visToX = rotated ? (cols - 1 - _lastMove.toCol) : _lastMove.toCol;
    const fromIndex = visFromY * cols + visFromX;
    const toIndex = visToY * cols + visToX;
    const tiles = document.querySelectorAll('#game-board .tile');
    if(tiles[fromIndex]) tiles[fromIndex].classList.add('prev-from');
    if(tiles[toIndex]) tiles[toIndex].classList.add('prev-to');
}

// suggestions
let _suggestion = null;
export function clearSuggestion(){
    const tilesEls = document.querySelectorAll('#game-board .tile');
    tilesEls.forEach(t=>{t.classList.remove('suggest-from','suggest-to')});
    _suggestion = null;
}

export function showSuggestion(move){
    clearSuggestion();
    if(!move) return;
    _suggestion = move;
    const rows = currentBoard ? currentBoard.length : 0;
    const cols = boardCols;
    const rotated = (playerColor === 'b');
    const visFromY = rotated ? (rows - 1 - move.fromRow) : move.fromRow;
    const visFromX = rotated ? (cols - 1 - move.fromCol) : move.fromCol;
    const visToY = rotated ? (rows - 1 - move.toRow) : move.toRow;
    const visToX = rotated ? (cols - 1 - move.toCol) : move.toCol;
    const fromIndex = visFromY * cols + visFromX;
    const toIndex = visToY * cols + visToX;
    const tiles = document.querySelectorAll('#game-board .tile');
    if(tiles[fromIndex]) tiles[fromIndex].classList.add('suggest-from');
    if(tiles[toIndex]) tiles[toIndex].classList.add('suggest-to');
}

// ---------- Drag & Drop helpers ----------
let _dragState = null; // {pieceEl, originIdx, originLogical, ghostEl, pointerId}

function startDrag(e){
    // only primary button
    if(e.button !== 0) return;
    const pieceEl = e.currentTarget;
    // find the tile index
    const tileEl = pieceEl.closest && pieceEl.closest('#game-board .tile');
    if(!tileEl) return;
    const idx = tiles.indexOf(tileEl);
    if(idx < 0) return;
    const rows = currentBoard ? currentBoard.length : 0;
    const cols = boardCols || (currentBoard && currentBoard[0] && currentBoard[0].length) || 8;
    const visY = Math.floor(idx / cols);
    const visX = idx % cols;
    const rotated = (playerColor === 'b');
    const logicalY = rotated ? (rows - 1 - visY) : visY;
    const logicalX = rotated ? (cols - 1 - visX) : visX;

    e.preventDefault();
    pieceEl.setPointerCapture(e.pointerId);
    // create ghost image using pickup SVG (no glow)
    const board = currentBoard;
    const pieceValSrc = board && board[logicalY] ? board[logicalY][logicalX] : null;
    const pIdx = pieceValSrc ? parseInt(pieceValSrc[1], 10) : 0;
    const ghost = document.createElement('img');
    ghost.classList.add('piece-ghost');
    ghost.style.position = 'fixed';
    ghost.style.pointerEvents = 'none';
    ghost.style.opacity = '0.95';
    // point to the glow-free pickup SVG; fallback to original svg if missing
    ghost.src = `./pieces/${pIdx}.pickup.svg`;
    // size ghost to match source piece to avoid layout reflow issues
    const srcRect = pieceEl.getBoundingClientRect();
    ghost.style.width = srcRect.width + 'px';
    ghost.style.height = srcRect.height + 'px';
    ghost.style.boxSizing = 'border-box';
    document.body.appendChild(ghost);
    // place ghost at pointer
    moveGhostTo(ghost, e.clientX, e.clientY);

    _dragState = { pieceEl, originIdx: idx, originLogical: { row: logicalY, col: logicalX }, ghostEl: ghost, pointerId: e.pointerId };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', endDrag);
}

function moveGhostTo(ghost, x, y){
    // CSS for .piece-ghost uses transform: translate(-50%,-50%) so set left/top to pointer coords
    // This keeps the cursor centered on the ghost regardless of computed width/height.
    ghost.style.left = x + 'px';
    ghost.style.top = y + 'px';
}

function onPointerMove(e){
    if(!_dragState || e.pointerId !== _dragState.pointerId) return;
    // try to snap to the center of the tile under the pointer
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const tileEl = el && el.closest && el.closest('#game-board .tile');
    if(tileEl){
        const rect = tileEl.getBoundingClientRect();
        const cx = rect.left + rect.width/2;
        const cy = rect.top + rect.height/2;
        _dragState.ghostEl.style.left = cx + 'px';
        _dragState.ghostEl.style.top = cy + 'px';
    } else {
        moveGhostTo(_dragState.ghostEl, e.clientX, e.clientY);
    }
}

function endDrag(e){
    if(!_dragState || e.pointerId !== _dragState.pointerId) return cleanupDrag();
    const ghost = _dragState.ghostEl;
    // find tile under pointer
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const tileEl = el && el.closest && el.closest('#game-board .tile');
    if(tileEl){
        const idx = tiles.indexOf(tileEl);
        if(idx >= 0){
            const rows = currentBoard ? currentBoard.length : 0;
            const cols = boardCols || (currentBoard && currentBoard[0] && currentBoard[0].length) || 8;
            const visY = Math.floor(idx / cols);
            const visX = idx % cols;
            const rotated = (playerColor === 'b');
            const logicalY = rotated ? (rows - 1 - visY) : visY;
            const logicalX = rotated ? (cols - 1 - visX) : visX;

            // validate move: is the target square a valid move/take for this piece?
            const board = currentBoard;
            const origin = _dragState.originLogical;
            const pieceVal = board[origin.row][origin.col];
            if(pieceVal){
                const pieceIndex = parseInt(pieceVal[1],10);
                const color = pieceVal[0];
                // quick validation using showMoves (we could also use validSquare)
                const [dots, takes] = showMoves(board, pieceIndex, color, origin.row, origin.col);
                let ok = false;
                for(let i=0;i<dots.length;i+=2){ if(dots[i]===logicalY && dots[i+1]===logicalX) ok = true; }
                for(let i=0;i<takes.length;i+=2){ if(takes[i]===logicalY && takes[i+1]===logicalX) ok = true; }
                if(ok){
                    // apply move
                    const newBoard = movePiece(board, pieceIndex, color, origin.row, origin.col, logicalY, logicalX);
                    renderBoard(newBoard);
                    try{ window.dispatchEvent(new CustomEvent('player:move', { detail: { fromRow: origin.row, fromCol: origin.col, toRow: logicalY, toCol: logicalX, pieceIndex, color } })); }catch(e){}
                    cleanupDrag();
                    return;
                }
            }
        }
    }
    // invalid drop: animate ghost fade and cleanup
    if(ghost && ghost.parentNode){ ghost.style.transition = 'opacity 0.18s'; ghost.style.opacity = '0.2'; setTimeout(()=> cleanupDrag(), 180); } else cleanupDrag();
}

function cleanupDrag(){
    if(!_dragState) return;
    try{ if(_dragState.pieceEl && _dragState.pointerId) _dragState.pieceEl.releasePointerCapture(_dragState.pointerId); }catch(e){}
    if(_dragState.ghostEl && _dragState.ghostEl.parentNode) _dragState.ghostEl.parentNode.removeChild(_dragState.ghostEl);
    _dragState = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', endDrag);
}
