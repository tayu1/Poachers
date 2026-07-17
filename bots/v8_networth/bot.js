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

// Flank square lookup (8x8 bool grid)
const IS_FLANK = new Uint8Array(64);
const FLANK_COORDS = [
  [1,2],[1,5],[6,2],[6,5],
  [2,1],[5,1],[2,6],[5,6]
];
for (const [r,c] of FLANK_COORDS) IS_FLANK[r * 8 + c] = 1;

// Center distance lookup (precomputed for each cell)
const CENTER_DIST = new Float32Array(64);
for (let r = 0; r < 8; r++) {
  for (let c = 0; c < 8; c++) {
    CENTER_DIST[r * 8 + c] = Math.abs(r - 3.5) + Math.abs(c - 3.5);
  }
}

// Board history for repetition detection
let boardHistory = [];

function hashBoard(board) {
  let h = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p) {
        h = (h * 31 + p.charCodeAt(0)) | 0;
      } else {
        h = (h * 31) | 0;
      }
    }
  }
  return h;
}

// ─── Combat Probability Helper ───────────────────────────────────────────────

function getCombatWinProb(attackerPiece, targetPiece, regionProbs, attackerTeam, targetCoords) {
  const attackerType = getPieceType(attackerPiece);
  const targetType = getPieceType(targetPiece);

  // King involvement = instant capture (100% win)
  if (attackerType === 'k' || targetType === 'k') {
    return 1.0;
  }

  const stats = regionProbs[COL_REGION[targetCoords.c] * 3 + ROW_REGION[targetCoords.r]];
  if (!stats || stats.total === 0) return 0.5;

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

// Count threatened squares (non-zero entries)
function countThreats(threatMap) {
  let count = 0;
  for (let i = 0; i < 64; i++) if (threatMap[i]) count++;
  return count;
}

// ─── Pinned pieces detection (from v3) ───────────────────────────────────────

function getPinnedCount(board, playerIndex) {
  const team = PLAYER_TEAMS[playerIndex];
  let count = 0;

  // Find kings
  const kings = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] && getPieceType(board[r][c]) === 'k' && getPieceTeam(board[r][c]) === team) {
        kings.push(r * 8 + c);
      }
    }
  }

  const dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];

  for (let ki = 0; ki < kings.length; ki++) {
    const kr = (kings[ki] >> 3), kc = (kings[ki] & 7);
    for (let di = 0; di < 8; di++) {
      const dr = dirs[di][0], dc = dirs[di][1];
      const isDiag = (dr !== 0 && dc !== 0);

      let firstPieceTeam = null;
      let tr = kr + dr, tc = kc + dc;

      while (tr >= 0 && tr < 8 && tc >= 0 && tc < 8) {
        const piece = board[tr][tc];
        if (piece) {
          const pt = getPieceTeam(piece);
          if (firstPieceTeam === null) {
            if (pt !== team) break; // enemy piece between king and potential pinner
            firstPieceTeam = pt;
          } else {
            // Second piece found
            if (pt !== team) {
              const type = getPieceType(piece);
              if ((isDiag && type === 'b') || (!isDiag && type === 'r')) {
                count++;
              }
            }
            break;
          }
        }
        tr += dr; tc += dc;
      }
    }
  }
  return count;
}

// ─── Rich Board Evaluator (V7 Hybrid) ───────────────────────────────────────
//
// Weights layout (13 params, same indices as v3 for compatibility):
// P[0]  = Pawn value
// P[1]  = Knight value
// P[2]  = Bishop value
// P[3]  = Rook value
// P[4]  = King value (used as large constant for win/loss)
// P[5]  = Hill control bonus
// P[6]  = Flank square bonus
// P[7]  = Pawn centrality weight
// P[8]  = Promotion bonus
// P[9]  = Mobility weight (threatened squares count)
// P[10] = King-under-threat penalty
// P[11] = Pinned piece penalty
// P[12] = Attack initiative bonus

function evaluate(gameState, playerIndex, P, regionProbs) {
  const board = gameState.board;
  const team = PLAYER_TEAMS[playerIndex];
  const oppTeam = team === TEAMS.A ? TEAMS.B : TEAMS.A;

  // Quick king count check
  let kingsMine = 0, kingsOpp = 0;
  for (let i = 0; i < 64; i++) {
    const piece = board[i >> 3][i & 7];
    if (piece && getPieceType(piece) === 'k') {
      if (getPieceTeam(piece) === team) kingsMine++;
      else kingsOpp++;
    }
  }
  if (kingsMine === 0) return -100000;
  if (kingsOpp === 0) return 100000;

  // Build threat maps
  const myThreats = buildThreatMap(board, team);
  const oppThreats = buildThreatMap(board, oppTeam);

  let score = 0;

  // Piece-square evaluation
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece) continue;

      const pTeam = getPieceTeam(piece);
      const type = getPieceType(piece);
      const isMine = (pTeam === team);
      const sign = isMine ? 1 : -1;
      const idx = r * 8 + c;

      // Material value
      const val = P[PIECE_VAL_IDX[type]] || 0;
      score += val * sign;

      if (isMine) {
        // Hill control bonus
        const myHills = HILL_IDX[playerIndex];
        const partnerHills = HILL_IDX[(playerIndex + 2) % 4];
        for (let h = 0; h < myHills.length; h++) if (myHills[h] === idx) score += P[5];
        for (let h = 0; h < partnerHills.length; h++) if (partnerHills[h] === idx) score += P[5];

        // Flank bonus
        if (IS_FLANK[idx]) score += P[6];

        // Pawn centrality
        if (type === 'p') {
          score += P[7] * (10 - CENTER_DIST[idx]);
        }

        // King under threat penalty
        if (type === 'k' && oppThreats[idx]) {
          score -= P[10];
        }

        // Card-aware safety
        if (regionProbs) {
          const stats = regionProbs[COL_REGION[c] * 3 + ROW_REGION[r]];
          if (stats && stats.total > 0) {
            const P_def = (pTeam === TEAMS.A) ? (stats.winsA / stats.total) : (stats.winsB / stats.total);
            if (oppThreats[idx]) {
              score -= val * (1 - P_def) * 0.5;
            } else {
              score += val * P_def * 0.1;
            }
          }
        }
      } else {
        // Opponent piece evaluations
        const oppHills = HILL_IDX[(playerIndex + 1) % 4];
        const oppPartnerHills = HILL_IDX[(playerIndex + 3) % 4];
        for (let h = 0; h < oppHills.length; h++) if (oppHills[h] === idx) score -= P[5];
        for (let h = 0; h < oppPartnerHills.length; h++) if (oppPartnerHills[h] === idx) score -= P[5];

        if (IS_FLANK[idx]) score -= P[6];

        if (type === 'p') {
          score -= P[7] * (10 - CENTER_DIST[idx]);
        }

        // Opponent king under my threat bonus
        if (type === 'k' && myThreats[idx]) {
          score += P[10];
        }

        if (regionProbs) {
          const stats = regionProbs[COL_REGION[c] * 3 + ROW_REGION[r]];
          if (stats && stats.total > 0) {
            const P_attack = (pTeam === TEAMS.A) ? ((stats.winsA + stats.draws) / stats.total) : ((stats.winsB + stats.draws) / stats.total);
            if (myThreats[idx]) {
              score += val * P_attack * 0.5;
            } else {
              score -= val * (1 - P_attack) * 0.1;
            }
          }
        }
      }
    }
  }

  // Mobility (threatened squares count)
  score += P[9] * countThreats(myThreats);
  score -= P[9] * countThreats(oppThreats);

  // Pinned pieces
  const myPins = getPinnedCount(board, playerIndex);
  score -= P[11] * myPins;
  const oppPins1 = getPinnedCount(board, (playerIndex + 1) % 4);
  const oppPins2 = getPinnedCount(board, (playerIndex + 3) % 4);
  score += P[11] * (oppPins1 + oppPins2);

  // Base deck advantage
  const myBaseSize = gameState.players[playerIndex].baseDeck.length;
  const opp1BaseSize = gameState.players[(playerIndex + 1) % 4].baseDeck.length;
  const opp2BaseSize = gameState.players[(playerIndex + 3) % 4].baseDeck.length;
  score += 0.2 * myBaseSize;
  score -= 0.1 * (opp1BaseSize + opp2BaseSize);

  return score;
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

  const numSamples = (typeof process !== 'undefined' && process.env.OPTIMIZING) ? 20 : 40;
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
  const undo = { type: move.type, turn: state.turn, hillWasVisited: state.hillWasVisited };
  const board = state.board;
  const isHill = (move.to && (move.to.r === 3 || move.to.r === 4) && (move.to.c === 3 || move.to.c === 4));
  if (isHill) state.hillWasVisited = 1;


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
  if (undo.hillWasVisited !== undefined) state.hillWasVisited = undo.hillWasVisited;
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

// ─── Move ordering (captures/attacks first for better pruning) ───────────────

const MOVE_ORDER_PRIORITY = { 'capture': 0, 'attack': 1, 'promote': 2, 'move': 3 };

function orderMoves(moves) {
  moves.sort((a, b) => (MOVE_ORDER_PRIORITY[a.type] || 3) - (MOVE_ORDER_PRIORITY[b.type] || 3));
  return moves;
}

// ─── Selective 3-Ply Lookahead Search ────────────────────────────────────────
//
// Ply 1: All our legal moves (maximize)
// Ply 2: Only opponent captures/attacks (minimize — worst case for us)
// Ply 3: Only our counter-captures/attacks/promotions (maximize — best tactical response)

function evaluateMoveWithLookahead(gameState, move, myTeam, activePlayer, regionProbs, P) {
  if (move.type === 'attack') {
    const attackerPiece = gameState.board[move.from.r][move.from.c];
    const targetPiece = gameState.board[move.to.r][move.to.c];
    const winProb = getCombatWinProb(attackerPiece, targetPiece, regionProbs, myTeam, move.to);

    // Win branch
    const undoWin = makeMove(gameState, move, 'win');
    const scoreWin = evaluate(gameState, activePlayer, P, regionProbs) + (P[12] * winProb);
    const worstWinScore = getOpponentWorstCase(gameState, myTeam, activePlayer, regionProbs, P, scoreWin, 0);
    unmakeMove(gameState, undoWin);

    // Lose branch
    const undoLose = makeMove(gameState, move, 'lose');
    const scoreLose = evaluate(gameState, activePlayer, P, regionProbs);
    const worstLoseScore = getOpponentWorstCase(gameState, myTeam, activePlayer, regionProbs, P, scoreLose, 0);
    unmakeMove(gameState, undoLose);

    return (winProb * worstWinScore) + ((1.0 - winProb) * worstLoseScore);
  } else {
    // Normal move, capture, promote
    const undo = makeMove(gameState, move);
    let baseScore = evaluate(gameState, activePlayer, P, regionProbs);
    let actionBonus = 0;
    if (move.type === 'promote') actionBonus = P[8];
    baseScore += actionBonus;

    const worstScore = getOpponentWorstCase(gameState, myTeam, activePlayer, regionProbs, P, baseScore, actionBonus);
    unmakeMove(gameState, undo);
    return worstScore;
  }
}

function getOpponentWorstCase(gameState, myTeam, activePlayer, regionProbs, P, baseScore, actionBonus = 0) {
  if (baseScore >= 100000 || baseScore <= -100000) return baseScore;
  // ─── Ply 2: Opponent's best tactical reply (captures/attacks only) ───
  const oppPlayer = gameState.turn;
  const oppTeam = PLAYER_TEAMS[oppPlayer];

  if (oppTeam === myTeam) {
    // Teammate's turn — skip, they won't attack us
    return baseScore;
  }

  const oppMoves = getAllLegalMovesForActivePlayer(gameState);
  const threats = [];
  for (let i = 0; i < oppMoves.length; i++) {
    const m = oppMoves[i];
    if (m.type === 'capture' || m.type === 'attack') threats.push(m);
  }

  if (threats.length === 0) {
    return baseScore;
  }

  let worstScore = baseScore;

  for (const oppMove of threats) {
    let scoreOpp;

    if (oppMove.type === 'capture') {
      const undoOpp = makeMove(gameState, oppMove);
      const evalAfterOpp = evaluate(gameState, activePlayer, P, regionProbs) + actionBonus;
      // Ply 3: Our counter-response
      scoreOpp = getCounterBestCase(gameState, myTeam, activePlayer, regionProbs, P, evalAfterOpp, actionBonus);
      unmakeMove(gameState, undoOpp);
    } else {
      // Opponent attack — weighted by EV
      const attackerPiece = gameState.board[oppMove.from.r][oppMove.from.c];
      const targetPiece = gameState.board[oppMove.to.r][oppMove.to.c];
      const winProb = getCombatWinProb(attackerPiece, targetPiece, regionProbs, oppTeam, oppMove.to);

      const undoWin = makeMove(gameState, oppMove, 'win');
      const evalWin = evaluate(gameState, activePlayer, P, regionProbs) + actionBonus;
      const counterWin = getCounterBestCase(gameState, myTeam, activePlayer, regionProbs, P, evalWin, actionBonus);
      unmakeMove(gameState, undoWin);

      const undoLose = makeMove(gameState, oppMove, 'lose');
      const evalLose = evaluate(gameState, activePlayer, P, regionProbs) + actionBonus;
      const counterLose = getCounterBestCase(gameState, myTeam, activePlayer, regionProbs, P, evalLose, actionBonus);
      unmakeMove(gameState, undoLose);

      scoreOpp = (winProb * counterWin) + ((1.0 - winProb) * counterLose);
    }

    if (scoreOpp < worstScore) {
      worstScore = scoreOpp;
    }
  }

  return worstScore;
}

function getCounterBestCase(gameState, myTeam, activePlayer, regionProbs, P, baseScore, actionBonus = 0) {
  if (baseScore >= 100000 || baseScore <= -100000) return baseScore;
  // ─── Ply 3: Our best counter-response (captures/attacks/promotions only) ───
  const counterPlayer = gameState.turn;
  const counterTeam = PLAYER_TEAMS[counterPlayer];

  if (counterTeam !== myTeam) {
    // Not our turn — can't counter
    return baseScore;
  }

  const counterMoves = getAllLegalMovesForActivePlayer(gameState);
  const tacticalMoves = [];
  for (let i = 0; i < counterMoves.length; i++) {
    const m = counterMoves[i];
    if (m.type === 'capture' || m.type === 'attack') tacticalMoves.push(m);
  }

  // Also check promotions
  const team = PLAYER_TEAMS[counterPlayer];
  const pool = gameState.capturedPieces[team];
  const possiblePromotions = [];
  if (pool.rooks > 0) possiblePromotions.push({ type: 'r', subtype: null });
  if (pool.knights > 0) possiblePromotions.push({ type: 'n', subtype: null });
  if (pool.darkBishop > 0) possiblePromotions.push({ type: 'b', subtype: 'dark' });
  if (pool.lightBishop > 0) possiblePromotions.push({ type: 'b', subtype: 'light' });
  if (pool.king !== null) possiblePromotions.push({ type: 'k', subtype: null });

  for (const promo of possiblePromotions) {
    const validSquares = find_pawns_to_promot(counterPlayer, promo.type, promo.subtype, gameState);
    for (const sq of validSquares) {
      tacticalMoves.push({
        type: 'promote',
        to: { r: sq.r, c: sq.c },
        promoType: promo.type,
        promoSubtype: promo.subtype
      });
    }
  }

  if (tacticalMoves.length === 0) {
    return baseScore;
  }

  let bestScore = baseScore;

  for (const counterMove of tacticalMoves) {
    let scoreCounter;

    if (counterMove.type === 'capture') {
      const undoCounter = makeMove(gameState, counterMove);
      scoreCounter = evaluate(gameState, activePlayer, P, regionProbs) + actionBonus;
      unmakeMove(gameState, undoCounter);
    } else if (counterMove.type === 'attack') {
      const attackerPiece = gameState.board[counterMove.from.r][counterMove.from.c];
      const targetPiece = gameState.board[counterMove.to.r][counterMove.to.c];
      const winProb = getCombatWinProb(attackerPiece, targetPiece, regionProbs, myTeam, counterMove.to);

      const undoWin = makeMove(gameState, counterMove, 'win');
      const scoreWin = evaluate(gameState, activePlayer, P, regionProbs) + actionBonus;
      unmakeMove(gameState, undoWin);

      const undoLose = makeMove(gameState, counterMove, 'lose');
      const scoreLose = evaluate(gameState, activePlayer, P, regionProbs) + actionBonus;
      unmakeMove(gameState, undoLose);

      scoreCounter = (winProb * scoreWin) + ((1.0 - winProb) * scoreLose);
    } else {
      // Promote
      const undoCounter = makeMove(gameState, counterMove);
      scoreCounter = evaluate(gameState, activePlayer, P, regionProbs) + P[8] + actionBonus;
      unmakeMove(gameState, undoCounter);
    }

    if (scoreCounter > bestScore) {
      bestScore = scoreCounter;
    }
  }

  return bestScore;
}

// ─── Top-level move selection ────────────────────────────────────────────────

function getBestMove(gameState, P) {
  const activePlayer = gameState.turn;
  const myTeam = PLAYER_TEAMS[activePlayer];
  const moves = orderMoves(getExpandedMoves(gameState, activePlayer));

  if (moves.length === 0) return null;

  const regionProbs = gameState.regionProbs || computeRegionProbabilities(gameState, activePlayer);

  let bestMove = null;
  let bestScore = -Infinity;

  for (const move of moves) {
    let score = evaluateMoveWithLookahead(gameState, move, myTeam, activePlayer, regionProbs, P);

    // Repetition penalty
    if (move.type === 'move') {
      const undo = makeMove(gameState, move);
      const nextHash = hashBoard(gameState.board);
      unmakeMove(gameState, undo);
      const historyIdx = boardHistory.indexOf(nextHash);
      if (historyIdx !== -1) {
        score -= (100.0 / (boardHistory.length - historyIdx));
      }
    }

    // Jitter to break ties
    score += (Math.random() * 0.1 - 0.05);

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  // Update board history
  if (bestMove && bestMove.type === 'move') {
    const undo = makeMove(gameState, bestMove);
    const chosenHash = hashBoard(gameState.board);
    unmakeMove(gameState, undo);
    boardHistory.push(chosenHash);
    if (boardHistory.length > 12) {
      boardHistory.shift();
    }
  }

  return bestMove;
}

// ─── Public eval function for external tools ─────────────────────────────────

function evaluateBoard(gameState, playerIndex, P) {
  const regionProbs = gameState.regionProbs || computeRegionProbabilities(gameState, playerIndex);
  return evaluate(gameState, playerIndex, P, regionProbs);
}

// ─── Exports ─────────────────────────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getBestMove,
    evaluateBoard
  };
}

if (typeof window !== 'undefined') {
  window.PoachersBot_v8 = {
    getBestMove,
    evaluateBoard
  };
}
})();
} catch (e) {
  console.error("BOT JS LOAD ERROR (V8 NETWORTH)", e);
}
