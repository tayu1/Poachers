import { createInitialGameState, applyAction, getAllLegalActions, checkWinCondition, isSeatKingAlive } from '../src/core/engine';
import { getBestBotAction, evaluateActionTopK, evaluateState, getTopKMoves, DEFAULT_BOT_PROFILE } from '../src/bot/bot';
import { generateFullThreatMap } from '../src/core/moves';
import { PlayerSeat, ActionType, decType, decOrigin, decEnd, actionIntToGameAction } from '../src/core/types';
import { DEFAULT_PVALS } from '../src/bot/pvals';

const state = createInitialGameState();
state.board.fill(0);

// Row 0
state.board[2] = 4; // White Rook
state.board[3] = 5; // White King
state.board[5] = 2; // White Knight

// Row 1
state.board[11] = 3;      // White Bishop (just moved from 4 to 11)
state.board[12] = 1 | 16; // White Pawn bunkered
state.board[13] = 1 | 16; // White Pawn bunkered

// Row 2
state.board[16] = 4 | 8;      // Black Rook
state.board[17] = 1;          // White Pawn
state.board[18] = 1;          // White Pawn
state.board[22] = 1 | 8 | 16; // Black Pawn bunkered
state.board[23] = 2 | 8;      // Black Knight

// Row 3
state.board[25] = 1 | 8;      // Black Pawn
state.board[31] = 5 | 8;      // East Black King

// Row 4
state.board[32] = 3 | 8;      // Black Bishop
state.board[33] = 1 | 8 | 16; // Black Pawn bunkered
state.board[35] = 1 | 8;      // Black Pawn on Hill!
state.board[37] = 2;          // White Knight (attacking 31!)
state.board[39] = 3 | 8;      // Black Bishop

// Row 5
state.board[40] = 2 | 8;      // Black Knight
state.board[41] = 1 | 8 | 16; // Black Pawn bunkered
state.board[46] = 1 | 8 | 16; // Black Pawn bunkered
state.board[47] = 4 | 8;      // Black Rook

// Row 6
state.board[50] = 1 | 16;     // White Pawn bunkered
state.board[52] = 1;          // White Pawn
state.board[53] = 1 | 16;     // White Pawn bunkered

// Row 7
state.board[59] = 5;          // White King
state.board[60] = 3;          // White Bishop
state.board[61] = 4;          // White Rook

state.deadPoolCounts.fill(0);
state.deadPoolCounts[5 | 8] = 1; // West Black King is dead

state.threatMap = generateFullThreatMap(state.board);
state.activePlayer = PlayerSeat.EAST;

// Step 1: East King moves 31 -> 30 (Row 3, Col 6)
const kingMove = (31 << 14) | (30 << 8);
const s1 = createInitialGameState();
s1.board.set(state.board);
s1.deadPoolCounts.set(state.deadPoolCounts);
s1.activePlayer = PlayerSeat.EAST;
s1.threatMap = generateFullThreatMap(s1.board);
applyAction(s1, kingMove);

// Step 2: South Knight moves 37 -> 20 (Row 2, Col 4, threatening square 30!)
const southMove20 = (37 << 14) | (20 << 8);
const s2 = createInitialGameState();
s2.board.set(s1.board);
s2.deadPoolCounts.set(s1.deadPoolCounts);
s2.activePlayer = PlayerSeat.SOUTH;
s2.threatMap = generateFullThreatMap(s2.board);
applyAction(s2, southMove20);

console.log('After South 37->20:');
console.log('Active Player:', PlayerSeat[s2.activePlayer]);
console.log('Threatened Kings:', s2.threatenedKings);

// Check all legal actions for West
const westActions = getAllLegalActions(s2, PlayerSeat.WEST);
console.log('\nAll legal actions for West (count = ' + westActions.length + '):');
for (const wa of westActions) {
  const type = decType(wa);
  const from = (wa >>> 14) & 0x3F;
  const to = (wa >>> 8) & 0x3F;
  const pieceCode = wa & 0xFF;

  // Let's test eval of next state
  const s3 = createInitialGameState();
  s3.board.set(s2.board);
  s3.deadPoolCounts.set(s2.deadPoolCounts);
  s3.activePlayer = PlayerSeat.WEST;
  s3.threatMap = generateFullThreatMap(s3.board);
  applyAction(s3, wa);
  const ev = evaluateState(s3, PlayerSeat.WEST);
  console.log(`  Action type=${ActionType[type]} from=${from} to=${to} piece=${pieceCode}: eval = ${ev}`);
}

const westTopK = getTopKMoves(s2, PlayerSeat.WEST, 4);
console.log('\nWest Top-K moves chosen by getTopKMoves:');
for (const wa of westTopK) {
  const type = decType(wa);
  const from = (wa >>> 14) & 0x3F;
  const to = (wa >>> 8) & 0x3F;
  const pieceCode = wa & 0xFF;
  console.log(`  Top-K: type=${ActionType[type]} from=${from} to=${to} piece=${pieceCode}`);
}
