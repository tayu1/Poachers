import { DEFAULT_BOT_PROFILE, BotProfile } from '../src/bot/bot';
import { DEFAULT_BOT_PROFILE_V21 } from '../src/bot/legacy/bot_v21';
import { runHeadlessGame } from '../src/bot/simulation';
import { PlayerSeat } from '../src/core/types';

const NEW_BOT_TOPK4: BotProfile = {
  name: 'New Bot (4-ply, Top-4)',
  depth: 4,
  topK: 4,
  adaptiveBranching: false,
  randomnessMargin: 30,
  randomnessTemperature: 10,
  randomnessP: 0.25
};

const LEGACY_BOT_TOPK3: BotProfile = {
  name: 'Legacy V21 (4-ply, Top-3)',
  depth: 4,
  topK: 3,
  adaptiveBranching: false,
  randomnessMargin: 30,
  randomnessTemperature: 10,
  randomnessP: 0.25
};

console.log('====================================================');
console.log('🤖 20-Game Tournament: New Bot (Top-4) vs Legacy V21 (Top-3)');
console.log('====================================================\n');

const TOTAL_GAMES = 20;
let winTopK4 = 0;
let winTopK3 = 0;
let draws = 0;
let totalTurns = 0;

for (let i = 1; i <= TOTAL_GAMES; i++) {
  const isTopK4TeamA = i <= 10;
  const teamTopK4 = isTopK4TeamA ? 'A' : 'B';
  const teamTopK3 = isTopK4TeamA ? 'B' : 'A';

  const profiles: Record<PlayerSeat, BotProfile> = isTopK4TeamA
    ? {
        [PlayerSeat.NORTH]: NEW_BOT_TOPK4,
        [PlayerSeat.SOUTH]: NEW_BOT_TOPK4,
        [PlayerSeat.EAST]: LEGACY_BOT_TOPK3,
        [PlayerSeat.WEST]: LEGACY_BOT_TOPK3
      }
    : {
        [PlayerSeat.NORTH]: LEGACY_BOT_TOPK3,
        [PlayerSeat.SOUTH]: LEGACY_BOT_TOPK3,
        [PlayerSeat.EAST]: NEW_BOT_TOPK4,
        [PlayerSeat.WEST]: NEW_BOT_TOPK4
      };

  const result = runHeadlessGame(profiles, 250, true);
  totalTurns += result.totalTurns;

  let victor = 'Draw';
  if (result.winnerTeam === teamTopK4) {
    victor = 'New Bot (Top-4)';
    winTopK4++;
  } else if (result.winnerTeam === teamTopK3) {
    victor = 'Legacy V21 (Top-3)';
    winTopK3++;
  } else {
    draws++;
  }

  console.log(
    `Game ${String(i).padStart(2)}: Winner: ${victor.padEnd(20)} | Turns: ${String(result.totalTurns).padStart(3)} | Time: ${result.durationMs?.toFixed(0)}ms (Top-4 as Team ${teamTopK4})`
  );
}

console.log('\n====================================================');
console.log('🏆 TOURNAMENT FINAL RESULTS (20 Games)');
console.log('====================================================');
console.log(`New Bot (Top-4) Wins  : ${winTopK4} (${((winTopK4 / TOTAL_GAMES) * 100).toFixed(1)}%)`);
console.log(`Legacy V21 (Top-3) Wins: ${winTopK3} (${((winTopK3 / TOTAL_GAMES) * 100).toFixed(1)}%)`);
console.log(`Draws                 : ${draws}`);
console.log(`Avg Turns per Game    : ${(totalTurns / TOTAL_GAMES).toFixed(1)} turns`);
console.log('====================================================');
