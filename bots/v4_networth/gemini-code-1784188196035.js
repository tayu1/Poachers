/**
 * Poachers Bot v4 — "NetWorth" (Fixed)
 * 
 * Improvements:
 * 1. Absolute King tracking (detects game over states).
 * 2. Massive penalties for moving into or remaining in check.
 * 3. Fixed static threat tension logic (bypassing buggy mock piece objects).
 * 4. Defense awareness (threatened pieces lose less expected value if defended).
 * 5. Added promotion bonuses.
 */
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
  getLegalMoves, getAllLegalMovesForActivePlayer,
  getPositionalCardsForCell, HILL_SQUARES,
  getSlideDestination, find_pawns_to_promot,
  executePromotion, add_to_captured_pieces
} = engine;

// ─── Precomputed lookup tables ───────────────────────────────────────────────

const COL_REGION = new Uint8Array([0, 0, 0, 1, 1, 2, 2, 2]);
const ROW_REGION = new Uint8Array([0, 0, 0, 1, 1, 2, 2, 2]);

const PIECE_VAL_IDX = { 'p': 0, 'n': 1, 'b': 2, 'r': 3, 'k': 4 };

const HILL_IDX = {};
for (const pid of [0, 1, 2, 3]) {
  HILL_IDX[pid] = HILL_SQUARES[pid].map(sq => sq.r * 8 + sq.c);
}

// ─── Combat Probability Helper ───────────────────────────────────────────────

function getCombatWinProb(attackerPiece, targetPiece, regionProbs, attackerTeam, targetCoords) {
  const attackerType = getPieceType(attackerPiece);
  const targetType = getPieceType(targetPiece);

  if (attackerType === 'k' || targetType === 'k') {
    return 1.0; 
  }

  const stats = regionProbs[COL_REGION[targetCoords.c] * 3 + ROW_REGION[targetCoords.r]];
  if (!stats) return 0.5;

  return attackerTeam === TEAMS.A
    ? (stats.winsA + stats.draws) / stats.total
    : (stats.winsB + stats.draws) / stats.total;
}

// ─── Threat Map Helper ───────────────────────────────────────────────────────

function buildThreatMap(board, teamChar) {
  const threats = new Uint8Array(64);
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece) continue;
      const pTeam = getPieceTeam(piece);
      if (pTeam !== teamChar) continue;
      const type = getPieceType(piece);
      
      if (type === 'p') {
        if (r > 0 && c > 0) threats[(r-1)*8+(c-1)]++;
        if (r > 0 && c < 7) threats[(r-1)*8+(c+1)]++;
        if (r < 7 && c > 0) threats[(r+1)*8+(c-1)]++;
        if (r < 7 && c < 7) threats[(r+1)*8+(c+1)]++;
      } else if (type === 'n') {
        const offsets = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
        for (let i = 0; i < 8; i++) {
          const tr = r + offsets[i][0], tc = c + offsets[i][1];
          if (tr >= 0 && tr < 8 && tc >= 0 && tc < 8) threats[tr*8+tc]++;
        }
      } else if (type === 'b') {
        const dirs = [[-1,-1],[-1,1],[1,-1],[1,1]];
        for (let d = 0; d < 4; d++) {
          const dr = dirs[d][0], dc = dirs[d][1];
          let tr = r+dr, tc = c+dc;
          while (tr >= 0 && tr < 8 && tc >= 0 && tc < 8) {
            threats[tr*8+tc]++;
            if (board[tr][tc]) break;
            tr += dr; tc += dc;
          }
        }
      } else if (type === 'r') {
        const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
        for (let d = 0; d < 4; d++) {
          const dr = dirs[d][0], dc = dirs[d][1];
          let tr = r+dr, tc = c+dc;
          while (tr >= 0 && tr < 8 && tc >= 0 && tc < 8) {
            threats[tr*8+tc]++;
            if (board[tr][tc]) break;
            tr += dr; tc += dc;
          }
        }
      } else if (type === 'k') {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const tr = r+dr, tc = c+dc;
            if (tr >= 0 && tr < 8 && tc >= 0 && tc < 8) threats[tr*8+tc]++;
          }
        }
      }
    }
  }
  return threats;
}

// ─── Net Worth Evaluator (FIXED) ─────────────────────────────────────────────

function evaluateNetWorth(gameState, myTeam, activePlayer, regionProbs, P) {
  const board = gameState.board;
  let netWorth = 0;

  const myThreats = buildThreatMap(board, myTeam);
  const oppTeam = myTeam === TEAMS.A ? TEAMS.B : TEAMS.A;
  const oppThreats = buildThreatMap(board, oppTeam);

  const ALL_HILL_SQUARES = [
    ...HILL_IDX[0], ...HILL_IDX[1], ...HILL_IDX[2], ...HILL_IDX[3]
  ];

  let kingsMine = 0;
  let kingsOpp = 0;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      const idx = r * 8 + c;
      
      // Pillar 1: Center Control (Empty or Occupied)
      if (ALL_HILL_SQUARES.includes(idx)) {
        if (myThreats[idx] > 0) netWorth += (P[5] * 0.5); 
        if (oppThreats[idx] > 0) netWorth -= (P[5] * 0.5);
      }

      if (!piece) continue;

      const pTeam = getPieceTeam(piece);
      const type = getPieceType(piece);
      const isMine = (pTeam === myTeam);
      const sign = isMine ? 1 : -1;
      
      // Track Kings for absolute game-over detection
      if (type === 'k') {
        if (isMine) kingsMine++;
        else kingsOpp++;
      }

      // Pillar 2: Material
      const val = P[PIECE_VAL_IDX[type]];
      netWorth += val * sign;

      // Pillar 3: Center Occupancy
      if (ALL_HILL_SQUARES.includes(idx)) {
        netWorth += P[5] * sign; 
      }

      // Pillar 4: Threat Tension (Expected Value)
      const stats = regionProbs[COL_REGION[c] * 3 + ROW_REGION[r]];
      let winProbA = 0.5, winProbB = 0.5;
      if (stats && stats.total > 0) {
         winProbA = (stats.winsA + stats.draws) / stats.total;
         winProbB = (stats.winsB + stats.draws) / stats.total;
      }

      if (isMine) {
        if (oppThreats[idx] > 0) {
          if (type === 'k') {
            // FATAL PENALTY: Never leave the King in check
            netWorth -= 50000; 
          } else {
            const enemyWinProb = (oppTeam === TEAMS.A) ? winProbA : winProbB;
            // Mitigate penalty if the piece is safely defended by our own team
            const defenseFactor = (myThreats[idx] > 0) ? 0.2 : 1.0;
            netWorth -= (val * enemyWinProb * defenseFactor); 
          }
        }
      } else {
        if (myThreats[idx] > 0) {
          if (type === 'k') {
            // HUGE INCENTIVE: Attack the enemy King
            netWorth += 50000; 
          } else {
            const myWinProb = (myTeam === TEAMS.A) ? winProbA : winProbB;
            const defenseFactor = (oppThreats[idx] > 0) ? 0.2 : 1.0;
            netWorth += (val * myWinProb * defenseFactor);
          }
        }
      }
    }
  }

  // Absolute Win/Loss guards
  if (kingsMine === 0) return -1000000;
  if (kingsOpp === 0) return 1000000;

  return netWorth;
}

// ─── Monte Carlo Region probabilities ────────────────────────────────────────

function computeRegionProbabilities(gameState, playerId) {
  const allCards = engine.createDeck();
  const knownCards = new Set();
  
  gameState.publicCards.forEach(c => { if (c) knownCards.add(c); });
  gameState.players.forEach(p => {
    p.positionalCards.forEach(c => { if (c) knownCards.add(c); });
  });
  gameState.players[playerId].baseDeck.forEach(c => { if (c) knownCards.add(c); });
  
  const unknownCards = allCards.filter(c => !knownCards.has(c));
  const regionProbs = new Array(9);
  
  const numSamples = 40;
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
      
      let winsA = 0, winsB = 0, draws = 0, total = 0;
      
      for (const [turn, river] of samples) {
        const public5Cards = [...gameState.publicCards, turn, river];
        const teamAHand = engine.getBestHand([...teamACards, ...public5Cards]);
        const teamBHand = engine.getBestHand([...teamBCards, ...public5Cards]);
        
        total++;
        if (teamAHand.rank > teamBHand.rank) {
          winsA++;
        } else if (teamBHand.rank > teamAHand.rank) {
          winsB++;
        } else {
          let tieBroken = false;
          for (let k = 0; k < teamAHand.kickers.length; k++) {
            if (teamAHand.kickers[k] > teamBHand.kickers[k]) { winsA++; tieBroken = true; break; }
            else if (teamBHand.kickers[k] > teamAHand.kickers[k]) { winsB++; tieBroken = true; break; }
          }
          if (!tieBroken) draws++;
        }
      }
      
      regionProbs[colRegion * 3 + rowRegion] = { winsA, winsB, draws, total };
    }
  }
  return regionProbs;
}

// ─── Make / Unmake move pattern ──────────────────────────────────────────────

function makeMove(state, move, outcome) {
  const undo = { type: move.type, turn: state.turn };
  const board = state.board;
  
  if (move.type === 'move') {
    undo.fromR = move.from.r; undo.fromC = move.from.c;
    undo.toR = move.to.r; undo.toC = move.to.c;
    undo.fromPiece = board[move.from.r][move.from.c];
    undo.toPiece = board[move.to.r][move.to.c];
    board[move.to.r][move.to.c] = board[move.from.r][move.from.c];
    board[move.from.r][move.from.c] = null;
    state.turn = (state.turn + 1) % 4;
    
  } else if (move.type === 'capture') {
    undo.fromR = move.from.r; undo.fromC = move.from.c;
    undo.toR = move.to.r; undo.toC = move.to.c;
    undo.fromPiece = board[move.from.r][move.from.c];
    undo.toPiece = board[move.to.r][move.to.c];
    if (undo.toPiece) {
      const capTeam = getPieceTeam(undo.toPiece);
      undo.capTeam = capTeam;
      undo.poolSnapshot = { ...state.capturedPieces[capTeam] };
      add_to_captured_pieces(undo.toPiece, move.to.r, move.to.c, state);
    }
    board[move.to.r][move.to.c] = board[move.from.r][move.from.c];
    board[move.from.r][move.from.c] = null;
    state.turn = (state.turn + 1) % 4;
    
  } else if (move.type === 'attack') {
    if (outcome === 'win') {
      undo.fromR = move.from.r; undo.fromC = move.from.c;
      undo.toR = move.to.r; undo.toC = move.to.c;
      undo.fromPiece = board[move.from.r][move.from.c];
      undo.toPiece = board[move.to.r][move.to.c];
      if (undo.toPiece) {
        const capTeam = getPieceTeam(undo.toPiece);
        undo.capTeam = capTeam;
        undo.poolSnapshot = { ...state.capturedPieces[capTeam] };
        add_to_captured_pieces(undo.toPiece, move.to.r, move.to.c, state);
      }
      board[move.to.r][move.to.c] = board[move.from.r][move.from.c];
      board[move.from.r][move.from.c] = null;
      state.turn = (state.turn + 1) % 4;
    } else {
      undo.fromR = move.from.r; undo.fromC = move.from.c;
      undo.fromPiece = board[move.from.r][move.from.c];
      const attackerType = getPieceType(undo.fromPiece);
      undo.slid = false;
      if (attackerType === 'r' || attackerType === 'b') {
        const slideDest = getSlideDestination(move.from, move.to);
        if (slideDest.r !== move.from.r || slideDest.c !== move.from.c) {
          undo.slid = true;
          undo.slideR = slideDest.r; undo.slideC = slideDest.c;
          undo.slidePrevPiece = board[slideDest.r][slideDest.c];
          board[slideDest.r][slideDest.c] = board[move.from.r][move.from.c];
          board[move.from.r][move.from.c] = null;
        }
      }
      state.turn = (state.turn + 1) % 4;
    }
    undo.outcome = outcome;
    
  } else if (move.type === 'promote') {
    undo.toR = move.to.r; undo.toC = move.to.c;
    undo.prevPiece = board[move.to.r][move.to.c];
    undo.promoType = move.promoType;
    undo.promoSubtype = move.promoSubtype;
    const activeTeam = PLAYER_TEAMS[state.turn];
    undo.promoTeam = activeTeam;
    undo.poolSnapshot = { ...state.capturedPieces[activeTeam] };
    undo.playerId = state.turn;
    executePromotion(move.to.r, move.to.c, move.promoType, move.promoSubtype, state.turn, state);
    state.turn = (state.turn + 1) % 4;
  }
  
  return undo;
}

function unmakeMove(state, undo) {
  state.turn = undo.turn;
  const board = state.board;
  
  if (undo.type === 'move') {
    board[undo.fromR][undo.fromC] = undo.fromPiece;
    board[undo.toR][undo.toC] = undo.toPiece;
    
  } else if (undo.type === 'capture') {
    board[undo.fromR][undo.fromC] = undo.fromPiece;
    board[undo.toR][undo.toC] = undo.toPiece;
    if (undo.capTeam !== undefined) {
      state.capturedPieces[undo.capTeam] = undo.poolSnapshot;
    }
    
  } else if (undo.type === 'attack') {
    if (undo.outcome === 'win') {
      board[undo.fromR][undo.fromC] = undo.fromPiece;
      board[undo.toR][undo.toC] = undo.toPiece;
      if (undo.capTeam !== undefined) {
        state.capturedPieces[undo.capTeam] = undo.poolSnapshot;
      }
    } else {
      if (undo.slid) {
        board[undo.slideR][undo.slideC] = undo.slidePrevPiece;
      }
      board[undo.fromR][undo.fromC] = undo.fromPiece;
    }
    
  } else if (undo.type === 'promote') {
    board[undo.toR][undo.toC] = undo.prevPiece;
    state.capturedPieces[undo.promoTeam] = undo.poolSnapshot;
  }
}

// ─── Move generation with expansion ─────────────────────────────────────────

function getExpandedMoves(gameState, currentTurn) {
  const moves = getAllLegalMovesForActivePlayer(gameState);
  
  const team = PLAYER_TEAMS[currentTurn];
  const pool = gameState.capturedPieces[team];
  const possiblePromotions = [];
  if (pool.rooks > 0) possiblePromotions.push({ type: 'r', subtype: null });
  if (pool.knights > 0) possiblePromotions.push({ type: 'n', subtype: null });
  if (pool.darkBishop > 0) possiblePromotions.push({ type: 'b', subtype: 'dark' });
  if (pool.lightBishop > 0) possiblePromotions.push({ type: 'b', subtype: 'light' });
  if (pool.king !== null) possiblePromotions.push({ type: 'k', subtype: null });
  
  for (const promo of possiblePromotions) {
    const validSquares = find_pawns_to_promot(currentTurn, promo.type, promo.subtype, gameState);
    for (const sq of validSquares) {
      moves.push({
        type: 'promote',
        to: { r: sq.r, c: sq.c },
        promoType: promo.type,
        promoSubtype: promo.subtype
      });
    }
  }
  return moves;
}

// ─── 1-Ply Main Search Loop ──────────────────────────────────────────────────

function getBestMove(gameState, P) {
  const activePlayer = gameState.turn;
  const myTeam = PLAYER_TEAMS[activePlayer];
  const moves = getExpandedMoves(gameState, activePlayer);
  
  if (moves.length === 0) return null;

  const regionProbs = gameState.regionProbs || computeRegionProbabilities(gameState, activePlayer);

  let bestMove = null;
  let bestScore = -Infinity;

  for (const move of moves) {
    let score = 0;
    
    if (move.type === 'attack') {
      const attackerPiece = gameState.board[move.from.r][move.from.c];
      const targetPiece = gameState.board[move.to.r][move.to.c];
      const winProb = getCombatWinProb(attackerPiece, targetPiece, regionProbs, myTeam, move.to);
      
      const undoWin = makeMove(gameState, move, 'win');
      const scoreWin = evaluateNetWorth(gameState, myTeam, activePlayer, regionProbs, P);
      unmakeMove(gameState, undoWin);
      
      const undoLose = makeMove(gameState, move, 'lose');
      const scoreLose = evaluateNetWorth(gameState, myTeam, activePlayer, regionProbs, P);
      unmakeMove(gameState, undoLose);
      
      score = (winProb * scoreWin) + ((1.0 - winProb) * scoreLose);
      
      // Bonus for initiating an attack
      if (P[12]) score += (P[12] * winProb);

    } else if (move.type === 'promote') {
      const undo = makeMove(gameState, move);
      score = evaluateNetWorth(gameState, myTeam, activePlayer, regionProbs, P);
      if (P[8]) score += P[8]; // Promotion bonus
      unmakeMove(gameState, undo);
    } else {
      const undo = makeMove(gameState, move);
      score = evaluateNetWorth(gameState, myTeam, activePlayer, regionProbs, P);
      unmakeMove(gameState, undo);
    }

    // Jitter to break ties and prevent infinite loops
    score += (Math.random() * 0.1 - 0.05);

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return bestMove;
}

// ─── Public eval function for external tools ─────────────────────────────────

function evaluateBoard(gameState, playerIndex, P) {
  const regionProbs = gameState.regionProbs || computeRegionProbabilities(gameState, playerIndex);
  const myTeam = PLAYER_TEAMS[playerIndex];
  return evaluateNetWorth(gameState, myTeam, playerIndex, regionProbs, P);
}

// ─── Exports ─────────────────────────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getBestMove,
    evaluateBoard,
    evaluateNetWorth
  };
}

if (typeof window !== 'undefined') {
  window.PoachersBot_v4 = {
    getBestMove,
    evaluateBoard,
    evaluateNetWorth
  };
}
})();
} catch (e) {
  console.error("BOT JS LOAD ERROR (V4 NETWORTH)", e);
}