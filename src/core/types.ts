/**
 * Pure Data Structures & Interfaces for Poachers Engine.
 * ZERO DOM or Network dependencies allowed in this file.
 */

import { TurnTimeLimit } from '../config';

export type { TurnTimeLimit };

export type Team = 'A' | 'B';

export enum PlayerSeat {
  NORTH = 0, // Team A
  EAST = 1,  // Team B
  SOUTH = 2, // Team A
  WEST = 3   // Team B
}

export enum TurnPhase {
  IDLE = 'IDLE',
  SETUP_DRAFT = 'SETUP_DRAFT',
  AWAITING_INPUT = 'AWAITING_INPUT',
  COMBAT_DELAY = 'COMBAT_DELAY',
  REFILL_PENDING = 'REFILL_PENDING',
  GAME_OVER = 'GAME_OVER'
}

/**
 * Numeric Piece encoding
 * Bit layout:  [_ _ _ B T P P P]
 * P[2:0] = piece type (0=empty, 1=Pawn, 2=Knight, 3=Bishop, 4=Rook, 5=King)
 * T[3]   = team        (0=Team A, 1=Team B)
 * B[4]   = bunkered    (0=normal, 1=bunkered)
 */
export const enum Pc {
  EMPTY = 0,
  // Team A (bit 3 = 0)
  A_PAWN = 1, A_KNIGHT = 2, A_BISHOP = 3, A_ROOK = 4, A_KING = 5,
  // Team B (bit 3 = 1)
  B_PAWN = 9, B_KNIGHT = 10, B_BISHOP = 11, B_ROOK = 12, B_KING = 13,
  // Flag
  BUNKER_BIT = 16
}

/**
 * 2-Bit Cell Capabilities tuple mapping for threatMap (4096-byte array):
 * 0 (00) = NONE:   No threat, no move
 * 1 (01) = MOVE:   Move, no threat (e.g. Pawn forward step)
 * 2 (10) = THREAT: Threat, no move (e.g. Pawn empty diagonal or friendly defense)
 * 3 (11) = MOVE | THREAT: Move and threat (e.g. Standard piece move to empty or capture)
 */
export const CellMark = {
  NONE:   0,      // Value 0: Unreachable or blocked
  MOVE:   1 << 0, // Bit 0 (1): Legal move target
  THREAT: 1 << 1  // Bit 1 (2): Pressure/Threat target
};

// Piece notation character for UI/Notation boundaries (uppercase)
export type PieceType = 'P' | 'N' | 'B' | 'R' | 'K';
export type Piece = PieceType | null;

export function pieceToChar(piece: number | PieceType | null | undefined): PieceType | null {
  if (piece === null || piece === undefined || piece === 0) return null;
  if (typeof piece === 'string') return piece.toUpperCase() as PieceType;
  const type = piece & 7;
  switch (type) {
    case 1: return 'P';
    case 2: return 'N';
    case 3: return 'B';
    case 4: return 'R';
    case 5: return 'K';
    default: return null;
  }
}

export function charToPiece(char: PieceType | string | number | null | undefined, isTeamB: boolean = false): number {
  if (char === null || char === undefined) return Pc.EMPTY;
  if (typeof char === 'number') return char;
  const teamOffset = isTeamB ? 8 : 0;
  switch (char.toUpperCase()) {
    case 'P': return Pc.A_PAWN + teamOffset;
    case 'N': return Pc.A_KNIGHT + teamOffset;
    case 'B': return Pc.A_BISHOP + teamOffset;
    case 'R': return Pc.A_ROOK + teamOffset;
    case 'K': return Pc.A_KING + teamOffset;
    default: return Pc.EMPTY;
  }
}

/**
 * Fast zero-allocation numeric piece type helper (1=Pawn, 2=Knight, 3=Bishop, 4=Rook, 5=King).
 */
export function getPieceType(piece: PieceType | number | string | null | undefined): number {
  if (piece === null || piece === undefined || piece === 0) return Pc.EMPTY;
  if (typeof piece === 'number') return piece & 7;
  switch (piece.toUpperCase()) {
    case 'P': return 1;
    case 'N': return 2;
    case 'B': return 3;
    case 'R': return 4;
    case 'K': return 5;
    default: return Pc.EMPTY;
  }
}

export type Board1D = Uint8Array; // 64 bytes

export type Suit = 'S' | 'H' | 'D' | 'C'; // Spades, Hearts, Diamonds, Clubs
export type CardRank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14; // 11=J, 12=Q, 13=K, 14=A

export interface Card {
  id: string;
  suit: Suit;
  rank: CardRank;
}

export enum HandRank {
  HIGH_CARD = 1,
  ONE_PAIR = 2,
  TWO_PAIR = 3,
  THREE_OF_A_KIND = 4,
  STRAIGHT = 5,
  FLUSH = 6,
  FULL_HOUSE = 7,
  FOUR_OF_A_KIND = 8,
  STRAIGHT_FLUSH = 9
}

export interface EvaluatedHand {
  rank: HandRank;
  score: number;
  name: string;
  cards: Card[];
  winningCards?: Card[];
}

export interface PlayerState {
  seat: PlayerSeat;
  team: Team;
  baseDeck: Card[];
  trenchCards: [Card | null, Card | null, Card | null]; // TRENCH
}

export enum ActionType {
  MOVE = 0,
  PROMOTION = 1,
  SET_BUNKER = 2,
  CARD_SWAP = 3,
  REFILL_TRENCH = 4,
  SKIP_TURN = 5,
  RESIGN = 6,
  TRENCH_SELECT = 7
}

export type GameActionType = ActionType | 'MOVE' | 'PROMOTION' | 'CARD_SWAP' | 'SKIP_TURN' | 'TRENCH_SELECT' | 'REFILL_TRENCH' | 'RESIGN' | 'SET_BUNKER';

export interface GameAction {
  type: GameActionType;
  /** Primary origin field: fromIndex (MOVE) | hillIndex (PROMOTION) | targetIndex (SET_BUNKER) | slot1 (CARD_SWAP) | trenchSlot (REFILL) */
  origin?: number;
  /** Primary end/target field: toIndex (MOVE) | sourceIndex (SET_BUNKER) | slot2 (CARD_SWAP) | baseCardIndex (REFILL) */
  end?: number | null;
  /** Auxiliary piece field: piece to promote to ('R', 'N', 'B', 'K') or piece being moved */
  piece?: PieceType | number;

  /** Legacy input1 field for backward compatibility */
  input1?: number | string | null;
  /** Legacy input2 field for backward compatibility */
  input2?: number | null | [number, number, number];
}

/**
 * 32-bit Integer Action encoding
 * Bits:  [22:20] type   [19:14] origin   [13:8] end   [7:4] pieceCode   [3:0] reserved
 *        3 bits         6 bits           6 bits       4 bits            4 bits
 */
export type ActionInt = number;

export function encodeAction(type: number, origin: number, end: number, pieceCode: number = 0): ActionInt {
  return (type << 20) | (origin << 14) | (end << 8) | (pieceCode & 0xFF);
}
export function decType(a: ActionInt): number { return (a >>> 20) & 7; }
export function decOrigin(a: ActionInt): number { return (a >>> 14) & 0x3F; }
export function decEnd(a: ActionInt): number { return (a >>> 8) & 0x3F; }
export function decPiece(a: ActionInt): number { return a & 0xFF; }

export function actionIntToGameAction(a: ActionInt): GameAction {
  const typeInt = (a >>> 20) & 7;
  const p1 = (a >>> 14) & 0x3F;
  const p2 = (a >>> 8) & 0x3F;
  const meta = a & 0xFF;

  switch (typeInt) {
    case ActionType.MOVE:
      return { type: 'MOVE', input1: p1, input2: p2, origin: p1, end: p2 };
    case ActionType.PROMOTION:
      return { type: 'PROMOTION', input1: meta, input2: p1, origin: p1, end: p2, piece: meta };
    case ActionType.SET_BUNKER:
      return { type: 'SET_BUNKER', input1: p1, input2: p2, origin: p1, end: p2 };
    case ActionType.CARD_SWAP:
      return { type: 'CARD_SWAP', input1: p1, input2: p2, origin: p1, end: p2 };
    case ActionType.REFILL_TRENCH:
      return { type: 'REFILL_TRENCH', input1: p1, input2: p2, origin: p1, end: p2 };
    case ActionType.SKIP_TURN:
      return { type: 'SKIP_TURN', input1: null, input2: null };
    case ActionType.RESIGN:
      return { type: 'RESIGN', input1: p1, input2: p2, origin: p1, end: p2 };
    default:
      return { type: 'MOVE', input1: p1, input2: p2, origin: p1, end: p2 };
  }
}

export interface Move {
  fromIndex: number;
  toIndex: number;
  piece: PieceType | number;
  capturedPiece: PieceType | number | null;
  isAttack: boolean;
  isKingCapture: boolean;
  isPromotion: boolean;
}

export interface PromotionOption {
  hillIndex: number;
  promotedPiece: PieceType | number;
}

export interface CombatResult {
  attackerSeat: PlayerSeat;
  defenderSeat: PlayerSeat;
  attackerPosIndex: number;
  defenderPosIndex: number;
  attackerHand: EvaluatedHand;
  defenderHand: EvaluatedHand;
  winnerSeat: PlayerSeat | null;
  capturedPiece: PieceType | number | null;
  isDefenderBunkered?: boolean;
}

export interface RegionOdds {
  teamAWinRate: number; // 0.0 to 1.0 (win/tie probability for Team A)
  teamBWinRate: number; // 0.0 to 1.0 (win probability for Team B)
}

export type LastMoveType = 'move' | 'capture' | 'failed_attack' | 'promotion' | 'bunker_change';

export interface LastMove {
  fromIndex: number;
  toIndex: number;
  type?: LastMoveType;
  /** Populated only when type === 'promotion' — the hill square index. */
  hillIndex?: number;
  moveId?: string;
}

export interface SetupState {
  inSetup: boolean;
  setupCompletedSeats: PlayerSeat[];
}

export interface GameState {
  board: Board1D; // Uint8Array(64)
  threatMap: Uint8Array; // Uint8Array(4096), 64 origins * 64 targets bitmask
  activePlayer: PlayerSeat;
  players: Record<PlayerSeat, PlayerState>;
  deck: Card[];
  publicFlop: [Card | null, Card | null, Card | null];
  publicTurnRiver: [Card | null, Card | null];
  isTurnRiverRevealed: boolean;
  regionOdds: Float64Array | RegionOdds[]; // array of 9 elements
  deadPoolCounts: Uint8Array; // Uint8Array(16), indexed by Pc enum
  turnCount: number;
  isGameOver: boolean;
  winnerTeam: Team | null;
  score: { teamA: number; teamB: number };
  threatenedKings: number[];
  lastMove: LastMove | null;
  hasSwappedThisTurn: boolean;
  setupState: SetupState;

  botSeats: Record<PlayerSeat, boolean>;
  pendingRefills: { seat: PlayerSeat; slot: number }[];
  pendingCombat?: CombatResult | null;
  isCombatDelaying?: boolean;
  seatActionCounts?: Record<PlayerSeat, number>;
}

export enum BotRequestType {
  FAST_CALC = 0,
  HEADLESS = 1,
  UI_GAME = 2
}

export type RequestType = BotRequestType;
