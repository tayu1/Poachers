import { createInitialGameState } from '../src/core/engine';
import { getBestBotAction, evaluateActionTopK, evaluateState, DEFAULT_BOT_PROFILE } from '../src/bot/bot';
import { generateFullThreatMap } from '../src/core/moves';
import { PlayerSeat } from '../src/core/types';

const state = createInitialGameState();
state.board.fill(0);

// Row 0
state.board[2] = 4; // White Rook
state.board[3] = 5; // White King
state.board[4] = 3; // White Bishop

// Row 1
state.board[10] = 1 | 16; // White Pawn bunkered
state.board[11] = 1;      // White Pawn
state.board[12] = 1;      // White Pawn
state.board[13] = 1;      // White Pawn

// Row 2
state.board[16] = 4 | 8;      // Black Rook
state.board[17] = 1 | 8 | 16; // Black Pawn bunkered
state.board[20] = 2;          // White Knight
state.board[22] = 1 | 8 | 16; // Black Pawn bunkered
state.board[23] = 5 | 8;      // East Black King

// Row 3
state.board[27] = 5 | 8;      // West Black King (before move to 19)
state.board[30] = 1 | 8;      // Black Pawn

// Row 4
state.board[32] = 3 | 8;      // Black Bishop
state.board[33] = 1 | 8;      // Black Pawn
state.board[36] = 1 | 8;      // Black Pawn
state.board[38] = 2 | 8;      // Black Knight
state.board[39] = 3 | 8;      // Black Bishop

// Row 5
state.board[41] = 1 | 8 | 16; // Black Pawn bunkered
state.board[43] = 1;          // White Pawn
state.board[44] = 2 | 8;      // Black Knight
state.board[46] = 1 | 8 | 16; // Black Pawn bunkered
state.board[47] = 4 | 8;      // Black Rook

// Row 6
state.board[50] = 1 | 16;     // White Pawn bunkered
state.board[52] = 1;          // White Pawn
state.board[53] = 1 | 16;     // White Pawn bunkered

// Row 7
state.board[60] = 3;          // White Bishop
state.board[61] = 4;          // White Rook

state.threatMap = generateFullThreatMap(state.board);
state.activePlayer = PlayerSeat.WEST;

// Test with standard pvals vs high king value pvals
const customPvals = [...DEFAULT_BOT_PROFILE.pvals!];
customPvals[2] = 30000; // TEAM_KING_ONBOARD
customPvals[3] = 35000; // ENEMY_KING_ONBOARD

console.log('=== TEST WITH HIGH KING VALUES (P[2]=30000, P[3]=35000) ===');
const bestAction = getBestBotAction(state, { ...DEFAULT_BOT_PROFILE, pvals: customPvals, randomnessMargin: 0 });
console.log('Best action chosen by West with High King PVALS:', bestAction);

// King 27 -> 19 score
const kingMoveTo19 = (27 << 14) | (19 << 8);
const eval19 = evaluateActionTopK(state, kingMoveTo19, PlayerSeat.WEST, customPvals, 4, 4);
console.log('Eval of King 27 -> 19:', eval19);

// King 27 -> 26 score
const kingMoveTo26 = (27 << 14) | (26 << 8);
const eval26 = evaluateActionTopK(state, kingMoveTo26, PlayerSeat.WEST, customPvals, 4, 4);
console.log('Eval of King 27 -> 26:', eval26);
