// smush our funky board format into classic FEN so chess engines don't rage
// board[0] is the top (rank 8), board[7] bottom (rank 1) — yeah that's how we roll
// pieces are 'w2' or 'b4' or null

const PIECE_MAP = {
  0: 'p', // pawn
  1: 'k', // king
  2: 'n', // knight
  3: 'b', // bishop
  4: 'r', // rook
  5: 'q'  // queen
};

export function boardToFEN(board, sideToMove = 'w'){
  if(!Array.isArray(board) || board.length===0) return '';
  const rows = board.length;
  const cols = board[0].length;
  const ranks = [];
  for(let r=0;r<rows;r++){
    let empty = 0;
    let parts = '';
    for(let c=0;c<cols;c++){
      const v = board[r][c];
      if(!v){ empty++; continue; }
      if(empty>0){ parts += String(empty); empty = 0; }
      const color = v[0];
      const idx = parseInt(v[1],10);
      const letter = PIECE_MAP[idx] || 'p';
      parts += (color === 'w' ? letter.toUpperCase() : letter.toLowerCase());
    }
    if(empty>0) parts += String(empty);
    ranks.push(parts);
  }
  // FEN wants ranks 8->1; our board already lines up (praise the heavens)
  const fenBoard = ranks.join('/');
  const side = sideToMove === 'b' ? 'b' : 'w';
  // minimal additional fields: castling -, en-passant -, halfmove 0, fullmove 1
  return `${fenBoard} ${side} - - 0 1`;
}

export default boardToFEN;
