import { DEFAULT_BOT_PROFILE, BotProfile } from '../src/bot/bot';
import { runHeadlessGame } from '../src/bot/simulation';
import { PlayerSeat } from '../src/core/types';

const TOTAL_GAMES = 20;

const profileTopK6: BotProfile = {
  ...DEFAULT_BOT_PROFILE,
  name: 'Bot_TopK_6',
  depth: 4,
  topK: 6
};

const profileTopK4: BotProfile = {
  ...DEFAULT_BOT_PROFILE,
  name: 'Bot_TopK_4',
  depth: 4,
  topK: 4
};

console.log('='.repeat(60));
console.log(`🤖 TOURNAMENT: Depth 4 (Top-K 6) vs Depth 4 (Top-K 4) - ${TOTAL_GAMES} Games`);
console.log(`- Depth: 4 for both`);
console.log(`- Symmetrical seating: 5 games Top-K 6 on Team A, 5 games Top-K 6 on Team B`);
console.log('='.repeat(60));

let topK6Wins = 0;
let topK4Wins = 0;
let draws = 0;
let totalDurationMs = 0;

for (let g = 1; g <= TOTAL_GAMES; g++) {
  const isTopK6TeamA = g <= TOTAL_GAMES / 2;
  const topK6Team = isTopK6TeamA ? 'A' : 'B';
  const topK4Team = isTopK6TeamA ? 'B' : 'A';

  const profiles: Record<PlayerSeat, BotProfile> = isTopK6TeamA
    ? {
        [PlayerSeat.NORTH]: profileTopK6, // Team A
        [PlayerSeat.SOUTH]: profileTopK6, // Team A
        [PlayerSeat.EAST]: profileTopK4,  // Team B
        [PlayerSeat.WEST]: profileTopK4   // Team B
      }
    : {
        [PlayerSeat.NORTH]: profileTopK4, // Team A
        [PlayerSeat.SOUTH]: profileTopK4, // Team A
        [PlayerSeat.EAST]: profileTopK6,  // Team B
        [PlayerSeat.WEST]: profileTopK6   // Team B
      };

  const startTime = performance.now();
  const result = runHeadlessGame(profiles, 250, true);
  const gameDuration = performance.now() - startTime;
  totalDurationMs += gameDuration;

  let winnerName = 'DRAW';
  if (result.winnerTeam === topK6Team) {
    topK6Wins++;
    winnerName = 'Top-K 6 (Winner)';
  } else if (result.winnerTeam === topK4Team) {
    topK4Wins++;
    winnerName = 'Top-K 4 (Winner)';
  } else {
    draws++;
  }

  console.log(
    `Game ${g.toString().padStart(2)}/${TOTAL_GAMES}: ${winnerName.padEnd(18)} | ` +
    `Turns: ${result.totalTurns.toString().padStart(3)} | ` +
    `Duration: ${(gameDuration / 1000).toFixed(2)}s | ` +
    `Team A (N/S): ${isTopK6TeamA ? 'Top-K 6' : 'Top-K 4'} | ` +
    `Team B (E/W): ${isTopK6TeamA ? 'Top-K 4' : 'Top-K 6'} | ` +
    `Score [Top-K 6: ${topK6Wins}, Top-K 4: ${topK4Wins}, Draws: ${draws}]`
  );
}

console.log('='.repeat(60));
console.log('🏁 TOURNAMENT SUMMARY');
console.log('='.repeat(60));
console.log(`Top-K 6 Wins:  ${topK6Wins} / ${TOTAL_GAMES} (${((topK6Wins / TOTAL_GAMES) * 100).toFixed(1)}%)`);
console.log(`Top-K 4 Wins:  ${topK4Wins} / ${TOTAL_GAMES} (${((topK4Wins / TOTAL_GAMES) * 100).toFixed(1)}%)`);
console.log(`Draws:         ${draws} / ${TOTAL_GAMES} (${((draws / TOTAL_GAMES) * 100).toFixed(1)}%)`);
console.log(`Total Time:    ${(totalDurationMs / 1000).toFixed(2)}s (avg ${(totalDurationMs / TOTAL_GAMES / 1000).toFixed(2)}s per game)`);
console.log('='.repeat(60));
