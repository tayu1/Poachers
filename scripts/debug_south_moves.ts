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

const southTopK = getTopKMoves(s1, PlayerSeat.SOUTH, 4);
console.log('South moves from s1:');
for (const sm of southTopK) {
  const sf = (sm >>> 14) & 0x3F;
  const st = (sm >>> 8) & 0x3F;
  console.log(`South move from ${sf} (${sf>>3},${sf&7}) to ${st} (${st>>3},${st&7})`);
}
