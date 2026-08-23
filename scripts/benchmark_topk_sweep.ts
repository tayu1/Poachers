import { DEFAULT_BOT_PROFILE, BotProfile } from '../src/bot/bot';
import { runHeadlessGame } from '../src/bot/simulation';
import { PlayerSeat } from '../src/core/types';

interface SweepTestResult {
  topK: number;
  vsTopK: number;
  testWins: number;
  baselineWins: number;
  draws: number;
  winRate: number;
  avgDurationMs: number;
  avgTurns: number;
}

const BASELINE_TOPK = 3;
const TOP_K_VALUES = [4, 5, 6, 7, 8];
const GAMES_PER_LEVEL = 20;

function runTournament(testTopK: number, baseTopK: number, totalGames: number): SweepTestResult {
  const testProfile: BotProfile = {
    name: `Bot (Top-${testTopK})`,
    depth: 4,
    topK: testTopK,
    adaptiveBranching: false,
    randomnessMargin: 30,
    randomnessTemperature: 10,
    randomnessP: 0.25
  };

  const baseProfile: BotProfile = {
    name: `Bot (Top-${baseTopK})`,
    depth: 4,
    topK: baseTopK,
    adaptiveBranching: false,
    randomnessMargin: 30,
    randomnessTemperature: 10,
    randomnessP: 0.25
  };

  let testWins = 0;
  let baseWins = 0;
  let draws = 0;
  let totalDuration = 0;
  let totalTurns = 0;

  for (let g = 1; g <= totalGames; g++) {
    // Symmetrical team alternation: first half test is Team A, second half test is Team B
    const isTestTeamA = g <= totalGames / 2;
    const testTeam = isTestTeamA ? 'A' : 'B';
    const baseTeam = isTestTeamA ? 'B' : 'A';

    const profiles: Record<PlayerSeat, BotProfile> = isTestTeamA
      ? {
          [PlayerSeat.NORTH]: testProfile,
          [PlayerSeat.SOUTH]: testProfile,
          [PlayerSeat.EAST]: baseProfile,
          [PlayerSeat.WEST]: baseProfile
        }
      : {
          [PlayerSeat.NORTH]: baseProfile,
          [PlayerSeat.SOUTH]: baseProfile,
          [PlayerSeat.EAST]: testProfile,
          [PlayerSeat.WEST]: testProfile
        };

    const result = runHeadlessGame(profiles, 250, true);
    totalDuration += result.durationMs || 0;
    totalTurns += result.totalTurns;

    if (result.winnerTeam === testTeam) {
      testWins++;
    } else if (result.winnerTeam === baseTeam) {
      baseWins++;
    } else {
      draws++;
    }
  }

  return {
    topK: testTopK,
    vsTopK: baseTopK,
    testWins,
    baselineWins: baseWins,
    draws,
    winRate: Number(((testWins / totalGames) * 100).toFixed(1)),
    avgDurationMs: Math.round(totalDuration / totalGames),
    avgTurns: Number((totalTurns / totalGames).toFixed(1))
  };
}

console.log('========================================================================');
console.log(`🔬 TOP-K SCALING SWEEP (Testing topK = 4, 5, 6, 7, 8 vs Baseline topK = ${BASELINE_TOPK})`);
console.log(`   ${GAMES_PER_LEVEL} Games per Level (Symmetric Color Balance & Random Starts)`);
console.log('========================================================================\n');

const results: SweepTestResult[] = [];

for (const k of TOP_K_VALUES) {
  process.stdout.write(`Evaluating topK = ${k} vs topK = ${BASELINE_TOPK} (${GAMES_PER_LEVEL} games)... `);
  const start = performance.now();
  const res = runTournament(k, BASELINE_TOPK, GAMES_PER_LEVEL);
  const elapsed = performance.now() - start;
  results.push(res);
  console.log(`Done in ${(elapsed / 1000).toFixed(1)}s -> Win Rate: ${res.winRate}% (${res.testWins}W - ${res.baselineWins}L - ${res.draws}D) | Avg Game: ${res.avgDurationMs}ms`);
}

console.log('\n========================================================================');
console.log('📊 TOP-K SWEEP SUMMARY & DIMINISHING RETURNS TABLE');
console.log('========================================================================');
console.log('| topK | vs Baseline | Win Rate | Wins / Losses / Draws | Avg Game Latency | Marginal Improvement |');
console.log('| :--- | :--- | :--- | :--- | :--- | :--- |');

let prevWinRate = 50.0; // Baseline vs Baseline expected ~50%
for (const r of results) {
  const marginal = (r.winRate - prevWinRate).toFixed(1);
  const marginalStr = Number(marginal) > 0 ? `+${marginal}%` : `${marginal}%`;
  console.log(
    `| **topK=${r.topK}** | vs topK=${r.vsTopK} | **${r.winRate}%** | ${r.testWins}W / ${r.baselineWins}L / ${r.draws}D | ${r.avgDurationMs} ms | ${marginalStr} |`
  );
  prevWinRate = r.winRate;
}
console.log('========================================================================\n');
