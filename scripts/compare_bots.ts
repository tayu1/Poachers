import { DEFAULT_BOT_PROFILE, BotProfile } from '../src/bot/bot';
import { DEFAULT_BOT_PROFILE_V21 } from '../src/bot/legacy/bot_v21';
import { runHeadlessGame, SimResult } from '../src/bot/simulation';
import { PlayerSeat } from '../src/core/types';

const NEW_BOT_PROFILE: BotProfile = {
  name: 'New Bot (6-ply Adaptive)',
  depth: 6,
  topK: 3,
  adaptiveBranching: true,
  randomnessMargin: 30,
  randomnessTemperature: 10,
  randomnessP: 0.25
};

const LEGACY_BOT_PROFILE: BotProfile = {
  name: 'Legacy V21 (4-ply)',
  depth: 4,
  topK: 3,
  adaptiveBranching: false,
  randomnessMargin: 30,
  randomnessTemperature: 10,
  randomnessP: 0.25
};

console.log('====================================================');
console.log('🤖 20-Game Tournament: New Bot (6-ply) vs Legacy V21 (4-ply)');
console.log('====================================================\n');

const TOTAL_GAMES = 20;
let newBotWins = 0;
let legacyBotWins = 0;
let draws = 0;
let totalTurns = 0;
let kingCaptures = 0;

const gameResults: Array<{
  gameNum: number;
  newBotTeam: 'A' | 'B';
  winnerTeam: string;
  victor: string;
  turns: number;
  reason: string;
  durationMs: number;
}> = [];

const startTime = performance.now();

for (let i = 1; i <= TOTAL_GAMES; i++) {
  // Alternate sides every 5 games or 10 games:
  // 1-10: New Bot is Team A, Legacy is Team B
  // 11-20: Legacy is Team A, New Bot is Team B
  const isNewBotTeamA = i <= 10;
  const newBotTeam = isNewBotTeamA ? 'A' : 'B';
  const legacyTeam = isNewBotTeamA ? 'B' : 'A';

  const profiles: Record<PlayerSeat, BotProfile> = isNewBotTeamA
    ? {
        [PlayerSeat.NORTH]: NEW_BOT_PROFILE,
        [PlayerSeat.SOUTH]: NEW_BOT_PROFILE,
        [PlayerSeat.EAST]: LEGACY_BOT_PROFILE,
        [PlayerSeat.WEST]: LEGACY_BOT_PROFILE
      }
    : {
        [PlayerSeat.NORTH]: LEGACY_BOT_PROFILE,
        [PlayerSeat.SOUTH]: LEGACY_BOT_PROFILE,
        [PlayerSeat.EAST]: NEW_BOT_PROFILE,
        [PlayerSeat.WEST]: NEW_BOT_PROFILE
      };

  const result = runHeadlessGame(profiles, 250, true);
  totalTurns += result.totalTurns;
  if (result.endReason === 'KING_CAPTURE') kingCaptures++;

  let victor = 'Draw';
  if (result.winnerTeam === newBotTeam) {
    victor = 'New Bot (6-ply)';
    newBotWins++;
  } else if (result.winnerTeam === legacyTeam) {
    victor = 'Legacy V21 (4-ply)';
    legacyBotWins++;
  } else {
    draws++;
  }

  gameResults.push({
    gameNum: i,
    newBotTeam,
    winnerTeam: result.winnerTeam || 'None',
    victor,
    turns: result.totalTurns,
    reason: result.endReason,
    durationMs: Math.round(result.durationMs || 0)
  });

  console.log(
    `Game ${String(i).padStart(2)}: Winner: ${victor.padEnd(18)} | Turns: ${String(result.totalTurns).padStart(3)} | Reason: ${result.endReason.padEnd(12)} | Time: ${result.durationMs?.toFixed(0)}ms (New Bot as Team ${newBotTeam})`
  );
}

const totalDuration = performance.now() - startTime;

console.log('\n====================================================');
console.log('🏆 TOURNAMENT FINAL RESULTS (20 Games)');
console.log('====================================================');
console.log(`New Bot (6-ply) Wins : ${newBotWins} (${((newBotWins / TOTAL_GAMES) * 100).toFixed(1)}%)`);
console.log(`Legacy V21 Wins      : ${legacyBotWins} (${((legacyBotWins / TOTAL_GAMES) * 100).toFixed(1)}%)`);
console.log(`Draws                : ${draws} (${((draws / TOTAL_GAMES) * 100).toFixed(1)}%)`);
console.log(`King Captures        : ${kingCaptures} / ${TOTAL_GAMES} (${((kingCaptures / TOTAL_GAMES) * 100).toFixed(1)}%)`);
console.log(`Avg Turns per Game   : ${(totalTurns / TOTAL_GAMES).toFixed(1)} turns`);
console.log(`Avg Time per Game    : ${(totalDuration / TOTAL_GAMES).toFixed(0)} ms`);
console.log(`Total Elapsed Time   : ${(totalDuration / 1000).toFixed(2)} s`);
console.log('====================================================');
