/**
 * Poachers - Core Game Engine Data Structures
 * Decoupled engine logic containing state representation and coordinate mapping.
 */

let hill_was_visited = 0;

// Player/Team configuration
const PLAYERS = {
  NORTH: 0, // Team A (N-S)
  EAST: 1,  // Team B (E-W)
  SOUTH: 2, // Team A (N-S)
  WEST: 3   // Team B (E-W)
};

const TEAMS = {
  A: 'A', // North-South
  B: 'B'  // East-West
};

// Map player ID to team
const PLAYER_TEAMS = {
  [PLAYERS.NORTH]: TEAMS.A,
  [PLAYERS.EAST]: TEAMS.B,
  [PLAYERS.SOUTH]: TEAMS.A,
  [PLAYERS.WEST]: TEAMS.B
};

// Piece representation: Capital letters = Team A, Lowercase letters = Team B
const PIECES = {
  EMPTY: null,
  // Team A (Yellow / N-S)
  PAWN_A: 'P',
  KNIGHT_A: 'N',
  BISHOP_A: 'B',
  ROOK_A: 'R',
  KING_A: 'K',
  // Team B (Blue / E-W)
  PAWN_B: 'p',
  KNIGHT_B: 'n',
  BISHOP_B: 'b',
  ROOK_B: 'r',
  KING_B: 'k'
};

// Initial board layout based on board_set_up_csv
const INITIAL_BOARD = [
  // Row 0 (North row)
  [PIECES.EMPTY, PIECES.EMPTY, PIECES.ROOK_A, PIECES.KNIGHT_A, PIECES.BISHOP_A, PIECES.KING_A, PIECES.EMPTY, PIECES.EMPTY],
  // Row 1 (North pawn row)
  [PIECES.EMPTY, PIECES.EMPTY, PIECES.PAWN_A, PIECES.PAWN_A, PIECES.PAWN_A, PIECES.PAWN_A, PIECES.EMPTY, PIECES.EMPTY],
  // Row 2 (West/East pieces)
  [PIECES.ROOK_B, PIECES.PAWN_B, PIECES.EMPTY, PIECES.EMPTY, PIECES.EMPTY, PIECES.EMPTY, PIECES.PAWN_B, PIECES.KNIGHT_B],
  // Row 3 (West/East pieces)
  [PIECES.KNIGHT_B, PIECES.PAWN_B, PIECES.EMPTY, PIECES.EMPTY, PIECES.EMPTY, PIECES.EMPTY, PIECES.PAWN_B, PIECES.KING_B],
  // Row 4 (West/East pieces)
  [PIECES.BISHOP_B, PIECES.PAWN_B, PIECES.EMPTY, PIECES.EMPTY, PIECES.EMPTY, PIECES.EMPTY, PIECES.PAWN_B, PIECES.BISHOP_B],
  // Row 5 (West/East pieces)
  [PIECES.KING_B, PIECES.PAWN_B, PIECES.EMPTY, PIECES.EMPTY, PIECES.EMPTY, PIECES.EMPTY, PIECES.PAWN_B, PIECES.ROOK_B],
  // Row 6 (South pawn row)
  [PIECES.EMPTY, PIECES.EMPTY, PIECES.PAWN_A, PIECES.PAWN_A, PIECES.PAWN_A, PIECES.PAWN_A, PIECES.EMPTY, PIECES.EMPTY],
  // Row 7 (South row)
  [PIECES.EMPTY, PIECES.EMPTY, PIECES.KNIGHT_A, PIECES.KING_A, PIECES.BISHOP_A, PIECES.ROOK_A, PIECES.EMPTY, PIECES.EMPTY]
];

// Flank squares (red squares in UI where flank pawns start)
const FLANK_SQUARES = [
  { r: 1, c: 2 }, { r: 1, c: 5 },
  { r: 6, c: 2 }, { r: 6, c: 5 },
  { r: 2, c: 1 }, { r: 5, c: 1 },
  { r: 2, c: 6 }, { r: 5, c: 6 }
];

// Helper to check if a cell is a flank square
function isFlankSquare(r, c) {
  return FLANK_SQUARES.some(sq => sq.r === r && sq.c === c);
}

// 2x2 green box (hills)
const HILL_SQUARES = {
  [PLAYERS.NORTH]: [{ r: 3, c: 3 }, { r: 3, c: 4 }],
  [PLAYERS.SOUTH]: [{ r: 4, c: 3 }, { r: 4, c: 4 }],
  [PLAYERS.WEST]: [{ r: 3, c: 3 }, { r: 4, c: 3 }],
  [PLAYERS.EAST]: [{ r: 3, c: 4 }, { r: 4, c: 4 }]
};

// Create a standard 52-card deck
function createDeck() {
  const suits = ['C', 'D', 'H', 'S']; // Clubs, Diamonds, Hearts, Spades
  const values = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
  const deck = [];
  for (const suit of suits) {
    for (const val of values) {
      deck.push(val + suit);
    }
  }
  return deck;
}

// Shuffle helper (Fisher-Yates)
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Maps grid coordinate properties to player card regions.
 * Team A (N-S) maps columns: 0-2 (0/Left), 3-4 (1/Center), 5-7 (2/Right)
 * Team B (E-W) maps rows: 0-2 (0/Upper), 3-4 (1/Center), 5-7 (2/Bottom)
 */
function getColumnRegion(col) {
  if (col >= 0 && col <= 2) return 0; // Left
  if (col >= 3 && col <= 4) return 1; // Center
  if (col >= 5 && col <= 7) return 2; // Right
  return -1;
}

function getRowRegion(row) {
  if (row >= 0 && row <= 2) return 0; // Upper
  if (row >= 3 && row <= 4) return 1; // Center
  if (row >= 5 && row <= 7) return 2; // Bottom
  return -1;
}

/**
 * Retrieves the relevant positional cards from both teams for a given cell coordinate.
 * Team A (N-S) uses columns, so it returns cards from North (0) and South (2).
 * Team B (E-W) uses rows, so it returns cards from West (3) and East (1).
 */
function getPositionalCardsForCell(row, col, gameState) {
  const colRegion = getColumnRegion(col);
  const rowRegion = getRowRegion(row);

  const teamACards = [
    gameState.players[PLAYERS.NORTH].positionalCards[colRegion],
    gameState.players[PLAYERS.SOUTH].positionalCards[colRegion]
  ];

  const teamBCards = [
    gameState.players[PLAYERS.WEST].positionalCards[rowRegion],
    gameState.players[PLAYERS.EAST].positionalCards[rowRegion]
  ];

  return {
    teamA: teamACards,
    teamB: teamBCards
  };
}

/**
 * Returns the team ('A' or 'B') of a piece, or null if empty.
 */
function getPieceTeam(piece) {
  if (!piece) return null;
  return piece === piece.toUpperCase() ? TEAMS.A : TEAMS.B;
}

/**
 * Returns the base piece type in lowercase ('p', 'n', 'b', 'r', 'k').
 */
function getPieceType(piece) {
  if (!piece) return null;
  return piece.toLowerCase();
}

/**
 * Checks if a grid coordinate is within the 8x8 board boundaries.
 */
function isWithinBoard(row, col) {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

/**
 * Returns whether the active player controls the piece at (row, col).
 * You control your team's pieces that are on your half of the board.
 */
function isPieceControllable(row, col, playerId, board) {
  const piece = board[row][col];
  if (!piece) return false;

  const pieceTeam = getPieceTeam(piece);
  const playerTeam = PLAYER_TEAMS[playerId];
  if (pieceTeam !== playerTeam) return false;

  // Check board halves:
  // North (0): rows 0-3
  // East (1): cols 4-7
  // South (2): rows 4-7
  // West (3): cols 0-3
  if (playerId === PLAYERS.NORTH && row > 3) return false;
  if (playerId === PLAYERS.SOUTH && row < 4) return false;
  if (playerId === PLAYERS.WEST && col > 3) return false;
  if (playerId === PLAYERS.EAST && col < 4) return false;

  return true;
}

/**
 * Finds all coordinates of the enemy team's Kings on the board.
 */
function getEnemyKings(team, board) {
  const enemyKingChar = team === TEAMS.A ? PIECES.KING_B : PIECES.KING_A;
  const positions = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] === enemyKingChar) {
        positions.push({ r, c });
      }
    }
  }
  return positions;
}

/**
 * Checks if a coordinate is adjacent (Chebyshev distance <= 1) to any enemy King.
 */
function isAdjacentToEnemyKing(row, col, team, board) {
  const enemyKings = getEnemyKings(team, board);
  return enemyKings.some(king => {
    return Math.abs(row - king.r) <= 1 && Math.abs(col - king.c) <= 1;
  });
}

/**
 * Calculates all legal moves for a piece at (row, col).
 * Enforces turn order, control, board limits, and all piece-specific rules.
 */
function getLegalMoves(row, col, gameState, ignoreControl = false) {
  const board = gameState.board;
  const piece = board[row][col];
  if (!piece) return [];

  const team = getPieceTeam(piece);
  const type = getPieceType(piece);

  // Enforce control based on current turn unless ignored (e.g. for simulations or testing)
  if (!ignoreControl && !isPieceControllable(row, col, gameState.turn, board)) {
    return [];
  }

  const moves = [];

  // Helper to add move/attack
  function addMoveIfValid(targetRow, targetCol) {
    if (!isWithinBoard(targetRow, targetCol)) return false;

    const targetPiece = board[targetRow][targetCol];
    if (!targetPiece) {
      // Empty square: Normal move
      moves.push({
        from: { r: row, c: col },
        to: { r: targetRow, c: targetCol },
        type: 'move'
      });
      return true;
    } else {
      const targetTeam = getPieceTeam(targetPiece);
      if (targetTeam !== team) {
        // Enemy piece: Attack or Capture
        const isImmediateCapture = (type === 'k' || getPieceType(targetPiece) === 'k');
        moves.push({
          from: { r: row, c: col },
          to: { r: targetRow, c: targetCol },
          type: isImmediateCapture ? 'capture' : 'attack'
        });
      }
      return false; // Blocked by piece (friendly or enemy)
    }
  }

  // --- Pawns ---
  if (type === 'p') {
    // 4 Orthogonal directions for normal moves (empty squares only)
    const orthoDirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of orthoDirs) {
      const tr = row + dr;
      const tc = col + dc;
      if (isWithinBoard(tr, tc) && !board[tr][tc]) {
        moves.push({
          from: { r: row, c: col },
          to: { r: tr, c: tc },
          type: 'move'
        });
      }
    }

    // 4 Diagonal directions for attacks (must contain enemy piece)
    const diagDirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    for (const [dr, dc] of diagDirs) {
      const tr = row + dr;
      const tc = col + dc;
      if (isWithinBoard(tr, tc)) {
        const targetPiece = board[tr][tc];
        if (targetPiece && getPieceTeam(targetPiece) !== team) {
          // Check Flank pawn restriction: pawns on flank red squares cannot attack each other
          // This rule drops once the first piece enters the center hill (hill_was_visited === 1)
          const isAttackerFlankPawn = isFlankSquare(row, col);
          const isTargetFlankPawn = isFlankSquare(tr, tc) && getPieceType(targetPiece) === 'p';

          if (hill_was_visited === 0 && isAttackerFlankPawn && isTargetFlankPawn) {
            continue; // Skip flank pawn-on-pawn attacks
          }

          const isImmediateCapture = getPieceType(targetPiece) === 'k';
          moves.push({
            from: { r: row, c: col },
            to: { r: tr, c: tc },
            type: isImmediateCapture ? 'capture' : 'attack'
          });
        }
      }
    }
  }

  // --- Knights ---
  else if (type === 'n') {
    const knightOffsets = [
      [-2, -1], [-2, 1], [-1, -2], [-1, 2],
      [1, -2], [1, 2], [2, -1], [2, 1]
    ];
    for (const [dr, dc] of knightOffsets) {
      addMoveIfValid(row + dr, col + dc);
    }
  }

  // --- Bishops ---
  else if (type === 'b') {
    const diagDirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    for (const [dr, dc] of diagDirs) {
      let step = 1;
      while (true) {
        const tr = row + dr * step;
        const tc = col + dc * step;
        if (!isWithinBoard(tr, tc)) break;
        const canContinue = addMoveIfValid(tr, tc);
        if (!canContinue) break;
        step++;
      }
    }
  }

  // --- Rooks ---
  else if (type === 'r') {
    const orthoDirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of orthoDirs) {
      let step = 1;
      while (true) {
        const tr = row + dr * step;
        const tc = col + dc * step;
        if (!isWithinBoard(tr, tc)) break;
        const canContinue = addMoveIfValid(tr, tc);
        if (!canContinue) break;
        step++;
      }
    }
  }

  // --- Kings ---
  else if (type === 'k') {
    const kingDirs = [
      [-1, -1], [-1, 0], [-1, 1],
      [0, -1], [0, 1],
      [1, -1], [1, 0], [1, 1]
    ];

    for (const [dr, dc] of kingDirs) {
      const tr = row + dr;
      const tc = col + dc;

      if (!isWithinBoard(tr, tc)) continue;

      // Rule: Kings can't cross the half-line
      if (team === TEAMS.A) {
        // N-S King. Identify which one by starting row
        const startingHalfIsNorth = (row < 4);
        if (startingHalfIsNorth && tr > 3) continue; // North King cannot enter South half
        if (!startingHalfIsNorth && tr < 4) continue; // South King cannot enter North half
      } else {
        // E-W King. Identify which one by starting col
        const startingHalfIsWest = (col < 4);
        if (startingHalfIsWest && tc > 3) continue; // West King cannot enter East half
        if (!startingHalfIsWest && tc < 4) continue; // East King cannot enter West half
      }

      // Rule: Kings can't touch enemy Kings
      if (isAdjacentToEnemyKing(tr, tc, team, board)) {
        continue;
      }

      addMoveIfValid(tr, tc);
    }
  }

  return moves;
}

/**
 * Returns all legal moves for the active player.
 */
function getAllLegalMovesForActivePlayer(gameState) {
  const activePlayer = gameState.turn;
  const board = gameState.board;
  const allMoves = [];

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (isPieceControllable(r, c, activePlayer, board)) {
        const pieceMoves = getLegalMoves(r, c, gameState, false);
        allMoves.push(...pieceMoves);
      }
    }
  }

  return allMoves;
}

/**
 * Adds a captured piece to the team's capturedPieces structure.
 */
function add_to_captured_pieces(piece, r, c, gameState) {
  const team = getPieceTeam(piece);
  const type = getPieceType(piece);
  if (!team || !type) return;

  const pool = gameState.capturedPieces[team];

  if (type === 'p') {
    pool.pawns++;
  } else if (type === 'n') {
    pool.knights++;
  } else if (type === 'r') {
    pool.rooks++;
  } else if (type === 'b') {
    const isDark = (r + c) % 2 !== 0;
    if (isDark) {
      pool.darkBishop++;
    } else {
      pool.lightBishop++;
    }
  } else if (type === 'k') {
    if (team === TEAMS.A) {
      pool.king = r < 4 ? PLAYERS.NORTH : PLAYERS.SOUTH;
    } else {
      pool.king = c >= 4 ? PLAYERS.EAST : PLAYERS.WEST;
    }
  }
}

/**
 * Finds all valid pawns that can be promoted to the selected captured piece type.
 * Enforces the Bishop color rules and the King territory/proximity rules.
 */
function find_pawns_to_promot(playerId, targetPieceType, targetPieceSubtype, gameState) {
  const team = PLAYER_TEAMS[playerId];
  const hill = HILL_SQUARES[playerId];
  const validSquares = [];

  for (const sq of hill) {
    const piece = gameState.board[sq.r][sq.c];
    // Check if there is a friendly pawn on the hill square
    if (piece && getPieceType(piece) === 'p' && getPieceTeam(piece) === team) {
      let isValid = true;

      if (targetPieceType === 'b') {
        // Bishop color must match square color
        const isDark = (sq.r + sq.c) % 2 !== 0;
        if (targetPieceSubtype === 'dark' && !isDark) isValid = false;
        if (targetPieceSubtype === 'light' && isDark) isValid = false;
      } 
      else if (targetPieceType === 'k') {
        const pool = gameState.capturedPieces[team];
        // Can only promote if the captured King belongs to this player
        if (pool.king !== playerId) isValid = false;

        // Must not already have a King on this player's half of the board
        let hasKingOnHalf = false;
        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 8; c++) {
            const p = gameState.board[r][c];
            if (p && getPieceType(p) === 'k' && getPieceTeam(p) === team) {
              if (playerId === PLAYERS.NORTH && r < 4) hasKingOnHalf = true;
              if (playerId === PLAYERS.SOUTH && r >= 4) hasKingOnHalf = true;
              if (playerId === PLAYERS.WEST && c < 4) hasKingOnHalf = true;
              if (playerId === PLAYERS.EAST && c >= 4) hasKingOnHalf = true;
            }
          }
        }
        if (hasKingOnHalf) isValid = false;

        // Proximity check: Must not be adjacent to any enemy King
        if (isValid && isAdjacentToEnemyKing(sq.r, sq.c, team, gameState.board)) {
          isValid = false;
        }
      }

      if (isValid) {
        validSquares.push(sq);
      }
    }
  }

  return validSquares;
}

/**
 * Executes a promotion by replacing a pawn with the resurrected piece.
 * Updates the captured pieces dataset (adds a pawn, removes the resurrected piece).
 */
function executePromotion(targetRow, targetCol, pieceType, subtype, playerId, gameState) {
  const team = PLAYER_TEAMS[playerId];
  const pool = gameState.capturedPieces[team];

  let char = null;
  if (pieceType === 'r') {
    char = team === TEAMS.A ? PIECES.ROOK_A : PIECES.ROOK_B;
    if (pool.rooks > 0) pool.rooks--;
  } else if (pieceType === 'n') {
    char = team === TEAMS.A ? PIECES.KNIGHT_A : PIECES.KNIGHT_B;
    if (pool.knights > 0) pool.knights--;
  } else if (pieceType === 'b') {
    char = team === TEAMS.A ? PIECES.BISHOP_A : PIECES.BISHOP_B;
    if (subtype === 'dark') {
      if (pool.darkBishop > 0) pool.darkBishop--;
    } else {
      if (pool.lightBishop > 0) pool.lightBishop--;
    }
  } else if (pieceType === 'k') {
    char = team === TEAMS.A ? PIECES.KING_A : PIECES.KING_B;
    pool.king = null;
  }

  if (!char) return false;

  // Swap pawn on board with resurrected piece
  gameState.board[targetRow][targetCol] = char;

  // Add the pawn back to captured pool
  pool.pawns++;

  return true;
}

const CARD_VALUE_MAP = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
};
const SUIT_NUMERIC_VALUES = {
  'C': 1, 'D': 2, 'H': 3, 'S': 4
};

const CARD_CACHE = {};
function getNumericCard(cardStr) {
  let cached = CARD_CACHE[cardStr];
  if (!cached) {
    const val = CARD_VALUE_MAP[cardStr[0]];
    const suit = SUIT_NUMERIC_VALUES[cardStr[1]];
    cached = { val, suit };
    CARD_CACHE[cardStr] = cached;
  }
  return cached;
}

/**
 * Evaluates a 5-card poker hand and returns its rank name and kicker scores for comparison.
 * Optimized numeric version with zero string operations and zero allocations.
 */
function evaluate5CardHand(cards) {
  const parsed = new Array(5);
  for (let i = 0; i < 5; i++) {
    parsed[i] = getNumericCard(cards[i]);
  }

  // Inline insertion sort for 5 elements (descending)
  for (let i = 1; i < 5; i++) {
    const key = parsed[i];
    let j = i - 1;
    while (j >= 0 && parsed[j].val < key.val) {
      parsed[j + 1] = parsed[j];
      j--;
    }
    parsed[j + 1] = key;
  }

  const v0 = parsed[0].val, v1 = parsed[1].val, v2 = parsed[2].val, v3 = parsed[3].val, v4 = parsed[4].val;
  const s0 = parsed[0].suit, s1 = parsed[1].suit, s2 = parsed[2].suit, s3 = parsed[3].suit, s4 = parsed[4].suit;

  const isFlush = (s0 === s1 && s0 === s2 && s0 === s3 && s0 === s4);

  // Check straight
  let isStraight = false;
  let straightHigh = 0;

  if (v0 !== v1 && v1 !== v2 && v2 !== v3 && v3 !== v4) {
    if (v0 - v4 === 4) {
      isStraight = true;
      straightHigh = v0;
    } else if (v0 === 14 && v1 === 5 && v2 === 4 && v3 === 3 && v4 === 2) {
      isStraight = true;
      straightHigh = 5;
    }
  }

  // Four of a Kind
  if (v0 === v3 || v1 === v4) {
    const quadVal = (v0 === v3) ? v0 : v4;
    const kickerVal = (v0 === v3) ? v4 : v0;
    return { rank: 7, name: "Four of a Kind", kickers: [quadVal, kickerVal] };
  }

  // Full House
  const isFullHouse = (v0 === v2 && v3 === v4) || (v0 === v1 && v2 === v4);
  if (isFullHouse) {
    const tripsVal = (v0 === v2) ? v0 : v4;
    const pairVal = (v0 === v2) ? v4 : v0;
    return { rank: 6, name: "Full House", kickers: [tripsVal, pairVal] };
  }

  if (isStraight && isFlush) {
    return { rank: 8, name: "Straight Flush", kickers: [straightHigh] };
  }
  if (isFlush) {
    return { rank: 5, name: "Flush", kickers: [v0, v1, v2, v3, v4] };
  }
  if (isStraight) {
    return { rank: 4, name: "Straight", kickers: [straightHigh] };
  }

  // Three of a Kind
  if (v0 === v2 || v1 === v3 || v2 === v4) {
    const tripsVal = (v0 === v2) ? v0 : ((v1 === v3) ? v1 : v4);
    const kicker1 = (v0 === v2) ? v3 : v0;
    const kicker2 = (v0 === v2) ? v4 : ((v1 === v3) ? v4 : v1);
    return { rank: 3, name: "Three of a Kind", kickers: [tripsVal, kicker1, kicker2] };
  }

  // Two Pair
  if ((v0 === v1 && v2 === v3) || (v0 === v1 && v3 === v4) || (v1 === v2 && v3 === v4)) {
    let p1, p2, kicker;
    if (v0 === v1 && v2 === v3) {
      p1 = v0; p2 = v2; kicker = v4;
    } else if (v0 === v1 && v3 === v4) {
      p1 = v0; p2 = v3; kicker = v2;
    } else {
      p1 = v1; p2 = v3; kicker = v0;
    }
    return { rank: 2, name: "Two Pair", kickers: [p1, p2, kicker] };
  }

  // One Pair
  if (v0 === v1 || v1 === v2 || v2 === v3 || v3 === v4) {
    if (v0 === v1) return { rank: 1, name: "One Pair", kickers: [v0, v2, v3, v4] };
    if (v1 === v2) return { rank: 1, name: "One Pair", kickers: [v1, v0, v3, v4] };
    if (v2 === v3) return { rank: 1, name: "One Pair", kickers: [v2, v0, v1, v4] };
    return { rank: 1, name: "One Pair", kickers: [v3, v0, v1, v2] };
  }

  // High Card
  return { rank: 0, name: "High Card", kickers: [v0, v1, v2, v3, v4] };
}

/**
 * Returns the best 5-card poker hand combination out of up to 7 cards.
 */
function getBestHand(sevenCards) {
  const validCards = sevenCards.filter(Boolean);

  if (validCards.length < 5) {
    const vals = validCards.map(c => CARD_VALUE_MAP[c[0]] || 0).sort((a, b) => b - a);
    return {
      rank: 0,
      name: "High Card",
      kickers: vals
    };
  }

  // Generate k-combinations
  function k_combinations(set, k) {
    let i, j, combs, head, tailcombs;
    if (k > set.length || k <= 0) return [];
    if (k === set.length) return [set];
    if (k === 1) {
      combs = [];
      for (i = 0; i < set.length; i++) combs.push([set[i]]);
      return combs;
    }
    combs = [];
    for (i = 0; i < set.length - k + 1; i++) {
      head = set.slice(i, i + 1);
      tailcombs = k_combinations(set.slice(i + 1), k - 1);
      for (j = 0; j < tailcombs.length; j++) {
        combs.push(head.concat(tailcombs[j]));
      }
    }
    return combs;
  }

  const combinations = k_combinations(validCards, 5);
  let bestHand = null;

  combinations.forEach(comb => {
    const score = evaluate5CardHand(comb);
    if (!bestHand) {
      bestHand = score;
    } else {
      let isBetter = false;
      if (score.rank > bestHand.rank) {
        isBetter = true;
      } else if (score.rank === bestHand.rank) {
        for (let i = 0; i < score.kickers.length; i++) {
          if (score.kickers[i] > bestHand.kickers[i]) {
            isBetter = true;
            break;
          } else if (score.kickers[i] < bestHand.kickers[i]) {
            break;
          }
        }
      }
      if (isBetter) {
        bestHand = score;
      }
    }
  });

  return bestHand;
}

/**
 * Calculates the destination square adjacent to the defender along the attack path.
 */
function getSlideDestination(from, to) {
  const dr = to.r - from.r;
  const dc = to.c - from.c;
  const stepR = dr === 0 ? 0 : (dr > 0 ? 1 : -1);
  const stepC = dc === 0 ? 0 : (dc > 0 ? 1 : -1);
  return {
    r: to.r - stepR,
    c: to.c - stepC
  };
}

/**
 * Checks if the active player is entitled to a Hill refill (has a friendly piece on their Hill).
 * If yes, draws a card to their base deck (caps at 5).
 */
function checkHillRefill(playerId, gameState) {
  const player = gameState.players[playerId];

  if (player.baseDeck.length >= 5) return null;

  if (isPlayerOnHill(playerId, gameState)) {
    const newCard = gameState.deck.pop();
    if (newCard) {
      player.baseDeck.push(newCard);
      return newCard;
    }
  }
  return null;
}

/**
 * Resolves a combat conflict using positional cards and public cards.
 * Updates board state (capture or slide/stay), clears used cards, deals 3 new public cards,
 * and refills empty positional cards from players' base decks.
 */
/**
 * Evaluates the combat hand results without mutating the board or cards.
 */
function evaluateCombat(move, combatCards, gameState) {
  const fromPiece = gameState.board[move.from.r][move.from.c];
  const toPiece = gameState.board[move.to.r][move.to.c];
  const attackerTeam = getPieceTeam(fromPiece);
  const defenderTeam = getPieceTeam(toPiece);

  const public5Cards = [...gameState.publicCards, ...combatCards];
  const cards = getPositionalCardsForCell(move.to.r, move.to.c, gameState);

  const teamAHand = getBestHand([...cards.teamA, ...public5Cards]);
  const teamBHand = getBestHand([...cards.teamB, ...public5Cards]);

  let winnerTeam = null;
  let isDraw = false;

  if (teamAHand.rank > teamBHand.rank) {
    winnerTeam = TEAMS.A;
  } else if (teamBHand.rank > teamAHand.rank) {
    winnerTeam = TEAMS.B;
  } else {
    let tieBroken = false;
    for (let i = 0; i < teamAHand.kickers.length; i++) {
      if (teamAHand.kickers[i] > teamBHand.kickers[i]) {
        winnerTeam = TEAMS.A;
        tieBroken = true;
        break;
      } else if (teamBHand.kickers[i] > teamAHand.kickers[i]) {
        winnerTeam = TEAMS.B;
        tieBroken = true;
        break;
      }
    }
    if (!tieBroken) {
      isDraw = true;
      winnerTeam = attackerTeam;
    }
  }

  let outcome = "";
  if (winnerTeam === attackerTeam) {
    outcome = "capture";
  } else {
    const pieceType = getPieceType(fromPiece);
    if (pieceType === 'r' || pieceType === 'b') {
      outcome = "slide";
    } else {
      outcome = "stay";
    }
  }

  return {
    winnerTeam,
    attackerTeam,
    defenderTeam,
    outcome,
    isDraw,
    teamAHand,
    teamBHand
  };
}

/**
 * Applies the calculated combat results to the board and card decks.
 */
function applyCombatResult(move, combatResult, combatCards, gameState) {
  const fromPiece = gameState.board[move.from.r][move.from.c];
  const toPiece = gameState.board[move.to.r][move.to.c];

  if (combatResult.outcome === "capture") {
    add_to_captured_pieces(toPiece, move.to.r, move.to.c, gameState);
    gameState.board[move.to.r][move.to.c] = fromPiece;
    gameState.board[move.from.r][move.from.c] = null;
    gameState.lastMove = { from: move.from, to: move.to };
  } else if (combatResult.outcome === "slide") {
    const dest = getSlideDestination(move.from, move.to);
    if (dest.r !== move.from.r || dest.c !== move.from.c) {
      gameState.board[dest.r][dest.c] = fromPiece;
      gameState.board[move.from.r][move.from.c] = null;
      gameState.lastMove = { from: move.from, to: dest };
    } else {
      gameState.lastMove = null;
    }
  } else {
    // Stays in place (no board change needed)
    gameState.lastMove = null;
  }

  // Clear used positional cards
  const colRegion = getColumnRegion(move.to.c);
  const rowRegion = getRowRegion(move.to.r);

  const usedPositionalA = [
    gameState.players[PLAYERS.NORTH].positionalCards[colRegion],
    gameState.players[PLAYERS.SOUTH].positionalCards[colRegion]
  ];
  const usedPositionalB = [
    gameState.players[PLAYERS.WEST].positionalCards[rowRegion],
    gameState.players[PLAYERS.EAST].positionalCards[rowRegion]
  ];

  // Identify the defender and their losing card
  const attackerPlayerId = gameState.turn;
  const defenderTeam = getPieceTeam(toPiece);
  const defenderPlayerId = (defenderTeam === TEAMS.A)
    ? (move.to.r < 4 ? PLAYERS.NORTH : PLAYERS.SOUTH)
    : (move.to.c < 4 ? PLAYERS.WEST : PLAYERS.EAST);

  const defenderCardIdx = (defenderTeam === TEAMS.A) ? colRegion : rowRegion;
  const defenderLosingCard = gameState.players[defenderPlayerId].positionalCards[defenderCardIdx];

  let defenderCardStolen = false;
  if (combatResult.outcome === "capture" && defenderLosingCard) {
    gameState.players[attackerPlayerId].baseDeck.push(defenderLosingCard);
    defenderCardStolen = true;
  }

  gameState.players[PLAYERS.NORTH].positionalCards[colRegion] = null;
  gameState.players[PLAYERS.SOUTH].positionalCards[colRegion] = null;
  gameState.players[PLAYERS.WEST].positionalCards[rowRegion] = null;
  gameState.players[PLAYERS.EAST].positionalCards[rowRegion] = null;

  if (defenderCardStolen) {
    if (defenderTeam === TEAMS.A) {
      if (defenderPlayerId === PLAYERS.NORTH) {
        usedPositionalA[0] = null;
      } else {
        usedPositionalA[1] = null;
      }
    } else {
      if (defenderPlayerId === PLAYERS.WEST) {
        usedPositionalB[0] = null;
      } else {
        usedPositionalB[1] = null;
      }
    }
  }

  // Recycle used cards to bottom of the deck
  const clearedCards = [
    ...gameState.publicCards, 
    ...combatCards, 
    ...usedPositionalA.filter(Boolean), 
    ...usedPositionalB.filter(Boolean)
  ];
  gameState.deck.unshift(...clearedCards);

  // Deal 3 new public cards
  gameState.publicCards = [gameState.deck.pop(), gameState.deck.pop(), gameState.deck.pop()];

  // Helper to get card rank value
  const rankValue = (card) => {
    const r = card[0];
    const map = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
    return map[r] || 0;
  };

  // Refill positional cards with the highest available cards from baseDeck
  for (const p of gameState.players) {
    for (let i = 0; i < 3; i++) {
      if (p.positionalCards[i] === null && p.baseDeck.length > 0) {
        // Find index of highest card
        let highestIdx = 0;
        let highestVal = rankValue(p.baseDeck[0]);
        for (let j = 1; j < p.baseDeck.length; j++) {
          const val = rankValue(p.baseDeck[j]);
          if (val > highestVal) {
            highestVal = val;
            highestIdx = j;
          }
        }
        // Remove and assign the highest card
        p.positionalCards[i] = p.baseDeck.splice(highestIdx, 1)[0];
      }
    }
  }
  // Recalculate regional card strengths after combat
  gameState.regionProbs = engineComputeRegionProbabilities(gameState);
}

/**
 * Computes regional card strength probabilities based on public board/positional cards.
 */
function engineComputeRegionProbabilities(gameState) {
  const allCards = createDeck();
  const knownCards = new Set();
  
  gameState.publicCards.forEach(c => { if (c) knownCards.add(c); });
  gameState.players.forEach(p => {
    p.positionalCards.forEach(c => {
      if (c) knownCards.add(c);
    });
  });
  
  const unknownCards = allCards.filter(c => !knownCards.has(c));
  const regionProbs = new Array(9);
  
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
      
      for (let i = 0; i < unknownCards.length; i++) {
        for (let j = i + 1; j < unknownCards.length; j++) {
          const turn = unknownCards[i];
          const river = unknownCards[j];
          
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
      }
      
      regionProbs[colRegion * 3 + rowRegion] = { winsA, winsB, draws, total };
    }
  }
  return regionProbs;
}

/**
 * Initializes a new Poachers GameState.
 */
function initGame() {
  hill_was_visited = 0;
  const deck = shuffle(createDeck());

  const players = [
    {
      id: PLAYERS.NORTH,
      name: 'North',
      team: TEAMS.A,
      positionalCards: [null, null, null],
      baseDeck: []
    },
    {
      id: PLAYERS.EAST,
      name: 'East',
      team: TEAMS.B,
      positionalCards: [null, null, null],
      baseDeck: []
    },
    {
      id: PLAYERS.SOUTH,
      name: 'South',
      team: TEAMS.A,
      positionalCards: [null, null, null],
      baseDeck: []
    },
    {
      id: PLAYERS.WEST,
      name: 'West',
      team: TEAMS.B,
      positionalCards: [null, null, null],
      baseDeck: []
    }
  ];

  // Helper to get card rank value
  const rankValue = (card) => {
    const r = card[0];
    const map = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
    return map[r] || 0;
  };

  for (let i = 0; i < 4; i++) {
    const playerHand = deck.splice(0, 8);
    // Sort hand descending by rank
    playerHand.sort((a, b) => rankValue(b) - rankValue(a));
    
    // Default assignment: highest 3 as positional cards, remaining 5 as base deck
    players[i].positionalCards = playerHand.slice(0, 3);
    players[i].baseDeck = playerHand.slice(3);
  }

  // Deal 3 public cards for the Flop
  const flop = [deck.pop(), deck.pop(), deck.pop()];

  const state = {
    board: JSON.parse(JSON.stringify(INITIAL_BOARD)),
    players: players,
    deck: deck,
    publicCards: flop,         // Current open community cards (starts with 3)
    turn: PLAYERS.NORTH,       // North starts first
    hasSwappedThisTurn: false, // Track if active player has swapped cards this turn
    capturedPieces: {
      [TEAMS.A]: {
        pawns: 0,
        darkBishop: 0,
        lightBishop: 0,
        king: null,
        rooks: 0,
        knights: 0
      },
      [TEAMS.B]: {
        pawns: 0,
        darkBishop: 0,
        lightBishop: 0,
        king: null,
        rooks: 0,
        knights: 0
      }
    },
    matchScores: {
      [TEAMS.A]: 0,
      [TEAMS.B]: 0
    }
  };
  state.regionProbs = engineComputeRegionProbabilities(state);
  return state;
}

/**
 * Gets a player's base deck card count.
 */
function getPlayerBaseSize(playerId, gameState) {
  const p = gameState.players[playerId];
  return p ? p.baseDeck.length : 0;
}

/**
 * Returns whether a player's King is currently alive on the board.
 */
function isPlayerKingAlive(playerId, gameState) {
  const team = PLAYER_TEAMS[playerId];
  if (!team) return false;
  const kingChar = team === TEAMS.A ? PIECES.KING_A : PIECES.KING_B;
  
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (gameState.board[r][c] === kingChar) {
        // A King cannot cross the half line, so we match it to the player's board half
        if (playerId === PLAYERS.NORTH && r < 4) return true;
        if (playerId === PLAYERS.SOUTH && r >= 4) return true;
        if (playerId === PLAYERS.WEST && c < 4) return true;
        if (playerId === PLAYERS.EAST && c >= 4) return true;
      }
    }
  }
  return false;
}

/**
 * Returns whether a player has a piece on any of their hill squares.
 */
function isPlayerOnHill(playerId, gameState) {
  const team = PLAYER_TEAMS[playerId];
  const hill = HILL_SQUARES[playerId];
  if (!team || !hill) return false;
  
  const hasPiece = hill.some(sq => {
    const piece = gameState.board[sq.r][sq.c];
    return piece && getPieceTeam(piece) === team;
  });
  if (hasPiece) {
    hill_was_visited = 1;
  }
  return hasPiece;
}

/**
 * Swaps a base deck card with a positional card for the given player.
 */
function swapCards(playerId, baseCardIdx, positionalCardIdx, gameState) {
  if (gameState.hasSwappedThisTurn) {
    return false;
  }
  const p = gameState.players[playerId];
  if (!p) return false;

  const baseCard = p.baseDeck[baseCardIdx];
  const posCard = p.positionalCards[positionalCardIdx];
  if (baseCard === undefined || posCard === undefined) return false;

  p.baseDeck[baseCardIdx] = posCard;
  p.positionalCards[positionalCardIdx] = baseCard;

  gameState.hasSwappedThisTurn = true;
  gameState.regionProbs = engineComputeRegionProbabilities(gameState);
  return true;
}

/**
 * Swaps two positional cards for the given player.
 */
function swapPositionalCards(playerId, posCardIdx1, posCardIdx2, gameState) {
  if (gameState.hasSwappedThisTurn) {
    return false;
  }
  const p = gameState.players[playerId];
  if (!p) return false;

  const card1 = p.positionalCards[posCardIdx1];
  const card2 = p.positionalCards[posCardIdx2];
  if (card1 === undefined || card2 === undefined) return false;

  p.positionalCards[posCardIdx1] = card2;
  p.positionalCards[posCardIdx2] = card1;

  gameState.hasSwappedThisTurn = true;
  gameState.regionProbs = engineComputeRegionProbabilities(gameState);
  return true;
}


if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    get hill_was_visited() { return hill_was_visited; },
    set hill_was_visited(val) { hill_was_visited = val; },
    PLAYERS,
    TEAMS,
    PLAYER_TEAMS,
    PIECES,
    INITIAL_BOARD,
    FLANK_SQUARES,
    HILL_SQUARES,
    isWithinBoard,
    isFlankSquare,
    getColumnRegion,
    getRowRegion,
    getPositionalCardsForCell,
    getPieceTeam,
    getPieceType,
    isPieceControllable,
    getEnemyKings,
    isAdjacentToEnemyKing,
    getLegalMoves,
    getAllLegalMovesForActivePlayer,
    add_to_captured_pieces,
    find_pawns_to_promot,
    executePromotion,
    evaluate5CardHand,
    getBestHand,
    getSlideDestination,
    checkHillRefill,
    evaluateCombat,
    applyCombatResult,
    initGame,
    createDeck,
    shuffle,
    getPlayerBaseSize,
    isPlayerKingAlive,
    isPlayerOnHill,
    swapCards,
    swapPositionalCards
  };
}

if (typeof window !== 'undefined') {
  window.PoachersEngine = {
    get hill_was_visited() { return hill_was_visited; },
    set hill_was_visited(val) { hill_was_visited = val; },
    PLAYERS,
    TEAMS,
    PLAYER_TEAMS,
    PIECES,
    INITIAL_BOARD,
    FLANK_SQUARES,
    HILL_SQUARES,
    isWithinBoard,
    isFlankSquare,
    getColumnRegion,
    getRowRegion,
    getPositionalCardsForCell,
    getPieceTeam,
    getPieceType,
    isPieceControllable,
    getEnemyKings,
    isAdjacentToEnemyKing,
    getLegalMoves,
    getAllLegalMovesForActivePlayer,
    add_to_captured_pieces,
    find_pawns_to_promot,
    executePromotion,
    evaluate5CardHand,
    getBestHand,
    getSlideDestination,
    checkHillRefill,
    evaluateCombat,
    applyCombatResult,
    initGame,
    createDeck,
    shuffle,
    getPlayerBaseSize,
    isPlayerKingAlive,
    isPlayerOnHill,
    swapCards,
    swapPositionalCards
  };
}

