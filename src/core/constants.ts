import { Board1D, PlayerSeat, Team } from './types';

export const BOARD_SIZE = 8;
export const TOTAL_SQUARES = 64;

export const PLAYER_TEAMS: Record<PlayerSeat, Team> = {
  [PlayerSeat.NORTH]: 'A',
  [PlayerSeat.EAST]: 'B',
  [PlayerSeat.SOUTH]: 'A',
  [PlayerSeat.WEST]: 'B'
};

export const TEAM_SEATS: Record<Team, PlayerSeat[]> = {
  A: [PlayerSeat.NORTH, PlayerSeat.SOUTH],
  B: [PlayerSeat.EAST, PlayerSeat.WEST]
};

export function toIndex(r: number, c: number): number {
  return r * BOARD_SIZE + c;
}

export function getRow(index: number): number {
  return index >> 3;
}

export function getCol(index: number): number {
  return index & 7;
}

// Initial 1D Board setup matching reference CSV layout with numeric piece values and embedded bunker bits
export const INITIAL_BOARD_1D: Board1D = new Uint8Array([
  0, 0, 4, 5, 3, 2, 0, 0,    // Row 0 (North) A_ROOK, A_KING, A_BISHOP, A_KNIGHT
  0, 0, 17, 1, 1, 17, 0, 0,  // Row 1 (North) A_PAWN + BUNKER on flanks
  12, 25, 0, 0, 0, 0, 25, 10, // Row 2 (West/East) B_ROOK, B_PAWN+BUNKER | B_PAWN+BUNKER, B_KNIGHT
  13, 9, 0, 0, 0, 0, 9, 13,  // Row 3 B_KING, B_PAWN | B_PAWN, B_KING
  11, 9, 0, 0, 0, 0, 9, 11,  // Row 4 B_BISHOP, B_PAWN | B_PAWN, B_BISHOP
  10, 25, 0, 0, 0, 0, 25, 12, // Row 5 B_KNIGHT, B_PAWN+BUNKER | B_PAWN+BUNKER, B_ROOK
  0, 0, 17, 1, 1, 17, 0, 0,  // Row 6 (South) A_PAWN + BUNKER on flanks
  0, 0, 2, 5, 3, 4, 0, 0     // Row 7 (South) A_KNIGHT, A_KING, A_BISHOP, A_ROOK
]);

// Center Hill 2x2 squares: d4 (27), e4 (28), d5 (35), e5 (36)
export const HILL_SQUARE_INDICES = [27, 28, 35, 36];

export const HILL_SQUARES_BY_SEAT: Record<PlayerSeat, number[]> = {
  [PlayerSeat.NORTH]: [27, 28],
  [PlayerSeat.EAST]: [28, 36],
  [PlayerSeat.SOUTH]: [35, 36],
  [PlayerSeat.WEST]: [27, 35]
};

export const MAX_BASE_DECK_SIZE = 5;

// Initial bunkered piece indices per player seat (both flank pawns)
export const INITIAL_BUNKER_INDICES_BY_SEAT: Record<PlayerSeat, number[]> = {
  [PlayerSeat.NORTH]: [10, 13], // Row 1, Col 2 ('P') and Row 1, Col 5 ('P')
  [PlayerSeat.EAST]: [22, 46],  // Row 2, Col 6 ('p') and Row 5, Col 6 ('p')
  [PlayerSeat.SOUTH]: [50, 53], // Row 6, Col 2 ('P') and Row 6, Col 5 ('P')
  [PlayerSeat.WEST]: [17, 41]   // Row 2, Col 1 ('p') and Row 5, Col 1 ('p')
};

export { DEFAULT_TURN_TIME_LIMIT, TURN_TIME_LIMIT_OPTIONS } from '../config';
export type { TurnTimeLimit } from '../config';
