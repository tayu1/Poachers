import { createInitialGameState, applyAction, getAllLegalActions, checkWinCondition, isSeatKingAlive } from '../src/core/engine';
import { getBestBotAction, evaluateActionTopK, evaluateState, getTopKMoves, DEFAULT_BOT_PROFILE } from '../src/bot/bot';
import { generateFullThreatMap, getLegalMoves1D } from '../src/core/moves';
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

console.log('=== POSITION ANALYSIS ===');
console.log('Active Player:', PlayerSeat[state.activePlayer]);
console.log('Is East King Alive:', isSeatKingAlive(state.board, PlayerSeat.EAST));
console.log('Is West King Alive:', isSeatKingAlive(state.board, PlayerSeat.WEST));
console.log('Threatened Kings:', state.threatenedKings);

// Check legal actions for East
const legalActions = getAllLegalActions(state, PlayerSeat.EAST);
console.log('Legal actions count for East:', legalActions.length);
for (const a of legalActions) {
  const from = (a >>> 14) & 0x3F;
  const to = (a >>> 8) & 0x3F;
  const type = decType(a);
  console.log(`Action: type=${ActionType[type]} from=${from} (${from >> 3},${from & 7}) to=${to} (${to >> 3},${to & 7})`);
}

// Evaluate state right now
console.log('\nCurrent State Eval for East:', evaluateState(state, PlayerSeat.EAST));

// Evaluate each action at depth 1 (immediate next state eval)
console.log('\n--- Immediate Next State Eval for each East move ---');
for (const a of legalActions) {
  const from = (a >>> 14) & 0x3F;
  const to = (a >>> 8) & 0x3F;
  const s = createInitialGameState();
  s.board.set(state.board);
  s.deadPoolCounts.set(state.deadPoolCounts);
  s.activePlayer = PlayerSeat.EAST;
  s.threatMap = generateFullThreatMap(s.board);
  applyAction(s, a);
  const ev = evaluateState(s, PlayerSeat.EAST);
  console.log(`Move from ${from} to ${to}: eval = ${ev}, activePlayer becomes ${PlayerSeat[s.activePlayer]}, GameOver=${s.isGameOver}`);
}

// Evaluate with evaluateActionTopK at depth 4
console.log('\n--- Deep Search (depth=4, topK=4) for each East move ---');
for (const a of legalActions) {
  const from = (a >>> 14) & 0x3F;
  const to = (a >>> 8) & 0x3F;
  const deepEval = evaluateActionTopK(state, a, PlayerSeat.EAST, DEFAULT_PVALS, 4, 4);
  console.log(`Move from ${from} to ${to}: deepEval = ${deepEval}`);
}

// Evaluate with getBestBotAction
console.log('\n--- Bot Action Selection ---');
const best = getBestBotAction(state, { ...DEFAULT_BOT_PROFILE, randomnessMargin: 0 });
console.log('Chosen Action:', best);
