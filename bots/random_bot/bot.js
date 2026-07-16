const engine = typeof window !== 'undefined' ? window.PoachersEngine : require('../../engine.js');

const { PLAYER_TEAMS } = engine;

/**
 * Returns a completely random legal move for the active player.
 */
function getBestMove(gameState, P) {
  const activePlayer = gameState.turn;
  const moves = engine.getAllLegalMovesForActivePlayer(gameState);
  
  // Find promotion moves
  const team = PLAYER_TEAMS[activePlayer];
  const pool = gameState.capturedPieces[team];
  const possiblePromotions = [];
  if (pool.rooks > 0) possiblePromotions.push({ type: 'r', subtype: null });
  if (pool.knights > 0) possiblePromotions.push({ type: 'n', subtype: null });
  if (pool.darkBishop > 0) possiblePromotions.push({ type: 'b', subtype: 'dark' });
  if (pool.lightBishop > 0) possiblePromotions.push({ type: 'b', subtype: 'light' });
  if (pool.king !== null) possiblePromotions.push({ type: 'k', subtype: null });
  
  for (const promo of possiblePromotions) {
    const validSquares = engine.find_pawns_to_promot(activePlayer, promo.type, promo.subtype, gameState);
    for (const sq of validSquares) {
      moves.push({
        type: 'promote',
        to: { r: sq.r, c: sq.c },
        promoType: promo.type,
        promoSubtype: promo.subtype
      });
    }
  }
  
  if (moves.length === 0) return null;
  
  // Pick a random move
  const randomIndex = Math.floor(Math.random() * moves.length);
  return moves[randomIndex];
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getBestMove
  };
}

if (typeof window !== 'undefined') {
  window.PoachersRandomBot = {
    getBestMove
  };
}
