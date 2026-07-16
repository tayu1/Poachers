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

function getColumnRegion(col) {
  if (col >= 0 && col <= 2) return 0;
  if (col >= 3 && col <= 4) return 1;
  if (col >= 5 && col <= 7) return 2;
  return -1;
}

function getRowRegion(row) {
  if (row >= 0 && row <= 2) return 0;
  if (row >= 3 && row <= 4) return 1;
  if (row >= 5 && row <= 7) return 2;
  return -1;
}

/**
 * Returns a Set of coordinates (as 'r,c' strings) threatened by the given player's team.
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
 * Returns coordinates of friendly pieces pinning/blocking enemy sliders.
 */
function getPinnedPieces(board, playerIndex) {
  const team = PLAYER_TEAMS[playerIndex];
  const pinned = [];
  
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
            if (getPieceTeam(firstPiece) !== team) break;
          } else {
            if (getPieceTeam(firstPiece) === team && getPieceTeam(piece) !== team) {
              const type = getPieceType(piece);
              if ((isDiag && type === 'b') || (!isDiag && type === 'r')) {
                pinned.push(firstPieceCoords);
              }
            }
            break;
          }
        }
        step++;
      }
    }
  }
  return pinned;
}

/**
 * Computes regional card strength probabilities once per turn.
 */
function computeRegionProbabilities(gameState, playerId) {
  const allCards = engine.createDeck();
  const knownCards = new Set();
  
  gameState.publicCards.forEach(c => knownCards.add(c));
  gameState.players.forEach(p => {
    p.positionalCards.forEach(c => {
      if (c) knownCards.add(c);
    });
  });
  gameState.players[playerId].baseDeck.forEach(c => knownCards.add(c));
  
  const unknownCards = allCards.filter(c => !knownCards.has(c));
  const regionProbs = new Array(9);
  
  // Pre-generate 35 random turn/river samples to ensure consistency and speed
  const numSamples = 35;
  const samples = [];
  for (let s = 0; s < numSamples; s++) {
    const idx1 = Math.floor(Math.random() * unknownCards.length);
    let idx2 = Math.floor(Math.random() * (unknownCards.length - 1));
    if (idx2 >= idx1) idx2++;
    samples.push([unknownCards[idx1], unknownCards[idx2]]);
  }
  
  for (let colRegion = 0; colRegion < 3; colRegion++) {
    for (let rowRegion = 0; rowRegion < 3; rowRegion++) {
      const teamACards = [
        gameState.players[PLAYERS.NORTH].positionalCards[colRegion],
        gameState.players[PLAYERS.SOUTH].positionalCards[colRegion]
      ];
      const teamBCards = [
        gameState.players[PLAYERS.WEST].positionalCards[rowRegion],
        gameState.players[PLAYERS.EAST].positionalCards[rowRegion]
      ];
      
      let winsA = 0;
      let winsB = 0;
      let draws = 0;
      let total = 0;
      
      for (const [turn, river] of samples) {
        const public5Cards = [...gameState.publicCards, turn, river];
        const teamAHand = getBestHand([...teamACards, ...public5Cards]);
        const teamBHand = getBestHand([...teamBCards, ...public5Cards]);
        
        total++;
        if (teamAHand.rank > teamBHand.rank) {
          winsA++;
        } else if (teamBHand.rank > teamAHand.rank) {
          winsB++;
        } else {
          let tieBroken = false;
          for (let k = 0; k < teamAHand.kickers.length; k++) {
            if (teamAHand.kickers[k] > teamBHand.kickers[k]) {
              winsA++;
              tieBroken = true;
              break;
            } else if (teamBHand.kickers[k] > teamAHand.kickers[k]) {
              winsB++;
              tieBroken = true;
              break;
            }
          }
          if (!tieBroken) {
            draws++;
          }
        }
      }
      
      regionProbs[colRegion * 3 + rowRegion] = { winsA, winsB, draws, total };
    }
  }
  return regionProbs;
}

/**
 * Computes exact combat win probability using the precalculated region probabilities.
 */
function getCombatWinProbabilityFast(move, regionProbs, playerId) {
  const myTeam = PLAYER_TEAMS[playerId];
  const colRegion = getColumnRegion(move.to.c);
  const rowRegion = getRowRegion(move.to.r);
  const stats = regionProbs[colRegion * 3 + rowRegion];
  if (!stats) return 0.5;
  
  if (myTeam === TEAMS.A) {
    return (stats.winsA + stats.draws) / stats.total;
  } else {
    return (stats.winsB + stats.draws) / stats.total;
  }
}

/**
 * Fallback to standard slow computation when regionProbs is not available.
 */
function getCombatWinProbabilitySlow(move, gameState, playerId) {
  const allCards = engine.createDeck();
  const knownCards = new Set();
  gameState.publicCards.forEach(c => knownCards.add(c));
  gameState.players.forEach(p => p.positionalCards.forEach(c => { if (c) knownCards.add(c); }));
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
      if (res.winnerTeam === myTeam || (res.isDraw && res.attackerTeam === myTeam)) {
        wins++;
      }
    }
  }
  return wins / total;
}

/**
 * Evaluates the board utility.
 */
function evaluateBoardInternal(gameState, playerIndex, P, regionProbs) {
  const team = PLAYER_TEAMS[playerIndex];
  
  // 1. King Count and Game Over check
  let kingsMine = 0;
  let kingsOpp = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = gameState.board[r][c];
      if (piece) {
        const pTeam = getPieceTeam(piece);
        const type = getPieceType(piece);
        if (type === 'k') {
          if (pTeam === team) kingsMine++;
          else kingsOpp++;
        }
      }
    }
  }
  if (kingsMine === 0) return -100000;
  if (kingsOpp === 0) return 100000;

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

        // Card-aware safety evaluation
        if (regionProbs) {
          const stats = regionProbs[getColumnRegion(c) * 3 + getRowRegion(r)];
          if (stats) {
            const P_def = (pTeam === TEAMS.A) ? (stats.winsA / stats.total) : (stats.winsB / stats.total);
            if (allOppThreats.has(`${r},${c}`)) {
              score -= val * (1 - P_def) * 0.5;
            } else {
              score += val * P_def * 0.1;
            }
          }
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

        // Card-aware vulnerability evaluation
        if (regionProbs) {
          const stats = regionProbs[getColumnRegion(c) * 3 + getRowRegion(r)];
          if (stats) {
            const P_attack = (pTeam === TEAMS.A) ? ((stats.winsA + stats.draws) / stats.total) : ((stats.winsB + stats.draws) / stats.total);
            if (myThreats.has(`${r},${c}`)) {
              score += val * P_attack * 0.5;
            } else {
              score -= val * (1 - P_attack) * 0.1;
            }
          }
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

  // Add small value for base deck size
  const myBaseSize = gameState.players[playerIndex].baseDeck.length;
  const opp1BaseSize = gameState.players[(playerIndex + 1) % 4].baseDeck.length;
  const opp2BaseSize = gameState.players[(playerIndex + 3) % 4].baseDeck.length;
  score += 0.2 * myBaseSize;
  score -= 0.1 * (opp1BaseSize + opp2BaseSize);
  
  return score;
}

function evaluateBoard(gameState, playerIndex, P) {
  const regionProbs = gameState.regionProbs || computeRegionProbabilities(gameState, playerIndex);
  return evaluateBoardInternal(gameState, playerIndex, P, regionProbs);
}

function hashBoard(board) {
  return board.map(row => row.map(cell => cell || '.').join('')).join('|');
}

let boardHistory = [];
let initialBoardHash = null;

function getBestMove(gameState, P) {
  if (!initialBoardHash && engine.INITIAL_BOARD) {
    initialBoardHash = hashBoard(engine.INITIAL_BOARD);
  }
  
  const currentHash = hashBoard(gameState.board);
  if (currentHash === initialBoardHash) {
    boardHistory = [];
  }

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
  
  const regionProbs = gameState.regionProbs || computeRegionProbabilities(gameState, activePlayer);
  
  let bestMove = null;
  let bestScore = -Infinity;
  
  for (const move of moves) {
    const nextState = JSON.parse(JSON.stringify(gameState));
    let moveScore = 0;
    
    if (move.type === 'move') {
      nextState.board[move.to.r][move.to.c] = nextState.board[move.from.r][move.from.c];
      nextState.board[move.from.r][move.from.c] = null;
      moveScore = evaluateBoardInternal(nextState, activePlayer, P, regionProbs);
    } else if (move.type === 'promote') {
      engine.executePromotion(move.to.r, move.to.c, move.promoType, move.promoSubtype, activePlayer, nextState);
      moveScore = evaluateBoardInternal(nextState, activePlayer, P, regionProbs);
      moveScore += P[8];
    } else {
      // Attack / Capture
      const winProb = getCombatWinProbabilityFast(move, regionProbs, activePlayer);
      
      // Simulate win
      const winState = JSON.parse(JSON.stringify(gameState));
      const toPiece = winState.board[move.to.r][move.to.c];
      if (toPiece) {
        engine.add_to_captured_pieces(toPiece, move.to.r, move.to.c, winState);
      }
      winState.board[move.to.r][move.to.c] = winState.board[move.from.r][move.from.c];
      winState.board[move.from.r][move.from.c] = null;
      const winScore = evaluateBoardInternal(winState, activePlayer, P, regionProbs);
      
      // Simulate lose (assume stay)
      const loseState = JSON.parse(JSON.stringify(gameState));
      const loseScore = evaluateBoardInternal(loseState, activePlayer, P, regionProbs);
      
      moveScore = (winProb * winScore) + ((1 - winProb) * loseScore);
      moveScore += P[12] * winProb;
    }
    
    // Repetition check & penalty
    if (move.type === 'move') {
      const nextHash = hashBoard(nextState.board);
      const historyIdx = boardHistory.indexOf(nextHash);
      if (historyIdx !== -1) {
        const repPenalty = -15.0 / (boardHistory.length - historyIdx);
        moveScore += repPenalty;
      }
    }
    
    moveScore += (Math.random() * 0.1 - 0.05);
    
    if (moveScore > bestScore) {
      bestScore = moveScore;
      bestMove = move;
    }
  }
  
  if (bestMove && bestMove.type === 'move') {
    const nextState = JSON.parse(JSON.stringify(gameState));
    nextState.board[bestMove.to.r][bestMove.to.c] = nextState.board[bestMove.from.r][bestMove.from.c];
    nextState.board[bestMove.from.r][bestMove.from.c] = null;
    const chosenHash = hashBoard(nextState.board);
    boardHistory.push(chosenHash);
    if (boardHistory.length > 12) {
      boardHistory.shift();
    }
  }
  
  return bestMove;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getThreatenedCells,
    getPinnedPieces,
    getCombatWinProbability: getCombatWinProbabilitySlow,
    evaluateBoard,
    getBestMove
  };
}

if (typeof window !== 'undefined') {
  window.PoachersBot_no_minimax = {
    getThreatenedCells,
    getPinnedPieces,
    getCombatWinProbability: getCombatWinProbabilitySlow,
    evaluateBoard,
    getBestMove
  };
}
})();
} catch (e) {
  console.error("BOT JS LOAD ERROR (NO MINIMAX)", e);
}
