import fs from 'fs';
import path from 'path';
import { BotProfile, DEFAULT_BOT_PROFILE } from './bot';
import { DEFAULT_PVALS } from './pvals';
import { runHeadlessGame } from './simulation';
import { PlayerSeat } from '../core/types';

export { DEFAULT_PVALS } from './pvals';

export interface GenerationStats {
  generation: number;
  bestFitness: number;
  bestProfile: BotProfile;
  avgTurnTimeMs?: number;
  aborted?: boolean;
}

export interface MutationConfig {
  mode?: 'coupled' | 'decoupled';
  numChanges: number;
  magnitude: number;
  mutateThresholds?: boolean;
}

export const PVAL_COMMENTS: string[] = [
  /* 0 */  '/* 0:  RANDOMNESS_MARGIN (~ noise)          */',
  /* 1 */  '/* 1:  GAME_END_SCORE (+win/-loss)          */',
  /* 2 */  '/* 2:  KING_ONBOARD                         */',
  /* 3 */  '/* 3:  KING_UNPROTECTED_BY_PIECE (*)        */',
  /* 4 */  '/* 4:  KING_PROTECTED_BY_PIECE (*)          */',
  /* 5 */  '/* 5:  HILL_CONTROL_COUNT                   */',
  /* 6 */  '/* 6:  PAWN_ON_HILL                         */',
  /* 7 */  '/* 7:  PAWN_HILL_NO_KING                    */',
  /* 8 */  '/* 8:  CENTER_THREAT_COUNT                  */',
  /* 9 */  '/* 9:  PIECE_BASE_COUNT                     */',
  /* 10 */ '/* 10: PIECE_PAWN (*)                       */',
  /* 11 */ '/* 11: PIECE_KNIGHT (*)                     */',
  /* 12 */ '/* 12: PIECE_BISHOP (*)                     */',
  /* 13 */ '/* 13: PIECE_ROOK (*)                       */',
  /* 14 */ '/* 14: PIECE_UNPROTECTED_BY_PIECE (*)       */',
  /* 15 */ '/* 15: PIECE_PROTECTED_BY_PIECE (*)         */',
  /* 16 */ '/* 16: PIECE_BUNKERED_BY_PIECE (*)          */',
  /* 17 */ '/* 17: PIECE_UNPROTECTED_BY_KING (*)        */',
  /* 18 */ '/* 18: PIECE_PROTECTED_BY_KING (*)          */',
  /* 19 */ '/* 19: PIECE_BUNKERED_BY_KING (*)           */',
  /* 20 */ '/* 20: GAP1_ROOT_TOP4                       */',
  /* 21 */ '/* 21: GAP2_ROOT_TOP8                       */',
  /* 22 */ '/* 22: GAP_DEEP_PLIES                       */'
];

// All mutable parameter indices (skipping 1 which is fixed Game End value)
export const MUTABLE_PVAL_INDICES: number[] = [
  0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22
];

// Multiplier parameters (*) that are floating point numbers
export const MULTIPLIER_PVAL_INDICES: Set<number> = new Set([
  3, 4, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19
]);

/**
 * Saves improved P-Values directly into src/bot/pvals.ts
 */
export function savePvalsToFile(pvals: number[], filePath?: string): void {
  const targetPath = filePath || path.resolve(process.cwd(), 'src/bot/pvals.ts');
  if (!fs.existsSync(targetPath)) return;

  const content = fs.readFileSync(targetPath, 'utf8');

  const lines = pvals.map((val, i) => {
    const comment = PVAL_COMMENTS[i] || `/* ${i}: */`;
    return `  ${comment.padEnd(49)} ${val},`;
  });
  lines[lines.length - 1] = lines[lines.length - 1].replace(/,$/, '');

  const newArrayBlock = `export const DEFAULT_PVALS: number[] = [\n${lines.join('\n')}\n];`;

  const updatedContent = content.replace(
    /export const DEFAULT_PVALS:\s*number\[\]\s*=\s*\[[\s\S]*?\];/,
    newArrayBlock
  );

  fs.writeFileSync(targetPath, updatedContent, 'utf8');
  console.log(`💾 Successfully updated DEFAULT_PVALS in ${targetPath}`);
}

export const savePvalsToBotFile = savePvalsToFile;

export function generateMutatedBotProfile(
  name: string,
  base: BotProfile = DEFAULT_BOT_PROFILE,
  config: MutationConfig = { numChanges: 1, magnitude: 0.20 }
): BotProfile {
  const pvals = [...(base.pvals || DEFAULT_PVALS)];

  const chosen = new Set<number>();
  const pool = MUTABLE_PVAL_INDICES;
  while (chosen.size < Math.min(config.numChanges, pool.length)) {
    const randomIdx = pool[Math.floor(Math.random() * pool.length)];
    chosen.add(randomIdx);
  }

  for (const idx of chosen) {
    const factor = 1.0 + (Math.random() * 2 - 1) * config.magnitude;
    if (idx === 0) {
      // Randomness Margin (floor at 15 to maintain opening move variety)
      pvals[idx] = Math.max(15, Math.round(pvals[idx] * factor));
    } else if (MULTIPLIER_PVAL_INDICES.has(idx)) {
      // Multipliers (*) retain precision
      pvals[idx] = Math.max(0.001, Math.round(pvals[idx] * factor * 1000) / 1000);
    } else {
      pvals[idx] = Math.max(1, Math.round(pvals[idx] * factor));
    }
  }

  return {
    name,
    pvals,
    depth: base.depth ?? 4,
    topK: base.topK ?? 3,
    trenchStrategy: base.trenchStrategy
  };
}

export function generateRandomBotProfile(name: string): BotProfile {
  return generateMutatedBotProfile(name, DEFAULT_BOT_PROFILE, { numChanges: 1, magnitude: 0.25 });
}

export interface MatchEvaluationResult {
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  totalTurns: number;
  totalDurationMs: number;
  avgMsPerMove: number;
}

export function evaluateCandidateVsBase(
  candidate: BotProfile,
  base: BotProfile,
  gamesCount: number = 10,
  maxTurns: number = 150
): MatchEvaluationResult {
  let wins = 0;
  let losses = 0;
  let draws = 0;
  let totalTurns = 0;
  let totalDurationMs = 0;

  for (let i = 0; i < gamesCount; i++) {
    const isCandidateTeamA = i % 2 === 0;
    const botA = isCandidateTeamA ? candidate : base;
    const botB = isCandidateTeamA ? base : candidate;

    const res = runHeadlessGame(
      {
        [PlayerSeat.NORTH]: botA,
        [PlayerSeat.SOUTH]: botA,
        [PlayerSeat.EAST]: botB,
        [PlayerSeat.WEST]: botB
      },
      maxTurns,
      true
    );

    totalTurns += res.totalTurns;
    if (res.durationMs) totalDurationMs += res.durationMs;

    if (!res.winnerTeam) {
      draws++;
    } else if ((res.winnerTeam === 'A' && isCandidateTeamA) || (res.winnerTeam === 'B' && !isCandidateTeamA)) {
      wins++;
    } else {
      losses++;
    }
  }

  const winRate = Number((wins / gamesCount).toFixed(3));
  const avgMsPerMove = totalTurns > 0 ? totalDurationMs / totalTurns : 0;

  return { wins, losses, draws, winRate, totalTurns, totalDurationMs, avgMsPerMove };
}

export function printPValDiff(base: BotProfile, best: BotProfile): void {
  console.log(`\n📊 Numbered P-Values Diff (${base.name} -> ${best.name}):`);
  console.log(`--------------------------------------------------------------------------------`);
  let changesCount = 0;

  const basePvals = base.pvals || DEFAULT_PVALS;
  const bestPvals = best.pvals || DEFAULT_PVALS;

  for (let i = 0; i < Math.min(basePvals.length, bestPvals.length); i++) {
    const baseVal = basePvals[i];
    const bestVal = bestPvals[i];
    if (baseVal !== bestVal) {
      changesCount++;
      const diff = bestVal - baseVal;
      const sign = diff > 0 ? '+' : '';
      const pct = baseVal !== 0 ? ` (${sign}${((diff / baseVal) * 100).toFixed(1)}%)` : '';
      const name = PVAL_COMMENTS[i]?.replace(/\/\*|\*\/|\d+:/g, '').trim() || `P[${i}]`;
      console.log(`- P[${i.toString().padStart(2, ' ')}] ${name.padEnd(38)}: ${baseVal} -> ${bestVal}${pct}`);
    }
  }

  if (changesCount === 0) {
    console.log(`- (No P-Value changes detected vs base profile)`);
  }
  console.log(`================================================================----------------\n`);
}

/**
 * Robust Hill-Climbing / Champion-Challenger Optimization.
 * The current baseline acts as Champion. Each round, a mutated Challenger plays directly
 * against the Champion. If Challenger wins > 50% across matches, it becomes the new Champion.
 */
export function runGeneticEvolution(
  rounds: number = 3,
  matchesPerChallenge: number = 10,
  mutationConfig: MutationConfig = { numChanges: 1, magnitude: 0.20 },
  autoSave: boolean = false
): GenerationStats[] {
  console.log(`⏱️ Evaluating baseline turn speed across 5 sample games...`);
  const benchStart = performance.now();
  let baseTurns = 0;
  for (let b = 0; b < 5; b++) {
    const benchRes = runHeadlessGame(undefined, 100, true);
    baseTurns += benchRes.totalTurns;
  }
  const benchElapsedMs = performance.now() - benchStart;
  const avgMsPerMoveBase = baseTurns > 0 ? benchElapsedMs / baseTurns : 1.0;

  const totalGamesInSim = rounds * matchesPerChallenge;
  const estTotalSec = Math.round((totalGamesInSim * (benchElapsedMs / 5)) / 1000);
  const estMin = Math.floor(estTotalSec / 60);
  const estSecRem = estTotalSec % 60;

  console.log(`⏱️ Base Bot Move Speed: ${avgMsPerMoveBase.toFixed(2)} ms/move (${benchElapsedMs.toFixed(0)}ms for ${baseTurns} turns in 5 games, avg ${(benchElapsedMs / 5).toFixed(0)} ms/game).`);
  console.log(`⏱️ Planned Matches: ${rounds} rounds × ${matchesPerChallenge} games/challenge = ${totalGamesInSim} games (estimated ~${estMin}m ${estSecRem}s).`);
  console.log(`=============================================================================`);

  let currentChampion: BotProfile = {
    ...DEFAULT_BOT_PROFILE,
    name: 'Champion_Base',
    pvals: [...(DEFAULT_BOT_PROFILE.pvals || DEFAULT_PVALS)]
  };

  let totalCrownings = 0;
  let totalGamesPlayed = 0;
  let totalTurnsPlayed = baseTurns;
  let totalTimeMs = benchElapsedMs;
  const history: GenerationStats[] = [];

  const evoStart = performance.now();

  for (let r = 0; r < rounds; r++) {
    const roundStart = performance.now();
    const challenger = generateMutatedBotProfile(
      `Challenger_R${r + 1}`,
      currentChampion,
      mutationConfig
    );

    const matchRes = evaluateCandidateVsBase(challenger, currentChampion, matchesPerChallenge, 150);
    totalGamesPlayed += matchesPerChallenge;
    totalTurnsPlayed += matchRes.totalTurns;
    const roundTimeMs = performance.now() - roundStart;
    totalTimeMs += roundTimeMs;

    console.log(`\n⚔️ [Round ${r + 1}/${rounds}] ${challenger.name} vs ${currentChampion.name}:`);
    console.log(`   Result: ${matchRes.wins}W - ${matchRes.losses}L - ${matchRes.draws}D (${(matchRes.winRate * 100).toFixed(1)}% Win Rate | ${matchRes.totalTurns} turns | ${roundTimeMs.toFixed(0)}ms | ${(roundTimeMs / matchesPerChallenge).toFixed(1)}ms/game | ${matchRes.avgMsPerMove.toFixed(2)}ms/move)`);

    // To defeat the champion, challenger must have more wins than losses and at least 55% win rate
    if (matchRes.wins > matchRes.losses && matchRes.winRate >= 0.55) {
      totalCrownings++;
      console.log(`👑 [NEW CHAMPION] Round ${r + 1}: ${challenger.name} defeated ${currentChampion.name}!`);
      printPValDiff(currentChampion, challenger);

      currentChampion = {
        ...challenger,
        name: `Champion_R${r + 1}`
      };

      if (autoSave) {
        savePvalsToFile(currentChampion.pvals!);
      }
    }

    history.push({
      generation: r + 1,
      bestFitness: matchRes.wins,
      bestProfile: currentChampion,
      avgTurnTimeMs: matchRes.avgMsPerMove
    });
  }

  const evoTotalSec = ((performance.now() - evoStart) / 1000).toFixed(2);
  const movesPerSec = totalTurnsPlayed > 0 ? ((totalTurnsPlayed / (totalTimeMs / 1000))).toFixed(1) : '0';

  console.log(`\n=============================================================================`);
  console.log(`🏁 Genetic Evolution Run Complete (${evoTotalSec}s elapsed):`);
  console.log(`- Total Games Played    : ${totalGamesPlayed}`);
  console.log(`- Total Turns/Moves     : ${totalTurnsPlayed}`);
  console.log(`- Avg Speed per Move    : ${(totalTimeMs / totalTurnsPlayed).toFixed(2)} ms/move (${movesPerSec} moves/sec)`);
  console.log(`- Avg Speed per Game    : ${(totalTimeMs / (totalGamesPlayed + 5)).toFixed(1)} ms/game`);
  console.log(`- Total Champion Upgrades: ${totalCrownings}`);
  console.log(`- Final Champion        : ${currentChampion.name}`);
  console.log(`=============================================================================\n`);

  return history;
}
