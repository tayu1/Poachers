import { DEFAULT_BOT_PROFILE, BotProfile, getBestBotAction } from '../src/bot/bot';
import { runHeadlessGame } from '../src/bot/simulation';
import { createInitialGameState } from '../src/core/engine';
import { PlayerSeat } from '../src/core/types';

console.log('====================================================');
console.log('⏱️ BENCHMARKING DEPTH = 8, TOP-K = 4');
console.log('====================================================\n');

// 1. Measure single-turn decision latency from initial game state
const state = createInitialGameState();
state.activePlayer = PlayerSeat.NORTH;

// Warm-up
getBestBotAction(state, {
  ...DEFAULT_BOT_PROFILE,
  depth: 8,
  topK: 4,
  adaptiveBranching: false,
  randomnessMargin: 0
});

console.log('1. Measuring Single-Move Latency (Mid-game tactical board):');

const t0 = performance.now();
const actionFlat = getBestBotAction(state, {
  ...DEFAULT_BOT_PROFILE,
  depth: 8,
  topK: 4,
  adaptiveBranching: false,
  randomnessMargin: 0
});
const flatMoveMs = performance.now() - t0;
console.log(`- Flat 8-ply (topK=4 at all 8 plies): ${flatMoveMs.toFixed(1)} ms per move`);

const t1 = performance.now();
const actionAdaptive = getBestBotAction(state, {
  ...DEFAULT_BOT_PROFILE,
  depth: 8,
  topK: 4,
  adaptiveBranching: true,
  randomnessMargin: 0
});
const adaptiveMoveMs = performance.now() - t1;
console.log(`- Adaptive 8-ply (topK=4 early, tapered deep): ${adaptiveMoveMs.toFixed(1)} ms per move`);

// 2. Run complete 1-game headless simulations to measure full game time
console.log('\n2. Measuring Complete Game Latency:');

const simFlat = runHeadlessGame(
  {
    [PlayerSeat.NORTH]: { ...DEFAULT_BOT_PROFILE, depth: 8, topK: 4, adaptiveBranching: false },
    [PlayerSeat.SOUTH]: { ...DEFAULT_BOT_PROFILE, depth: 8, topK: 4, adaptiveBranching: false },
    [PlayerSeat.EAST]: { ...DEFAULT_BOT_PROFILE, depth: 8, topK: 4, adaptiveBranching: false },
    [PlayerSeat.WEST]: { ...DEFAULT_BOT_PROFILE, depth: 8, topK: 4, adaptiveBranching: false }
  },
  100
);
console.log(`- Complete Game (Flat 8-ply, topK=4): ${simFlat.durationMs?.toFixed(0)} ms for ${simFlat.totalTurns} turns (Avg ${(simFlat.durationMs! / simFlat.totalTurns).toFixed(1)} ms/turn)`);

const simAdaptive = runHeadlessGame(
  {
    [PlayerSeat.NORTH]: { ...DEFAULT_BOT_PROFILE, depth: 8, topK: 4, adaptiveBranching: true },
    [PlayerSeat.SOUTH]: { ...DEFAULT_BOT_PROFILE, depth: 8, topK: 4, adaptiveBranching: true },
    [PlayerSeat.EAST]: { ...DEFAULT_BOT_PROFILE, depth: 8, topK: 4, adaptiveBranching: true },
    [PlayerSeat.WEST]: { ...DEFAULT_BOT_PROFILE, depth: 8, topK: 4, adaptiveBranching: true }
  },
  100
);
console.log(`- Complete Game (Adaptive 8-ply, topK=4): ${simAdaptive.durationMs?.toFixed(0)} ms for ${simAdaptive.totalTurns} turns (Avg ${(simAdaptive.durationMs! / simAdaptive.totalTurns).toFixed(1)} ms/turn)`);

console.log('\n====================================================');
