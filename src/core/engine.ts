import {
  autoPickBotTrenches,
  computeRegionProbabilities,
  createDeck,
  dealInitialPlayerCards,
  getBestHandFrom7CardPool,
  getTrenchCardIndexForSquare,
  getSquareCombatOdds,
  grantTurnEndCardRewards,
  popHighestRankCard,
  popMedianRankCard,
  processPostCombat,
  refillAllTrenchCards,
  swapPlayerCards,
  TrenchStrategy
} from './cards';
import { HILL_SQUARE_INDICES, HILL_SQUARES_BY_SEAT, INITIAL_BOARD_1D, PLAYER_TEAMS, TEAM_SEATS, getCol, getRow } from './constants';
import { generateFullThreatMap, getLegalMoves1D, getPieceTeam, getSlidingTargetIndex, getThreatenedKings, INITIAL_THREAT_MAP, isPieceControllable, isPromotionValid, isSeatKingAlive, update_threatMap_by_move } from './moves';
import {
  formatDirectTakeText,
  formatFailedCombatText,
  formatPokerComparison,
  formatPromotionText,
  formatSetBunkerText,
  formatStandardMoveText,
  getSeatCode
} from './notation';
import {
  ActionInt,
  ActionType,
  Board1D,
  BotRequestType,
  Card,
  CombatResult,
  EvaluatedHand,
  GameAction,
  GameActionType,
  GameState,
  HandRank,
  LastMove,
  LastMoveType,
  Pc,
  PieceType,
  PlayerSeat,
  PlayerState,
  PromotionOption,
  Team,
  TurnTimeLimit,
  encodeAction,
  getPieceType,
  charToPiece
} from './types';

export { isSeatKingAlive };
export type { ActionType, GameAction, GameActionType };
export * from './cards';

const FAST_CALC_DUMMY_HAND: EvaluatedHand = {
  rank: HandRank.HIGH_CARD,
  score: 0,
  name: 'FAST_CALC',
  cards: []
};

let globalMoveSeq = 0;

/** Zero-system-call sequential ID generator for UI move tracking */
export function generateMoveId(): string {
  globalMoveSeq = (globalMoveSeq + 1) | 0;
  return globalMoveSeq.toString(36);
}

/** Reset move ID counter between games to prevent unbounded growth */
export function resetGlobalMoveSeq(): void {
  globalMoveSeq = 0;
}

export function removeBunkerIfPresent(state: GameState, _seat: PlayerSeat, squareIndex: number): void {
  const piece = state.board[squareIndex];
  if (piece !== 0 && (piece & 16) !== 0) {
    state.board[squareIndex] = piece & ~16;
    if (state.threatMap) {
      update_threatMap_by_move(state.board, state.threatMap, squareIndex);
    }
  }
}

export interface TurnActionResult {
  logText: string;
  pokerText?: string;
  isGameOver: boolean;
  winnerTeam: Team | null;
  combatOccurred?: boolean;
  pendingCombat?: CombatResult;
}

export function toUint8Array(arr: any, length: number): Uint8Array {
  if (!arr) return new Uint8Array(length);
  if (arr instanceof Uint8Array) return new Uint8Array(arr);
  if (ArrayBuffer.isView(arr) || arr instanceof ArrayBuffer) return new Uint8Array(arr as any);
  if (Array.isArray(arr)) return new Uint8Array(arr);
  if (arr && arr.type === 'Buffer' && Array.isArray(arr.data)) return new Uint8Array(arr.data);
  if (typeof arr === 'object') {
    const res = new Uint8Array(length);
    for (let i = 0; i < length; i++) res[i] = arr[i] || 0;
    return res;
  }
  return new Uint8Array(length);
}

export function fastCloneState(state: GameState): GameState {
  return {
    board: toUint8Array(state.board, 64),
    threatMap: state.threatMap ? toUint8Array(state.threatMap, 4096) : new Uint8Array(INITIAL_THREAT_MAP),
    activePlayer: state.activePlayer,
    players: {
      0: { ...state.players[0], baseDeck: state.players[0].baseDeck.slice(), trenchCards: [...state.players[0].trenchCards] },
      1: { ...state.players[1], baseDeck: state.players[1].baseDeck.slice(), trenchCards: [...state.players[1].trenchCards] },
      2: { ...state.players[2], baseDeck: state.players[2].baseDeck.slice(), trenchCards: [...state.players[2].trenchCards] },
      3: { ...state.players[3], baseDeck: state.players[3].baseDeck.slice(), trenchCards: [...state.players[3].trenchCards] }
    },
    deck: state.deck.slice(),
    publicFlop: [...state.publicFlop],
    publicTurnRiver: [...state.publicTurnRiver],
    isTurnRiverRevealed: state.isTurnRiverRevealed,
    regionOdds: state.regionOdds ? (state.regionOdds instanceof Float64Array ? new Float64Array(state.regionOdds) : state.regionOdds.map(o => ({ ...o }))) : new Float64Array(9),
    deadPoolCounts: toUint8Array(state.deadPoolCounts, 16),
    turnCount: state.turnCount,
    hasSwappedThisTurn: state.hasSwappedThisTurn,
    isGameOver: state.isGameOver,
    winnerTeam: state.winnerTeam,
    score: { ...state.score },
    threatenedKings: [...(state.threatenedKings || [])],
    lastMove: state.lastMove ? { ...state.lastMove } : null,
    setupState: state.setupState ? {
      inSetup: state.setupState.inSetup,
      setupCompletedSeats: [...state.setupState.setupCompletedSeats]
    } : { inSetup: false, setupCompletedSeats: [0, 1, 2, 3] },
    botSeats: { ...state.botSeats },
    pendingRefills: (state.pendingRefills || []).map(pr => ({ ...pr })),
    seatActionCounts: state.seatActionCounts ? { ...state.seatActionCounts } : { 0: 0, 1: 0, 2: 0, 3: 0 }
  };
}

/** Lightweight zero-card-clone state snapshot dedicated for bot lookahead & forward simulation (FAST_CALC) */
export function fastCloneBotState(state: GameState): GameState {
  return {
    board: new Uint8Array(state.board),
    threatMap: state.threatMap ? new Uint8Array(state.threatMap) : new Uint8Array(INITIAL_THREAT_MAP),
    activePlayer: state.activePlayer,
    players: null as any,
    deck: null as any,
    publicFlop: state.publicFlop,
    publicTurnRiver: state.publicTurnRiver,
    isTurnRiverRevealed: state.isTurnRiverRevealed,
    regionOdds: state.regionOdds,
    deadPoolCounts: new Uint8Array(state.deadPoolCounts),
    turnCount: state.turnCount,
    hasSwappedThisTurn: state.hasSwappedThisTurn,
    isGameOver: state.isGameOver,
    winnerTeam: state.winnerTeam,
    score: { teamA: state.score?.teamA ?? 0, teamB: state.score?.teamB ?? 0 },
    threatenedKings: state.threatenedKings || [],
    lastMove: null,
    setupState: { inSetup: false, setupCompletedSeats: [0, 1, 2, 3] },
    botSeats: state.botSeats || { 0: true, 1: true, 2: true, 3: true },
    pendingRefills: [],
    seatActionCounts: state.seatActionCounts
      ? { 0: state.seatActionCounts[0] || 0, 1: state.seatActionCounts[1] || 0, 2: state.seatActionCounts[2] || 0, 3: state.seatActionCounts[3] || 0 }
      : { 0: 0, 1: 0, 2: 0, 3: 0 }
  };
}

/**
 * Initial trench filling / draft phase setup.
 * Remarked out / retained for reference; players now start directly with 3 random trench cards.
 * (Can be deleted completely later).
 */
export function initializeTrenchDraftPhase(
  state: GameState,
  _botSeats?: Record<PlayerSeat, boolean>,
  _autoCardPick: boolean = false,
  _botStrategies?: Partial<Record<PlayerSeat, TrenchStrategy>>
): void {
  /*
  for (const seat of [PlayerSeat.NORTH, PlayerSeat.EAST, PlayerSeat.SOUTH, PlayerSeat.WEST]) {
    const strat = _botStrategies?.[seat] || 'BOT_DEFAULT_DRAFT';
    autoPickBotTrenches(state.players[seat], strat, state.publicFlop);
  }
  */

  state.setupState = {
    inSetup: false,
    setupCompletedSeats: [0, 1, 2, 3]
  };
}

export interface CreateInitialGameStateOptions {
  autoSetupBots?: boolean;
  botSeats?: Record<PlayerSeat, boolean>;
  botStrategies?: Partial<Record<PlayerSeat, TrenchStrategy>>;
  autoCardPick?: boolean;
  score?: { teamA: number; teamB: number };
  startingPlayer?: PlayerSeat;
  turnTimeLimit?: TurnTimeLimit;
  skipSetup?: boolean;
}

export function createInitialGameState(options?: CreateInitialGameStateOptions): GameState {
  const startingPlayer = options?.startingPlayer ?? PlayerSeat.NORTH;
  const initialScore = options?.score ? { ...options.score } : { teamA: 0, teamB: 0 };
  const deck = createDeck();

  const northSetup = dealInitialPlayerCards(deck);
  const eastSetup = dealInitialPlayerCards(deck);
  const southSetup = dealInitialPlayerCards(deck);
  const westSetup = dealInitialPlayerCards(deck);

  const players: Record<PlayerSeat, PlayerState> = {
    [PlayerSeat.NORTH]: { seat: PlayerSeat.NORTH, team: 'A', baseDeck: northSetup.baseDeck, trenchCards: northSetup.trenchCards },
    [PlayerSeat.EAST]:  { seat: PlayerSeat.EAST,  team: 'B', baseDeck: eastSetup.baseDeck,  trenchCards: eastSetup.trenchCards },
    [PlayerSeat.SOUTH]: { seat: PlayerSeat.SOUTH, team: 'A', baseDeck: southSetup.baseDeck, trenchCards: southSetup.trenchCards },
    [PlayerSeat.WEST]:  { seat: PlayerSeat.WEST,  team: 'B', baseDeck: westSetup.baseDeck,  trenchCards: westSetup.trenchCards }
  };

  const publicFlop: [Card, Card, Card] = [deck.pop()!, deck.pop()!, deck.pop()!];
  const publicTurnRiver: [Card, Card] = [deck.pop()!, deck.pop()!];

  const state: GameState = {
    board: new Uint8Array(INITIAL_BOARD_1D),
    threatMap: new Uint8Array(INITIAL_THREAT_MAP),
    activePlayer: startingPlayer,
    players,
    deck,
    publicFlop,
    publicTurnRiver,
    isTurnRiverRevealed: false,
    regionOdds: [],
    deadPoolCounts: new Uint8Array(16),
    turnCount: 1,
    isGameOver: false,
    winnerTeam: null,
    score: initialScore,
    threatenedKings: [],
    lastMove: null,
    hasSwappedThisTurn: false,
    setupState: {
      inSetup: false,
      setupCompletedSeats: [0, 1, 2, 3]
    },
    botSeats: options?.botSeats ?? {
      [PlayerSeat.NORTH]: false,
      [PlayerSeat.EAST]: true,
      [PlayerSeat.SOUTH]: false,
      [PlayerSeat.WEST]: true
    },
    pendingRefills: [],
    seatActionCounts: { 0: 0, 1: 0, 2: 0, 3: 0 }
  };

  /*
  // Initial trench filling / setup phase (remarked out as players now start directly with 3 random trench cards & 5 base deck cards)
  if (options?.skipSetup) {
    for (const seat of [PlayerSeat.NORTH, PlayerSeat.EAST, PlayerSeat.SOUTH, PlayerSeat.WEST] as PlayerSeat[]) {
      const strat = options?.botStrategies?.[seat] || 'ALWAYS_HIGHEST';
      autoPickBotTrenches(state.players[seat], strat, state.publicFlop);
    }
    state.setupState = { inSetup: false, setupCompletedSeats: [0, 1, 2, 3] };
  } else {
    initializeTrenchDraftPhase(state, options?.botSeats, false, options?.botStrategies);
  }
  */

  state.threatenedKings = getThreatenedKings(state.board, state.threatMap);
  state.regionOdds = computeRegionProbabilities(state);
  return state;
}

export function executeTrenchSelectAction(
  state: GameState,
  seat: PlayerSeat,
  selectedBaseIndices: [number, number, number]
): TurnActionResult {
  const player = state.players[seat];
  if (selectedBaseIndices.length !== 3) {
    throw new Error('Trench selection requires exactly 3 base card indices');
  }

  const sortedIndices = [...selectedBaseIndices].sort((a, b) => b - a);
  const chosen: Card[] = [];
  for (const idx of sortedIndices) {
    if (idx < 0 || idx >= player.baseDeck.length) {
      throw new Error(`Invalid base deck card index: ${idx}`);
    }
    chosen.push(player.baseDeck.splice(idx, 1)[0]);
  }

  chosen.reverse();
  player.trenchCards = [chosen[0], chosen[1], chosen[2]];

  if (!state.setupState.setupCompletedSeats.includes(seat)) {
    state.setupState.setupCompletedSeats.push(seat);
  }

  if (state.setupState.setupCompletedSeats.length === 4) {
    state.setupState.inSetup = false;
    state.regionOdds = computeRegionProbabilities(state);
  }

  const seatCode = getSeatCode(seat);
  return {
    logText: `${seatCode} : Selected 3 Trench cards.`,
    isGameOver: state.isGameOver,
    winnerTeam: state.winnerTeam
  };
}

export function executeTrenchSingleCardSelect(
  state: GameState,
  seat: PlayerSeat,
  baseCardIndex: number,
  botSeats?: Record<PlayerSeat, boolean>
): TurnActionResult {
  const player = state.players[seat];
  const emptySlotIdx = player.trenchCards.findIndex(c => c === null);
  if (emptySlotIdx === -1) {
    throw new Error(`Seat ${seat} trench cards are already full`);
  }

  if (baseCardIndex < 0 || baseCardIndex >= player.baseDeck.length) {
    throw new Error(`Invalid base deck card index: ${baseCardIndex}`);
  }

  const card = player.baseDeck.splice(baseCardIndex, 1)[0];
  player.trenchCards[emptySlotIdx] = card;

  if (!player.trenchCards.includes(null)) {
    if (!state.setupState.setupCompletedSeats.includes(seat)) {
      state.setupState.setupCompletedSeats.push(seat);
    }
  }

  if (state.setupState.setupCompletedSeats.length === 4) {
    state.setupState.inSetup = false;
    state.regionOdds = computeRegionProbabilities(state);
  }

  const seatCode = getSeatCode(seat);
  return {
    logText: `${seatCode} : Placed card in Trench slot ${emptySlotIdx + 1}.`,
    isGameOver: state.isGameOver,
    winnerTeam: state.winnerTeam
  };
}

export function executeRefillTrenchAction(
  state: GameState,
  seat: PlayerSeat,
  trenchSlot: number,
  baseCardIndex: number,
  botSeats?: Record<PlayerSeat, boolean>,
  autoCardPick: boolean = true
): TurnActionResult {
  const player = state.players[seat];
  if (trenchSlot < 0 || trenchSlot > 2) {
    throw new Error(`Invalid trench slot: ${trenchSlot}`);
  }
  if (baseCardIndex < 0 || baseCardIndex >= player.baseDeck.length) {
    throw new Error(`Invalid base deck card index: ${baseCardIndex}`);
  }

  const card = player.baseDeck.splice(baseCardIndex, 1)[0];
  player.trenchCards[trenchSlot] = card;

  const stillPending = handlePostCombatRefillStage(state, botSeats, undefined, autoCardPick);
  if (!stillPending) {
    advanceTurn(state);
  }

  state.regionOdds = computeRegionProbabilities(state);
  const seatCode = getSeatCode(seat);

  return {
    logText: `${seatCode} : Refilled Trench slot ${trenchSlot}.`,
    isGameOver: state.isGameOver,
    winnerTeam: state.winnerTeam
  };
}

function resolveCombatInternal(
  state: GameState,
  attackerSeat: PlayerSeat,
  defenderSeat: PlayerSeat,
  attackerPos: number,
  defenderPos: number,
  options?: ApplyActionOptions
): CombatResult {
  const reqType = getRequestType(options);
  const capturedPiece = state.board[defenderPos];
  const isDefenderBunkered = (capturedPiece & 16) !== 0;

  if (options?.forceCombatWinner !== undefined) {
    return {
      attackerSeat,
      defenderSeat,
      attackerPosIndex: attackerPos,
      defenderPosIndex: defenderPos,
      attackerHand: FAST_CALC_DUMMY_HAND,
      defenderHand: FAST_CALC_DUMMY_HAND,
      winnerSeat: options.forceCombatWinner,
      capturedPiece,
      isDefenderBunkered
    };
  }

  if (reqType === BotRequestType.FAST_CALC) {
    let winRate = 0.5;
    if (options?.combatOddsMode !== 'FIFTY_FIFTY') {
      const attackerTeam = PLAYER_TEAMS[attackerSeat];
      const odds = getSquareCombatOdds(state, defenderPos);
      winRate = attackerTeam === 'A' ? odds.teamAWinRate : odds.teamBWinRate;
    }
    const winnerSeat = winRate >= 0.5 ? attackerSeat : defenderSeat;

    return {
      attackerSeat,
      defenderSeat,
      attackerPosIndex: attackerPos,
      defenderPosIndex: defenderPos,
      attackerHand: FAST_CALC_DUMMY_HAND,
      defenderHand: FAST_CALC_DUMMY_HAND,
      winnerSeat,
      capturedPiece,
      isDefenderBunkered
    };
  }

  state.isTurnRiverRevealed = true;

  const attackerTeam = state.players[attackerSeat].team;
  const defenderTeam = state.players[defenderSeat].team;

  const attCardIdx = getTrenchCardIndexForSquare(defenderPos, attackerTeam);
  const defCardIdx = getTrenchCardIndexForSquare(defenderPos, defenderTeam);

  const attackerSeats = TEAM_SEATS[attackerTeam];
  const defenderSeats = TEAM_SEATS[defenderTeam];

  const attackerTrenchCards: Card[] = attackerSeats
    .map(seat => state.players[seat].trenchCards[attCardIdx])
    .filter((c): c is Card => c !== null && c !== undefined);

  const defenderTrenchCards: Card[] = defenderSeats
    .map(seat => state.players[seat].trenchCards[defCardIdx])
    .filter((c): c is Card => c !== null && c !== undefined);

  const communityCards = [
    ...state.publicFlop.filter((c): c is Card => c !== null),
    ...state.publicTurnRiver.filter((c): c is Card => c !== null)
  ];

  const attackerPool = [...communityCards, ...attackerTrenchCards];
  const defenderPool = [...communityCards, ...defenderTrenchCards];

  const attackerHand = getBestHandFrom7CardPool(attackerPool);
  const defenderHand = getBestHandFrom7CardPool(defenderPool);

  const winnerSeat: PlayerSeat = (attackerHand.score >= defenderHand.score) ? attackerSeat : defenderSeat;

  return {
    attackerSeat,
    defenderSeat,
    attackerPosIndex: attackerPos,
    defenderPosIndex: defenderPos,
    attackerHand,
    defenderHand,
    winnerSeat,
    capturedPiece,
    isDefenderBunkered
  };
}

export function resolveCombat(
  state: GameState,
  attackerSeat: PlayerSeat,
  defenderSeat: PlayerSeat,
  attackerPos: number,
  defenderPos: number,
  options?: ApplyActionOptions
): CombatResult {
  return resolveCombatInternal(state, attackerSeat, defenderSeat, attackerPos, defenderPos, options);
}

export function getPieceOwnerSeat(piece: number, posIndex: number): PlayerSeat {
  const team = getPieceTeam(piece);
  const row = getRow(posIndex);
  const col = getCol(posIndex);

  if (team === 'A') {
    return row < 4 ? PlayerSeat.NORTH : PlayerSeat.SOUTH;
  } else {
    return col < 4 ? PlayerSeat.WEST : PlayerSeat.EAST;
  }
}

export function checkWinCondition(board: Board1D): Team | null {
  let teamAKings = 0;
  let teamBKings = 0;
  let teamAPieces = 0;
  let teamBPieces = 0;

  for (let i = 0; i < 64; i++) {
    const piece = board[i];
    if (piece === 0) continue;
    const team = (piece & 8) === 0 ? 'A' : 'B';
    const isKing = (piece & 7) === 5;

    if (team === 'A') {
      teamAPieces++;
      if (isKing) teamAKings++;
    } else {
      teamBPieces++;
      if (isKing) teamBKings++;
    }
  }

  const teamALost = teamAKings === 0 || (teamAPieces === 1 && teamAKings === 1);
  const teamBLost = teamBKings === 0 || (teamBPieces === 1 && teamBKings === 1);

  if (teamALost && !teamBLost) return 'B';
  if (teamBLost && !teamALost) return 'A';
  return null;
}

export function getTeamCapturedPieces(state: GameState, team: Team): number[] {
  const pieces: number[] = [];
  const teamBit = team === 'A' ? 0 : 8;
  for (let pType = 2; pType <= 5; pType++) {
    const pieceCode = pType | teamBit;
    for (let i = 0; i < state.deadPoolCounts[pieceCode]; i++) {
      pieces.push(pieceCode);
    }
  }
  return pieces;
}

export function getValidPromotionOptions(
  state: GameState,
  seat: PlayerSeat = state.activePlayer
): PromotionOption[] {
  const options: PromotionOption[] = [];
  const teamBit = PLAYER_TEAMS[seat] === 'A' ? 0 : 8;
  const hillSquares = HILL_SQUARES_BY_SEAT[seat];
  const added = new Set<string>();
  const promotableTypes = [2, 3, 4, 5];

  for (const hillIdx of hillSquares) {
    const piece = state.board[hillIdx];
    if (piece === Pc.EMPTY || (piece & 7) !== 1 || (piece & 8) !== teamBit) {
      continue;
    }
    for (const pType of promotableTypes) {
      const promoPiece = pType | teamBit;
      if (state.deadPoolCounts[promoPiece] > 0) {
        const key = `${hillIdx}:${promoPiece}`;
        if (!added.has(key) && isPromotionValid(state.board, seat, hillIdx, promoPiece, state.deadPoolCounts)) {
          added.add(key);
          options.push({ hillIndex: hillIdx, promotedPiece: promoPiece });
        }
      }
    }
  }

  return options;
}

export function hasValidPromotionOption(
  state: GameState,
  seat: PlayerSeat = state.activePlayer
): boolean {
  const teamBit = PLAYER_TEAMS[seat] === 'A' ? 0 : 8;
  const hillSquares = HILL_SQUARES_BY_SEAT[seat];
  const promotableTypes = [2, 3, 4, 5];

  for (const hillIdx of hillSquares) {
    const piece = state.board[hillIdx];
    if (piece === Pc.EMPTY || (piece & 7) !== 1 || (piece & 8) !== teamBit) {
      continue;
    }
    for (const pType of promotableTypes) {
      const promoPiece = pType | teamBit;
      if (state.deadPoolCounts[promoPiece] > 0) {
        if (isPromotionValid(state.board, seat, hillIdx, promoPiece, state.deadPoolCounts)) {
          return true;
        }
      }
    }
  }
  return false;
}

export function hasPlayerAnyLegalActions(state: GameState, seat: PlayerSeat): boolean {
  if (!state.threatMap || state.threatMap.length !== 4096) {
    state.threatMap = generateFullThreatMap(state.board);
  }

  for (let i = 0; i < 64; i++) {
    const piece = state.board[i];
    if (piece !== 0 && isPieceControllable(piece, seat, i)) {
      if ((piece & 16) !== 0) return true;
      const moves = getLegalMoves1D(state.board, i, seat, state.threatMap);
      if (moves.length > 0) return true;
    }
  }

  return hasValidPromotionOption(state, seat);
}

export function getAllLegalActions(
  state: GameState,
  seat: PlayerSeat = state.activePlayer
): ActionInt[] {
  const actions: ActionInt[] = [];

  const promoOptions = getValidPromotionOptions(state, seat);
  for (const opt of promoOptions) {
    actions.push(encodeAction(ActionType.PROMOTION, opt.hillIndex, opt.hillIndex, getPieceType(opt.promotedPiece)));
  }

  if (!state.threatMap || state.threatMap.length !== 4096) {
    state.threatMap = generateFullThreatMap(state.board);
  }

  for (let origin = 0; origin < 64; origin++) {
    const piece = state.board[origin];
    if (piece !== Pc.EMPTY && (piece & Pc.BUNKER_BIT) === 0 && isPieceControllable(piece, seat, origin)) {
      const moves = getLegalMoves1D(state.board, origin, seat, state.threatMap);
      for (let m = 0; m < moves.length; m++) {
        actions.push(moves[m]);
      }
    }
  }

  for (let origin = 0; origin < 64; origin++) {
    const piece = state.board[origin];
    if (piece !== 0 && (piece & 16) !== 0 && isPieceControllable(piece, seat, origin)) {
      actions.push(encodeAction(ActionType.SET_BUNKER, origin, 0, 0));
      for (let end = 0; end < 64; end++) {
        if (end === origin || HILL_SQUARE_INDICES.includes(end)) continue;
        const targetPiece = state.board[end];
        if (targetPiece !== 0 && (targetPiece & 16) === 0 && isPieceControllable(targetPiece, seat, end)) {
          actions.push(encodeAction(ActionType.SET_BUNKER, origin, end, 0));
        }
      }
    }
  }

  if (actions.length === 0) {
    actions.push(encodeAction(ActionType.SKIP_TURN, 0, 0, 0));
  }

  return actions;
}

export function getRandomLegalAction(
  state: GameState,
  seat: PlayerSeat = state.activePlayer
): ActionInt {
  const actions = getAllLegalActions(state, seat);
  return actions[Math.floor(Math.random() * actions.length)];
}

export function advanceTurn(state: GameState): void {
  // Grant turn end card rewards to the current active player before their turn ends.
  // This must happen after all trench refills are complete so we don't hit the base deck cap artificially.
  const cardRewards = grantTurnEndCardRewards(state, state.activePlayer);
  if (cardRewards.hillGranted) {
    state.regionOdds = computeRegionProbabilities(state);
  }

  let nextSeat = ((state.activePlayer + 1) % 4) as PlayerSeat;
  let attempts = 0;

  while (attempts < 4) {
    if (hasPlayerAnyLegalActions(state, nextSeat)) {
      state.activePlayer = nextSeat;
      state.turnCount++;
      state.hasSwappedThisTurn = false;
      return;
    }
    nextSeat = ((nextSeat + 1) % 4) as PlayerSeat;
    attempts++;
  }

  state.isGameOver = true;
  const winner = checkWinCondition(state.board);
  if (winner) {
    state.winnerTeam = winner;
    if (winner === 'A') state.score.teamA++;
    else state.score.teamB++;
  }
}

export interface ApplyActionOptions {
  requestType?: BotRequestType;
  skipOddsRecompute?: boolean;
  botSeats?: Record<PlayerSeat, boolean>;
  botStrategies?: Partial<Record<PlayerSeat, TrenchStrategy>>;
  autoCardPick?: boolean;
  deferPostCombat?: boolean;
  forceCombatWinner?: PlayerSeat;
  combatOddsMode?: 'ACCURATE_ODDS' | 'FIFTY_FIFTY';
}

export function getRequestType(options?: ApplyActionOptions): BotRequestType {
  return options?.requestType !== undefined ? options.requestType : BotRequestType.UI_GAME;
}

function finalizeTurn(
  state: GameState,
  seat: PlayerSeat,
  lastMove: LastMove | null,
  options?: ApplyActionOptions
): void {
  const reqType = getRequestType(options);

  if (!state.seatActionCounts) {
    state.seatActionCounts = { 0: 0, 1: 0, 2: 0, 3: 0 };
  }
  state.seatActionCounts[seat] = (state.seatActionCounts[seat] || 0) + 1;

  let pendingHumanRefill = false;

  if (reqType !== BotRequestType.FAST_CALC) {
    pendingHumanRefill = handlePostCombatRefillStage(
      state, options?.botSeats, options?.botStrategies, options?.autoCardPick ?? true
    );

    const skipOdds = options?.skipOddsRecompute ?? (reqType !== BotRequestType.UI_GAME);
    if (!skipOdds) {
      if (!state.regionOdds || state.regionOdds.length === 0) {
        state.regionOdds = computeRegionProbabilities(state);
      }
    }
  }

  if (!state.threatMap || state.threatMap.length !== 4096) {
    state.threatMap = generateFullThreatMap(state.board);
  }
  state.threatenedKings = getThreatenedKings(state.board, state.threatMap);
  state.lastMove = lastMove;

  const winner = checkWinCondition(state.board);
  if (winner) {
    state.isGameOver = true;
    state.winnerTeam = winner;
    if (winner === 'A') state.score.teamA++;
    else state.score.teamB++;
  } else if (!pendingHumanRefill) {
    advanceTurn(state);
  }
}

export function handlePostCombatRefillStage(
  state: GameState,
  botSeats?: Record<PlayerSeat, boolean>,
  botStrategies?: Partial<Record<PlayerSeat, TrenchStrategy>>,
  autoCardPick: boolean = true
): boolean {
  const effectiveBotSeats = botSeats ? { ...state.botSeats, ...botSeats } : state.botSeats;

  if (state.pendingRefills.length === 0) {
    for (const seat of [PlayerSeat.NORTH, PlayerSeat.EAST, PlayerSeat.SOUTH, PlayerSeat.WEST]) {
      const player = state.players[seat];
      for (let slot = 0; slot < player.trenchCards.length; slot++) {
        if (player.trenchCards[slot] === null && player.baseDeck.length > 0) {
          state.pendingRefills.push({ seat, slot });
        }
      }
    }
  }

  for (const pr of state.pendingRefills) {
    const player = state.players[pr.seat];
    if (effectiveBotSeats[pr.seat] && player.trenchCards[pr.slot] === null && player.baseDeck.length > 0) {
      const strat = botStrategies?.[pr.seat] || 'ALWAYS_HIGHEST';
      const card = strat === 'MEDIUM_RESERVE_ATTACK'
        ? popMedianRankCard(player.baseDeck)
        : popHighestRankCard(player.baseDeck);
      if (card) {
        player.trenchCards[pr.slot] = card;
      }
    } else if (autoCardPick && !effectiveBotSeats[pr.seat] && player.trenchCards[pr.slot] === null && player.baseDeck.length > 0) {
      const card = popHighestRankCard(player.baseDeck);
      if (card) {
        player.trenchCards[pr.slot] = card;
      }
    }
  }

  state.pendingRefills = state.pendingRefills.filter(pr => {
    const player = state.players[pr.seat];
    return player && player.trenchCards[pr.slot] === null && player.baseDeck.length > 0;
  });

  const remainingHumanRefill = state.pendingRefills.find(pr => {
    const player = state.players[pr.seat];
    return !effectiveBotSeats[pr.seat] && player.trenchCards[pr.slot] === null && player.baseDeck.length > 0;
  });

  if (remainingHumanRefill) {
    return true;
  }

  state.pendingRefills = [];
  return false;
}

export function completePostCombat(
  state: GameState,
  combat: CombatResult,
  options?: ApplyActionOptions
): void {
  if (!(combat as any).isResolved) {
    executeCombatResolution(state, combat, options);
  }

  const reqType = getRequestType(options);
  if (reqType !== BotRequestType.FAST_CALC) {
    processPostCombat(state, combat);
  }
  state.pendingCombat = null;
  state.isCombatDelaying = false;

  const existingLastMove = state.lastMove;
  finalizeTurn(state, combat.attackerSeat, existingLastMove!, options);
}

export function executeCombatResolution(
  state: GameState,
  combat: CombatResult,
  options?: ApplyActionOptions
): { logText: string; pokerText?: string; isGameOver: boolean; winnerTeam: Team | null } {
  if ((combat as any).isResolved) {
    return {
      logText: '',
      pokerText: formatPokerComparison(combat),
      isGameOver: state.isGameOver,
      winnerTeam: state.winnerTeam
    };
  }
  (combat as any).isResolved = true;

  const reqType = getRequestType(options);
  const isFastOrHeadless = reqType === BotRequestType.FAST_CALC || reqType === BotRequestType.HEADLESS;

  const { attackerSeat, defenderSeat, attackerPosIndex: fromIndex, defenderPosIndex: toIndex, isDefenderBunkered } = combat;
  const piece = state.board[fromIndex] || (combat as any).attackerPiece || 0;
  const rawCaptured = state.board[toIndex] !== 0 ? state.board[toIndex] : (combat.capturedPiece ?? 0);
  const capturedPiece: number = typeof rawCaptured === 'number' ? rawCaptured : charToPiece(rawCaptured);
  const pType = piece & 7;

  // Reveal turn and river cards
  state.isTurnRiverRevealed = true;

  const resolved = resolveCombatInternal(state, attackerSeat, defenderSeat, fromIndex, toIndex, options);
  if (combat.winnerSeat === null || combat.winnerSeat === undefined) {
    combat.attackerHand = resolved.attackerHand;
    combat.defenderHand = resolved.defenderHand;
    combat.winnerSeat = resolved.winnerSeat;
  }

  let moveType: LastMoveType = 'move';
  let failedAttackDestIndex: number | undefined = undefined;
  let text = '';
  let pokerText: string | undefined;

  if (!isFastOrHeadless) {
    pokerText = formatPokerComparison(combat);
  }

  if (isDefenderBunkered) {
    state.deadPoolCounts[piece & 15]++;
    state.board[fromIndex] = 0;

    if (combat.winnerSeat === attackerSeat) {
      moveType = 'capture';
      if (capturedPiece !== 0) {
        state.deadPoolCounts[capturedPiece & 15]++;
      }
      state.board[toIndex] = 0;
      if (!isFastOrHeadless) {
        text = formatDirectTakeText(getPieceChar(piece), getPieceChar(capturedPiece || 0), fromIndex, toIndex, true);
      }
    } else {
      moveType = 'failed_attack';
      if (!isFastOrHeadless) {
        text = formatFailedCombatText(getPieceChar(piece), toIndex, fromIndex, fromIndex, true);
      }
    }
    update_threatMap_by_move(state.board, state.threatMap, fromIndex, toIndex);
  } else {
    if (combat.winnerSeat === attackerSeat) {
      moveType = 'capture';
      if (capturedPiece !== 0) {
        state.deadPoolCounts[capturedPiece & 15]++;
      }
      state.board[toIndex] = piece & ~16;
      state.board[fromIndex] = 0;
      if (!isFastOrHeadless) {
        text = formatDirectTakeText(getPieceChar(piece), getPieceChar(capturedPiece || 0), fromIndex, toIndex);
      }
      update_threatMap_by_move(state.board, state.threatMap, fromIndex, toIndex);
    } else {
      moveType = 'failed_attack';
      let destIndex = fromIndex;
      if (pType === 4 || pType === 3) {
        const slideIndex = getSlidingTargetIndex(fromIndex, toIndex);
        if (slideIndex !== fromIndex && state.board[slideIndex] === 0) {
          state.board[slideIndex] = piece & ~16;
          state.board[fromIndex] = 0;
          destIndex = slideIndex;
        }
      }
      if (destIndex !== fromIndex) {
        failedAttackDestIndex = destIndex;
      }
      if (!isFastOrHeadless) {
        text = formatFailedCombatText(getPieceChar(piece), toIndex, fromIndex, destIndex);
      }
      update_threatMap_by_move(state.board, state.threatMap, fromIndex, destIndex);
    }
  }

  const moveInfo: LastMove = {
    fromIndex,
    toIndex,
    destIndex: failedAttackDestIndex,
    type: moveType,
    moveId: isFastOrHeadless ? undefined : generateMoveId()
  };
  state.lastMove = moveInfo;
  state.threatenedKings = getThreatenedKings(state.board, state.threatMap);

  return {
    logText: text,
    pokerText,
    isGameOver: state.isGameOver,
    winnerTeam: state.winnerTeam
  };
}

const PIECE_CHARS_TEAM_A: (PieceType | string)[] = ['', 'P', 'N', 'B', 'R', 'K'];
const PIECE_CHARS_TEAM_B: (PieceType | string)[] = ['', 'p', 'n', 'b', 'r', 'k'];

function getPieceChar(piece: number): PieceType {
  const type = piece & 7;
  return ((piece & 8) !== 0 ? PIECE_CHARS_TEAM_B[type] : PIECE_CHARS_TEAM_A[type]) as PieceType;
}

export function executeTurnAction(
  state: GameState,
  moveInt: ActionInt,
  options?: ApplyActionOptions
): TurnActionResult {
  const reqType = getRequestType(options);
  const isFastOrHeadless = reqType === BotRequestType.FAST_CALC || reqType === BotRequestType.HEADLESS;
  const currentSeat = state.activePlayer;

  const fromIndex = (moveInt >>> 14) & 0x3F;
  const toIndex = (moveInt >>> 8) & 0x3F;
  const piece = state.board[fromIndex];
  const capturedPiece = state.board[toIndex];
  
  const pType = piece & 7;
  const targetPType = capturedPiece === 0 ? 0 : (capturedPiece & 7);
  
  const isKingCapture = capturedPiece !== 0 && (targetPType === 5 || pType === 5);
  const isAttack = capturedPiece !== 0 && !isKingCapture;

  let text = '';
  let pokerText: string | undefined;
  let combatOccurred = false;
  let pendingCombatResult: CombatResult | undefined;
  let moveType: LastMoveType = 'move';

  if (!state.threatMap || state.threatMap.length !== 4096) {
    state.threatMap = generateFullThreatMap(state.board);
  }
  
  if (isKingCapture) {
    moveType = 'capture';
    if (capturedPiece !== 0) {
      state.deadPoolCounts[capturedPiece & 15]++;
    }
    const isDefenderBunkered = (capturedPiece & 16) !== 0;
    
    state.board[toIndex] &= ~16;
    state.board[fromIndex] &= ~16;

    if (isDefenderBunkered) {
      state.deadPoolCounts[piece & 15]++;
      state.board[toIndex] = 0;
      state.board[fromIndex] = 0;
      if (!isFastOrHeadless) {
        text = formatDirectTakeText(getPieceChar(piece), getPieceChar(capturedPiece || (5 | ((piece & 8) ^ 8))), fromIndex, toIndex, true);
      }
    } else {
      if (!isFastOrHeadless) {
        text = formatDirectTakeText(getPieceChar(piece), getPieceChar(capturedPiece || (5 | ((piece & 8) ^ 8))), fromIndex, toIndex);
      }
      state.board[toIndex] = piece;
      state.board[fromIndex] = 0;
    }
    update_threatMap_by_move(state.board, state.threatMap, fromIndex, toIndex);

    const moveInfo: LastMove = { fromIndex, toIndex, type: moveType, moveId: isFastOrHeadless ? undefined : generateMoveId() };
    finalizeTurn(state, currentSeat, moveInfo, options);
  } else if (isAttack) {
    combatOccurred = true;
    const defenderSeat = getPieceOwnerSeat(capturedPiece, toIndex);
    const isDefenderBunkered = (capturedPiece & 16) !== 0;

    const combat: CombatResult = {
      attackerSeat: currentSeat,
      defenderSeat,
      attackerPosIndex: fromIndex,
      defenderPosIndex: toIndex,
      attackerHand: FAST_CALC_DUMMY_HAND,
      defenderHand: FAST_CALC_DUMMY_HAND,
      winnerSeat: null,
      capturedPiece,
      isDefenderBunkered
    };
    (combat as any).attackerPiece = piece;

    if (options?.deferPostCombat) {
      state.isTurnRiverRevealed = false;
      pendingCombatResult = combat;
      state.pendingCombat = combat;
      state.isCombatDelaying = true;
      state.threatenedKings = getThreatenedKings(state.board, state.threatMap);
      state.lastMove = { fromIndex, toIndex, type: 'move', moveId: isFastOrHeadless ? undefined : generateMoveId() };
    } else {
      const combatOutcome = executeCombatResolution(state, combat, options);
      text = combatOutcome.logText;
      pokerText = combatOutcome.pokerText;
      completePostCombat(state, combat, options);
    }
  } else {
    moveType = 'move';
    state.board[toIndex] = piece & ~16;
    state.board[fromIndex] = 0;
    update_threatMap_by_move(state.board, state.threatMap, fromIndex, toIndex);

    if (!isFastOrHeadless) {
      text = formatStandardMoveText(getPieceChar(piece), fromIndex, toIndex);
    }

    const moveInfo: LastMove = { fromIndex, toIndex, type: moveType, moveId: isFastOrHeadless ? undefined : generateMoveId() };
    finalizeTurn(state, currentSeat, moveInfo, options);
  }

  return {
    logText: text,
    pokerText,
    isGameOver: state.isGameOver,
    winnerTeam: state.winnerTeam,
    combatOccurred,
    pendingCombat: pendingCombatResult
  };
}

export function executePromotionAction(
  state: GameState,
  targetIndex: number,
  promotedPiece: number,
  options?: ApplyActionOptions
): TurnActionResult {
  const reqType = getRequestType(options);
  const isFastOrHeadless = reqType === BotRequestType.FAST_CALC || reqType === BotRequestType.HEADLESS;

  const currentSeat = state.activePlayer;
  const teamBit = PLAYER_TEAMS[currentSeat] === 'A' ? 0 : 8;
  const pieceTypeNum = getPieceType(promotedPiece);
  const pieceCode = (pieceTypeNum & 7) | teamBit;
  const pawnPiece = 1 | teamBit;

  state.board[targetIndex] = pieceCode;
  state.deadPoolCounts[pieceCode]--;
  state.deadPoolCounts[pawnPiece]++;

  if (!state.threatMap || state.threatMap.length !== 4096) {
    state.threatMap = generateFullThreatMap(state.board);
  } else {
    update_threatMap_by_move(state.board, state.threatMap, targetIndex);
  }

  const moveInfo: LastMove = {
    fromIndex: targetIndex,
    toIndex: targetIndex,
    type: 'promotion',
    hillIndex: targetIndex,
    moveId: isFastOrHeadless ? undefined : generateMoveId()
  };
  finalizeTurn(state, currentSeat, moveInfo, options);

  return {
    logText: isFastOrHeadless ? '' : formatPromotionText(getPieceChar(pieceCode), targetIndex),
    isGameOver: state.isGameOver,
    winnerTeam: state.winnerTeam
  };
}

export function executeCardSwapAction(
  state: GameState,
  slot1: number,
  slot2: number,
  options?: ApplyActionOptions
): TurnActionResult {
  const reqType = getRequestType(options);
  const isFastOrHeadless = reqType === BotRequestType.FAST_CALC || reqType === BotRequestType.HEADLESS;

  if (state.hasSwappedThisTurn) {
    throw new Error('Card swap already used this turn');
  }

  const success = swapPlayerCards(state, state.activePlayer, slot1, slot2);
  if (!success) {
    throw new Error('Invalid card swap action');
  }
  state.hasSwappedThisTurn = true;

  const skipOdds = options?.skipOddsRecompute ?? (reqType !== BotRequestType.UI_GAME);
  if (!skipOdds) {
    state.regionOdds = computeRegionProbabilities(state);
  }

  if (!state.threatMap || state.threatMap.length !== 4096) {
    state.threatMap = generateFullThreatMap(state.board);
  }
  state.threatenedKings = getThreatenedKings(state.board, state.threatMap);

  const seatCode = getSeatCode(state.activePlayer);
  return {
    logText: isFastOrHeadless ? '' : `${seatCode} : Swapped card.`,
    isGameOver: state.isGameOver,
    winnerTeam: state.winnerTeam
  };
}

export function executeSetBunkerAction(
  state: GameState,
  p1: number,
  options?: ApplyActionOptions,
  p2?: number | null
): TurnActionResult {
  const reqType = getRequestType(options);
  const isFastOrHeadless = reqType === BotRequestType.FAST_CALC || reqType === BotRequestType.HEADLESS;

  const currentSeat = state.activePlayer;
  const teamBit = PLAYER_TEAMS[currentSeat] === 'A' ? 0 : 8;

  let originIndex: number | null = (p1 !== undefined && p1 !== null && p1 !== -1) ? p1 : null;
  let endIndex: number | null = (p2 !== undefined && p2 !== null && p2 !== -1 && p2 !== 0) ? p2 : null;

  if (originIndex === null) {
    for (let i = 0; i < 64; i++) {
      if (state.board[i] !== 0 && (state.board[i] & 8) === teamBit && (state.board[i] & 16) !== 0) {
        originIndex = i;
        break;
      }
    }
  }

  if (originIndex === null) {
    throw new Error('No bunkered piece found for active player to change');
  }

  const originPiece = state.board[originIndex];
  if (originPiece === 0 || !isPieceControllable(originPiece, currentSeat, originIndex) || (originPiece & 16) === 0) {
    throw new Error(`Square ${originIndex} does not contain a bunkered piece controlled by active player`);
  }

  state.board[originIndex] &= ~16;

  if (endIndex !== null && endIndex !== originIndex) {
    if (HILL_SQUARE_INDICES.includes(endIndex)) {
      state.board[originIndex] |= 16;
      throw new Error(`Cannot set bunkered piece on Hill square (${endIndex})`);
    }
    const targetPiece = state.board[endIndex];
    if (targetPiece === 0 || !isPieceControllable(targetPiece, currentSeat, endIndex)) {
      state.board[originIndex] |= 16;
      throw new Error(`Cannot set bunkered piece on square ${endIndex}: not controlled by active player`);
    }
    state.board[endIndex] |= 16;
  } else {
    endIndex = null;
  }

  if (!state.threatMap || state.threatMap.length !== 4096) {
    state.threatMap = generateFullThreatMap(state.board);
  } else {
    update_threatMap_by_move(state.board, state.threatMap, originIndex, endIndex ?? undefined);
  }

  const moveInfo: LastMove = {
    fromIndex: originIndex,
    toIndex: endIndex ?? originIndex,
    type: 'bunker_change',
    moveId: isFastOrHeadless ? undefined : generateMoveId()
  };
  finalizeTurn(state, currentSeat, moveInfo, options);

  return {
    logText: isFastOrHeadless ? '' : formatSetBunkerText(originIndex, endIndex),
    isGameOver: state.isGameOver,
    winnerTeam: state.winnerTeam
  };
}

export function applyAction(
  state: GameState,
  action: GameAction | ActionInt,
  options?: ApplyActionOptions
): TurnActionResult {
  let type: ActionType | string;
  let p1: number = -1;
  let p2: number = -1;
  let meta: number = 0;
  let actionInt: ActionInt | null = null;

  if (typeof action === 'number') {
    actionInt = action;
    type = action >>> 20;
    p1 = (action >>> 14) & 0x3F;
    p2 = (action >>> 8) & 0x3F;
    meta = action & 0xFF;
  } else {
    type = action.type;
    p1 = action.origin !== undefined ? action.origin : Number(action.input1);
    p2 = action.end !== undefined ? Number(action.end) : (action.input2 !== null && action.input2 !== undefined ? Number(action.input2) : -1);
    if (action.piece && typeof action.piece === 'number') {
      meta = action.piece;
    } else if (typeof action.piece === 'string') {
      const teamBit = PLAYER_TEAMS[state.activePlayer] === 'A' ? 0 : 8;
      meta = getPieceType(action.piece) | teamBit;
    }
  }

  switch (type) {
    case ActionType.MOVE:
    case 'MOVE': {
      if (actionInt === null) {
        actionInt = encodeAction(ActionType.MOVE, p1, p2, meta);
      }
      return executeTurnAction(state, actionInt, options);
    }
    case ActionType.SET_BUNKER:
    case 'SET_BUNKER': {
      return executeSetBunkerAction(state, p1, options, p2 !== -1 ? p2 : null);
    }
    case ActionType.PROMOTION:
    case 'PROMOTION': {
      let hillIndex = -1;
      let promoPiece = 0;

      if (typeof action === 'number') {
        hillIndex = p1;
        promoPiece = meta;
      } else {
        if (action.origin !== undefined && action.origin !== null && Number(action.origin) >= 0) {
          hillIndex = Number(action.origin);
        } else if (action.input2 !== undefined && action.input2 !== null && !isNaN(Number(action.input2)) && Number(action.input2) >= 0) {
          hillIndex = Number(action.input2);
        } else if (action.end !== undefined && action.end !== null && !isNaN(Number(action.end)) && Number(action.end) >= 0) {
          hillIndex = Number(action.end);
        } else if (p1 >= 0 && p1 < 64) {
          hillIndex = p1;
        } else if (p2 >= 0 && p2 < 64) {
          hillIndex = p2;
        }

        if (action.piece !== undefined && action.piece !== null) {
          promoPiece = typeof action.piece === 'number' ? action.piece : getPieceType(action.piece);
        } else if (action.input1 !== undefined && action.input1 !== null) {
          promoPiece = typeof action.input1 === 'number' ? action.input1 : getPieceType(action.input1);
        } else if (meta !== 0) {
          promoPiece = meta;
        }
      }

      if (actionInt === null && hillIndex >= 0) {
        actionInt = encodeAction(ActionType.PROMOTION, hillIndex, hillIndex, getPieceType(promoPiece));
      }

      return executePromotionAction(state, hillIndex, promoPiece, options);
    }
    case ActionType.CARD_SWAP:
    case 'CARD_SWAP': {
      return executeCardSwapAction(state, p1, p2, options);
    }
    case ActionType.TRENCH_SELECT:
    case 'TRENCH_SELECT': {
      const seat = p1 as PlayerSeat;
      let selectedIndices: [number, number, number];
      if (typeof action !== 'number' && (action as any).end && Array.isArray((action as any).end)) {
        selectedIndices = (action as any).end as unknown as [number, number, number];
      } else {
        selectedIndices = ((action as any).input2 as unknown) as [number, number, number];
      }
      return executeTrenchSelectAction(state, seat, selectedIndices);
    }
    case ActionType.REFILL_TRENCH:
    case 'REFILL_TRENCH': {
      const refillSeat = state.pendingRefills.length > 0 ? state.pendingRefills[0].seat : state.activePlayer;
      return executeRefillTrenchAction(state, refillSeat, p1, p2, options?.botSeats, options?.autoCardPick ?? true);
    }
    case ActionType.SKIP_TURN:
    case 'SKIP_TURN': {
      const reqType = getRequestType(options);
      const isFastOrHeadless = reqType === BotRequestType.FAST_CALC || reqType === BotRequestType.HEADLESS;
      const seatCode = getSeatCode(state.activePlayer);
      const moveInfo: LastMove = {
        fromIndex: 0,
        toIndex: 0,
        type: 'move',
        moveId: isFastOrHeadless ? undefined : generateMoveId()
      };
      finalizeTurn(state, state.activePlayer, moveInfo, options);
      return {
        logText: isFastOrHeadless ? '' : `${seatCode} : Turn Skipped (No legal moves).`,
        isGameOver: state.isGameOver,
        winnerTeam: state.winnerTeam
      };
    }
    case ActionType.RESIGN:
    case 'RESIGN': {
      const seat = p1 !== -1 ? p1 as PlayerSeat : state.activePlayer;
      return executeResignAction(state, seat);
    }
    default:
      throw new Error(`Unknown action type: ${type}`);
  }
}

export function executeResignAction(
  state: GameState,
  resigningSeat: PlayerSeat
): TurnActionResult {
  const resigningTeam: Team = PLAYER_TEAMS[resigningSeat] || state.players[resigningSeat]?.team || 'A';
  const winnerTeam: Team = resigningTeam === 'A' ? 'B' : 'A';

  state.isGameOver = true;
  state.winnerTeam = winnerTeam;
  if (winnerTeam === 'A') state.score.teamA++;
  else state.score.teamB++;

  const seatCode = getSeatCode(resigningSeat);
  const logText = `Team ${resigningTeam} (${seatCode}) Resigned! Team ${winnerTeam} Victorious!`;

  return {
    logText,
    isGameOver: true,
    winnerTeam
  };
}
