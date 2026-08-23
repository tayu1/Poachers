import { BotProfile, DEFAULT_BOT_PROFILE, getBestBotAction } from './bot';
import { applyAction, createInitialGameState } from '../core/engine';
import { GameState, PlayerSeat, Team, BotRequestType } from '../core/types';
import { TrenchStrategy } from '../core/cards';

export interface SimResult {
  winnerTeam: Team | null;
  totalTurns: number;
  endReason: 'KING_CAPTURE' | 'MAX_TURNS';
  score: { teamA: number; teamB: number };
  finalState: GameState;
  durationMs?: number;
}

export function runHeadlessGame(
  profiles?: Partial<Record<PlayerSeat, BotProfile>>,
  maxTurns: number = 300,
  randomizeStartingPlayer: boolean = false
): SimResult {
  const t0 = performance.now();
  const allBotSeats = {
    [PlayerSeat.NORTH]: true,
    [PlayerSeat.EAST]: true,
    [PlayerSeat.SOUTH]: true,
    [PlayerSeat.WEST]: true
  };

  const botProfiles: Record<PlayerSeat, BotProfile> = {
    [PlayerSeat.NORTH]: profiles?.[PlayerSeat.NORTH] || DEFAULT_BOT_PROFILE,
    [PlayerSeat.EAST]: profiles?.[PlayerSeat.EAST] || DEFAULT_BOT_PROFILE,
    [PlayerSeat.SOUTH]: profiles?.[PlayerSeat.SOUTH] || DEFAULT_BOT_PROFILE,
    [PlayerSeat.WEST]: profiles?.[PlayerSeat.WEST] || DEFAULT_BOT_PROFILE
  };

  const botStrategies: Partial<Record<PlayerSeat, TrenchStrategy>> = {};
  for (const seat of [PlayerSeat.NORTH, PlayerSeat.EAST, PlayerSeat.SOUTH, PlayerSeat.WEST] as PlayerSeat[]) {
    const profile = botProfiles[seat];
    if (profile.trenchStrategy) {
      botStrategies[seat] = profile.trenchStrategy;
    }
  }

  const seats = [PlayerSeat.NORTH, PlayerSeat.EAST, PlayerSeat.SOUTH, PlayerSeat.WEST];
  const startingPlayer = randomizeStartingPlayer
    ? seats[Math.floor(Math.random() * seats.length)]
    : PlayerSeat.NORTH;

  const state: GameState = createInitialGameState({
    autoSetupBots: true,
    botSeats: allBotSeats,
    botStrategies,
    startingPlayer
  });

  while (!state.isGameOver && state.turnCount < maxTurns) {
    const currentSeat = state.activePlayer;
    const profile = botProfiles[currentSeat];

    const bestAction = getBestBotAction(state, profile);
    if (!bestAction) {
      break;
    }

    applyAction(state, bestAction.actionInt ?? bestAction.action, {
      botSeats: allBotSeats,
      botStrategies,
      requestType: BotRequestType.HEADLESS
    });
  }

  let winnerTeam = state.winnerTeam;
  if (!winnerTeam) {
    let countA = 0;
    let countB = 0;
    for (const p of state.board) {
      if (p !== 0) {
        if ((p & 8) === 0) countA++;
        else countB++;
      }
    }
    if (countA > countB) winnerTeam = 'A';
    else if (countB > countA) winnerTeam = 'B';
  }

  const durationMs = performance.now() - t0;

  return {
    winnerTeam,
    totalTurns: state.turnCount,
    endReason: state.isGameOver ? 'KING_CAPTURE' : 'MAX_TURNS',
    score: state.score,
    finalState: state,
    durationMs
  };
}

export interface SimulationSuiteResult {
  totalGames: number;
  teamAWins: number;
  teamBWins: number;
  draws: number;
  teamAWinRate: number;
  teamBWinRate: number;
  avgTurns: number;
  kingCaptures: number;
  maxTurnTimeouts: number;
  totalDurationMs: number;
  avgMsPerGame: number;
  avgMsPerTurn: number;
}

export function runSimulationSuite(
  totalGames: number = 50,
  profiles?: Partial<Record<PlayerSeat, BotProfile>>,
  maxTurns: number = 300
): SimulationSuiteResult {
  const suiteStart = performance.now();
  let teamAWins = 0;
  let teamBWins = 0;
  let draws = 0;
  let totalTurnsSum = 0;
  let kingCaptures = 0;
  let maxTurnTimeouts = 0;

  for (let i = 0; i < totalGames; i++) {
    const result = runHeadlessGame(profiles, maxTurns, true);
    totalTurnsSum += result.totalTurns;

    if (result.winnerTeam === 'A') teamAWins++;
    else if (result.winnerTeam === 'B') teamBWins++;
    else draws++;

    if (result.endReason === 'KING_CAPTURE') kingCaptures++;
    else maxTurnTimeouts++;
  }

  const totalDurationMs = performance.now() - suiteStart;

  return {
    totalGames,
    teamAWins,
    teamBWins,
    draws,
    teamAWinRate: Number((teamAWins / totalGames).toFixed(3)),
    teamBWinRate: Number((teamBWins / totalGames).toFixed(3)),
    avgTurns: Number((totalTurnsSum / totalGames).toFixed(1)),
    kingCaptures,
    maxTurnTimeouts,
    totalDurationMs,
    avgMsPerGame: totalDurationMs / totalGames,
    avgMsPerTurn: totalTurnsSum > 0 ? totalDurationMs / totalTurnsSum : 0
  };
}
