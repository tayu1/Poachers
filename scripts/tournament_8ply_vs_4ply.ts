import { DEFAULT_BOT_PROFILE, BotProfile } from '../src/bot/bot';
import { runHeadlessGame } from '../src/bot/simulation';
import { PlayerSeat } from '../src/core/types';

const BOT_8PLY_TOPK4: BotProfile = {
  name: '8-ply Bot (depth 8, topK 4)',
  depth: 8,
  topK: 4,
  adaptiveBranching: false,
  randomnessMargin: 30,
  randomnessTemperature: 10,
  randomnessP: 0.25
};

const BOT_4PLY_TOPK4: BotProfile = {
  name: '4-ply Bot (depth 4, topK 4)',
  depth: 4,
  topK: 4,
  adaptiveBranching: false,
  randomnessMargin: 30,
  randomnessTemperature: 10,
  randomnessP: 0.25
};

console.log('========================================================================');
console.log('🤖 10-Game Tournament: 8-ply (Top-4) vs 4-ply (Top-4)');
console.log('========================================================================\n');

const TOTAL_GAMES = 10;
let win8ply = 0;
let win4ply = 0;
let draws = 0;
let totalTurns = 0;
const startTime = performance.now();

for (let i = 1; i <= TOTAL_GAMES; i++) {
  // First 5 games: 8-ply is Team A (North & South), 4-ply is Team B (East & West)
  // Next 5 games : 4-ply is Team A (North & South), 8-ply is Team B (East & West)
  const is8plyTeamA = i <= 5;
  const team8ply = is8plyTeamA ? 'A' : 'B';
  const team4ply = is8plyTeamA ? 'B' : 'A';

  const profiles: Record<PlayerSeat, BotProfile> = is8plyTeamA
    ? {
        [PlayerSeat.NORTH]: BOT_8PLY_TOPK4,
        [PlayerSeat.SOUTH]: BOT_8PLY_TOPK4,
        [PlayerSeat.EAST]: BOT_4PLY_TOPK4,
        [PlayerSeat.WEST]: BOT_4PLY_TOPK4
      }
    : {
        [PlayerSeat.NORTH]: BOT_4PLY_TOPK4,
        [PlayerSeat.SOUTH]: BOT_4PLY_TOPK4,
        [PlayerSeat.EAST]: BOT_8PLY_TOPK4,
        [PlayerSeat.WEST]: BOT_8PLY_TOPK4
      };

  const result = runHeadlessGame(profiles, 250, true);
  totalTurns += result.totalTurns;

  let victor = 'Draw';
  if (result.winnerTeam === team8ply) {
    victor = '8-ply Bot';
    win8ply++;
  } else if (result.winnerTeam === team4ply) {
    victor = '4-ply Bot';
    win4ply++;
  } else {
    draws++;
  }

  console.log(
    `Game ${String(i).padStart(2)}: Winner: ${victor.padEnd(12)} | Turns: ${String(result.totalTurns).padStart(3)} | Reason: ${result.endReason.padEnd(12)} | Time: ${(result.durationMs! / 1000).toFixed(2)}s (8-ply as Team ${team8ply})`
  );
}

const totalDuration = performance.now() - startTime;

console.log('\n========================================================================');
console.log('🏆 TOURNAMENT FINAL RESULTS (10 Games)');
console.log('========================================================================');
console.log(`8-ply (Top-4) Wins : ${win8ply} (${((win8ply / TOTAL_GAMES) * 100).toFixed(1)}%)`);
console.log(`4-ply (Top-4) Wins : ${win4ply} (${((win4ply / TOTAL_GAMES) * 100).toFixed(1)}%)`);
console.log(`Draws              : ${draws}`);
console.log(`Avg Turns per Game : ${(totalTurns / TOTAL_GAMES).toFixed(1)} turns`);
console.log(`Avg Time per Game  : ${(totalDuration / TOTAL_GAMES / 1000).toFixed(2)} s`);
console.log(`Total Elapsed Time : ${(totalDuration / 1000).toFixed(2)} s`);
console.log('========================================================================\n');
