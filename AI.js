import { showMoves, inCheck, isCheckmate } from "./gameEngine.js";

// New: Negamax with alpha-beta and simple eval. Supports variable depth.
function cloneBoard(board) { return JSON.parse(JSON.stringify(board)); }

function materialScore(board, color) {
	// simple material: sum piece values; lower index = more valuable
	const vals = [100, 900, 300, 300, 500, 350];
	let s = 0;
	for (let r = 0; r < board.length; r++) {
		for (let c = 0; c < (board[r] || []).length; c++) {
			const v = board[r][c];
			if (!v) continue;
			const idx = parseInt(v[1], 10);
			const col = v[0];
			const val = vals[idx] || 0;
			s += (col === color) ? val : -val;
		}
	}
	return s;
}

function positionalScore(board, color) {
	// center preference and mobility proxy (more moves = better)
	let s = 0;
	const rows = board.length;
	const cols = (board[0] || []).length;
	const centerR = (rows - 1) / 2;
	const centerC = (cols - 1) / 2;
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			const v = board[r][c];
			if (!v) continue;
			const idx = parseInt(v[1], 10);
			const col = v[0];
			const dist = Math.abs(centerR - r) + Math.abs(centerC - c);
			const contribution = Math.max(0, 40 - dist * 6) * (col === color ? 1 : -1);
			s += contribution;
		}
	}
	return s;
}

function evalBoard(board, color) {
	// combine material + positional
	const mat = materialScore(board, color);
	const pos = positionalScore(board, color);
	return mat + pos;
}

function scoreCapture(board, toRow, toCol) {
	const target = board[toRow] && board[toRow][toCol];
	if (!target) return 0;
	const idx = parseInt(target[1], 10);
	if (Number.isNaN(idx)) return 50;
	return 120 + (6 - idx) * 8;
}

// generate all legal moves for color as array of {fromRow,fromCol,toRow,toCol,pIdx,isCapture,captureValue}
function generateMoves(board, color) {
	const moves = [];
	for (let r = 0; r < board.length; r++) {
		for (let c = 0; c < (board[r] || []).length; c++) {
			const v = board[r][c];
			if (!v || v[0] !== color) continue;
			const pIdx = parseInt(v[1], 10);
			if (Number.isNaN(pIdx) || pIdx >= 7) continue;
			const [dots, takes] = showMoves(board, pIdx, color, r, c);
			for (let i = 0; i < dots.length; i += 2) moves.push({ fromRow: r, fromCol: c, toRow: dots[i], toCol: dots[i+1], pieceIndex: pIdx, isCapture: false, captureValue: 0 });
			for (let i = 0; i < takes.length; i += 2) {
				const tr = takes[i], tc = takes[i+1];
				moves.push({ fromRow: r, fromCol: c, toRow: tr, toCol: tc, pieceIndex: pIdx, isCapture: true, captureValue: scoreCapture(board, tr, tc) });
			}
		}
	}
	// order: captures first by value
	moves.sort((a,b)=> (b.isCapture ? b.captureValue : 0) - (a.isCapture ? a.captureValue : 0));
	return moves;
}

function applyMove(board, mv, color){
	const sim = cloneBoard(board);
	sim[mv.toRow][mv.toCol] = `${color}${mv.pieceIndex}`;
	sim[mv.fromRow][mv.fromCol] = null;
	return sim;
}

// quiescence: only consider captures until quiet
function quiescence(board, color, alpha, beta) {
	const stand = evalBoard(board, color);
	if (stand >= beta) return beta;
	if (alpha < stand) alpha = stand;

	const moves = generateMoves(board, color).filter(m=>m.isCapture);
	for (const mv of moves) {
		const sim = applyMove(board, mv, color);
		if (inCheck(sim, color)) continue;
		const score = -quiescence(sim, color === 'w' ? 'b' : 'w', -beta, -alpha);
		if (score >= beta) return beta;
		if (score > alpha) alpha = score;
	}
	return alpha;
}

function negamax(board, color, depth, alpha, beta) {
	if (depth <= 0) {
		// quiescence search to avoid horizon effect
		const q = quiescence(board, color, alpha, beta);
		return { score: q, move: null };
	}
	const moves = generateMoves(board, color);
	if (!moves.length) {
		// no moves: checkmate or stalemate
		if (inCheck(board, color)) return { score: -100000, move: null };
		return { score: 0, move: null };
	}
	let bestScore = -Infinity;
	let bestMove = null;
	for (const mv of moves) {
		const sim = applyMove(board, mv, color);
		if (inCheck(sim, color)) continue; // illegal: left king in check
		const res = negamax(sim, color === 'w' ? 'b' : 'w', depth - 1, -beta, -alpha);
		const score = -res.score;
		if (score > bestScore) { bestScore = score; bestMove = mv; }
		if (score > alpha) alpha = score;
		if (alpha >= beta) break; // beta cutoff
	}
	return { score: bestScore, move: bestMove };
}

// exported: findBestMove(board, color, depth=2)
export function findBestMove(board, color, depth = 2) {
	// clamp depth
	depth = Math.max(1, Math.min(10, depth));
	const result = negamax(board, color, depth, -Infinity, Infinity);
	if (!result || !result.move) return null;
	return { fromRow: result.move.fromRow, fromCol: result.move.fromCol, toRow: result.move.toRow, toCol: result.move.toCol, pieceIndex: result.move.pieceIndex };
}
