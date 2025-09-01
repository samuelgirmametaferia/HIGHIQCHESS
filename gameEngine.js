export class Piece {
    constructor(id, color, row, column) {
        this.ID = id;
        this.color = color;
        this.row = row;
        this.column = column;
    }
    pMoves() {
        switch (this.ID) {
            case 0:
                console.log("SINCE THE DAWN OF TIME!");
                return ["limVs", [1, 1, -1, 1], []];
            case 1:
                return ["limVs", [1, 1, -1, 1, 1, -1, -1, -1, -1, 0, 1, 0, 0, 1, 0, -1], []];
            case 2:
                return ["jmpVa2", [2, 0, -2, 0, 0, 2, 0, -2, 2, 2, -2, 2, -2, -2, 2, -2], []];
            case 3:
                return ["ulimVs", [1, 1, -1, 1, -1, -1, 1, -1], []];
            case 4:
                return [
                    "spVs",
                    [0, 1, 0, -1, 1, 0, -1, 0], // normal rook-like one step
                    [0, 2] // forward jump (dy=2 means “two steps forward” for black, backward for white)
                ];

            case 5:
                return ["ulimVs", [1, 1, -1, 1, -1, -1, 1, -1, 0, 1, 0, -1, 1, 0, -1, 0], []];
            default:
                console.log("ERROR! ERROR! WAMP WAMP DUMB B*TCH");
                return ["error", "error", "error"];
        }
    }
}
export let takenPieces = [];
export let lastMove = null; // {fromRow, fromCol, toRow, toCol, pieceIndex, color}
// Helper: deep clone board for simulation
function cloneBoard(board){
    return JSON.parse(JSON.stringify(board));
}

// Find the king (assumption: piece index 1 is the king)
export function findKingPosition(board, color){
    for(let r=0;r<board.length;r++){
        for(let c=0;c<(board[r]||[]).length;c++){
            const v = board[r][c];
            if(v && v[0]===color && parseInt(v[1],10)===1) return [r,c];
        }
    }
    return null;
}

// Check if a square is attacked by any piece of byColor
export function isSquareAttacked(board, row, col, byColor){
    for(let r=0;r<board.length;r++){
        for(let c=0;c<(board[r]||[]).length;c++){
            const v = board[r][c];
            if(!v || v[0]!==byColor) continue;
            const pIdx = parseInt(v[1],10);
            if(Number.isNaN(pIdx) || pIdx>=7) continue;
            const [dotArray, takeArray] = showMoves(board, pIdx, byColor, r, c);
            for(let i=0;i<takeArray.length;i+=2){ if(takeArray[i]===row && takeArray[i+1]===col) return true; }
            // Some movesystems may allow moving onto square as a 'move' as attack (e.g., en passant not used), but we check takes primarily
        }
    }
    return false;
}

// Check if color is currently in check
export function inCheck(board, color){
    const pos = findKingPosition(board, color);
    if(!pos) return true; // no king = treated as check/checkmate
    const [r,c] = pos;
    const opp = color==='w'?'b':'w';
    return isSquareAttacked(board, r, c, opp);
}

// Return true if color has any legal move that results in king not in check
export function hasLegalMoves(board, color){
    for(let r=0;r<board.length;r++){
        for(let c=0;c<(board[r]||[]).length;c++){
            const v = board[r][c];
            if(!v || v[0]!==color) continue;
            const pIdx = parseInt(v[1],10);
            if(Number.isNaN(pIdx) || pIdx>=7) continue;
            const [dots, takes] = showMoves(board, pIdx, color, r, c);
            // try quiet moves
            for(let i=0;i<dots.length;i+=2){
                const tr = dots[i], tc = dots[i+1];
                const sim = cloneBoard(board);
                // apply move
                sim[tr][tc] = `${color}${pIdx}`;
                sim[r][c] = null;
                if(!inCheck(sim, color)) return true;
            }
            // try captures
            for(let i=0;i<takes.length;i+=2){
                const tr = takes[i], tc = takes[i+1];
                const sim = cloneBoard(board);
                sim[tr][tc] = `${color}${pIdx}`;
                sim[r][c] = null;
                if(!inCheck(sim, color)) return true;
            }
        }
    }
    return false;
}

export function isCheckmate(board, color){
    // If the king is missing, treat as immediate checkmate
    const pos = findKingPosition(board, color);
    if(!pos) return true;
    if(!inCheck(board, color)) return false;
    return !hasLegalMoves(board, color);
}
export function validSquare(row, column, board2D, pieceIndex, color = "w", check = true) {
    // guard against invalid pieceIndex
    if (typeof pieceIndex === "number" && pieceIndex > 7) {
        return ["invalid", false];
    }
    if (!check) {
        return ["invalid", false];
    }
    // use board dimensions for bounds
    const rows = board2D.length;
    const cols = board2D[0]?.length ?? 0;
    if (row < 0 || row >= rows || column < 0 || column >= cols) {
        return ["invalid", false];
    }

    const tile = board2D[row][column];
    if (tile == null) {
        return ["move", true];
    } else if (tile[0] != color) {
        return ["take", true];
    } else {
        return ["invalid", false];
    }
}

// THIS DIDN'T TAKE THAT MUCH TIME TO IMPLEMENT>  X<
function applyVector(row, col, dx, dy, color) {
    const rowChange = (color === 'w') ? -dy : dy;
    return [row + rowChange, col + dx];
}

export function showMoves(board2D, pieceIndex, color, currentRow, currentColumn) {
    let currentPiece = new Piece(pieceIndex, color, currentRow, currentColumn);
    let dotArray = [];
    let takedotArray = [];
    let [op, mv, anim] = currentPiece.pMoves();
    let operations = op.split("V");
    let op1 = operations[1];
    if (operations[0] == "lim") {

        if (op1.startsWith("s")) {
            for (let n = 0; n < mv.length; n += 2) {
                // mv is [dx, dy, dx, dy ...] man grid calculus is cooked
                let dx = mv[n];
                let dy = mv[n + 1];
                let [targetRow, targetCol] = applyVector(currentRow, currentColumn, dx, dy, color);
                let [protocol, check] = validSquare(targetRow, targetCol, board2D, pieceIndex, color);
                console.log(targetRow, targetCol);
                if (check && protocol == "move") {
                    dotArray.push(targetRow, targetCol);
                } else if (check && protocol == "take") {
                    takedotArray.push(targetRow, targetCol);
                }
            }
        } else {
            //we are animating in 2s because I am cooked.
            //let animBy = parseInt(op1[1]);

            for (let n = 0; n < anim.length; n += 4) {
                // anim uses pairs that sum to a net dx/dy
                let dx = anim[n] + anim[n + 2];
                let dy = anim[n + 1] + anim[n + 3];
                let [targetRow, targetCol] = applyVector(currentRow, currentColumn, dx, dy, color);
                let [proc3, jmpAnim2] = validSquare(targetRow, targetCol, board2D, pieceIndex, color);
                if (jmpAnim2 && proc3 == "move") {
                    dotArray.push(targetRow, targetCol);
                } else if (jmpAnim2 && proc3 == "take") {
                    takedotArray.push(targetRow, targetCol);
                }
            }
        }
    } else if (operations[0] == "ulim") {
        if (op1.startsWith("s")) {

            for (let n = 0; n < mv.length; n += 2) {
                let dx = mv[n];
                let dy = mv[n + 1];
                let cC = currentColumn;
                let cR = currentRow;
                while (true) {
                    // advance. PLEASE I NEED THIS.
                    let [nextR, nextC] = applyVector(cR, cC, dx, dy, color);
                    cR = nextR;
                    cC = nextC;

                    let [proc, check] = validSquare(cR, cC, board2D, pieceIndex, color);

                    if (check && proc === "move") {
                        dotArray.push(cR, cC);
                    } else if (check && proc === "take") {
                        takedotArray.push(cR, cC);
                        // stop sliding when encountering an enemy piece; cannot jump over it
                        break;

                    } else {
                        break;
                    }
                }

            }

        } else {
            console.log("Not rn now");
        }
    } else if (operations[0] == "sp") {
        for (let n = 0; n < mv.length; n += 2) {
            let dx = mv[n];
            let dy = mv[n + 1];
            let cC = currentColumn;
            let cR = currentRow;
            // only white piece with ID 4 may perform jumping-captures here
            const allowJump = (pieceIndex === 4 && color === 'w');
            let freeBI = false;
            while (true) {
                // advance
                let [nextR, nextC] = applyVector(cR, cC, dx, dy, color);
                cR = nextR;
                cC = nextC;

                let [proc, check] = validSquare(cR, cC, board2D, pieceIndex, color);

                if (check && proc === "move") {
                    dotArray.push(cR, cC);
                } else if (check && proc === "take") {
                    // if jumps are not allowed for this piece, present capture but stop (no jump over)
                    if (!allowJump) {
                        takedotArray.push(cR, cC);
                        break;
                    }
                    // allowJump true: permit a single capture jump
                    if (freeBI) break;
                    takedotArray.push(cR, cC);
                    freeBI = true;
                } else {
                    break;
                }
            }
        }
    } else {
        if (op1.startsWith("s")) {
            console.log("Uhh what? What do you mean? Anim can't be empty rn. You are either using jmp or something else/");
        } else {
            for (let n = 0; n < mv.length; n += 2) {
                let dx = mv[n];
                let dy = mv[n + 1];
                let [targetRow, targetCol] = applyVector(currentRow, currentColumn, dx, dy, color);
                let [proc3, jmpAnim2] = validSquare(targetRow, targetCol, board2D, pieceIndex, color);
                if (jmpAnim2 && proc3 == "move") {
                    dotArray.push(targetRow, targetCol);
                } else if (jmpAnim2 && proc3 == "take") {
                    takedotArray.push(targetRow, targetCol);
                }
            }
        }
    }
    return [dotArray, takedotArray];
}

export function movePiece(board2D, pieceIndex, color, currentRow, currentColumn, targetRow, targetCol) {
    let newBoard = board2D;
    let [proc, ans] = validSquare(targetRow, targetCol, board2D, pieceIndex, color);
    console.log(`${proc},${ans}`)
    if (ans) {
        if (proc === "take") {
            takenPieces.push(new Piece(pieceIndex, color, targetRow, targetCol));
        }
        newBoard[targetRow][targetCol] = `${color}${pieceIndex}`;
        newBoard[currentRow][currentColumn] = null;
        // record last move
        lastMove = { fromRow: currentRow, fromCol: currentColumn, toRow: targetRow, toCol: targetCol, pieceIndex, color };
        try{
            window.dispatchEvent(new CustomEvent('move:applied', { detail: lastMove }));
        }catch(e){}
        // check/checkmate detection
        try{
            const opp = color === 'w' ? 'b' : 'w';
            // use the updated board state (after the move) when evaluating check/checkmate
            if(inCheck(newBoard, opp)){
                window.dispatchEvent(new CustomEvent('game:check', { detail: { color: opp } }));
                if(isCheckmate(newBoard, opp)){
                    window.dispatchEvent(new CustomEvent('game:checkmate', { detail: { color: opp } }));
                }
            }
        }catch(e){console.error('check detection failed',e)}
    }

    return board2D;
}