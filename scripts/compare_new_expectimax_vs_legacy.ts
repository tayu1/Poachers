import { DEFAULT_BOT_PROFILE, BotProfile } from '../src/bot/bot';
import { DEFAULT_BOT_PROFILE_V21 } from '../src/bot/legacy/bot_v21';
import { runHeadlessGame } from '../src/bot/simulation';
import { PlayerSeat } from '../src/core/types';

const NEW_EXPECTIMAX_BOT: BotProfile = {
  name: 'New Bot (50/50 Combat Expectimax, Top-4)',
  depth: 4,
  topK: 4,
  adaptiveBranching: false,
  randomnessMargin: 30,
  randomnessTemperature: 10,
  randomnessP: 0.25
};

const LEGACY_V21_BOT: BotProfile = {
  name: 'Legacy V21 Bot (Top-3)',
  depth: 4,
  topK: 3,
  adaptiveBranching: false,
  randomnessMargin: 30,
  randomnessTemperature: 10,
  randomnessP: 0.25
};

console.log('========================================================================');
console.log('⚔️ TOURNAMENT: New Bot (50/50 Combat Expectimax, Top-4) vs Legacy V21 (Top-3)');
console.log('   20 Games Total (10 Games as Team A, 10 Games as Team B, Random Starts)');
console.log('========================================================================\n');

const TOTAL_GAMES = 20;
let newBotWins = 0;
let legacyWins = 0;
let draws = 0;
let totalTurns = 0;
let kingCaptures = 0;

const startTime = performance.now();

for (let i = 1; i <= TOTAL_GAMES; i++) {
  const isNewTeamA = i <= 10;
  const newTeam = isNewTeamA ? 'A' : 'B';
  const legacyTeam = isNewTeamA ? 'B' : 'A';

  const profiles: Record<PlayerSeat, BotProfile> = isNewTeamA
    ? {
        [PlayerSeat.NORTH]: NEW_EXPECTIMAX_BOT,
        [PlayerSeat.SOUTH]: NEW_EXPECTIMAX_BOT,
        [PlayerSeat.EAST]: LEGACY_V21_BOT,
        [PlayerSeat.WEST]: LEGACY_V21_BOT
      }
    : {
        [PlayerSeat.NORTH]: LEGACY_V21_BOT,
        [PlayerSeat.SOUTH]: LEGACY_V21_BOT,
        [PlayerSeat.EAST]: NEW_EXPECTIMAX_BOT,
        [PlayerSeat.WEST]: NEW_EXPECTIMAX_BOT
      };

  const result = runHeadlessGame(profiles, 250, true);
  totalTurns += result.totalTurns;
  if (result.endReason === 'KING_CAPTURE') kingCaptures++;

  let victor = 'Draw';
  if (result.winnerTeam === newTeam) {
    victor = 'New Bot';
    newBotWins++;
  } else if (result.winnerTeam === legacyTeam) {
    victor = 'Legacy V21';
    legacyWins++;
  } else {
    draws++;
  }

  console.log(
    `Game ${String(i).padStart(2)}: Winner: ${victor.padEnd(12)} | Turns: ${String(result.totalTurns).padStart(3)} | Reason: ${result.endReason.padEnd(12)} | Time: ${(result.durationMs! / 1000).toFixed(2)}s (New Bot as Team ${newTeam})`
  );
}

const totalDuration = performance.now() - startTime;

console.log('\n========================================================================');
console.log('🏆 TOURNAMENT FINAL RESULTS (20 Games)');
console.log('========================================================================');
console.log(`New Bot (50/50 Expectimax) Wins : ${newBotWins} (${((newBotWins / TOTAL_GAMES) * 100).toFixed(1)}%)`);
console.log(`Legacy V21 (Top-3) Wins          : ${legacyWins} (${((legacyWins / TOTAL_GAMES) * 100).toFixed(1)}%)`);
console.log(`Draws                            : ${draws}`);
console.log(`King Captures                    : ${kingCaptures} / ${TOTAL_GAMES} (${((kingCaptures / TOTAL_GAMES) * 100).toFixed(1)}%)`);
console.log(`Avg Turns per Game               : ${(totalTurns / TOTAL_GAMES).toFixed(1)} turns`);
console.log(`Avg Time per Game                : ${(totalDuration / TOTAL_GAMES / 1000).toFixed(2)} s`);
console.log(`Total Elapsed Time               : ${(totalDuration / 1000).toFixed(2)} s`);
console.log('========================================================================\n');
