import {
  applyAction,
  fastCloneBotState,
  fastCloneState,
  getAllLegalActions,
  getPieceOwnerSeat,
  isSeatKingAlive,
  isSeatOccupyingHill
} from '../core/engine';
import { generateFullThreatMap } from '../core/moves';
import {
  ActionInt,
  ActionType,
  Board1D,
  BotRequestType,
  CellMark,
  GameAction,
  GameState,
  LastMove,
  PlayerSeat,
  Team,
  actionIntToGameAction,
  decType,
  decOrigin,
  decEnd,
  decPiece,
  encodeAction
} from '../core/types';
import { PLAYER_TEAMS, TEAM_SEATS, HILL_SQUARES_BY_SEAT } from '../core/constants';
import { getSquareCombatOdds, TrenchStrategy, getBestHandFrom7CardPool, swapPlayerCards } from '../core/cards';
import {
  formatDirectTakeText,
  formatPromotionText,
  formatSetBunkerText,
  formatStandardMoveText,
  indexToAlgebraic,
  getSeatCode
} from '../core/notation';
import { DEFAULT_PVALS } from './pvals';

export { DEFAULT_PVALS } from './pvals';

export interface BotProfile {
  name: string;
  pvals?: number[];
  weights?: number[][];
  thresholds?: [number, number];
  depth?: number;
  topK?: number;
  adaptiveBranching?: boolean;
  trenchStrategy?: TrenchStrategy;
  randomnessMargin?: number;
  randomnessTemperature?: number;
  randomnessP?: number;
  heuristicGapThreshold?: number;
  verbose?: boolean;
}

export interface BotCandidateAction {
  action: GameAction;
  actionInt?: ActionInt;
  score: number;
  plyScores?: Record<number, number[]>;
  logSummary?: string;
}

export interface SearchTracer {
  plyScores: Map<number, number[]>;
}

const PIECE_NAMES: Record<number, string> = {
  1: 'Pawn',
  2: 'Knight',
  3: 'Bishop',
  4: 'Rook',
  5: 'King'
};

const SEAT_NAMES: Record<PlayerSeat, string> = {
  [PlayerSeat.NORTH]: 'NORTH',
  [PlayerSeat.EAST]: 'EAST',
  [PlayerSeat.SOUTH]: 'SOUTH',
  [PlayerSeat.WEST]: 'WEST'
};

export function formatActionInt(actionInt: ActionInt, board?: Uint8Array): string {
  const type = decType(actionInt);
  const from = decOrigin(actionInt);
  const to = decEnd(actionInt);
  const meta = decPiece(actionInt);

  if (type === ActionType.MOVE) {
    if (board && board[from] !== 0) {
      const piece = board[from];
      const target = board[to];
      if (target !== 0) {
        return formatDirectTakeText(piece as any, target as any, from, to);
      }
      return formatStandardMoveText(piece as any, from, to);
    }
    return `MOVE ${indexToAlgebraic(from)}->${indexToAlgebraic(to)}`;
  } else if (type === ActionType.SET_BUNKER) {
    return formatSetBunkerText(from, to);
  } else if (type === ActionType.PROMOTION) {
    return formatPromotionText(meta as any, from);
  } else if (type === ActionType.SKIP_TURN) {
    return `Turn Skipped (No legal moves).`;
  } else if (type === ActionType.CARD_SWAP) {
    return `Swapped card.`;
  }
  return `ACTION(${type}, ${from}->${to})`;
}

export const DEFAULT_BOT_PROFILE: BotProfile = {
  name: 'V22_DEEP',
  pvals: DEFAULT_PVALS,
  weights: [],
  thresholds: [6, 12],
  depth: 4,
  topK: 8,
  adaptiveBranching: false,
  trenchStrategy: 'POKER_SYNERGY'
};

/** Pre-allocated scratch buffer stack for zero-allocation tree search */
interface ScratchState {
  board: Uint8Array;
  threatMap: Uint8Array;
  deadPoolCounts: Uint8Array;
  activePlayer: PlayerSeat;
  turnCount: number;
  hasSwappedThisTurn: boolean;
  isGameOver: boolean;
  winnerTeam: Team | null;
  score: { teamA: number; teamB: number };
  threatenedKings: PlayerSeat[];
  lastMove: LastMove | null;
  setupState: { inSetup: boolean; setupCompletedSeats: PlayerSeat[] };
  botSeats: Record<PlayerSeat, boolean>;
  pendingRefills: any[];
  seatActionCounts: Record<PlayerSeat, number>;
  players: any;
  deck: any;
  publicFlop: any;
  publicTurnRiver: any;
  isTurnRiverRevealed: boolean;
  regionOdds: any;
}

const SEARCH_POOL_SIZE = 32;
const scratchStatePool: ScratchState[] = Array.from({ length: SEARCH_POOL_SIZE }, () => ({
  board: new Uint8Array(64),
  threatMap: new Uint8Array(4096),
  deadPoolCounts: new Uint8Array(16),
  activePlayer: PlayerSeat.NORTH,
  turnCount: 0,
  hasSwappedThisTurn: false,
  isGameOver: false,
  winnerTeam: null,
  score: { teamA: 0, teamB: 0 },
  threatenedKings: [],
  lastMove: null,
  setupState: { inSetup: false, setupCompletedSeats: [0, 1, 2, 3] },
  botSeats: { 0: true, 1: true, 2: true, 3: true },
  pendingRefills: [],
  seatActionCounts: { 0: 0, 1: 0, 2: 0, 3: 0 },
  players: null,
  deck: null,
  publicFlop: null,
  publicTurnRiver: null,
  isTurnRiverRevealed: false,
  regionOdds: null
}));

function cloneIntoScratch(src: GameState, poolIndex: number): GameState {
  const dst = scratchStatePool[poolIndex];
  dst.board.set(src.board);
  if (src.threatMap) {
    dst.threatMap.set(src.threatMap);
  }
  dst.deadPoolCounts.set(src.deadPoolCounts);
  dst.activePlayer = src.activePlayer;
  dst.turnCount = src.turnCount;
  dst.hasSwappedThisTurn = src.hasSwappedThisTurn;
  dst.isGameOver = src.isGameOver;
  dst.winnerTeam = src.winnerTeam;
  dst.score.teamA = src.score?.teamA ?? 0;
  dst.score.teamB = src.score?.teamB ?? 0;
  dst.threatenedKings = src.threatenedKings || [];
  dst.lastMove = null;
  dst.setupState.inSetup = false;
  dst.setupState.setupCompletedSeats[0] = 0;
  dst.setupState.setupCompletedSeats[1] = 1;
  dst.setupState.setupCompletedSeats[2] = 2;
  dst.setupState.setupCompletedSeats[3] = 3;
  dst.botSeats = src.botSeats || { 0: true, 1: true, 2: true, 3: true };
  dst.pendingRefills.length = 0;
  dst.seatActionCounts[0] = src.seatActionCounts?.[0] ?? 0;
  dst.seatActionCounts[1] = src.seatActionCounts?.[1] ?? 0;
  dst.seatActionCounts[2] = src.seatActionCounts?.[2] ?? 0;
  dst.seatActionCounts[3] = src.seatActionCounts?.[3] ?? 0;
  dst.players = null as any;
  dst.deck = null as any;
  dst.publicFlop = src.publicFlop;
  dst.publicTurnRiver = src.publicTurnRiver;
  dst.isTurnRiverRevealed = src.isTurnRiverRevealed;
  dst.regionOdds = src.regionOdds;
  return dst as unknown as GameState;
}

/** Pre-allocated buffer for active piece squares to avoid allocations in evaluateState */
const occupiedSquaresBuffer = new Int32Array(64);
const KING_ADJACENT_OFFSETS = [-9, -8, -7, -1, 1, 7, 8, 9];

function isAdjacentToEnemyKing(board: Uint8Array, targetIndex: number, teamBit: number): boolean {
  const targetRow = targetIndex >> 3;
  const targetCol = targetIndex & 7;
  for (let i = 0; i < 8; i++) {
    const adj = targetIndex + KING_ADJACENT_OFFSETS[i];
    if (adj >= 0 && adj < 64) {
      const adjRow = adj >> 3;
      const adjCol = adj & 7;
      if (Math.abs(adjRow - targetRow) <= 1 && Math.abs(adjCol - targetCol) <= 1) {
        const adjPiece = board[adj];
        if (adjPiece !== 0 && (adjPiece & 7) === 5 && (adjPiece & 8) !== teamBit) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Fast zero-allocation evaluation of a GameState from the perspective of a PlayerSeat.
 * Uses active-piece loop optimization for 10x-16x faster checks compared to 64x64 grid scan.
 */
export function evaluateState(
  state: GameState,
  seat: PlayerSeat,
  pvals: number[] = DEFAULT_PVALS,
  depthRemaining: number = 0
): number {
  const myTeam = PLAYER_TEAMS[seat];
  const enemyTeam: Team = myTeam === 'A' ? 'B' : 'A';
  let score = 0;

  // 1. Game end (P[1]) with distance-to-mate / depth awareness
  if (state.isGameOver) {
    const depthBonus = (depthRemaining || 0) * 1000;
    if (state.winnerTeam === myTeam) {
      score += (pvals[1] ?? 100000) + depthBonus;
    } else if (state.winnerTeam === enemyTeam) {
      score -= ((pvals[1] ?? 100000) + depthBonus);
    }
    return score;
  }

  const teamSeats = TEAM_SEATS[myTeam];
  const enemySeats = TEAM_SEATS[enemyTeam];
  const board = state.board;
  const threatMap = state.threatMap;

  // 2. Hill control counts (P[6])
  let teamHillControlCount = 0;
  let enemyHillControlCount = 0;
  for (let i = 0; i < 2; i++) {
    if (isSeatOccupyingHill(board, teamSeats[i])) teamHillControlCount++;
    if (isSeatOccupyingHill(board, enemySeats[i])) enemyHillControlCount++;
  }
  score += teamHillControlCount * (pvals[5] || 0);
  score -= enemyHillControlCount * (pvals[5] || 0);

  // 2a. Pawns on hill (P[7]) and Pawns on hill when needing a King (P[8])
  const teamBitA = myTeam === 'A' ? 0 : 8;
  const enemyTeamBit = enemyTeam === 'A' ? 0 : 8;

  // Friendly team hill pawns
  let myDeadKings = state.deadPoolCounts ? state.deadPoolCounts[5 | teamBitA] : 0;
  let teamPawnHillCount = 0;
  let teamPawnHillNoKingCount = 0;

  for (let i = 0; i < 2; i++) {
    const s = teamSeats[i];
    const hillSquares = HILL_SQUARES_BY_SEAT[s];
    const needsKing = !isSeatKingAlive(board, s) && myDeadKings > 0;
    let seatHasPromotableKingPawn = false;

    for (let j = 0; j < hillSquares.length; j++) {
      const sq = hillSquares[j];
      const piece = board[sq];
      if (piece !== 0 && (piece & 7) === 1 && (piece & 8) === teamBitA) {
        teamPawnHillCount++;
        if (needsKing && !seatHasPromotableKingPawn && !isAdjacentToEnemyKing(board, sq, teamBitA)) {
          seatHasPromotableKingPawn = true;
        }
      }
    }

    if (seatHasPromotableKingPawn && myDeadKings > 0) {
      teamPawnHillNoKingCount++;
      myDeadKings--;
    }
  }

  // Enemy team hill pawns
  let enemyDeadKings = state.deadPoolCounts ? state.deadPoolCounts[5 | enemyTeamBit] : 0;
  let enemyPawnHillCount = 0;
  let enemyPawnHillNoKingCount = 0;

  for (let i = 0; i < 2; i++) {
    const es = enemySeats[i];
    const hillSquares = HILL_SQUARES_BY_SEAT[es];
    const needsKing = !isSeatKingAlive(board, es) && enemyDeadKings > 0;
    let seatHasPromotableKingPawn = false;

    for (let j = 0; j < hillSquares.length; j++) {
      const sq = hillSquares[j];
      const piece = board[sq];
      if (piece !== 0 && (piece & 7) === 1 && (piece & 8) === enemyTeamBit) {
        enemyPawnHillCount++;
        if (needsKing && !seatHasPromotableKingPawn && !isAdjacentToEnemyKing(board, sq, enemyTeamBit)) {
          seatHasPromotableKingPawn = true;
        }
      }
    }

    if (seatHasPromotableKingPawn && enemyDeadKings > 0) {
      enemyPawnHillNoKingCount++;
      enemyDeadKings--;
    }
  }

  score += teamPawnHillCount * (pvals[6] || 0);
  score -= enemyPawnHillCount * (pvals[6] || 0);
  score += teamPawnHillNoKingCount * (pvals[7] || 0);
  score -= enemyPawnHillNoKingCount * (pvals[7] || 0);

  // 3. Board pieces, kings & threats
  let teamCenterThreatCount = 0;
  let enemyCenterThreatCount = 0;

  let numPieces = 0;
  for (let sq = 0; sq < 64; sq++) {
    if (board[sq] !== 0) {
      occupiedSquaresBuffer[numPieces++] = sq;
    }
  }

  for (let pIdx = 0; pIdx < numPieces; pIdx++) {
    const sq = occupiedSquaresBuffer[pIdx];
    const piece = board[sq];
    const pieceType = piece & 7;
    const pieceTeamBit = piece & 8;
    const isFriendly = (myTeam === 'A' && pieceTeamBit === 0) || (myTeam === 'B' && pieceTeamBit === 8);
    const isBunkered = (piece & 16) !== 0;

    // Center threat counting: check if this unbunkered piece threatens any of the 4 central hill squares [27, 28, 35, 36]
    if (threatMap && !isBunkered) {
      const sqShift = sq << 6;
      if (isFriendly) {
        if ((threatMap[sqShift | 27] & (CellMark.THREAT | CellMark.MOVE)) !== 0) teamCenterThreatCount++;
        if ((threatMap[sqShift | 28] & (CellMark.THREAT | CellMark.MOVE)) !== 0) teamCenterThreatCount++;
        if ((threatMap[sqShift | 35] & (CellMark.THREAT | CellMark.MOVE)) !== 0) teamCenterThreatCount++;
        if ((threatMap[sqShift | 36] & (CellMark.THREAT | CellMark.MOVE)) !== 0) teamCenterThreatCount++;
      } else {
        if ((threatMap[sqShift | 27] & (CellMark.THREAT | CellMark.MOVE)) !== 0) enemyCenterThreatCount++;
        if ((threatMap[sqShift | 28] & (CellMark.THREAT | CellMark.MOVE)) !== 0) enemyCenterThreatCount++;
        if ((threatMap[sqShift | 35] & (CellMark.THREAT | CellMark.MOVE)) !== 0) enemyCenterThreatCount++;
        if ((threatMap[sqShift | 36] & (CellMark.THREAT | CellMark.MOVE)) !== 0) enemyCenterThreatCount++;
      }
    }

    // Check defenders & attackers via threatMap across active pieces only
    let isProtected = false;
    let threatenedByKing = false;
    let threatenedByPiece = false;
    let threatenedByUncapturablePiece = false;

    if (threatMap) {
      for (let oIdx = 0; oIdx < numPieces; oIdx++) {
        const origin = occupiedSquaresBuffer[oIdx];
        const origPiece = board[origin];
        if ((origPiece & 16) !== 0) continue;

        if ((threatMap[(origin << 6) | sq] & CellMark.THREAT) === 0) continue;

        const origTeamBit = origPiece & 8;
        if (origTeamBit === pieceTeamBit) {
          if (origin !== sq) {
            isProtected = true;
          }
        } else {
          const origType = origPiece & 7;
          if (origType === 5) {
            threatenedByKing = true;
          } else {
            threatenedByPiece = true;
            if (pieceType === 5) {
              if ((threatMap[(sq << 6) | origin] & CellMark.THREAT) === 0) {
                threatenedByUncapturablePiece = true;
              }
            }
          }
        }

        if (pieceType !== 5) {
          if (isProtected && threatenedByPiece && threatenedByKing) break;
        }
      }
    }

    // Defense status: 0 = unprotected, 1 = protected, 2 = bunkered
    const defenseOffset = isBunkered ? 2 : (isProtected ? 1 : 0);

    if (pieceType === 5) {
      // King value (P[2]) and King threat retention (P[3..5])
      const kingBaseVal = pvals[2] ?? 20000;
      let retentionMultiplier = 1.0;
      if (threatMap && threatenedByPiece) {
        if (threatenedByUncapturablePiece) {
          retentionMultiplier = pvals[3];
        } else {
          retentionMultiplier = pvals[4];
        }
      }
      const kingScore = kingBaseVal * retentionMultiplier;
      score += isFriendly ? kingScore : -kingScore;
    } else {
      // Regular piece material value (P[9..13]) and threat retention (P[14..19])
      const basePresence = pvals[9] ?? 60;
      const pieceMultiplier = pvals[9 + pieceType] || 0;
      const fullMaterialVal = basePresence * pieceMultiplier;

      let retentionMultiplier = 1.0;
      if (threatMap) {
        if (threatenedByPiece) {
          retentionMultiplier = pvals[14 + defenseOffset];
        } else if (threatenedByKing) {
          retentionMultiplier = pvals[17 + defenseOffset];
        }
      }

      const pieceScore = fullMaterialVal * retentionMultiplier;
      score += isFriendly ? pieceScore : -pieceScore;
    }
  }

  if (threatMap) {
    score += teamCenterThreatCount * (pvals[8] || 0);
    score -= enemyCenterThreatCount * (pvals[8] || 0);
  }

  return score;
}

const EVAL_SCRATCH_SLOT = 31;

/**
 * Pure 22/24-PVAL candidate action selector:
 * Evaluates every legal move using evaluateState from the active seat's perspective,
 * sorting descending to pick the top K highest-evaluating moves with tiered or deep gap pruning.
 */
export function getTopKScoredMoves(
  state: GameState,
  seat: PlayerSeat,
  topK: number,
  pvals: number[] = DEFAULT_PVALS,
  heuristicGapThreshold?: number,
  isRoot: boolean = false,
  noPruning: boolean = false
): { actionInt: ActionInt; score: number }[] {
  if (!state.threatMap || state.threatMap.length !== 4096) {
    state.threatMap = generateFullThreatMap(state.board);
  }

  const allActions = getAllLegalActions(state, seat);
  const actions: ActionInt[] = [];
  for (let i = 0; i < allActions.length; i++) {
    const type = decType(allActions[i]);
    if (type !== ActionType.SKIP_TURN && type !== ActionType.CARD_SWAP) {
      actions.push(allActions[i]);
    }
  }

  if (actions.length === 0) {
    return [];
  }

  if (actions.length === 1) {
    const nextState = cloneIntoScratch(state, EVAL_SCRATCH_SLOT);
    applyAction(nextState, actions[0], {
      requestType: BotRequestType.FAST_CALC
    });
    const score = evaluateState(nextState, seat, pvals, 0);
    return [{ actionInt: actions[0], score }];
  }

  // Direct King Capture Check: If any legal move immediately wins the game, prioritize it
  for (let i = 0; i < actions.length; i++) {
    const actionInt = actions[i];
    if (decType(actionInt) === ActionType.MOVE) {
      const toIndex = (actionInt >>> 8) & 0x3F;
      const target = state.board[toIndex];
      if (target !== 0 && (target & 7) === 5) {
        return [{ actionInt, score: (pvals[1] ?? DEFAULT_PVALS[1] ?? 100000) }];
      }
    }
  }

  // Evaluate every legal action with evaluateState using pvals
  const scoredMoves: { actionInt: ActionInt; score: number }[] = [];
  for (let i = 0; i < actions.length; i++) {
    const actionInt = actions[i];
    const nextState = cloneIntoScratch(state, EVAL_SCRATCH_SLOT);
    applyAction(nextState, actionInt, {
      requestType: BotRequestType.FAST_CALC
    });
    const score = evaluateState(nextState, seat, pvals, 0);
    scoredMoves.push({ actionInt, score });
  }

  // Active seat selects moves that maximize its own team evaluation
  scoredMoves.sort((a, b) => b.score - a.score);

  if (noPruning) {
    return scoredMoves;
  }

  const topScore = scoredMoves[0].score;
  const candidateMoves: { actionInt: ActionInt; score: number }[] = [scoredMoves[0]];

  if (isRoot) {
    // Tiered Gap Pruning at Root:
    // Moves 1-4: gap1 threshold (e.g. 10000)
    // Moves 5-8: gap2 threshold (e.g. 1000)
    const gap1 = heuristicGapThreshold ?? (pvals[20] ?? DEFAULT_PVALS[20] ?? 10000);
    const gap2 = pvals[21] ?? DEFAULT_PVALS[21] ?? 1000;

    for (let i = 1; i < scoredMoves.length && candidateMoves.length < topK; i++) {
      const diff = topScore - scoredMoves[i].score;
      if (i < 4) {
        if (diff > gap1) break;
      } else {
        if (diff > gap2) break;
      }
      candidateMoves.push(scoredMoves[i]);
    }
  } else {
    // Deeper Plies: deep gap threshold (e.g. 1000)
    const gapPruning = heuristicGapThreshold ?? (pvals[22] ?? DEFAULT_PVALS[22] ?? 1000);
    for (let i = 1; i < scoredMoves.length && candidateMoves.length < topK; i++) {
      if (topScore - scoredMoves[i].score > gapPruning) {
        break; // Prune all lower options
      }
      candidateMoves.push(scoredMoves[i]);
    }
  }

  return candidateMoves;
}

/**
 * Pure 22/24-PVAL candidate action selector:
 * Evaluates every legal move using evaluateState from the active seat's perspective,
 * sorting descending to pick the top K highest-evaluating moves.
 */
export function getTopKMoves(
  state: GameState,
  seat: PlayerSeat,
  topK: number,
  pvals: number[] = DEFAULT_PVALS,
  heuristicGapThreshold?: number,
  isRoot: boolean = false
): ActionInt[] {
  return getTopKScoredMoves(state, seat, topK, pvals, heuristicGapThreshold, isRoot).map(c => c.actionInt);
}

/**
 * Recursive Pure Minimax / Expectimax search across Top-K candidate actions.
 * Zero-allocation scratch state pool indexing for lightning-fast tree traversals.
 */
function searchMinimaxRecursive(
  state: GameState,
  rootSeat: PlayerSeat,
  rootTeam: Team,
  pvals: number[],
  depthRemaining: number,
  topK: number,
  adaptiveBranching: boolean,
  poolIndex: number,
  totalDepth: number = 4,
  tracer?: SearchTracer
): number {
  const currentSeat = state.activePlayer;
  const currentTeam = PLAYER_TEAMS[currentSeat];
  const isMaximizing = (currentTeam === rootTeam);

  const currentPly = totalDepth - depthRemaining + 1;

  // Variable branching schedule:
  // Plies 1..3: branch with min(topK, 4)
  // Plies 4..8: branch with min(topK, 2) - never drops below 2
  let effectiveK: number;
  if (adaptiveBranching) {
    if (depthRemaining <= 2) {
      effectiveK = 1;
    } else if (depthRemaining <= 4) {
      effectiveK = Math.min(topK, 2);
    } else {
      effectiveK = Math.min(topK, 4);
    }
  } else {
    if (currentPly < 4) {
      effectiveK = Math.min(topK, 4);
    } else {
      effectiveK = Math.min(topK, 2);
    }
  }

  const deepGap = pvals[22] ?? DEFAULT_PVALS[22] ?? 1000;
  const scoredCandidates = getTopKScoredMoves(state, currentSeat, effectiveK, pvals, deepGap, false);
  if (scoredCandidates.length === 0) {
    return evaluateState(state, rootSeat, pvals, depthRemaining);
  }

  const nextPoolIndex = (poolIndex + 1) % SEARCH_POOL_SIZE;

  // If tracing and we haven't recorded scores for this ply along the primary line yet:
  if (tracer && !tracer.plyScores.has(currentPly)) {
    const plyScoresForRoot: number[] = [];
    for (let i = 0; i < scoredCandidates.length; i++) {
      const testState = cloneIntoScratch(state, nextPoolIndex);
      applyAction(testState, scoredCandidates[i].actionInt, {
        requestType: BotRequestType.FAST_CALC
      });
      const evalForRoot = evaluateState(testState, rootSeat, pvals, depthRemaining - 1);
      plyScoresForRoot.push(Math.round(evalForRoot));
    }
    tracer.plyScores.set(currentPly, plyScoresForRoot);
  }

  const moves = scoredCandidates.map(c => c.actionInt);

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      const type = decType(m);
      const fromIndex = (m >>> 14) & 0x3F;
      const toIndex = (m >>> 8) & 0x3F;
      const piece = state.board[fromIndex];
      const target = state.board[toIndex];
      const pType = piece & 7;
      const targetType = target === 0 ? 0 : (target & 7);
      const isCombat = (type === ActionType.MOVE && target !== 0 && targetType !== 5 && pType !== 5);

      const branchTracer = (i === 0) ? tracer : undefined;
      let evaluation: number;

      if (isCombat) {
        const defenderSeat = getPieceOwnerSeat(target, toIndex);

        // Branch 1: Attacker Wins Combat (50% probability)
        const nextStateWin = cloneIntoScratch(state, nextPoolIndex);
        applyAction(nextStateWin, m, {
          requestType: BotRequestType.FAST_CALC,
          forceCombatWinner: currentSeat
        });

        const evalWin = (nextStateWin.isGameOver || depthRemaining <= 1)
          ? evaluateState(nextStateWin, rootSeat, pvals, depthRemaining - 1)
          : searchMinimaxRecursive(
              nextStateWin,
              rootSeat,
              rootTeam,
              pvals,
              depthRemaining - 1,
              topK,
              adaptiveBranching,
              nextPoolIndex,
              totalDepth,
              branchTracer
            );

        // Branch 2: Attacker Loses Combat (50% probability)
        const nextStateLoss = cloneIntoScratch(state, nextPoolIndex);
        applyAction(nextStateLoss, m, {
          requestType: BotRequestType.FAST_CALC,
          forceCombatWinner: defenderSeat
        });

        const evalLoss = (nextStateLoss.isGameOver || depthRemaining <= 1)
          ? evaluateState(nextStateLoss, rootSeat, pvals, depthRemaining - 1)
          : searchMinimaxRecursive(
              nextStateLoss,
              rootSeat,
              rootTeam,
              pvals,
              depthRemaining - 1,
              topK,
              adaptiveBranching,
              nextPoolIndex,
              totalDepth,
              undefined
            );

        // True 50/50 Expectimax combination
        evaluation = 0.5 * evalWin + 0.5 * evalLoss;
      } else {
        // Quiet move / Direct King Take / Bunker / Promotion
        const nextState = cloneIntoScratch(state, nextPoolIndex);
        applyAction(nextState, m, {
          requestType: BotRequestType.FAST_CALC
        });

        evaluation = (nextState.isGameOver || depthRemaining <= 1)
          ? evaluateState(nextState, rootSeat, pvals, depthRemaining - 1)
          : searchMinimaxRecursive(
              nextState,
              rootSeat,
              rootTeam,
              pvals,
              depthRemaining - 1,
              topK,
              adaptiveBranching,
              nextPoolIndex,
              totalDepth,
              branchTracer
            );
      }

      if (evaluation > maxEval) maxEval = evaluation;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      const type = decType(m);
      const fromIndex = (m >>> 14) & 0x3F;
      const toIndex = (m >>> 8) & 0x3F;
      const piece = state.board[fromIndex];
      const target = state.board[toIndex];
      const pType = piece & 7;
      const targetType = target === 0 ? 0 : (target & 7);
      const isCombat = (type === ActionType.MOVE && target !== 0 && targetType !== 5 && pType !== 5);

      const branchTracer = (i === 0) ? tracer : undefined;
      let evaluation: number;

      if (isCombat) {
        const defenderSeat = getPieceOwnerSeat(target, toIndex);

        // Branch 1: Attacker Wins Combat (50% probability)
        const nextStateWin = cloneIntoScratch(state, nextPoolIndex);
        applyAction(nextStateWin, m, {
          requestType: BotRequestType.FAST_CALC,
          forceCombatWinner: currentSeat
        });

        const evalWin = (nextStateWin.isGameOver || depthRemaining <= 1)
          ? evaluateState(nextStateWin, rootSeat, pvals, depthRemaining - 1)
          : searchMinimaxRecursive(
              nextStateWin,
              rootSeat,
              rootTeam,
              pvals,
              depthRemaining - 1,
              topK,
              adaptiveBranching,
              nextPoolIndex,
              totalDepth,
              branchTracer
            );

        // Branch 2: Attacker Loses Combat (50% probability)
        const nextStateLoss = cloneIntoScratch(state, nextPoolIndex);
        applyAction(nextStateLoss, m, {
          requestType: BotRequestType.FAST_CALC,
          forceCombatWinner: defenderSeat
        });

        const evalLoss = (nextStateLoss.isGameOver || depthRemaining <= 1)
          ? evaluateState(nextStateLoss, rootSeat, pvals, depthRemaining - 1)
          : searchMinimaxRecursive(
              nextStateLoss,
              rootSeat,
              rootTeam,
              pvals,
              depthRemaining - 1,
              topK,
              adaptiveBranching,
              nextPoolIndex,
              totalDepth,
              undefined
            );

        // True 50/50 Expectimax combination
        evaluation = 0.5 * evalWin + 0.5 * evalLoss;
      } else {
        // Quiet move / Direct King Take / Bunker / Promotion
        const nextState = cloneIntoScratch(state, nextPoolIndex);
        applyAction(nextState, m, {
          requestType: BotRequestType.FAST_CALC
        });

        evaluation = (nextState.isGameOver || depthRemaining <= 1)
          ? evaluateState(nextState, rootSeat, pvals, depthRemaining - 1)
          : searchMinimaxRecursive(
              nextState,
              rootSeat,
              rootTeam,
              pvals,
              depthRemaining - 1,
              topK,
              adaptiveBranching,
              nextPoolIndex,
              totalDepth,
              branchTracer
            );
      }

      if (evaluation < minEval) minEval = evaluation;
    }
    return minEval;
  }
}

/**
 * Evaluates a root candidate action using arbitrary-depth Top-K Adversarial Minimax.
 * Uses fast win ratio combat (FAST_CALC) and pre-allocated zero-allocation state buffers.
 * Supports forceCombatWinner for 2-branch probabilistic Expectimax evaluation at Ply 0.
 */
export function evaluateActionTopK(
  state: GameState,
  rootActionInt: ActionInt,
  rootSeat: PlayerSeat,
  pvals: number[] = DEFAULT_PVALS,
  depth: number = 4,
  topK: number = 4,
  forceCombatWinner?: PlayerSeat,
  adaptiveBranching: boolean = false,
  tracer?: SearchTracer,
  totalDepth: number = depth
): number {
  const rootTeam = PLAYER_TEAMS[rootSeat];

  // Ply 0: Root move execution (uses accurate odds or forced combat branch)
  const s1 = cloneIntoScratch(state, 0);
  applyAction(s1, rootActionInt, {
    requestType: BotRequestType.FAST_CALC,
    forceCombatWinner,
    combatOddsMode: 'ACCURATE_ODDS'
  });

  if (s1.isGameOver || depth <= 1) {
    return evaluateState(s1, rootSeat, pvals, depth - 1);
  }

  // Ply 1 to (depth-1): Recursive Minimax across all candidate branches
  return searchMinimaxRecursive(
    s1,
    rootSeat,
    rootTeam,
    pvals,
    depth - 1,
    topK,
    adaptiveBranching,
    0,
    totalDepth,
    tracer
  );
}

/** Legacy rollout function maintained for backwards compatibility */
export function greedyRolloutScore(
  state: GameState,
  rootActionInt: ActionInt,
  rootSeat: PlayerSeat,
  pvals: number[],
  depth: number = 4
): number {
  return evaluateActionTopK(state, rootActionInt, rootSeat, pvals, depth, 1);
}

function getSlotScore(state: GameState, seat: PlayerSeat, trenchIndex: number, testCard: any): number {
  const teammateSeat = seat === PlayerSeat.NORTH ? PlayerSeat.SOUTH
    : seat === PlayerSeat.SOUTH ? PlayerSeat.NORTH
    : seat === PlayerSeat.EAST ? PlayerSeat.WEST
    : PlayerSeat.EAST;
  const teammate = state.players[teammateSeat];
  const teammateCard = teammate?.positionalCards[trenchIndex];
  const communityCards = state.publicFlop.filter((c: any) => c !== null);

  const pool = [...communityCards];
  if (testCard) pool.push(testCard);
  if (teammateCard) pool.push(teammateCard);

  if (pool.length >= 5) {
    return getBestHandFrom7CardPool(pool).score;
  }
  
  let slotScore = testCard ? testCard.rank * 10 : 0;
  if (testCard && teammateCard && testCard.rank === teammateCard.rank) {
    slotScore += 2000000;
  }
  return slotScore;
}

function findBestCardSwap(state: GameState, seat: PlayerSeat): ActionInt | null {
  const player = state.players[seat];
  const baseCount = player.baseDeck.length;

  let bestImprovement = 0;
  let bestSwap: ActionInt | null = null;

  const trySwap = (slot1: number, slot2: number) => {
    const isPos1 = slot1 < 3;
    const isPos2 = slot2 < 3;
    const c1 = isPos1 ? player.positionalCards[slot1] : player.baseDeck[slot1 - 3];
    const c2 = isPos2 ? player.positionalCards[slot2] : player.baseDeck[slot2 - 3];
    
    const isValidCard = (c: any) => c && c.id !== 'hidden' && c.rank > 0;
    if (!isValidCard(c1) && !isValidCard(c2)) return;

    let beforeScore = 0;
    let afterScore = 0;

    if (isPos1 && isPos2) {
      beforeScore += getSlotScore(state, seat, slot1, c1);
      beforeScore += getSlotScore(state, seat, slot2, c2);

      afterScore += getSlotScore(state, seat, slot1, c2);
      afterScore += getSlotScore(state, seat, slot2, c1);
    } else if (isPos1 && !isPos2) {
      beforeScore += getSlotScore(state, seat, slot1, c1);
      afterScore += getSlotScore(state, seat, slot1, c2);
    } else if (!isPos1 && isPos2) {
      beforeScore += getSlotScore(state, seat, slot2, c2);
      afterScore += getSlotScore(state, seat, slot2, c1);
    }

    const improvement = afterScore - beforeScore;
    if (improvement > bestImprovement) {
      bestImprovement = improvement;
      bestSwap = encodeAction(ActionType.CARD_SWAP, slot1, slot2, 0);
    }
  };

  // Trench-Trench
  trySwap(0, 1);
  trySwap(0, 2);
  trySwap(1, 2);

  // Trench-Base
  for (let t = 0; t < 3; t++) {
    for (let b = 0; b < baseCount; b++) {
      trySwap(t, 3 + b);
    }
  }

  return bestSwap;
}

/**
 * Evaluates all legal moves for the active player using Top-K Adversarial Forward Search (lookahead),
 * scoring each resulting branch with Expectimax probabilistic 2-branch combat and deep Alpha-Beta Minimax.
 */
export function getBestBotAction(
  state: GameState,
  profile: BotProfile = DEFAULT_BOT_PROFILE,
  _requestType: BotRequestType = BotRequestType.UI_GAME
): BotCandidateAction | null {
  if (state.isGameOver) return null;

  state.threatMap = generateFullThreatMap(state.board);

  // Handle pre-game trench setup draft: pick the 3 highest cards in the base deck
  if (state.setupState?.inSetup) {
    const seat = state.pendingRefills.length > 0
      ? state.pendingRefills[0].seat
      : state.activePlayer;
    const player = state.players[seat];
    if (player && player.baseDeck.length >= 3) {
      const indexed = player.baseDeck.map((c, i) => ({ rank: c.rank, index: i }));
      indexed.sort((a, b) => b.rank - a.rank);
      return {
        action: {
          type: 'TRENCH_SELECT',
          origin: seat,
          input1: seat,
          input2: [indexed[0].index, indexed[1].index, indexed[2].index]
        },
        score: 0
      };
    }
  }

  const seat = state.activePlayer;

  if (!state.hasSwappedThisTurn && !state.setupState?.inSetup && state.turnCount > 0) {
    const bestSwap = findBestCardSwap(state, seat);
    if (bestSwap !== null) {
      const shouldLog = (_requestType !== BotRequestType.HEADLESS && profile.verbose !== false) || profile.verbose === true;
      let logSummary = '';
      if (shouldLog) {
        logSummary = `🤖 [Bot Process] Player: ${SEAT_NAMES[seat]} (Team ${PLAYER_TEAMS[seat]}) | Pre-move Card Swap for better synergies.`;
        console.log(logSummary);
      }
      return {
        action: actionIntToGameAction(bestSwap),
        actionInt: bestSwap,
        score: 99999,
        logSummary
      };
    }
  }

  const pvals = profile.pvals || DEFAULT_PVALS;
  const depth = profile.depth !== undefined ? profile.depth : 4;
  const topK = profile.topK !== undefined ? profile.topK : 8;
  const adaptiveBranching = profile.adaptiveBranching ?? false;
  const shouldLog = (_requestType !== BotRequestType.HEADLESS && profile.verbose !== false) || profile.verbose === true;

  const tracer: SearchTracer = {
    plyScores: new Map<number, number[]>()
  };

  const allActions = getAllLegalActions(state, seat);
  const actions: ActionInt[] = [];
  for (let i = 0; i < allActions.length; i++) {
    const type = decType(allActions[i]);
    if (type !== ActionType.SKIP_TURN && type !== ActionType.CARD_SWAP) {
      actions.push(allActions[i]);
    }
  }

  if (actions.length === 0) {
    return null;
  }

  // Direct King Capture Check: If any legal move immediately captures enemy king, take it immediately!
  for (let i = 0; i < actions.length; i++) {
    const actionInt = actions[i];
    if (decType(actionInt) === ActionType.MOVE) {
      const toIndex = (actionInt >>> 8) & 0x3F;
      const target = state.board[toIndex];
      if (target !== 0 && (target & 7) === 5) {
        const winScore = (profile.pvals?.[1] ?? DEFAULT_PVALS[1] ?? 100000) + (depth * 1000);
        tracer.plyScores.set(1, [winScore]);

        let logSummary = '';
        if (shouldLog) {
          const lines = [
            `🤖 [Bot Process] Player: ${SEAT_NAMES[seat]} (Team ${PLAYER_TEAMS[seat]}) | Turn: ${state.turnCount} | Depth: ${depth}`,
            `  ply1: ${winScore} (Direct King Capture)`,
            `  ▶ Chosen: ${state.turnCount}. ${getSeatCode(seat)}] ${formatActionInt(actionInt, state.board)} (Score: ${winScore})`
          ];
          logSummary = lines.join('\n');
          console.log(logSummary);
        }

        return {
          action: actionIntToGameAction(actionInt),
          actionInt,
          score: winScore,
          plyScores: Object.fromEntries(tracer.plyScores.entries()),
          logSummary
        };
      }
    }
  }

  const scoredCandidatesPly1 = getTopKScoredMoves(state, seat, topK, pvals, profile.heuristicGapThreshold, true);
  if (scoredCandidatesPly1.length === 0) {
    return null;
  }

  tracer.plyScores.set(1, scoredCandidatesPly1.map(c => Math.round(c.score)));

  // If only 1 candidate remains after gap pruning, execute the obvious choice immediately!
  if (scoredCandidatesPly1.length === 1) {
    const chosenActionInt = scoredCandidatesPly1[0].actionInt;
    const immediateScore = scoredCandidatesPly1[0].score;

    let logSummary = '';
    if (shouldLog) {
      const lines = [
        `🤖 [Bot Process] Player: ${SEAT_NAMES[seat]} (Team ${PLAYER_TEAMS[seat]}) | Turn: ${state.turnCount} | Depth: ${depth}`,
        `  ply1: ${Math.round(immediateScore)} (1 candidate after gap pruning)`,
        `  ▶ Chosen: ${state.turnCount}. ${getSeatCode(seat)}] ${formatActionInt(chosenActionInt, state.board)} (Score: ${Math.round(immediateScore)})`
      ];
      logSummary = lines.join('\n');
      console.log(logSummary);
    }

    return {
      action: actionIntToGameAction(chosenActionInt),
      actionInt: chosenActionInt,
      score: immediateScore,
      plyScores: Object.fromEntries(tracer.plyScores.entries()),
      logSummary
    };
  }

  const scoredCandidates: { actionInt: ActionInt; score: number; ply1Score: number }[] = [];
  let bestDeepScore = -Infinity;
  const evaluatedActionInts = new Set<ActionInt>();

  const evaluateBatch = (batch: { actionInt: ActionInt; score: number }[]) => {
    for (let i = 0; i < batch.length; i++) {
      const actionInt = batch[i].actionInt;
      if (evaluatedActionInts.has(actionInt)) continue;
      evaluatedActionInts.add(actionInt);

      const ply1Score = batch[i].score;
      const type = decType(actionInt);
      const fromIndex = (actionInt >>> 14) & 0x3F;
      const toIndex = (actionInt >>> 8) & 0x3F;
      const piece = state.board[fromIndex];
      const target = state.board[toIndex];
      const pType = piece & 7;
      const targetType = target === 0 ? 0 : (target & 7);

      let score: number;
      const isAttack = (type === ActionType.MOVE && target !== 0 && targetType !== 5 && pType !== 5);

      const currentTracer = (scoredCandidates.length === 0 && shouldLog) ? tracer : undefined;

      if (isAttack) {
        const defenderSeat = getPieceOwnerSeat(target, toIndex);
        const odds = getSquareCombatOdds(state, toIndex);
        const attackerTeam = PLAYER_TEAMS[seat];
        const pWin = attackerTeam === 'A' ? odds.teamAWinRate : odds.teamBWinRate;

        const winScore = evaluateActionTopK(state, actionInt, seat, pvals, depth, topK, seat, adaptiveBranching, currentTracer, depth);
        const lossScore = evaluateActionTopK(state, actionInt, seat, pvals, depth, topK, defenderSeat, adaptiveBranching, undefined, depth);

        score = pWin * winScore + (1 - pWin) * lossScore;
      } else {
        score = evaluateActionTopK(state, actionInt, seat, pvals, depth, topK, undefined, adaptiveBranching, currentTracer, depth);
      }

      scoredCandidates.push({ actionInt, score, ply1Score });
      if (score > bestDeepScore) {
        bestDeepScore = score;
      }
    }
  };

  // Evaluate the initial topK candidates
  evaluateBatch(scoredCandidatesPly1);

  // Fallback search: if the best move found is losing (-10000 or worse), check more candidates
  if (bestDeepScore < -10000) {
    const allScoredMoves = getTopKScoredMoves(state, seat, topK, pvals, profile.heuristicGapThreshold, true, true);
    
    let currentOffset = topK;
    let addedBatches = 0;

    while (currentOffset < allScoredMoves.length) {
      if (bestDeepScore >= -10000) {
        break; 
      }
      // If score is >= -30000, we only check 1 extra batch (8 more candidates)
      if (bestDeepScore >= -30000 && addedBatches >= 1) {
        break; 
      }

      const batch = allScoredMoves.slice(currentOffset, currentOffset + topK);
      evaluateBatch(batch);
      
      currentOffset += topK;
      addedBatches++;
    }
  }

  scoredCandidates.sort((a, b) => b.score - a.score);

  let chosenActionInt = scoredCandidates[0].actionInt;
  let chosenScore = scoredCandidates[0].score;

  const margin = profile.randomnessMargin !== undefined ? profile.randomnessMargin : (pvals[0] ?? 0);
  const temp = profile.randomnessTemperature ?? 10;
  const pVal = profile.randomnessP !== undefined ? profile.randomnessP : (margin > 0 ? 0.25 : 0);

  if (margin > 0 && scoredCandidates.length > 1) {
    const topScore = scoredCandidates[0].score;
    const good = scoredCandidates.filter(c => topScore - c.score <= margin);
    if (good.length > 1 && pVal > 0 && Math.random() < pVal) {
      if (temp > 0) {
        let totalW = 0;
        const ws = good.map(c => {
          const w = Math.exp((c.score - topScore) / temp);
          totalW += w;
          return w;
        });
        let r = Math.random() * totalW;
        for (let i = 0; i < good.length; i++) {
          r -= ws[i];
          if (r <= 0) {
            chosenActionInt = good[i].actionInt;
            chosenScore = good[i].score;
            break;
          }
        }
      } else {
        const pick = good[Math.floor(Math.random() * good.length)];
        chosenActionInt = pick.actionInt;
        chosenScore = pick.score;
      }
    } else {
      const ties = scoredCandidates.filter(c => c.score === topScore);
      if (ties.length > 1) {
        const pick = ties[Math.floor(Math.random() * ties.length)];
        chosenActionInt = pick.actionInt;
        chosenScore = pick.score;
      }
    }
  } else {
    const topScore = scoredCandidates[0].score;
    const ties = scoredCandidates.filter(c => c.score === topScore);
    if (ties.length > 1) {
      const pick = ties[Math.floor(Math.random() * ties.length)];
      chosenActionInt = pick.actionInt;
      chosenScore = pick.score;
    }
  }

  let logSummary = '';
  if (shouldLog) {
    const lines: string[] = [
      `🤖 [Bot Process] Player: ${SEAT_NAMES[seat]} (Team ${PLAYER_TEAMS[seat]}) | Turn: ${state.turnCount} | Depth: ${depth}`
    ];
    for (let p = 1; p <= depth; p++) {
      const pScores = tracer.plyScores.get(p);
      if (pScores && pScores.length > 0) {
        lines.push(`  ply${p}: ${pScores.join(', ')}`);
      }
    }
    lines.push(`  Candidates:`);
    for (let i = 0; i < scoredCandidates.length; i++) {
      const c = scoredCandidates[i];
      const desc = formatActionInt(c.actionInt, state.board);
      lines.push(`    #${i + 1} ${state.turnCount}. ${getSeatCode(seat)}] ${desc} | 1-ply: ${Math.round(c.ply1Score)} | Search Score: ${Math.round(c.score)}`);
    }
    const chosenDesc = formatActionInt(chosenActionInt, state.board);
    lines.push(`  ▶ Chosen: ${state.turnCount}. ${getSeatCode(seat)}] ${chosenDesc} (Score: ${Math.round(chosenScore)})`);

    logSummary = lines.join('\n');
    console.log(logSummary);
  }

  return {
    action: actionIntToGameAction(chosenActionInt),
    actionInt: chosenActionInt,
    score: chosenScore,
    plyScores: Object.fromEntries(tracer.plyScores.entries()),
    logSummary
  };
}
