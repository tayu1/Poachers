import { DEFAULT_BOT_PROFILE, BotProfile, getBestBotAction } from '../src/bot/bot';
import { runHeadlessGame } from '../src/bot/simulation';
import { createInitialGameState } from '../src/core/engine';
import { PlayerSeat } from '../src/core/types';

console.log('====================================================');
console.log('⚔️ TESTING FULL 50/50 2-BRANCH EXPECTIMAX COMBAT SEARCH');
console.log('====================================================\n');

const state = createInitialGameState();
state.activePlayer = PlayerSeat.NORTH;

const t0 = performance.now();
const candidate = getBestBotAction(state, {
  ...DEFAULT_BOT_PROFILE,
  depth: 4,
  topK: 4
});
const moveTimeMs = performance.now() - t0;

console.log(`- 4-ply Search with 50/50 Combat Expectimax: ${moveTimeMs.toFixed(1)} ms`);
console.log(`- Selected Action: ${candidate?.action.type} (from ${candidate?.action.origin} to ${candidate?.action.end}) | Score: ${candidate?.score}`);

console.log('\nRunning 5-Game Test Match with 50/50 Combat Expectimax...');
for (let i = 1; i <= 5; i++) {
  const result = runHeadlessGame(
    {
      [PlayerSeat.NORTH]: { ...DEFAULT_BOT_PROFILE, depth: 4, topK: 4 },
      [PlayerSeat.SOUTH]: { ...DEFAULT_BOT_PROFILE, depth: 4, topK: 4 },
      [PlayerSeat.EAST]: { ...DEFAULT_BOT_PROFILE, depth: 4, topK: 4 },
      [PlayerSeat.WEST]: { ...DEFAULT_BOT_PROFILE, depth: 4, topK: 4 }
    },
    200,
    true
  );
  console.log(`Game ${i}: Winner Team ${result.winnerTeam} | Turns: ${result.totalTurns} | Time: ${result.durationMs?.toFixed(0)}ms | Reason: ${result.endReason}`);
}
console.log('====================================================');
