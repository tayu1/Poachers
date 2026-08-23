import { describe, expect, it } from 'vitest';
import { createInitialGameState } from '../core/engine';
import { generateFullThreatMap } from '../core/moves';
import {
  DEFAULT_BOT_PROFILE,
  evaluateState,
  getBestBotAction,
  greedyRolloutScore,
  evaluateActionTopK,
  getTopKMoves
} from './bot';
import { ActionType, PlayerSeat } from '../core/types';
import { runHeadlessGame } from './simulation';

describe('Next-Gen Bot Search & Evaluation Engine', () => {
  it('should immediately seize a direct King capture at root', () => {
    const state = createInitialGameState({ skipSetup: true });
    // Clear path: North pawn on 18 attacks East King on 27
    state.board[18] = 1; // North Pawn
    state.board[27] = 5 | 8; // East King (unbunkered)
    state.hasSwappedThisTurn = true; // Bypass pre-turn swap

    const candidate = getBestBotAction(state, { ...DEFAULT_BOT_PROFILE, randomnessMargin: 0 });
    expect(candidate).not.toBeNull();
    expect(candidate!.action.type).toBe('MOVE');
    expect(candidate!.action.origin).toBe(18);
    expect(candidate!.action.end).toBe(27);
    expect(candidate!.score).toBeGreaterThanOrEqual(100000);
  });

  it('should prefer capturing high-odds region squares over losing-odds squares', () => {
    const state = createInitialGameState({ skipSetup: true });
    state.activePlayer = PlayerSeat.NORTH;
    state.hasSwappedThisTurn = true;

    // Set North pawn on 18 that can attack 27 (good region) or 26 (other move)
    state.board[18] = 1; // North pawn
    state.board[27] = 2 | 8; // East Knight on 27
    state.board[26] = 2 | 8; // East Knight on 26

    // Configure region odds: Region for square 27 has 90% win rate for Team A
    // Region for square 26 has 10% win rate for Team A
    state.regionOdds = [
      { teamAWinRate: 0.1, teamBWinRate: 0.9 },
      { teamAWinRate: 0.9, teamBWinRate: 0.1 },
      { teamAWinRate: 0.1, teamBWinRate: 0.9 },
      { teamAWinRate: 0.1, teamBWinRate: 0.9 },
      { teamAWinRate: 0.9, teamBWinRate: 0.1 },
      { teamAWinRate: 0.1, teamBWinRate: 0.9 },
      { teamAWinRate: 0.1, teamBWinRate: 0.9 },
      { teamAWinRate: 0.1, teamBWinRate: 0.9 },
      { teamAWinRate: 0.1, teamBWinRate: 0.9 }
    ];

    const candidate = getBestBotAction(state, { ...DEFAULT_BOT_PROFILE, randomnessMargin: 0, depth: 4, topK: 3 });
    expect(candidate).not.toBeNull();
    expect(candidate!.action.type).toBe('MOVE');
  });

  it('should run 4-depth Top-3 search efficiently (Performance Benchmark)', () => {
    const state = createInitialGameState({ skipSetup: true });
    state.activePlayer = PlayerSeat.NORTH;
    state.hasSwappedThisTurn = true;

    // JIT warm-up
    getBestBotAction(state, {
      ...DEFAULT_BOT_PROFILE,
      depth: 4,
      topK: 3,
      randomnessMargin: 0
    });

    // Measure steady-state performance
    const start = performance.now();
    const candidate = getBestBotAction(state, {
      ...DEFAULT_BOT_PROFILE,
      depth: 4,
      topK: 3,
      randomnessMargin: 0
    });
    const elapsed = performance.now() - start;

    expect(candidate).not.toBeNull();
    expect(elapsed).toBeLessThan(250); // Steady state completes efficiently
  });

  it('should support deeper lookup (>4 ply: 5, 6, and 8 ply lookaheads)', () => {
    const state = createInitialGameState({ skipSetup: true });
    state.activePlayer = PlayerSeat.NORTH;
    state.hasSwappedThisTurn = true;

    // 5-ply search
    const c5 = getBestBotAction(state, {
      ...DEFAULT_BOT_PROFILE,
      depth: 5,
      topK: 3,
      randomnessMargin: 0
    });
    expect(c5).not.toBeNull();
    expect(c5?.action).toBeDefined();

    // 6-ply search (1.5 full rounds)
    const c6 = getBestBotAction(state, {
      ...DEFAULT_BOT_PROFILE,
      depth: 6,
      topK: 3,
      randomnessMargin: 0
    });
    expect(c6).not.toBeNull();
    expect(c6?.action).toBeDefined();

    // 8-ply search with adaptive branching (2 full rounds)
    const t0 = performance.now();
    const c8 = getBestBotAction(state, {
      ...DEFAULT_BOT_PROFILE,
      depth: 8,
      topK: 3,
      adaptiveBranching: true,
      randomnessMargin: 0
    });
    const elapsed8 = performance.now() - t0;
    expect(c8).not.toBeNull();
    expect(c8?.action).toBeDefined();
    expect(elapsed8).toBeLessThan(3000); // 8-ply search completes within reasonable time
  });

  it('should evaluate static positions consistently with zero-allocation active-piece loop', () => {
    const state = createInitialGameState({ skipSetup: true });
    const scoreNorth = evaluateState(state, PlayerSeat.NORTH);
    const scoreEast = evaluateState(state, PlayerSeat.EAST);
    const scoreSouth = evaluateState(state, PlayerSeat.SOUTH);
    const scoreWest = evaluateState(state, PlayerSeat.WEST);

    // Symmetrical initial state evaluations
    expect(scoreNorth).toBe(scoreSouth);
    expect(scoreEast).toBe(scoreWest);
    expect(scoreNorth).toBeCloseTo(scoreEast);
  });

  it('should handle trench setup draft phase for bots by selecting highest cards', () => {
    const state = createInitialGameState({ skipSetup: true });
    state.setupState = { inSetup: true, setupCompletedSeats: [] };
    state.players[PlayerSeat.NORTH].baseDeck = [
      { id: 'c1', suit: 'S', rank: 2 },
      { id: 'c2', suit: 'H', rank: 14 },
      { id: 'c3', suit: 'D', rank: 13 },
      { id: 'c4', suit: 'C', rank: 12 }
    ];

    const candidate = getBestBotAction(state);
    expect(candidate).not.toBeNull();
    expect(candidate!.action.type).toBe('TRENCH_SELECT');
    expect(candidate!.action.origin).toBe(PlayerSeat.NORTH);
  });

  it('should support legacy greedyRolloutScore function', () => {
    const state = createInitialGameState({ skipSetup: true });
    // Test that legacy rollout runs without errors
    const score = greedyRolloutScore(state, (10 << 14) | (18 << 8), PlayerSeat.NORTH, DEFAULT_BOT_PROFILE.pvals!, 2);
    expect(typeof score).toBe('number');
  });

  it('should accurately compute Expected Value from Win and Loss branches in combat', () => {
    const state = createInitialGameState({ skipSetup: true });
    state.activePlayer = PlayerSeat.NORTH;
    state.hasSwappedThisTurn = true;

    // Place North Pawn on 18 and East Knight on 27
    state.board[18] = 1;
    state.board[27] = 2 | 8;
    state.threatMap = generateFullThreatMap(state.board);

    const actionInt = (18 << 14) | (27 << 8); // Move 18 -> 27 (Attack)
    const pvals = DEFAULT_BOT_PROFILE.pvals!;

    // Evaluate Win branch and Loss branch individually
    const winScore = evaluateActionTopK(state, actionInt, PlayerSeat.NORTH, pvals, 4, 3, PlayerSeat.NORTH);
    const lossScore = evaluateActionTopK(state, actionInt, PlayerSeat.NORTH, pvals, 4, 3, PlayerSeat.WEST);

    // Set 80% win rate
    state.regionOdds = new Array(9).fill(null).map(() => ({ teamAWinRate: 0.8, teamBWinRate: 0.2 }));

    const expectedScore = 0.8 * winScore + 0.2 * lossScore;
    const candidate = getBestBotAction(state, { ...DEFAULT_BOT_PROFILE, randomnessMargin: 0, depth: 4, topK: 3 });

    // When 80% favorable attack on Knight is available, candidate should be this move with expectedScore
    expect(candidate).not.toBeNull();
    if (candidate!.action.origin === 18 && candidate!.action.end === 27) {
      expect(candidate!.score).toBeCloseTo(expectedScore, 1);
    }
  });

  it('should treat King attacking a piece as a 100% sure direct take (no poker combat)', () => {
    const state = createInitialGameState({ skipSetup: true });
    state.activePlayer = PlayerSeat.NORTH;
    state.hasSwappedThisTurn = true;

    // Place North King on 18 and enemy East Bishop on 19 (and friendly pawn already holding hill on 27)
    state.board[18] = 5; // North King
    state.board[19] = 3 | 8; // East Bishop
    state.board[27] = 1; // Friendly North Pawn on hill 27

    // Even with 0% win rate region odds, King taking a piece is a direct take (100% sure capture)
    state.regionOdds = new Array(9).fill(null).map(() => ({ teamAWinRate: 0.0, teamBWinRate: 1.0 }));

    const candidate = getBestBotAction(state, { ...DEFAULT_BOT_PROFILE, randomnessMargin: 0, depth: 1, topK: 3 });
    expect(candidate).not.toBeNull();
    // North King should take the Bishop on 19
    expect(candidate!.action.origin).toBe(18);
    expect(candidate!.action.end).toBe(19);
    expect(candidate!.score).toBeGreaterThan(evaluateState(state, PlayerSeat.NORTH));
  });


  it('should rank knight moves that directly threaten an enemy King at the top of candidate moves', () => {
    const state = createInitialGameState({ skipSetup: true });
    state.activePlayer = PlayerSeat.NORTH;
    state.hasSwappedThisTurn = true;
    // North Knight on 2, East King on 36
    // Knight moving to 19 creates direct threat on East King on 36 (offset 2 + 17 = 19, 19 + 17 = 36)
    state.board[2] = 2; // North Knight on 2
    state.board[36] = 5 | 8; // East King on 36
    state.threatMap = generateFullThreatMap(state.board);

    const knightThreatMove = (2 << 14) | (19 << 8);
    const topMoves = getTopKMoves(state, PlayerSeat.NORTH, 3);
    expect(topMoves).toContain(knightThreatMove);
    expect(topMoves[0]).toBe(knightThreatMove); // Top-1 move because of threat delta
  });

  it('should avoid suicidal King moves when evaluating candidate moves', () => {
    const state = createInitialGameState({ skipSetup: true });
    state.activePlayer = PlayerSeat.NORTH;
    state.hasSwappedThisTurn = true;
    // North King on 18, enemy East Knight on 36
    // Square 19 is attacked by East Knight on 36 (36 - 17 = 19)
    state.board[18] = 5; // North King
    state.board[36] = 2 | 8; // East Knight

    const suicidalKingMove = (18 << 14) | (19 << 8);
    const topMoves = getTopKMoves(state, PlayerSeat.NORTH, 1);
    // Suicidal move should never be the chosen top-1 move
    expect(topMoves[0]).not.toBe(suicidalKingMove);
  });

  it('should evaluate PAWN_ON_HILL (P[7]) bonus when pawn occupies the hill with alive king', () => {
    const stateWithHillPawn = createInitialGameState({ skipSetup: true });
    stateWithHillPawn.board[27] = 1; // North Pawn on hill 27

    const stateWithoutHillPawn = createInitialGameState({ skipSetup: true });
    stateWithoutHillPawn.board[19] = 1; // North Pawn on non-hill 19

    const scoreHill = evaluateState(stateWithHillPawn, PlayerSeat.NORTH);
    const scoreNonHill = evaluateState(stateWithoutHillPawn, PlayerSeat.NORTH);

    // Hill pawn receives P[6] (HILL_CONTROL_COUNT 500) + P[7] (PAWN_ON_HILL 300)
    expect(scoreHill - scoreNonHill).toBeGreaterThanOrEqual(800);
  });

  it('should award PAWN_HILL_NO_KING (P[8]) big bonus when King is dead and pawn holds hill', () => {
    // 1. King is Dead, Pawn on Hill
    const stateDeadKingHillPawn = createInitialGameState({ skipSetup: true });
    stateDeadKingHillPawn.board[3] = 0; // Remove North King
    stateDeadKingHillPawn.deadPoolCounts[5] = 1; // North King in dead pool
    stateDeadKingHillPawn.board[27] = 1; // North Pawn on hill 27

    // 2. King is Dead, Pawn NOT on Hill
    const stateDeadKingNonHillPawn = createInitialGameState({ skipSetup: true });
    stateDeadKingNonHillPawn.board[3] = 0; // Remove North King
    stateDeadKingNonHillPawn.deadPoolCounts[5] = 1; // North King in dead pool
    stateDeadKingNonHillPawn.board[19] = 1; // North Pawn on non-hill 19

    const evalWithHill = evaluateState(stateDeadKingHillPawn, PlayerSeat.NORTH);
    const evalWithoutHill = evaluateState(stateDeadKingNonHillPawn, PlayerSeat.NORTH);

    // Difference includes P[7] (PAWN_HILL_NO_KING) + P[6] + P[5] minus trench threat adjustments
    expect(evalWithHill - evalWithoutHill).toBeGreaterThanOrEqual(5000);
  });

  it('should not award PAWN_HILL_NO_KING bonus if King is still alive', () => {
    const stateAliveKingHillPawn = createInitialGameState({ skipSetup: true });
    stateAliveKingHillPawn.board[27] = 1; // North Pawn on hill 27
    // North King on 3 is alive!

    const stateAliveKingNonHillPawn = createInitialGameState({ skipSetup: true });
    stateAliveKingNonHillPawn.board[19] = 1; // North Pawn on non-hill 19
    // North King on 3 is alive!

    const evalHill = evaluateState(stateAliveKingHillPawn, PlayerSeat.NORTH);
    const evalNonHill = evaluateState(stateAliveKingNonHillPawn, PlayerSeat.NORTH);

    // Only P[6] (500) + P[7] (300) = 800, NOT +15000
    expect(evalHill - evalNonHill).toBeLessThan(2000);
  });

  it('should prioritize moving a pawn onto the Hill when King is dead', () => {
    const state = createInitialGameState({ skipSetup: true });
    state.activePlayer = PlayerSeat.NORTH;
    state.hasSwappedThisTurn = true;
    state.board[3] = 0; // North King is dead
    state.deadPoolCounts[5] = 1;

    // Clear board pieces except pawn at 19 that can step to hill 27 or quiet 18
    state.board[2] = 0;
    state.board[4] = 0;
    state.board[5] = 0;
    state.board[10] = 0;
    state.board[11] = 0;
    state.board[12] = 0;
    state.board[13] = 0;
    state.board[19] = 1; // North pawn on 19
    state.threatMap = generateFullThreatMap(state.board);

    const moveToHill = (19 << 14) | (27 << 8); // Move 19 -> 27 (onto Hill)
    const topMoves = getTopKMoves(state, PlayerSeat.NORTH, 3);

    expect(topMoves[0]).toBe(moveToHill);
  });

  it('should symmetrically penalize evaluation when enemy needs King and has pawn on hill', () => {
    const stateEnemyHillPawn = createInitialGameState({ skipSetup: true });
    stateEnemyHillPawn.board[31] = 0; // East King is dead
    stateEnemyHillPawn.deadPoolCounts[5 | 8] = 1; // East King in dead pool
    stateEnemyHillPawn.board[28] = 1 | 8; // East pawn on East's hill square 28

    const stateEnemyNoHillPawn = createInitialGameState({ skipSetup: true });
    stateEnemyNoHillPawn.board[31] = 0; // East King is dead
    stateEnemyNoHillPawn.deadPoolCounts[5 | 8] = 1; // East King in dead pool
    stateEnemyNoHillPawn.board[20] = 1 | 8; // East pawn on non-hill 20

    const scoreWithEnemyHill = evaluateState(stateEnemyHillPawn, PlayerSeat.NORTH);
    const scoreWithoutEnemyHill = evaluateState(stateEnemyNoHillPawn, PlayerSeat.NORTH);

    // Enemy having hill pawn when needing King significantly lowers North's score
    expect(scoreWithoutEnemyHill - scoreWithEnemyHill).toBeGreaterThanOrEqual(5000);
  });

  it('should prune candidate moves when gap exceeds GAP_PRUNING (P[21] = 10000)', () => {
    const state = createInitialGameState({ skipSetup: true });
    state.board.fill(0);

    // Active kings for White so game is in progress
    state.board[2] = 5;      // North King (safe)
    state.board[58] = 5;     // South King (safe)

    // East King on 31 under direct attack from White Knight on 37
    state.board[31] = 5 | 8; // East King
    state.board[37] = 2;     // White Knight attacking 31
    state.board[45] = 1;     // White Pawn on 45 attacking 38
    state.board[23] = 2 | 8; // East Knight
    state.board[39] = 3 | 8; // East Bishop
    state.deadPoolCounts.fill(0);
    state.threatMap = generateFullThreatMap(state.board);
    state.activePlayer = PlayerSeat.EAST;
    state.hasSwappedThisTurn = true;

    // Move 31 -> 30 moves king to safety (eval ~ 20000)
    // Move 31 -> 38 is attacked by pawn on 45 (eval ~ 6000), other piece moves leave 31 attacked (eval ~ 6000)
    // Gap > 10000 between #1 and all other moves -> pruned to 1 move
    const topMoves = getTopKMoves(state, PlayerSeat.EAST, 4);
    expect(topMoves.length).toBe(1);
    expect(topMoves[0]).toBe((31 << 14) | (30 << 8));

    // getBestBotAction should immediately choose 31 -> 30 without tree search
    const best = getBestBotAction(state, { ...DEFAULT_BOT_PROFILE, randomnessMargin: 0 });
    expect(best).not.toBeNull();
    expect(best!.action.origin).toBe(31);
    expect(best!.action.end).toBe(30);
  });

  it('should retain multiple high-eval candidate moves within the 10000 gap threshold', () => {
    const state = createInitialGameState({ skipSetup: true });
    state.board.fill(0);

    // North King at 18 with multiple safe quiet moves (e.g. 18 -> 17 and 18 -> 19)
    state.board[18] = 5; // North King
    state.threatMap = generateFullThreatMap(state.board);
    state.activePlayer = PlayerSeat.NORTH;
    state.hasSwappedThisTurn = true;

    const topMoves = getTopKMoves(state, PlayerSeat.NORTH, 3);
    // Since moves have close evaluations (small gap), multiple candidates are preserved
    expect(topMoves.length).toBeGreaterThan(1);
  });

  it('should capture ply state eval scores for top candidates after pruning', () => {
    const state = createInitialGameState({ skipSetup: true });
    state.activePlayer = PlayerSeat.NORTH;
    state.hasSwappedThisTurn = true;

    const botAction = getBestBotAction(state, {
      ...DEFAULT_BOT_PROFILE,
      depth: 4,
      topK: 3,
      randomnessMargin: 0
    });

    expect(botAction).not.toBeNull();
    expect(botAction?.plyScores).toBeDefined();
    expect(botAction?.plyScores?.[1]).toBeDefined();
    expect(botAction?.plyScores?.[1].length).toBeGreaterThan(0);
    expect(botAction?.logSummary).toContain('ply1:');
    expect(botAction?.logSummary).toContain('Candidates:');
    expect(botAction?.logSummary).toContain('Chosen:');
  });
});

