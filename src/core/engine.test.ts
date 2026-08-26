import { describe, it, expect } from 'vitest';
import { createInitialGameState, applyAction, completePostCombat, executeCombatResolution, isSeatOccupyingHill, grantHillCardReward } from './engine';
import { PlayerSeat } from './types';

describe('Core Engine & Combat Integration', () => {
  it('should initialize game state with all 4 seats and correct default board', () => {
    const state = createInitialGameState({ skipSetup: true });
    expect(state.activePlayer).toBe(PlayerSeat.NORTH);
    expect(state.turnCount).toBe(1);
    expect(state.isGameOver).toBe(false);
    expect(state.board.length).toBe(64);
    expect(state.publicFlop.length).toBe(3);
    expect(state.publicTurnRiver.length).toBe(2);
    expect(state.isTurnRiverRevealed).toBe(false);
    // By default auto-picks cards for seamless instant play
    expect(state.players[PlayerSeat.NORTH].trenchCards.every(c => c !== null)).toBe(true);
  });

  it.skip('should support manual trench card selection when enableManualDraft is set', () => {
    const state = createInitialGameState({
      skipSetup: false,
      botSeats: {
        [PlayerSeat.NORTH]: false,
        [PlayerSeat.EAST]: false,
        [PlayerSeat.SOUTH]: false,
        [PlayerSeat.WEST]: false
      }
    });
    expect(state.setupState.inSetup).toBe(true);
    expect(state.players[PlayerSeat.NORTH].baseDeck.length).toBe(5);

    // North selects 3 cards from the 5 base deck cards
    applyAction(state, {
      type: 'TRENCH_SELECT',
      input1: PlayerSeat.NORTH,
      input2: [0, 1, 2] as any
    });

    expect(state.setupState.setupCompletedSeats).toContain(PlayerSeat.NORTH);
    expect(state.players[PlayerSeat.NORTH].trenchCards.every(c => c !== null)).toBe(true);
    expect(state.players[PlayerSeat.NORTH].baseDeck.length).toBe(2);
  });

  it('should correctly handle combat deferral and post-combat resolution', () => {
    const state = createInitialGameState({ skipSetup: true });
    expect(state.setupState.inSetup).toBe(false);

    // Place an opponent piece in attack range
    const attackerFrom = 8; // North pawn on square 8
    const targetSquare = 16;
    state.board[targetSquare] = 2; // East pawn on square 16

    const moveAction = {
      type: 'MOVE' as const,
      input1: attackerFrom,
      input2: targetSquare
    };

    const result = applyAction(state, moveAction, { deferPostCombat: true });
    expect(result.combatOccurred).toBe(true);
    expect(result.pendingCombat).toBeDefined();
    expect(state.isCombatDelaying).toBe(true);
    expect(state.isTurnRiverRevealed).toBe(false);

    // Step 1: Execute combat resolution (Turn/River reveals and hands evaluate)
    executeCombatResolution(state, result.pendingCombat!);
    expect(state.isTurnRiverRevealed).toBe(true);

    // Step 2: Complete post combat
    completePostCombat(state, result.pendingCombat!);
    expect(state.isCombatDelaying).toBe(false);
    expect(state.pendingCombat).toBeNull();
  });

  describe('Hill Card Bonus per Player', () => {
    it('should correctly detect hill occupation for North on squares 27 and 28 only', () => {
      const state = createInitialGameState({ skipSetup: true });
      expect(isSeatOccupyingHill(state.board, PlayerSeat.NORTH)).toBe(false);
      expect(isSeatOccupyingHill(state.board, PlayerSeat.SOUTH)).toBe(false);

      // Place Team A piece on square 27 (North half)
      state.board[27] = 1; // Team A Pawn
      expect(isSeatOccupyingHill(state.board, PlayerSeat.NORTH)).toBe(true);
      expect(isSeatOccupyingHill(state.board, PlayerSeat.SOUTH)).toBe(false);
      expect(isSeatOccupyingHill(state.board, PlayerSeat.EAST)).toBe(false);
      expect(isSeatOccupyingHill(state.board, PlayerSeat.WEST)).toBe(false);

      // Move piece to square 28 (North half)
      state.board[27] = 0;
      state.board[28] = 1;
      expect(isSeatOccupyingHill(state.board, PlayerSeat.NORTH)).toBe(true);
      expect(isSeatOccupyingHill(state.board, PlayerSeat.SOUTH)).toBe(false);
    });

    it('should correctly detect hill occupation for South on squares 35 and 36 only', () => {
      const state = createInitialGameState({ skipSetup: true });
      expect(isSeatOccupyingHill(state.board, PlayerSeat.SOUTH)).toBe(false);
      expect(isSeatOccupyingHill(state.board, PlayerSeat.NORTH)).toBe(false);

      // Place Team A piece on square 35 (South half)
      state.board[35] = 1; // Team A Pawn
      expect(isSeatOccupyingHill(state.board, PlayerSeat.SOUTH)).toBe(true);
      expect(isSeatOccupyingHill(state.board, PlayerSeat.NORTH)).toBe(false);
      expect(isSeatOccupyingHill(state.board, PlayerSeat.EAST)).toBe(false);
      expect(isSeatOccupyingHill(state.board, PlayerSeat.WEST)).toBe(false);

      // Move piece to square 36 (South half)
      state.board[35] = 0;
      state.board[36] = 1;
      expect(isSeatOccupyingHill(state.board, PlayerSeat.SOUTH)).toBe(true);
      expect(isSeatOccupyingHill(state.board, PlayerSeat.NORTH)).toBe(false);
    });

    it('should correctly detect hill occupation for West on squares 27 and 35 only', () => {
      const state = createInitialGameState({ skipSetup: true });
      expect(isSeatOccupyingHill(state.board, PlayerSeat.WEST)).toBe(false);
      expect(isSeatOccupyingHill(state.board, PlayerSeat.EAST)).toBe(false);

      // Place Team B piece on square 27 (West half)
      state.board[27] = 9; // Team B Pawn
      expect(isSeatOccupyingHill(state.board, PlayerSeat.WEST)).toBe(true);
      expect(isSeatOccupyingHill(state.board, PlayerSeat.EAST)).toBe(false);
      expect(isSeatOccupyingHill(state.board, PlayerSeat.NORTH)).toBe(false);
      expect(isSeatOccupyingHill(state.board, PlayerSeat.SOUTH)).toBe(false);

      // Move to square 35 (West half)
      state.board[27] = 0;
      state.board[35] = 9;
      expect(isSeatOccupyingHill(state.board, PlayerSeat.WEST)).toBe(true);
      expect(isSeatOccupyingHill(state.board, PlayerSeat.EAST)).toBe(false);
    });

    it('should correctly detect hill occupation for East on squares 28 and 36 only', () => {
      const state = createInitialGameState({ skipSetup: true });
      expect(isSeatOccupyingHill(state.board, PlayerSeat.EAST)).toBe(false);
      expect(isSeatOccupyingHill(state.board, PlayerSeat.WEST)).toBe(false);

      // Place Team B piece on square 28 (East half)
      state.board[28] = 9; // Team B Pawn
      expect(isSeatOccupyingHill(state.board, PlayerSeat.EAST)).toBe(true);
      expect(isSeatOccupyingHill(state.board, PlayerSeat.WEST)).toBe(false);
      expect(isSeatOccupyingHill(state.board, PlayerSeat.NORTH)).toBe(false);
      expect(isSeatOccupyingHill(state.board, PlayerSeat.SOUTH)).toBe(false);

      // Move to square 36 (East half)
      state.board[28] = 0;
      state.board[36] = 9;
      expect(isSeatOccupyingHill(state.board, PlayerSeat.EAST)).toBe(true);
      expect(isSeatOccupyingHill(state.board, PlayerSeat.WEST)).toBe(false);
    });

    it('should grant a hill card reward to active player on turn end when occupying hill', () => {
      const state = createInitialGameState({ skipSetup: true });
      expect(state.activePlayer).toBe(PlayerSeat.NORTH);
      const initialNorthDeckCount = state.players[PlayerSeat.NORTH].baseDeck.length; // 2
      const initialMainDeckCount = state.deck.length;

      // Place a piece on square 27 for North
      state.board[27] = 1;

      // North makes a move (e.g. moving a piece from square 10 to square 18)
      applyAction(state, {
        type: 'MOVE',
        input1: 10,
        input2: 18
      });

      // North's baseDeck should have gained 1 card
      expect(state.players[PlayerSeat.NORTH].baseDeck.length).toBe(initialNorthDeckCount + 1);
      expect(state.deck.length).toBe(initialMainDeckCount - 1);
    });

    it('should grant hill bonus to all players when they each take their turn on the hill', () => {
      for (const seat of [PlayerSeat.NORTH, PlayerSeat.EAST, PlayerSeat.SOUTH, PlayerSeat.WEST]) {
        const state = createInitialGameState({ skipSetup: true, startingPlayer: seat });
        const initialCount = state.players[seat].baseDeck.length;

        // Place friendly piece on seat's hill square
        if (seat === PlayerSeat.NORTH) state.board[27] = 1;
        if (seat === PlayerSeat.EAST) state.board[28] = 9;
        if (seat === PlayerSeat.SOUTH) state.board[35] = 1;
        if (seat === PlayerSeat.WEST) state.board[35] = 9;

        const granted = grantHillCardReward(state, seat);
        expect(granted).toBe(true);
        expect(state.players[seat].baseDeck.length).toBe(initialCount + 1);
      }
    });

    it('should not grant card if baseDeck is already at MAX_BASE_DECK_SIZE (5)', () => {
      const state = createInitialGameState({ skipSetup: true });
      state.board[27] = 1;
      // Fill North's baseDeck to 5
      while (state.players[PlayerSeat.NORTH].baseDeck.length < 5) {
        state.players[PlayerSeat.NORTH].baseDeck.push(state.deck.pop()!);
      }
      expect(state.players[PlayerSeat.NORTH].baseDeck.length).toBe(5);

      const granted = grantHillCardReward(state, PlayerSeat.NORTH);
      expect(granted).toBe(false);
      expect(state.players[PlayerSeat.NORTH].baseDeck.length).toBe(5);
    });

    it('should grant hill bonus on combat victory when attacker moves onto hill', () => {
      const state = createInitialGameState({ skipSetup: true });
      // Place defender on hill square 27 (East pawn)
      state.board[27] = 9;
      // Place attacker on square 18 (North pawn, attacks 27 diagonally)
      state.board[18] = 1;

      // Ensure deterministic Royal Flush for North attacker
      state.players[PlayerSeat.NORTH].trenchCards = [
        { id: 'c-1', suit: 'S', rank: 14 },
        { id: 'c-1', suit: 'S', rank: 14 },
        { id: 'c-1', suit: 'S', rank: 14 }
      ];
      state.players[PlayerSeat.SOUTH].trenchCards = [
        { id: 'c-2', suit: 'S', rank: 13 },
        { id: 'c-2', suit: 'S', rank: 13 },
        { id: 'c-2', suit: 'S', rank: 13 }
      ];
      state.publicFlop = [
        { id: 'c-3', suit: 'S', rank: 12 },
        { id: 'c-4', suit: 'S', rank: 11 },
        { id: 'c-5', suit: 'S', rank: 10 }
      ];
      state.players[PlayerSeat.EAST].trenchCards = [
        { id: 'c-7', suit: 'C', rank: 2 },
        { id: 'c-8', suit: 'C', rank: 3 },
        { id: 'c-9', suit: 'C', rank: 4 }
      ];
      state.players[PlayerSeat.WEST].trenchCards = [
        { id: 'c-10', suit: 'C', rank: 2 },
        { id: 'c-11', suit: 'C', rank: 3 },
        { id: 'c-12', suit: 'C', rank: 4 }
      ];

      const initialNorthDeckCount = state.players[PlayerSeat.NORTH].baseDeck.length;

      // Attacker attacks defender on square 27
      const result = applyAction(state, {
        type: 'MOVE',
        input1: 18,
        input2: 27
      }, { deferPostCombat: true });

      expect(result.combatOccurred).toBe(true);
      expect(result.pendingCombat).toBeDefined();

      // Force attacker win
      result.pendingCombat!.winnerSeat = PlayerSeat.NORTH;

      // Complete post combat
      completePostCombat(state, result.pendingCombat!, { autoCardPick: false });

      // North should have occupied square 27 and received hill bonus
      expect(isSeatOccupyingHill(state.board, PlayerSeat.NORTH)).toBe(true);
      // North gained captured trench card (if applicable) + 1 hill bonus card
      expect(state.players[PlayerSeat.NORTH].baseDeck.length).toBeGreaterThan(initialNorthDeckCount);
    });

    it('should grant hill bonus on promotion action', () => {
      const state = createInitialGameState({ skipSetup: true });
      // North pawn on hill square 27
      state.board[27] = 1;
      // Add dead rook to pool
      state.deadPoolCounts[4] = 1;

      const initialNorthDeckCount = state.players[PlayerSeat.NORTH].baseDeck.length;

      applyAction(state, {
        type: 'PROMOTION',
        input1: 4, // Rook
        input2: 27 // square 27
      });

      // North promoted on square 27 and remains on hill
      expect(state.board[27]).toBe(4); // Rook
      expect(state.players[PlayerSeat.NORTH].baseDeck.length).toBe(initialNorthDeckCount + 1);
    });

    it('should grant hill bonus on bunker change action when occupying hill', () => {
      const state = createInitialGameState({ skipSetup: true });
      // North piece on hill square 27
      state.board[27] = 1;
      // North bunkered pawn on square 10
      state.board[10] = 17; // 1 | 16

      const initialNorthDeckCount = state.players[PlayerSeat.NORTH].baseDeck.length;

      applyAction(state, {
        type: 'SET_BUNKER',
        input1: 10,
        input2: 0 // release bunker
      });

      expect(state.players[PlayerSeat.NORTH].baseDeck.length).toBe(initialNorthDeckCount + 1);
    });

    it('should grant hill bonus to South when South moves onto South hill (square 35)', () => {
      const state = createInitialGameState({ skipSetup: true, startingPlayer: PlayerSeat.SOUTH });
      expect(state.activePlayer).toBe(PlayerSeat.SOUTH);
      const initialSouthDeckCount = state.players[PlayerSeat.SOUTH].baseDeck.length;
      const initialNorthDeckCount = state.players[PlayerSeat.NORTH].baseDeck.length;

      // Place South pawn at 43 (just below hill square 35)
      state.board[43] = 1;

      // South moves to hill square 35
      applyAction(state, {
        type: 'MOVE',
        input1: 43,
        input2: 35
      });

      // South should have gained a card and have hill LED on
      expect(isSeatOccupyingHill(state.board, PlayerSeat.SOUTH)).toBe(true);
      expect(isSeatOccupyingHill(state.board, PlayerSeat.NORTH)).toBe(false);
      expect(state.players[PlayerSeat.SOUTH].baseDeck.length).toBe(initialSouthDeckCount + 1);
      expect(state.players[PlayerSeat.NORTH].baseDeck.length).toBe(initialNorthDeckCount);
    });

    it('should grant hill bonus on skip turn action when occupying hill', () => {
      const state = createInitialGameState({ skipSetup: true });
      // North piece on hill square 27
      state.board[27] = 1;

      const initialNorthDeckCount = state.players[PlayerSeat.NORTH].baseDeck.length;

      applyAction(state, {
        type: 'SKIP_TURN',
        input1: undefined,
        input2: null
      });

      expect(state.players[PlayerSeat.NORTH].baseDeck.length).toBe(initialNorthDeckCount + 1);
    });

    it('should grant hill bonus when advancing onto the hill at turn end', () => {
      const state = createInitialGameState({ skipSetup: true });
      // Place North pawn at square 19
      state.board[19] = 1;
      expect(isSeatOccupyingHill(state.board, PlayerSeat.NORTH)).toBe(false);

      const initialNorthDeckCount = state.players[PlayerSeat.NORTH].baseDeck.length;

      // North moves pawn to hill square 27
      applyAction(state, {
        type: 'MOVE',
        input1: 19,
        input2: 27
      });

      expect(isSeatOccupyingHill(state.board, PlayerSeat.NORTH)).toBe(true);
      expect(state.players[PlayerSeat.NORTH].baseDeck.length).toBe(initialNorthDeckCount + 1);
    });

    it('should grant hill bonus via advanceTurn when combat ends with piece occupying hill', () => {
      const state = createInitialGameState({ skipSetup: true });
      // East enemy piece on hill square 27
      state.board[27] = 1 | 8;
      // North pawn on square 19
      state.board[19] = 1;

      const initialNorthDeckCount = state.players[PlayerSeat.NORTH].baseDeck.length; // 2

      // North attacks hill square 27 from square 19
      const result = applyAction(state, {
        type: 'MOVE',
        input1: 19,
        input2: 27
      }, { deferPostCombat: true, forceCombatWinner: PlayerSeat.NORTH });

      expect(result.combatOccurred).toBe(true);
      expect(result.pendingCombat).toBeDefined();

      // With default autoCardPick: true, North poaches defender card (+1), gains hill bonus (+1), and refills trench (-1) = net +1 base deck
      executeCombatResolution(state, result.pendingCombat!, { forceCombatWinner: PlayerSeat.NORTH });
      completePostCombat(state, result.pendingCombat!, { autoCardPick: true });

      expect(isSeatOccupyingHill(state.board, PlayerSeat.NORTH)).toBe(true);
      expect(state.players[PlayerSeat.NORTH].baseDeck.length).toBe(initialNorthDeckCount + 1);
    });
  });
});


