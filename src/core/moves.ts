import { HILL_SQUARE_INDICES, HILL_SQUARES_BY_SEAT, PLAYER_TEAMS, getCol, getRow, toIndex } from './constants';
import { ActionInt, ActionType, Board1D, CellMark, Pc, PlayerSeat, Team, encodeAction } from './types';

export function getPieceTeam(piece: number | null): Team | null {
  if (piece === null || piece === Pc.EMPTY) return null;
  return (piece & 8) === 0 ? 'A' : 'B';
}

export function isPieceControllable(piece: number | null, seat: PlayerSeat, index: number): boolean {
  const team = getPieceTeam(piece);
  if (!team || team !== PLAYER_TEAMS[seat]) return false;

  const row = getRow(index);
  const col = getCol(index);

  // Active player controls pieces on their half of the board
  switch (seat) {
    case PlayerSeat.NORTH: return row < 4;
    case PlayerSeat.SOUTH: return row >= 4;
    case PlayerSeat.WEST:  return col < 4;
    case PlayerSeat.EAST:  return col >= 4;
  }
}

export function isSeatKingAlive(board: Board1D, seat: PlayerSeat): boolean {
  for (let i = 0; i < 64; i++) {
    const piece = board[i];
    if (piece !== Pc.EMPTY && (piece & 7) === 5 && isPieceControllable(piece, seat, i)) {
      return true;
    }
  }
  return false;
}

const KNIGHT_OFFSETS = [-17, -15, -10, -6, 6, 10, 15, 17];
const DIAG_DIRS = [-9, -7, 7, 9];
const ORTHO_DIRS = [-8, 8, -1, 1];
const KING_DIRS = [-9, -8, -7, -1, 1, 7, 8, 9];

export function getLegalMoves1D(
  board: Board1D,
  fromIndex: number,
  seat: PlayerSeat,
  threatMap?: Uint8Array
): ActionInt[] {
  const pieceCode = board[fromIndex];
  if (pieceCode === Pc.EMPTY) return [];
  if ((pieceCode & Pc.BUNKER_BIT) !== 0) return []; // Bunkered pieces cannot move
  if (!isPieceControllable(pieceCode, seat, fromIndex)) return [];

  const map = (threatMap && threatMap.length === 4096) ? threatMap : generateFullThreatMap(board);
  const moves: ActionInt[] = [];
  const rowOffset = fromIndex << 6;
  const pType = pieceCode & 7;
  const fromCol = getCol(fromIndex);

  switch (pType) {
    case 1: { // Pawn
      for (const off of ORTHO_DIRS) {
        const target = fromIndex + off;
        if (target >= 0 && target < 64) {
          if (Math.abs(off) === 1 && Math.abs(getCol(target) - fromCol) !== 1) continue;
          if ((map[rowOffset + target] & CellMark.MOVE) !== 0) {
            moves.push(encodeAction(ActionType.MOVE, fromIndex, target, 0));
          }
        }
      }
      for (const off of DIAG_DIRS) {
        const target = fromIndex + off;
        if (target >= 0 && target < 64 && Math.abs(getCol(target) - fromCol) === 1) {
          if ((map[rowOffset + target] & CellMark.MOVE) !== 0) {
            moves.push(encodeAction(ActionType.MOVE, fromIndex, target, 0));
          }
        }
      }
      break;
    }
    case 2: { // Knight
      for (const off of KNIGHT_OFFSETS) {
        const target = fromIndex + off;
        if (target >= 0 && target < 64 && Math.abs(getCol(target) - fromCol) <= 2) {
          if ((map[rowOffset + target] & CellMark.MOVE) !== 0) {
            moves.push(encodeAction(ActionType.MOVE, fromIndex, target, 0));
          }
        }
      }
      break;
    }
    case 3: // Bishop
    case 4: { // Rook
      const dirs = pType === 3 ? DIAG_DIRS : ORTHO_DIRS;
      for (const step of dirs) {
        let curr = fromIndex;
        while (true) {
          if ((step === -9 || step === 7) && curr % 8 === 0) break;
          if ((step === -7 || step === 9) && curr % 8 === 7) break;
          if (step === -1 && curr % 8 === 0) break;
          if (step === 1 && curr % 8 === 7) break;
          curr += step;
          if (curr < 0 || curr >= 64) break;
          if ((map[rowOffset + curr] & CellMark.MOVE) !== 0) {
            moves.push(encodeAction(ActionType.MOVE, fromIndex, curr, 0));
          }
          if (board[curr] !== Pc.EMPTY) break;
        }
      }
      break;
    }
    case 5: { // King
      for (const off of KING_DIRS) {
        const target = fromIndex + off;
        if (target >= 0 && target < 64 && Math.abs(getCol(target) - fromCol) <= 1) {
          if ((map[rowOffset + target] & CellMark.MOVE) !== 0) {
            moves.push(encodeAction(ActionType.MOVE, fromIndex, target, 0));
          }
        }
      }
      break;
    }
  }
  return moves;
}

export function isPromotionValid(
  board: Board1D,
  seat: PlayerSeat,
  targetIndex: number,
  promotedPiece: number,
  deadPoolCounts: Uint8Array
): boolean {
  const teamBit = (PLAYER_TEAMS[seat] === 'A') ? 0 : 8;
  const pType = promotedPiece & 7;

  // 0. Pawns are never valid promotion targets
  if (pType === 1) return false;

  // 1. Piece must be available in team's dead pool counts
  if (deadPoolCounts[promotedPiece] === 0) return false;

  // 2. Target square must contain a friendly Pawn
  const currentPiece = board[targetIndex];
  if (currentPiece === Pc.EMPTY || (currentPiece & 7) !== 1 || (currentPiece & 8) !== teamBit) {
    return false;
  }

  // 3. Target square must be on that player's Hill squares
  const hillSquares = HILL_SQUARES_BY_SEAT[seat];
  if (!hillSquares.includes(targetIndex)) return false;

  // 4. Validation rule: King Promotion
  if (pType === 5) {
    // Max 1 King per team half of the board
    for (let i = 0; i < 64; i++) {
      const piece = board[i];
      if (piece !== Pc.EMPTY && (piece & 7) === 5 && (piece & 8) === teamBit) {
        if (isPieceControllable(piece, seat, i)) {
          return false;
        }
      }
    }

    // King cannot touch enemy King
    const targetRow = getRow(targetIndex);
    const targetCol = getCol(targetIndex);
    for (const off of KING_DIRS) {
      const adj = targetIndex + off;
      if (adj >= 0 && adj < 64) {
        const adjRow = getRow(adj);
        const adjCol = getCol(adj);
        if (Math.abs(adjRow - targetRow) <= 1 && Math.abs(adjCol - targetCol) <= 1) {
          const adjPiece = board[adj];
          if (adjPiece !== Pc.EMPTY && (adjPiece & 7) === 5 && (adjPiece & 8) !== teamBit) {
            return false;
          }
        }
      }
    }
  }

  // 5. Validation rule: Bishop Promotion
  if (pType === 3) {
    const targetIsLight = (getRow(targetIndex) + getCol(targetIndex)) % 2 === 0;

    // Max 1 Light-squared Bishop and 1 Dark-squared Bishop per team
    for (let i = 0; i < 64; i++) {
      const piece = board[i];
      if (piece !== Pc.EMPTY && (piece & 7) === 3 && (piece & 8) === teamBit) {
        const sqIsLight = (getRow(i) + getCol(i)) % 2 === 0;
        if (sqIsLight === targetIsLight) {
          return false;
        }
      }
    }
  }

  return true;
}

export function getSlidingTargetIndex(fromIndex: number, targetPosIndex: number): number {
  const fromRow = getRow(fromIndex);
  const fromCol = getCol(fromIndex);
  const toRow = getRow(targetPosIndex);
  const toCol = getCol(targetPosIndex);

  const dRow = Math.sign(toRow - fromRow);
  const dCol = Math.sign(toCol - fromCol);

  const slideRow = toRow - dRow;
  const slideCol = toCol - dCol;
  return toIndex(slideRow, slideCol);
}

// Fast cell pressure check: checks if targetIdx is threatened by any non-bunkered piece of attackerTeam
export function isSquareThreatened(
  board: Board1D,
  targetIdx: number,
  attackerTeam: Team,
  threatMap?: Uint8Array
): boolean {
  const map = (threatMap && threatMap.length === 4096) ? threatMap : generateFullThreatMap(board);
  const attackerTeamBit = attackerTeam === 'A' ? 0 : 8;
  for (let origin = 0; origin < 64; origin++) {
    const piece = board[origin];
    if (piece !== Pc.EMPTY && (piece & 8) === attackerTeamBit && (piece & Pc.BUNKER_BIT) === 0) {
      if ((map[(origin << 6) | targetIdx] & CellMark.THREAT) !== 0) {
        return true;
      }
    }
  }
  return false;
}

export function getThreatenedKings(board: Board1D, threatMap?: Uint8Array): number[] {
  const map = (threatMap && threatMap.length === 4096) ? threatMap : generateFullThreatMap(board);
  const threatened: number[] = [];
  
  for (let i = 0; i < 64; i++) {
    const piece = board[i];
    if (piece !== Pc.EMPTY && (piece & 7) === 5) {
      const enemyTeam = (piece & 8) === 0 ? 'B' : 'A';
      if (isSquareThreatened(board, i, enemyTeam, map)) {
        threatened.push(i);
      }
    }
  }
  
  return threatened;
}

export function getLegalBunkerTargets(board: Board1D, seat: PlayerSeat): number[] {
  const targets: number[] = [];
  for (let i = 0; i < 64; i++) {
    if (HILL_SQUARE_INDICES.includes(i)) continue;
    const piece = board[i];
    if (piece !== Pc.EMPTY && isPieceControllable(piece, seat, i)) {
      targets.push(i);
    }
  }
  return targets;
}

export function getControllingSeat(piece: number, index: number): PlayerSeat | null {
  if (piece === Pc.EMPTY) return null;
  const team = (piece & 8) === 0 ? 'A' : 'B';
  const row = index >> 3;
  const col = index & 7;
  if (team === 'A') {
    return row < 4 ? PlayerSeat.NORTH : PlayerSeat.SOUTH;
  } else {
    return col < 4 ? PlayerSeat.WEST : PlayerSeat.EAST;
  }
}

/**
 * Updates a single row (64 bytes) in the threatMap for the piece at origin.
 */
export function updateSinglePieceThreats(
  board: Board1D,
  origin: number,
  threatMap: Uint8Array
): void {
  const rowOffset = origin << 6;
  threatMap.fill(0, rowOffset, rowOffset + 64);

  const pieceCode = board[origin];
  if (pieceCode === Pc.EMPTY || (pieceCode & Pc.BUNKER_BIT) !== 0) return;

  const seat = getControllingSeat(pieceCode, origin);
  if (seat === null) return;

  const teamBit = pieceCode & 8;
  const pType = pieceCode & 7;
  const col = origin & 7;

  switch (pType) {
    case 1: { // PAWN
      for (let o = 0; o < 4; o++) {
        const off = ORTHO_DIRS[o];
        const target = origin + off;
        if (target >= 0 && target < 64) {
          if (Math.abs(off) === 1 && Math.abs((target & 7) - col) !== 1) continue;
          if (board[target] === Pc.EMPTY) {
            threatMap[rowOffset + target] |= CellMark.MOVE;
          }
        }
      }
      for (let d = 0; d < 4; d++) {
        const off = DIAG_DIRS[d];
        const target = origin + off;
        if (target >= 0 && target < 64 && Math.abs((target & 7) - col) === 1) {
          const targetPiece = board[target];
          if (targetPiece === Pc.EMPTY) {
            threatMap[rowOffset + target] |= CellMark.THREAT;
          } else if ((targetPiece & 8) !== teamBit) {
            threatMap[rowOffset + target] |= (CellMark.MOVE | CellMark.THREAT);
          } else {
            threatMap[rowOffset + target] |= CellMark.THREAT;
          }
        }
      }
      break;
    }

    case 2: { // KNIGHT
      for (let k = 0; k < 8; k++) {
        const target = origin + KNIGHT_OFFSETS[k];
        if (target >= 0 && target < 64 && Math.abs((target & 7) - col) <= 2) {
          const targetPiece = board[target];
          if (targetPiece === Pc.EMPTY || (targetPiece & 8) !== teamBit) {
            threatMap[rowOffset + target] |= (CellMark.MOVE | CellMark.THREAT);
          } else {
            threatMap[rowOffset + target] |= CellMark.THREAT;
          }
        }
      }
      break;
    }

    case 3: // BISHOP
    case 4: { // ROOK
      const dirs = pType === 3 ? DIAG_DIRS : ORTHO_DIRS;
      for (let d = 0; d < 4; d++) {
        const step = dirs[d];
        let curr = origin;
        while (true) {
          const c = curr & 7;
          if ((step === -9 || step === 7) && c === 0) break;
          if ((step === -7 || step === 9) && c === 7) break;
          if (step === -1 && c === 0) break;
          if (step === 1 && c === 7) break;

          curr += step;
          if (curr < 0 || curr >= 64) break;

          const targetPiece = board[curr];
          if (targetPiece === Pc.EMPTY) {
            threatMap[rowOffset + curr] |= (CellMark.MOVE | CellMark.THREAT);
          } else if ((targetPiece & 8) !== teamBit) {
            threatMap[rowOffset + curr] |= (CellMark.MOVE | CellMark.THREAT);
            if ((targetPiece & 7) !== 5) {
              break;
            }
          } else {
            threatMap[rowOffset + curr] |= CellMark.THREAT;
            break;
          }
        }
      }
      break;
    }

    case 5: { // KING
      for (let k = 0; k < 8; k++) {
        const step = KING_DIRS[k];
        const target = origin + step;
        if (target >= 0 && target < 64 && Math.abs((target & 7) - col) <= 1) {
          const targetRow = target >> 3;
          const targetCol = target & 7;

          let canStepRowCol = true;
          if (seat === PlayerSeat.NORTH && targetRow >= 4) canStepRowCol = false;
          if (seat === PlayerSeat.SOUTH && targetRow < 4) canStepRowCol = false;
          if (seat === PlayerSeat.WEST && targetCol >= 4) canStepRowCol = false;
          if (seat === PlayerSeat.EAST && targetCol < 4) canStepRowCol = false;

          if (canStepRowCol) {
            for (let adjOff of KING_DIRS) {
              const adj = target + adjOff;
              if (adj >= 0 && adj < 64 && Math.abs((adj & 7) - targetCol) <= 1) {
                const adjPiece = board[adj];
                if (adjPiece !== Pc.EMPTY && (adjPiece & 7) === 5 && (adjPiece & 8) !== teamBit) {
                  canStepRowCol = false;
                  break;
                }
              }
            }
          }

          const targetPiece = board[target];
          const isFriendly = targetPiece !== Pc.EMPTY && (targetPiece & 8) === teamBit;

          if (canStepRowCol && !isFriendly) {
            threatMap[rowOffset + target] |= (CellMark.MOVE | CellMark.THREAT);
          } else {
            threatMap[rowOffset + target] |= CellMark.THREAT;
          }
        }
      }
      break;
    }
  }
}

/**
 * Populates the entire 4096-byte threatMap for all 64 squares.
 */
export function generateFullThreatMap(
  board: Board1D,
  outMap: Uint8Array = new Uint8Array(4096)
): Uint8Array {
  outMap.fill(0);
  for (let i = 0; i < 64; i++) {
    if (board[i] !== Pc.EMPTY && (board[i] & Pc.BUNKER_BIT) === 0) {
      updateSinglePieceThreats(board, i, outMap);
    }
  }
  return outMap;
}

const INITIAL_THREAT_MAP_SPARSE: readonly number[] = [
  128,3, 129,3, 131,2, 138,2, 194,2, 196,2, 202,2, 203,2, 204,2, 267,2,
  269,2, 331,2, 335,3, 340,3, 342,3, 706,2, 708,2, 722,2, 723,1, 724,2,
  771,2, 773,2, 787,2, 788,1, 789,2, 1024,3, 1032,3, 1041,2, 1048,2, 1478,3,
  1485,3, 1501,3, 1510,2, 1552,2, 1553,2, 1561,2, 1568,2, 1569,2, 1616,2, 1618,2,
  1626,1, 1632,2, 1634,2, 1941,2, 1943,2, 1949,1, 1957,2, 1959,2, 2006,2, 2007,2,
  2014,2, 2022,2, 2023,2, 2073,2, 2089,2, 2136,2, 2138,2, 2146,1, 2152,2, 2154,2,
  2461,2, 2463,2, 2469,1, 2477,2, 2479,2, 2526,2, 2542,2, 2585,2, 2594,3, 2610,3,
  2617,3, 3047,2, 3054,2, 3063,3, 3071,3, 3306,2, 3307,1, 3308,2, 3322,2, 3324,2,
  3371,2, 3372,1, 3373,2, 3387,2, 3389,2, 3753,3, 3755,3, 3760,3, 3764,2, 3826,2,
  3827,2, 3828,2, 3834,2, 3836,2, 3891,2, 3893,2, 3957,2, 3964,2, 3966,3, 3967,3
];

function createInitialThreatMap(): Uint8Array {
  const map = new Uint8Array(4096);
  for (let i = 0; i < INITIAL_THREAT_MAP_SPARSE.length; i += 2) {
    map[INITIAL_THREAT_MAP_SPARSE[i]] = INITIAL_THREAT_MAP_SPARSE[i + 1];
  }
  return map;
}

export const INITIAL_THREAT_MAP: Uint8Array = createInitialThreatMap();

/**
 * Differential update of the threatMap after a move affecting fromIdx and/or toIdx.
 */
export function update_threatMap_by_move(
  board: Board1D,
  threatMap: Uint8Array,
  fromIdx?: number,
  toIdx?: number
): void {
  if (fromIdx === undefined && toIdx === undefined) {
    generateFullThreatMap(board, threatMap);
    return;
  }

  let dirtyMaskLow = 0;
  let dirtyMaskHigh = 0;

  const markDirty = (sq: number): void => {
    if (sq >= 0 && sq < 32) {
      dirtyMaskLow |= (1 << sq);
    } else if (sq >= 32 && sq < 64) {
      dirtyMaskHigh |= (1 << (sq - 32));
    }
  };

  const processSquare = (sq: number): void => {
    const col = sq & 7;
    const row = sq >> 3;

    // 1. Mark piece currently at sq (if any) or clear its row if empty/bunkered
    if (board[sq] === Pc.EMPTY || (board[sq] & Pc.BUNKER_BIT) !== 0) {
      const rowOffset = sq << 6;
      threatMap.fill(0, rowOffset, rowOffset + 64);
    } else {
      markDirty(sq);
    }

    // 2. Sliding pieces along diagonal rays (Bishops)
    for (let d = 0; d < 4; d++) {
      const dir = DIAG_DIRS[d];
      let curr = sq;
      while (true) {
        const c = curr & 7;
        if ((dir === -9 || dir === 7) && c === 0) break;
        if ((dir === -7 || dir === 9) && c === 7) break;
        curr += dir;
        if (curr < 0 || curr >= 64) break;
        const p = board[curr];
        if (p !== Pc.EMPTY && (p & Pc.BUNKER_BIT) === 0) {
          const pType = p & 7;
          if (pType === 3) {
            markDirty(curr);
          }
          if (pType !== 5) {
            break;
          }
        }
      }
    }

    // 3. Sliding pieces along orthogonal rays (Rooks)
    for (let d = 0; d < 4; d++) {
      const dir = ORTHO_DIRS[d];
      let curr = sq;
      while (true) {
        const c = curr & 7;
        if (dir === -1 && c === 0) break;
        if (dir === 1 && c === 7) break;
        curr += dir;
        if (curr < 0 || curr >= 64) break;
        const p = board[curr];
        if (p !== Pc.EMPTY && (p & Pc.BUNKER_BIT) === 0) {
          const pType = p & 7;
          if (pType === 4) {
            markDirty(curr);
          }
          if (pType !== 5) {
            break;
          }
        }
      }
    }

    // 4. Stepping pieces (Pawns distance 1)
    for (let d = 0; d < 8; d++) {
      const off = KING_DIRS[d];
      const neighbor = sq + off;
      if (neighbor >= 0 && neighbor < 64 && Math.abs((neighbor & 7) - col) <= 1) {
        const p = board[neighbor];
        if (p !== Pc.EMPTY && (p & Pc.BUNKER_BIT) === 0) {
          const pType = p & 7;
          if (pType === 1) {
            markDirty(neighbor);
          }
        }
      }
    }

    // 5. Knights
    for (let k = 0; k < 8; k++) {
      const neighbor = sq + KNIGHT_OFFSETS[k];
      if (neighbor >= 0 && neighbor < 64 && Math.abs((neighbor & 7) - col) <= 2) {
        const p = board[neighbor];
        if (p !== Pc.EMPTY && (p & Pc.BUNKER_BIT) === 0 && (p & 7) === 2) {
          markDirty(neighbor);
        }
      }
    }

    // 6. Kings (within distance 2 to account for king adjacency & opposition)
    for (let dr = -2; dr <= 2; dr++) {
      const r = row + dr;
      if (r < 0 || r >= 8) continue;
      for (let dc = -2; dc <= 2; dc++) {
        const c = col + dc;
        if (c < 0 || c >= 8) continue;
        const neighbor = (r << 3) | c;
        const p = board[neighbor];
        if (p !== Pc.EMPTY && (p & Pc.BUNKER_BIT) === 0 && (p & 7) === 5) {
          markDirty(neighbor);
        }
      }
    }
  };

  if (fromIdx !== undefined && fromIdx >= 0 && fromIdx < 64) {
    processSquare(fromIdx);
  }
  if (toIdx !== undefined && toIdx >= 0 && toIdx < 64 && toIdx !== fromIdx) {
    processSquare(toIdx);
  }

  // Recompute marked dirty pieces
  for (let sq = 0; sq < 32; sq++) {
    if ((dirtyMaskLow & (1 << sq)) !== 0) {
      updateSinglePieceThreats(board, sq, threatMap);
    }
  }
  for (let sq = 32; sq < 64; sq++) {
    if ((dirtyMaskHigh & (1 << (sq - 32))) !== 0) {
      updateSinglePieceThreats(board, sq, threatMap);
    }
  }
}
