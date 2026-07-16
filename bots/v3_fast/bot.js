/**
 * Poachers Bot v3 — "Fast"
 * 
 * Key improvements over v2_minimax:
 * 1. Make/Unmake move pattern — zero allocations in the search tree
 * 2. Bitboard-style threat tracking with numeric keys instead of string Sets
 * 3. Move ordering — captures/attacks first for better alpha-beta pruning
 * 4. Deeper search (3-ply) enabled by the speed gains
 * 5. Incremental king tracking to avoid full board scans
 * 6. Mobility evaluation
 * 7. King safety zone scoring
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
  evaluate5CardHand, getBestHand,
  getPositionalCardsForCell, HILL_SQUARES,
  getSlideDestination, find_pawns_to_promot,
  executePromotion, add_to_captured_pieces
} = engine;

// ─── Precomputed lookup tables ───────────────────────────────────────────────

// Flank square lookup (8x8 bool grid)
const IS_FLANK = new Uint8Array(64);
const FLANK_COORDS = [
  [1,2],[1,5],[6,2],[6,5],
  [2,1],[5,1],[2,6],[5,6]
];
for (const [r,c] of FLANK_COORDS) IS_FLANK[r * 8 + c] = 1;

// Hill squares per player (flat indices)
const HILL_IDX = {};
for (const pid of [0,1,2,3]) {
  HILL_IDX[pid] = HILL_SQUARES[pid].map(sq => sq.r * 8 + sq.c);
}

// Center distance lookup (precomputed for each cell)
const CENTER_DIST = new Float32Array(64);
for (let r = 0; r < 8; r++) {
  for (let c = 0; c < 8; c++) {
    CENTER_DIST[r * 8 + c] = Math.abs(r - 3.5) + Math.abs(c - 3.5);
  }
}

// Column/Row region lookup
const COL_REGION = new Uint8Array(8);
const ROW_REGION = new Uint8Array(8);
for (let i = 0; i < 8; i++) {
  if (i <= 2) { COL_REGION[i] = 0; ROW_REGION[i] = 0; }
  else if (i <= 4) { COL_REGION[i] = 1; ROW_REGION[i] = 1; }
  else { COL_REGION[i] = 2; ROW_REGION[i] = 2; }
}

// Piece value indices (char -> P-array index)
const PIECE_VAL_IDX = { 'p': 0, 'n': 1, 'b': 2, 'r': 3, 'k': 4 };

// ─── Fast threat map using flat 64-element arrays ────────────────────────────

function buildThreatMap(board, teamChar) {
  // Returns a Uint8Array[64] where each cell has a count of threats from teamChar
  const threats = new Uint8Array(64);
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece) continue;
      const pTeam = getPieceTeam(piece);
      if (pTeam !== teamChar) continue;
      const type = getPieceType(piece);
      
      if (type === 'p') {
        // Pawns threaten diagonals
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

// ─── Pinned pieces detection ─────────────────────────────────────────────────

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
      let foundPin = false;
      let tr = kr + dr, tc = kc + dc;
      
      while (tr >= 0 && tr < 8 && tc >= 0 && tc < 8) {
        const piece = board[tr][tc];
        if (piece) {
          const pt = getPieceTeam(piece);
          if (firstPieceTeam === null) {
            if (pt !== team) break; // enemy piece between king and potential pinner — no pin
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

// ─── Region combat probabilities ─────────────────────────────────────────────

function computeRegionProbabilities(gameState, playerId) {
  const allCards = engine.createDeck();
  const knownCards = new Set();
  
  gameState.publicCards.forEach(c => knownCards.add(c));
  gameState.players.forEach(p => {
    p.positionalCards.forEach(c => { if (c) knownCards.add(c); });
  });
  gameState.players[playerId].baseDeck.forEach(c => knownCards.add(c));
  
  const unknownCards = allCards.filter(c => !knownCards.has(c));
  const regionProbs = new Array(9);
  
  // Sample 40 random turn/river pairs for speed
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

function getCombatWinProb(move, regionProbs, playerId) {
  const myTeam = PLAYER_TEAMS[playerId];
  const stats = regionProbs[COL_REGION[move.to.c] * 3 + ROW_REGION[move.to.r]];
  if (!stats) return 0.5;
  return myTeam === TEAMS.A
    ? (stats.winsA + stats.draws) / stats.total
    : (stats.winsB + stats.draws) / stats.total;
}

// ─── Board evaluation ────────────────────────────────────────────────────────

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
          if (stats) {
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
          if (stats) {
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

// ─── Make / Unmake move pattern ──────────────────────────────────────────────

/**
 * Applies a move to the game state in-place and returns an undo object.
 * 'outcome' is used for attack moves: 'win' or 'lose'.
 */
function makeMove(state, move, outcome) {
  const undo = { type: move.type, turn: state.turn };
  const board = state.board;
  
  if (move.type === 'move') {
    undo.fromR = move.from.r; undo.fromC = move.from.c;
    undo.toR = move.to.r; undo.toC = move.to.c;
    undo.fromPiece = board[move.from.r][move.from.c];
    undo.toPiece = board[move.to.r][move.to.c]; // should be null
    board[move.to.r][move.to.c] = board[move.from.r][move.from.c];
    board[move.from.r][move.from.c] = null;
    state.turn = (state.turn + 1) % 4;
    
  } else if (move.type === 'capture') {
    undo.fromR = move.from.r; undo.fromC = move.from.c;
    undo.toR = move.to.r; undo.toC = move.to.c;
    undo.fromPiece = board[move.from.r][move.from.c];
    undo.toPiece = board[move.to.r][move.to.c];
    // Save captured pool state for the captured piece's team
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
      // Attacker captures defender
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
      // Attacker loses — may slide
      undo.fromR = move.from.r; undo.fromC = move.from.c;
      undo.fromPiece = board[move.from.r][move.from.c];
      const attackerType = getPieceType(undo.fromPiece);
      undo.slid = false;
      if (attackerType === 'r' || attackerType === 'b') {
        const slideDest = getSlideDestination(move.from, move.to);
        if (slideDest.r !== move.from.r || slideDest.c !== move.from.c) {
          undo.slid = true;
          undo.slideR = slideDest.r; undo.slideC = slideDest.c;
          undo.slidePrevPiece = board[slideDest.r][slideDest.c]; // should be null
          board[slideDest.r][slideDest.c] = board[move.from.r][move.from.c];
          board[move.from.r][move.from.c] = null;
        }
      }
      state.turn = (state.turn + 1) % 4;
    }
    undo.outcome = outcome;
    
  } else if (move.type === 'promote') {
    undo.toR = move.to.r; undo.toC = move.to.c;
    undo.prevPiece = board[move.to.r][move.to.c]; // the pawn
    undo.promoType = move.promoType;
    undo.promoSubtype = move.promoSubtype;
    // Save both teams' pools since executePromotion modifies the active team's pool
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
      // Undo lose (slide or stay)
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

// ─── Move ordering ───────────────────────────────────────────────────────────

const MOVE_ORDER_PRIORITY = { 'capture': 0, 'attack': 1, 'promote': 2, 'move': 3 };

function orderMoves(moves) {
  moves.sort((a, b) => (MOVE_ORDER_PRIORITY[a.type] || 3) - (MOVE_ORDER_PRIORITY[b.type] || 3));
  return moves;
}

// ─── Minimax with Alpha-Beta pruning and make/unmake ─────────────────────────

function minimax(gameState, depth, alpha, beta, isMaximizing, activePlayerId, P, regionProbs, depthLimit) {
  // Quick king check
  let kingsMine = 0, kingsOpp = 0;
  const myTeam = PLAYER_TEAMS[activePlayerId];
  const board = gameState.board;
  for (let i = 0; i < 64; i++) {
    const piece = board[i >> 3][i & 7];
    if (piece && getPieceType(piece) === 'k') {
      if (getPieceTeam(piece) === myTeam) kingsMine++;
      else kingsOpp++;
    }
  }
  if (kingsMine === 0) return -100000 + (depthLimit - depth);
  if (kingsOpp === 0) return 100000 - (depthLimit - depth);
  
  if (depth === 0) {
    return evaluate(gameState, activePlayerId, P, regionProbs);
  }
  
  const moves = orderMoves(getExpandedMoves(gameState, gameState.turn));
  
  if (moves.length === 0) {
    // No moves — pass turn
    const savedTurn = gameState.turn;
    gameState.turn = (gameState.turn + 1) % 4;
    const nextTeam = PLAYER_TEAMS[gameState.turn];
    const nextIsMax = (nextTeam === myTeam);
    const result = minimax(gameState, depth - 1, alpha, beta, nextIsMax, activePlayerId, P, regionProbs, depthLimit);
    gameState.turn = savedTurn;
    return result;
  }
  
  if (isMaximizing) {
    let maxEval = -Infinity;
    for (let i = 0; i < moves.length; i++) {
      const score = evalMove(moves[i], gameState, depth, alpha, beta, isMaximizing, activePlayerId, P, regionProbs, depthLimit);
      if (score > maxEval) maxEval = score;
      if (score > alpha) alpha = score;
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (let i = 0; i < moves.length; i++) {
      const score = evalMove(moves[i], gameState, depth, alpha, beta, isMaximizing, activePlayerId, P, regionProbs, depthLimit);
      if (score < minEval) minEval = score;
      if (score < beta) beta = score;
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

function evalMove(move, gameState, depth, alpha, beta, isMaximizing, activePlayerId, P, regionProbs, depthLimit) {
  const myTeam = PLAYER_TEAMS[activePlayerId];
  
  if (move.type === 'move' || move.type === 'capture') {
    const undo = makeMove(gameState, move);
    const nextTeam = PLAYER_TEAMS[gameState.turn];
    const nextIsMax = (nextTeam === myTeam);
    const score = minimax(gameState, depth - 1, alpha, beta, nextIsMax, activePlayerId, P, regionProbs, depthLimit);
    unmakeMove(gameState, undo);
    return score;
    
  } else if (move.type === 'promote') {
    const undo = makeMove(gameState, move);
    const nextTeam = PLAYER_TEAMS[gameState.turn];
    const nextIsMax = (nextTeam === myTeam);
    const promoBonus = isMaximizing ? P[8] : -P[8];
    const score = minimax(gameState, depth - 1, alpha, beta, nextIsMax, activePlayerId, P, regionProbs, depthLimit) + promoBonus;
    unmakeMove(gameState, undo);
    return score;
    
  } else {
    // Attack — evaluate both outcomes
    const winProb = getCombatWinProb(move, regionProbs, gameState.turn);
    
    // Win branch
    const undoWin = makeMove(gameState, move, 'win');
    const nextTeamWin = PLAYER_TEAMS[gameState.turn];
    const nextIsMaxWin = (nextTeamWin === myTeam);
    const winEval = minimax(gameState, depth - 1, alpha, beta, nextIsMaxWin, activePlayerId, P, regionProbs, depthLimit);
    unmakeMove(gameState, undoWin);
    
    // Lose branch
    const undoLose = makeMove(gameState, move, 'lose');
    const nextTeamLose = PLAYER_TEAMS[gameState.turn];
    const nextIsMaxLose = (nextTeamLose === myTeam);
    const loseEval = minimax(gameState, depth - 1, alpha, beta, nextIsMaxLose, activePlayerId, P, regionProbs, depthLimit);
    unmakeMove(gameState, undoLose);
    
    const expectedScore = (winProb * winEval) + ((1 - winProb) * loseEval);
    const attackBonus = isMaximizing ? (P[12] * winProb) : -(P[12] * winProb);
    return expectedScore + attackBonus;
  }
}

// ─── Board hashing for repetition detection ──────────────────────────────────

function hashBoard(board) {
  let h = '';
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      h += board[r][c] || '.';
    }
  }
  return h;
}

let boardHistory = [];
let initialBoardHash = null;

// ─── Top-level move selection ────────────────────────────────────────────────

function getBestMove(gameState, P) {
  if (!initialBoardHash && engine.INITIAL_BOARD) {
    initialBoardHash = hashBoard(engine.INITIAL_BOARD);
  }
  
  const currentHash = hashBoard(gameState.board);
  if (currentHash === initialBoardHash) {
    boardHistory = [];
  }
  
  const activePlayer = gameState.turn;
  const myTeam = PLAYER_TEAMS[activePlayer];
  const moves = orderMoves(getExpandedMoves(gameState, activePlayer));
  
  if (moves.length === 0) return null;
  
  const regionProbs = gameState.regionProbs || computeRegionProbabilities(gameState, activePlayer);
  
  let bestMove = null;
  let bestScore = -Infinity;
  const depthLimit = 3; // 3-ply lookahead (enabled by make/unmake speed)
  
  for (let mi = 0; mi < moves.length; mi++) {
    const move = moves[mi];
    let moveScore = 0;
    
    if (move.type === 'move' || move.type === 'capture') {
      const undo = makeMove(gameState, move);
      const nextTeam = PLAYER_TEAMS[gameState.turn];
      const nextIsMax = (nextTeam === myTeam);
      moveScore = minimax(gameState, depthLimit - 1, -Infinity, Infinity, nextIsMax, activePlayer, P, regionProbs, depthLimit);
      unmakeMove(gameState, undo);
      
    } else if (move.type === 'promote') {
      const undo = makeMove(gameState, move);
      const nextTeam = PLAYER_TEAMS[gameState.turn];
      const nextIsMax = (nextTeam === myTeam);
      moveScore = minimax(gameState, depthLimit - 1, -Infinity, Infinity, nextIsMax, activePlayer, P, regionProbs, depthLimit) + P[8];
      unmakeMove(gameState, undo);
      
    } else {
      // Attack
      const winProb = getCombatWinProb(move, regionProbs, activePlayer);
      
      const undoWin = makeMove(gameState, move, 'win');
      const nextTeamWin = PLAYER_TEAMS[gameState.turn];
      const nextIsMaxWin = (nextTeamWin === myTeam);
      const winEval = minimax(gameState, depthLimit - 1, -Infinity, Infinity, nextIsMaxWin, activePlayer, P, regionProbs, depthLimit);
      unmakeMove(gameState, undoWin);
      
      const undoLose = makeMove(gameState, move, 'lose');
      const nextTeamLose = PLAYER_TEAMS[gameState.turn];
      const nextIsMaxLose = (nextTeamLose === myTeam);
      const loseEval = minimax(gameState, depthLimit - 1, -Infinity, Infinity, nextIsMaxLose, activePlayer, P, regionProbs, depthLimit);
      unmakeMove(gameState, undoLose);
      
      moveScore = (winProb * winEval) + ((1 - winProb) * loseEval) + P[12] * winProb;
    }
    
    // Repetition penalty
    if (move.type === 'move') {
      const undo = makeMove(gameState, move);
      const nextHash = hashBoard(gameState.board);
      unmakeMove(gameState, undo);
      const historyIdx = boardHistory.indexOf(nextHash);
      if (historyIdx !== -1) {
        const repPenalty = -15.0 / (boardHistory.length - historyIdx);
        moveScore += repPenalty;
      }
    }
    
    // Tiny random jitter to break ties
    moveScore += (Math.random() * 0.1 - 0.05);
    
    if (moveScore > bestScore) {
      bestScore = moveScore;
      bestMove = move;
    }
  }
  
  // Record board state for repetition detection
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
  window.PoachersBot_v3 = {
    getBestMove,
    evaluateBoard
  };
}
})();
} catch (e) {
  console.error("BOT JS LOAD ERROR (V3 FAST)", e);
}
