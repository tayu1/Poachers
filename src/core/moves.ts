import { HILL_SQUARE_INDICES, HILL_SQUARES_BY_SEAT, INITIAL_BOARD_1D, MAX_BUNKERS_PER_PLAYER, PLAYER_TEAMS, getCol, getRow, toIndex } from './constants';
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

export function getPlayerBunkerCount(board: Board1D, seat: PlayerSeat): number {
  let count = 0;
  for (let i = 0; i < 64; i++) {
    const piece = board[i];
    if (piece !== Pc.EMPTY && (piece & Pc.BUNKER_BIT) !== 0 && isPieceControllable(piece, seat, i)) {
      count++;
    }
  }
  return count;
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

export function isPieceBunkerable(board: Board1D, seat: PlayerSeat, index: number): boolean {
  if (HILL_SQUARE_INDICES.includes(index)) return false;
  const piece = board[index];
  if (piece === Pc.EMPTY || (piece & Pc.BUNKER_BIT) !== 0) return false;
  return isPieceControllable(piece, seat, index);
}

export function getLegalBunkerTargets(board: Board1D, seat: PlayerSeat): number[] {
  if (getPlayerBunkerCount(board, seat) >= MAX_BUNKERS_PER_PLAYER) {
    return [];
  }
  const targets: number[] = [];
  for (let i = 0; i < 64; i++) {
    if (isPieceBunkerable(board, seat, i)) {
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
  if (pieceCode === Pc.EMPTY) return;
  const isBunkered = (pieceCode & Pc.BUNKER_BIT) !== 0;

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
      if (!isBunkered) {
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
      }
      break;
    }

    case 2: { // KNIGHT
      for (let k = 0; k < 8; k++) {
        const target = origin + KNIGHT_OFFSETS[k];
        if (target >= 0 && target < 64 && Math.abs((target & 7) - col) <= 2) {
          const targetPiece = board[target];
          if (isBunkered) {
            if (targetPiece === Pc.EMPTY) {
              threatMap[rowOffset + target] |= CellMark.MOVE;
            }
          } else {
            if (targetPiece === Pc.EMPTY || (targetPiece & 8) !== teamBit) {
              threatMap[rowOffset + target] |= (CellMark.MOVE | CellMark.THREAT);
            } else {
              threatMap[rowOffset + target] |= CellMark.THREAT;
            }
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
          if (isBunkered) {
            if (targetPiece === Pc.EMPTY) {
              threatMap[rowOffset + curr] |= CellMark.MOVE;
            } else {
              break;
            }
          } else {
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
          if (isBunkered) {
            if (canStepRowCol && targetPiece === Pc.EMPTY) {
              threatMap[rowOffset + target] |= CellMark.MOVE;
            }
          } else {
            const isFriendly = targetPiece !== Pc.EMPTY && (targetPiece & 8) === teamBit;
            if (canStepRowCol && !isFriendly) {
              threatMap[rowOffset + target] |= (CellMark.MOVE | CellMark.THREAT);
            } else {
              threatMap[rowOffset + target] |= CellMark.THREAT;
            }
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
    if (board[i] !== Pc.EMPTY) {
      updateSinglePieceThreats(board, i, outMap);
    }
  }
  return outMap;
}

export const INITIAL_THREAT_MAP: Uint8Array = generateFullThreatMap(INITIAL_BOARD_1D);

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

    // 1. Mark piece currently at sq (if any) or clear its row if empty
    if (board[sq] === Pc.EMPTY) {
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
        if (p !== Pc.EMPTY) {
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
        if (p !== Pc.EMPTY) {
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
        if (p !== Pc.EMPTY) {
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
        if (p !== Pc.EMPTY && (p & 7) === 2) {
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
        if (p !== Pc.EMPTY && (p & 7) === 5) {
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
