import { DEFAULT_BOT_PROFILE, BotProfile } from '../src/bot/bot';
import { runHeadlessGame } from '../src/bot/simulation';
import { PlayerSeat } from '../src/core/types';

const TOTAL_GAMES = 10;

// New Bot: Depth 8, Top-K 8 at root, tiered gap pruning (10k/3k) & variable branching
const profileNewBot: BotProfile = {
  ...DEFAULT_BOT_PROFILE,
  name: 'New_Bot_Depth8_TopK8',
  depth: 8,
  topK: 8
};

// Classic Bot: Depth 4, Top-K 4
const profileClassicBot: BotProfile = {
  ...DEFAULT_BOT_PROFILE,
  name: 'Classic_Bot_Depth4_TopK4',
  depth: 4,
  topK: 4
};

console.log('='.repeat(65));
console.log(`🤖 TOURNAMENT: New Bot (Depth 8 / Top-K 8) vs Classic (Depth 4 / Top-K 4)`);
console.log(`- Total Games: ${TOTAL_GAMES} (5 as Team A, 5 as Team B)`);
console.log(`- P-Values: GAP1=${DEFAULT_BOT_PROFILE.pvals?.[21] ?? 10000}, GAP2=${DEFAULT_BOT_PROFILE.pvals?.[22] ?? 3000}, GAP_DEEP=${DEFAULT_BOT_PROFILE.pvals?.[23] ?? 3000}`);
console.log('='.repeat(65));

let depth8Wins = 0;
let depth4Wins = 0;
let draws = 0;
let totalDurationMs = 0;

for (let g = 1; g <= TOTAL_GAMES; g++) {
  const isDepth8TeamA = g <= TOTAL_GAMES / 2;
  const depth8Team = isDepth8TeamA ? 'A' : 'B';
  const depth4Team = isDepth8TeamA ? 'B' : 'A';

  const profiles: Record<PlayerSeat, BotProfile> = isDepth8TeamA
    ? {
        [PlayerSeat.NORTH]: profileNewBot,     // Team A
        [PlayerSeat.SOUTH]: profileNewBot,     // Team A
        [PlayerSeat.EAST]: profileClassicBot,  // Team B
        [PlayerSeat.WEST]: profileClassicBot   // Team B
      }
    : {
        [PlayerSeat.NORTH]: profileClassicBot, // Team A
        [PlayerSeat.SOUTH]: profileClassicBot, // Team A
        [PlayerSeat.EAST]: profileNewBot,      // Team B
        [PlayerSeat.WEST]: profileNewBot       // Team B
      };

  const startTime = performance.now();
  const result = runHeadlessGame(profiles, 250, true);
  const gameDuration = performance.now() - startTime;
  totalDurationMs += gameDuration;

  let winnerName = 'DRAW';
  if (result.winnerTeam === depth8Team) {
    depth8Wins++;
    winnerName = 'Depth 8 (Winner)';
  } else if (result.winnerTeam === depth4Team) {
    depth4Wins++;
    winnerName = 'Depth 4 (Winner)';
  } else {
    draws++;
  }

  console.log(
    `Game ${g.toString().padStart(2)}/${TOTAL_GAMES}: ${winnerName.padEnd(18)} | ` +
    `Turns: ${result.totalTurns.toString().padStart(3)} | ` +
    `Duration: ${(gameDuration / 1000).toFixed(2)}s | ` +
    `Team A (N/S): ${isDepth8TeamA ? 'Depth 8' : 'Depth 4'} | ` +
    `Team B (E/W): ${isDepth8TeamA ? 'Depth 4' : 'Depth 8'} | ` +
    `Score [D8: ${depth8Wins}, D4: ${depth4Wins}, Draws: ${draws}]`
  );
}

console.log('='.repeat(60));
console.log('🏁 TOURNAMENT SUMMARY');
console.log('='.repeat(60));
console.log(`Depth 8 Wins:  ${depth8Wins} / ${TOTAL_GAMES} (${((depth8Wins / TOTAL_GAMES) * 100).toFixed(1)}%)`);
console.log(`Depth 4 Wins:  ${depth4Wins} / ${TOTAL_GAMES} (${((depth4Wins / TOTAL_GAMES) * 100).toFixed(1)}%)`);
console.log(`Draws:         ${draws} / ${TOTAL_GAMES} (${((draws / TOTAL_GAMES) * 100).toFixed(1)}%)`);
console.log(`Total Time:    ${(totalDurationMs / 1000).toFixed(2)}s (avg ${(totalDurationMs / TOTAL_GAMES / 1000).toFixed(2)}s per game)`);
console.log('='.repeat(60));
