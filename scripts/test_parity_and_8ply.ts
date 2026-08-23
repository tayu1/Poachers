import { DEFAULT_BOT_PROFILE, BotProfile, evaluateActionTopK } from '../src/bot/bot';
import { DEFAULT_BOT_PROFILE_V21, evaluateActionTopKV21 } from '../src/bot/legacy/bot_v21';
import { runHeadlessGame, SimResult } from '../src/bot/simulation';
import { createInitialGameState } from '../src/core/engine';
import { PlayerSeat } from '../src/core/types';

// Check 1: Does New Bot at depth 4 produce identical move evaluations to Legacy V21 at depth 4?
const state = createInitialGameState();
const moveInt = (10 << 14) | (18 << 8); // North pawn 10 -> 18

const scNew = evaluateActionTopK(state, moveInt, PlayerSeat.NORTH, DEFAULT_BOT_PROFILE.pvals!, 4, 3);
const scLegacy = evaluateActionTopKV21(state, moveInt, PlayerSeat.NORTH, DEFAULT_BOT_PROFILE_V21.pvals!, 4, 3);

console.log('Testing single-move evaluation parity at Depth 4:');
console.log('New Engine (depth 4):', scNew);
console.log('Legacy V21 (depth 4):', scLegacy);
console.log('Difference:', Math.abs(scNew - scLegacy));

// Check 2: Run 8-ply (2 full cycles: N->E->S->W->N->E->S->W) vs 4-ply (1 full cycle)
const BOT_8PLY: BotProfile = {
  name: '8-ply Bot (2 full rounds)',
  depth: 8,
  topK: 2, // top 2 at all 8 plies
  adaptiveBranching: false,
  randomnessMargin: 30,
  randomnessTemperature: 10,
  randomnessP: 0.25
};

const BOT_4PLY: BotProfile = {
  name: 'Legacy V21 (4-ply)',
  depth: 4,
  topK: 3,
  adaptiveBranching: false,
  randomnessMargin: 30,
  randomnessTemperature: 10,
  randomnessP: 0.25
};

console.log('\n====================================================');
console.log('🤖 20-Game Tournament: 8-ply (2 full rounds) vs 4-ply (1 full round)');
console.log('====================================================\n');

let win8 = 0;
let win4 = 0;
let draws = 0;

for (let i = 1; i <= 20; i++) {
  const is8TeamA = i <= 10;
  const team8 = is8TeamA ? 'A' : 'B';
  const team4 = is8TeamA ? 'B' : 'A';

  const profiles: Record<PlayerSeat, BotProfile> = is8TeamA
    ? {
        [PlayerSeat.NORTH]: BOT_8PLY,
        [PlayerSeat.SOUTH]: BOT_8PLY,
        [PlayerSeat.EAST]: BOT_4PLY,
        [PlayerSeat.WEST]: BOT_4PLY
      }
    : {
        [PlayerSeat.NORTH]: BOT_4PLY,
        [PlayerSeat.SOUTH]: BOT_4PLY,
        [PlayerSeat.EAST]: BOT_8PLY,
        [PlayerSeat.WEST]: BOT_8PLY
      };

  const result = runHeadlessGame(profiles, 250, true);
  let victor = 'Draw';
  if (result.winnerTeam === team8) {
    victor = '8-ply Bot';
    win8++;
  } else if (result.winnerTeam === team4) {
    victor = '4-ply Bot';
    win4++;
  } else {
    draws++;
  }

  console.log(`Game ${String(i).padStart(2)}: Winner: ${victor.padEnd(14)} | Turns: ${String(result.totalTurns).padStart(3)} | Time: ${result.durationMs?.toFixed(0)}ms (8-ply as Team ${team8})`);
}

console.log('\n====================================================');
console.log(`8-ply Wins : ${win8} (${((win8 / 20) * 100).toFixed(1)}%)`);
console.log(`4-ply Wins : ${win4} (${((win4 / 20) * 100).toFixed(1)}%)`);
console.log(`Draws      : ${draws}`);
console.log('====================================================');
