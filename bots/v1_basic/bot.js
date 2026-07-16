try {
(function() {
let engine;
if (typeof window !== 'undefined') {
  engine = window.PoachersEngine;
} else if (typeof require !== 'undefined') {
  engine = require('../../engine.js');
}

const {
  PLAYERS, TEAMS, PLAYER_TEAMS, PIECES,
  getPieceTeam, getPieceType, isWithinBoard,
  getLegalMoves, evaluate5CardHand, getBestHand,
  getPositionalCardsForCell, HILL_SQUARES
} = engine;

/**
 * Returns a Set of coordinates (as 'r,c' strings) threatened by the given player's team.
 * A cell is considered threatened if any of the team's pieces can attack it (diagonally for pawns)
 * or move to it (for other pieces).
 */
function getThreatenedCells(board, playerId) {
  const threatened = new Set();
  const playerTeam = PLAYER_TEAMS[playerId];
  
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece && getPieceTeam(piece) === playerTeam) {
        const type = getPieceType(piece);
        
        if (type === 'p') {
          const diagDirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
          for (const [dr, dc] of diagDirs) {
            const tr = r + dr;
            const tc = c + dc;
            if (isWithinBoard(tr, tc)) {
              threatened.add(`${tr},${tc}`);
            }
          }
        } else if (type === 'n') {
          const knightOffsets = [
            [-2, -1], [-2, 1], [-1, -2], [-1, 2],
            [1, -2], [1, 2], [2, -1], [2, 1]
          ];
          for (const [dr, dc] of knightOffsets) {
             const tr = r + dr;
             const tc = c + dc;
             if (isWithinBoard(tr, tc)) threatened.add(`${tr},${tc}`);
          }
        } else if (type === 'b') {
          const diagDirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
          for (const [dr, dc] of diagDirs) {
            let step = 1;
            while (true) {
              const tr = r + dr * step;
              const tc = c + dc * step;
              if (!isWithinBoard(tr, tc)) break;
              threatened.add(`${tr},${tc}`);
              if (board[tr][tc]) break; // blocked by any piece
              step++;
            }
          }
        } else if (type === 'r') {
          const orthoDirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
          for (const [dr, dc] of orthoDirs) {
            let step = 1;
            while (true) {
              const tr = r + dr * step;
              const tc = c + dc * step;
              if (!isWithinBoard(tr, tc)) break;
              threatened.add(`${tr},${tc}`);
              if (board[tr][tc]) break; // blocked by any piece
              step++;
            }
          }
        } else if (type === 'k') {
          const kingDirs = [
            [-1, -1], [-1, 0], [-1, 1],
            [0, -1], [0, 1],
            [1, -1], [1, 0], [1, 1]
          ];
          for (const [dr, dc] of kingDirs) {
             const tr = r + dr;
             const tc = c + dc;
             if (isWithinBoard(tr, tc)) threatened.add(`${tr},${tc}`);
          }
        }
      }
    }
  }
  return threatened;
}

/**
 * Returns coordinates of friendly pieces that are currently pinning/blocking an enemy sliding piece 
 * (Rook/Bishop) from taking a friendly King.
 */
function getPinnedPieces(board, playerIndex) {
  const team = PLAYER_TEAMS[playerIndex];
  const pinned = [];
  
  // Find friendly kings
  const kings = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] && getPieceType(board[r][c]) === 'k' && getPieceTeam(board[r][c]) === team) {
        kings.push({r, c});
      }
    }
  }
  
  const dirs = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1], [0, 1],
    [1, -1], [1, 0], [1, 1]
  ];
  
  for (const king of kings) {
    for (let i = 0; i < dirs.length; i++) {
      const [dr, dc] = dirs[i];
      const isDiag = (dr !== 0 && dc !== 0);
      
      let step = 1;
      let firstPiece = null;
      let firstPieceCoords = null;
      
      while (true) {
        const tr = king.r + dr * step;
        const tc = king.c + dc * step;
        if (!isWithinBoard(tr, tc)) break;
        
        const piece = board[tr][tc];
        if (piece) {
          if (!firstPiece) {
            firstPiece = piece;
            firstPieceCoords = {r: tr, c: tc};
            // If the first piece is an enemy, the king is in check from this direction (not pinned)
            if (getPieceTeam(firstPiece) !== team) break;
          } else {
            // We found a second piece. If the first piece is friendly and this second piece is an enemy slider...
            if (getPieceTeam(firstPiece) === team && getPieceTeam(piece) !== team) {
              const type = getPieceType(piece);
              if ((isDiag && type === 'b') || (!isDiag && type === 'r')) {
                pinned.push(firstPieceCoords);
              }
            }
            break; // Stop ray casting after second piece
          }
        }
        step++;
      }
    }
  }
  
  return pinned;
}

/**
 * Computes exact combat win probability by evaluating all 32C2 possible Turn/River pairs (496).
 */
function getCombatWinProbability(move, gameState, playerId) {
  const allCards = engine.createDeck();
  const knownCards = new Set();
  
  gameState.publicCards.forEach(c => knownCards.add(c));
  gameState.players.forEach(p => {
    p.positionalCards.forEach(c => {
      if (c) knownCards.add(c);
    });
  });
  // The bot only knows its own base deck
  gameState.players[playerId].baseDeck.forEach(c => knownCards.add(c));
  
  const unknownCards = allCards.filter(c => !knownCards.has(c));
  
  let wins = 0;
  let total = 0;
  const myTeam = PLAYER_TEAMS[playerId];
  
  for (let i = 0; i < unknownCards.length; i++) {
    for (let j = i + 1; j < unknownCards.length; j++) {
      const turn = unknownCards[i];
      const river = unknownCards[j];
      
      const res = engine.evaluateCombat(move, [turn, river], gameState);
      total++;
      if (res.winnerTeam === myTeam) {
        wins++;
      } else if (res.isDraw && res.attackerTeam === myTeam) {
        wins++; // attacker wins draws
      }
    }
  }
  
  return wins / total;
}

/**
 * Evaluates the board utility for the active player's team based on weight set P.
 */
function evaluateBoard(gameState, playerIndex, P) {
  const team = PLAYER_TEAMS[playerIndex];
  let score = 0;
  
  const myThreats = getThreatenedCells(gameState.board, playerIndex);
  const oppThreatsA = getThreatenedCells(gameState.board, (playerIndex + 1) % 4);
  const oppThreatsB = getThreatenedCells(gameState.board, (playerIndex + 3) % 4);
  const allOppThreats = new Set([...oppThreatsA, ...oppThreatsB]);
  
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = gameState.board[r][c];
      if (!piece) continue;
      
      const pTeam = getPieceTeam(piece);
      const type = getPieceType(piece);
      const isMine = (pTeam === team);
      const sign = isMine ? 1 : -1;
      
      // Material
      let val = 0;
      if (type === 'p') val = P[0];
      if (type === 'n') val = P[1];
      if (type === 'b') val = P[2];
      if (type === 'r') val = P[3];
      if (type === 'k') val = P[4];
      score += val * sign;
      
      if (isMine) {
        const myHills = HILL_SQUARES[playerIndex]; 
        const partnerHills = HILL_SQUARES[(playerIndex + 2) % 4];
        const isOnHill = [...myHills, ...partnerHills].some(sq => sq.r === r && sq.c === c);
        if (isOnHill) score += P[5];
        
        if (engine.isFlankSquare(r, c)) score += P[6];
        
        if (type === 'p') {
          const distToCenter = Math.abs(r - 3.5) + Math.abs(c - 3.5);
          score += P[7] * (10 - distToCenter); 
        }
        
        if (type === 'k' && allOppThreats.has(`${r},${c}`)) {
          score -= P[10];
        }
      } else {
        const oppHills = HILL_SQUARES[(playerIndex + 1) % 4];
        const oppPartnerHills = HILL_SQUARES[(playerIndex + 3) % 4];
        const isOnHill = [...oppHills, ...oppPartnerHills].some(sq => sq.r === r && sq.c === c);
        if (isOnHill) score -= P[5];
        
        if (engine.isFlankSquare(r, c)) score -= P[6];
        
        if (type === 'p') {
          const distToCenter = Math.abs(r - 3.5) + Math.abs(c - 3.5);
          score -= P[7] * (10 - distToCenter);
        }
        
        if (type === 'k' && myThreats.has(`${r},${c}`)) {
          score += P[10];
        }
      }
    }
  }
  
  score += P[9] * myThreats.size;
  score -= P[9] * allOppThreats.size;
  
  const myPins = getPinnedPieces(gameState.board, playerIndex);
  score -= P[11] * myPins.length;
  
  const oppPinsA = getPinnedPieces(gameState.board, (playerIndex + 1) % 4);
  const oppPinsB = getPinnedPieces(gameState.board, (playerIndex + 3) % 4);
  score += P[11] * (oppPinsA.length + oppPinsB.length);
  
  return score;
}

/**
 * Returns the best move for the active player based on parameter weights P.
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
  
  let bestMove = null;
  let bestScore = -Infinity;
  
  for (const move of moves) {
    const nextState = JSON.parse(JSON.stringify(gameState));
    
    let moveScore = 0;
    
    if (move.type === 'move') {
      nextState.board[move.to.r][move.to.c] = nextState.board[move.from.r][move.from.c];
      nextState.board[move.from.r][move.from.c] = null;
      moveScore = evaluateBoard(nextState, activePlayer, P);
    } else if (move.type === 'promote') {
      engine.executePromotion(move.to.r, move.to.c, move.promoType, move.promoSubtype, activePlayer, nextState);
      moveScore = evaluateBoard(nextState, activePlayer, P);
      moveScore += P[8]; // Promotion preference
    } else {
      // Attack / Capture
      const winProb = getCombatWinProbability(move, gameState, activePlayer);
      
      // Simulate win
      const winState = JSON.parse(JSON.stringify(gameState));
      const toPiece = winState.board[move.to.r][move.to.c];
      engine.add_to_captured_pieces(toPiece, move.to.r, move.to.c, winState);
      winState.board[move.to.r][move.to.c] = winState.board[move.from.r][move.from.c];
      winState.board[move.from.r][move.from.c] = null;
      const winScore = evaluateBoard(winState, activePlayer, P);
      
      // Simulate lose (assume stay)
      const loseState = JSON.parse(JSON.stringify(gameState));
      const loseScore = evaluateBoard(loseState, activePlayer, P);
      
      moveScore = (winProb * winScore) + ((1 - winProb) * loseScore);
      moveScore += P[12] * winProb; // Direct attack move bonus
    }
    
    // Add small random noise to prevent getting stuck in loops
    moveScore += (Math.random() * 0.1 - 0.05);
    
    if (moveScore > bestScore) {
      bestScore = moveScore;
      bestMove = move;
    }
  }
  
  return bestMove;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getThreatenedCells,
    getPinnedPieces,
    getCombatWinProbability,
    evaluateBoard,
    getBestMove
  };
}

if (typeof window !== 'undefined') {
  window.PoachersBot = {
    getThreatenedCells,
    getPinnedPieces,
    getCombatWinProbability,
    evaluateBoard,
    getBestMove
  };
}
})();
} catch (e) {
  if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
      const logBox = document.getElementById('log-entries');
      if (logBox) {
        const div = document.createElement('div');
        div.style.color = 'red';
        div.innerText = `[BOT.JS EVAL ERROR] ${e.message}`;
        logBox.appendChild(div);
      }
    });
  }
  console.error("BOT JS LOAD ERROR", e);
}
