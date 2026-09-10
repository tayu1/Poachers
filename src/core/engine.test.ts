import { describe, it, expect } from 'vitest';
import { createInitialGameState, applyAction, completePostCombat, executeCombatResolution, fastCloneState, isSeatOccupyingHill, grantHillCardReward } from './engine';
import { processPostCombat, dealCommunityCards } from './cards';
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
    // Each player starts with 3 random trench cards and 5 base deck cards
    expect(state.players[PlayerSeat.NORTH].trenchCards.every(c => c !== null)).toBe(true);
    expect(state.players[PlayerSeat.NORTH].trenchCards.length).toBe(3);
    expect(state.players[PlayerSeat.NORTH].baseDeck.length).toBe(5);
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
    expect(state.players[PlayerSeat.NORTH].baseDeck.length).toBe(6);

    // North selects 3 cards from the 6 base deck cards
    applyAction(state, {
      type: 'TRENCH_SELECT',
      input1: PlayerSeat.NORTH,
      input2: [0, 1, 2] as any
    });

    expect(state.setupState.setupCompletedSeats).toContain(PlayerSeat.NORTH);
    expect(state.players[PlayerSeat.NORTH].trenchCards.every(c => c !== null)).toBe(true);
    expect(state.players[PlayerSeat.NORTH].baseDeck.length).toBe(3);
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

    // Snapshot taken during post combat delay
    const snapshot = fastCloneState(state);
    expect(snapshot.pendingCombat).toBeDefined();
    expect(snapshot.pendingCombat?.attackerHand).toBeDefined();
    expect(snapshot.pendingCombat?.defenderHand).toBeDefined();
    expect(snapshot.isCombatDelaying).toBe(true);
    expect(snapshot.isTurnRiverRevealed).toBe(true);

    // Step 2: Complete post combat
    completePostCombat(state, result.pendingCombat!);
    expect(state.isCombatDelaying).toBe(false);
    expect(state.pendingCombat).toBeNull();

    // Snapshot remains intact with deep copy
    expect(snapshot.pendingCombat).toBeDefined();
    expect(snapshot.isCombatDelaying).toBe(true);
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
      state.players[PlayerSeat.NORTH].baseDeck = state.players[PlayerSeat.NORTH].baseDeck.slice(0, 3);
      const initialNorthDeckCount = state.players[PlayerSeat.NORTH].baseDeck.length; // 3
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
        state.players[seat].baseDeck = state.players[seat].baseDeck.slice(0, 3);
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
      expect(state.players[PlayerSeat.NORTH].baseDeck.length).toBe(5);

      const granted = grantHillCardReward(state, PlayerSeat.NORTH);
      expect(granted).toBe(false);
      expect(state.players[PlayerSeat.NORTH].baseDeck.length).toBe(5);
    });

    it('should grant hill bonus on combat victory when attacker moves onto hill', () => {
      const state = createInitialGameState({ skipSetup: true });
      state.players[PlayerSeat.NORTH].baseDeck = state.players[PlayerSeat.NORTH].baseDeck.slice(0, 3);
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
      state.players[PlayerSeat.NORTH].baseDeck = state.players[PlayerSeat.NORTH].baseDeck.slice(0, 3);
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
      state.players[PlayerSeat.NORTH].baseDeck = state.players[PlayerSeat.NORTH].baseDeck.slice(0, 3);
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
      state.players[PlayerSeat.SOUTH].baseDeck = state.players[PlayerSeat.SOUTH].baseDeck.slice(0, 3);
      state.players[PlayerSeat.NORTH].baseDeck = state.players[PlayerSeat.NORTH].baseDeck.slice(0, 3);
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
      state.players[PlayerSeat.NORTH].baseDeck = state.players[PlayerSeat.NORTH].baseDeck.slice(0, 3);
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
      state.players[PlayerSeat.NORTH].baseDeck = state.players[PlayerSeat.NORTH].baseDeck.slice(0, 3);
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
      state.players[PlayerSeat.NORTH].baseDeck = state.players[PlayerSeat.NORTH].baseDeck.slice(0, 3);
      // East enemy piece on hill square 27
      state.board[27] = 1 | 8;
      // North pawn on square 19
      state.board[19] = 1;

      const initialNorthDeckCount = state.players[PlayerSeat.NORTH].baseDeck.length; // 3

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

    it('should grant hill bonus before card refill so a player with 0 base deck cards can refill their empty trench card on combat victory', () => {
      const state = createInitialGameState({ skipSetup: true });
      // North has 0 cards in baseDeck
      state.players[PlayerSeat.NORTH].baseDeck = [];
      // East enemy piece on hill square 27
      state.board[27] = 1 | 8;
      // North pawn on square 19
      state.board[19] = 1;

      // North attacks hill square 27 from square 19 and wins
      const result = applyAction(state, {
        type: 'MOVE',
        input1: 19,
        input2: 27
      }, { deferPostCombat: true, forceCombatWinner: PlayerSeat.NORTH });

      expect(result.combatOccurred).toBe(true);

      // Resolve combat with North winning:
      // 1) North steals defender card (+1 in baseDeck)
      // 2) North occupies hill square 27, receives hill bonus (+1 in baseDeck) -> baseDeck has 2 cards
      // 3) Trench refill happens last: North refills used trench card (-1 from baseDeck) -> baseDeck has 1 card
      // Result: Trench has NO empty slots (all 3 filled), and 1 private card remains in baseDeck.
      executeCombatResolution(state, result.pendingCombat!, { forceCombatWinner: PlayerSeat.NORTH });
      completePostCombat(state, result.pendingCombat!, { autoCardPick: true });

      expect(isSeatOccupyingHill(state.board, PlayerSeat.NORTH)).toBe(true);
      expect(state.players[PlayerSeat.NORTH].baseDeck.length).toBe(1);
      expect(state.players[PlayerSeat.NORTH].trenchCards.includes(null)).toBe(false);
    });

    it('should refill an empty trench card using hill bonus on a non-combat move onto hill when baseDeck had 0 cards', () => {
      const state = createInitialGameState({ skipSetup: true });
      // North has 0 baseDeck cards and an empty trench slot (slot 1)
      state.players[PlayerSeat.NORTH].baseDeck = [];
      state.players[PlayerSeat.NORTH].trenchCards[1] = null;
      expect(state.players[PlayerSeat.NORTH].trenchCards[1]).toBeNull();

      // North pawn on square 19 moves to hill square 27 (non-combat move)
      state.board[19] = 1;

      applyAction(state, {
        type: 'MOVE',
        input1: 19,
        input2: 27
      });

      // North moved onto hill:
      // 1) Hill bonus granted (+1 in baseDeck)
      // 2) Refill happens last: empty trench slot 1 is refilled using the bonus card (-1 from baseDeck)
      // Result: Trench is fully refilled (no nulls), baseDeck has 0 cards, no empty position card with private card!
      expect(isSeatOccupyingHill(state.board, PlayerSeat.NORTH)).toBe(true);
      expect(state.players[PlayerSeat.NORTH].trenchCards.includes(null)).toBe(false);
      expect(state.players[PlayerSeat.NORTH].baseDeck.length).toBe(0);
    });

    it('should refill trench card using hill bonus when attacker on hill loses combat with 0 base deck cards', () => {
      const state = createInitialGameState({ skipSetup: true });
      // North has 0 baseDeck cards
      state.players[PlayerSeat.NORTH].baseDeck = [];
      // North has a piece on hill square 27
      state.board[27] = 1;
      // North pawn on square 10 attacks enemy on square 18 (not hill)
      state.board[10] = 1;
      state.board[18] = 9;

      const result = applyAction(state, {
        type: 'MOVE',
        input1: 10,
        input2: 18
      }, { deferPostCombat: true, forceCombatWinner: PlayerSeat.EAST });

      expect(result.combatOccurred).toBe(true);

      // Resolve combat with East winning (North loses):
      // 1) North does NOT steal defender card.
      // 2) North still occupies hill square 27, receives hill bonus (+1 in baseDeck).
      // 3) Refill happens last: North refills used trench card using the hill bonus card (-1 from baseDeck).
      // Result: Trench cards are full (no nulls), baseDeck has 0 cards.
      executeCombatResolution(state, result.pendingCombat!, { forceCombatWinner: PlayerSeat.EAST });
      completePostCombat(state, result.pendingCombat!, { autoCardPick: true });

      expect(isSeatOccupyingHill(state.board, PlayerSeat.NORTH)).toBe(true);
      expect(state.players[PlayerSeat.NORTH].trenchCards.includes(null)).toBe(false);
      expect(state.players[PlayerSeat.NORTH].baseDeck.length).toBe(0);
    });

    it('should allow human player with autoCardPick: false to see both stolen card and hill bonus in baseDeck during manual refill', () => {
      const state = createInitialGameState({ skipSetup: true });
      state.players[PlayerSeat.NORTH].baseDeck = [];
      state.board[27] = 1 | 8; // East enemy on hill
      state.board[19] = 1; // North pawn

      const result = applyAction(state, {
        type: 'MOVE',
        input1: 19,
        input2: 27
      }, { deferPostCombat: true, forceCombatWinner: PlayerSeat.NORTH });

      executeCombatResolution(state, result.pendingCombat!, { forceCombatWinner: PlayerSeat.NORTH });
      completePostCombat(state, result.pendingCombat!, { autoCardPick: false });

      // Before human manual refill:
      // North has 2 cards in baseDeck (stolen card + hill bonus card)
      expect(state.players[PlayerSeat.NORTH].baseDeck.length).toBe(2);
      expect(state.pendingRefills.length).toBeGreaterThan(0);
      expect(state.pendingRefills.some(pr => pr.seat === PlayerSeat.NORTH)).toBe(true);

      // Human chooses card 0 from baseDeck to refill trench slot
      const northRefill = state.pendingRefills.find(pr => pr.seat === PlayerSeat.NORTH)!;
      applyAction(state, {
        type: 'REFILL_TRENCH',
        input1: northRefill.slot,
        input2: 0
      }, { autoCardPick: true });

      // Now North trench is refilled and 1 card remains in baseDeck
      expect(state.players[PlayerSeat.NORTH].trenchCards[northRefill.slot]).not.toBeNull();
      expect(state.players[PlayerSeat.NORTH].baseDeck.length).toBe(1);
    });
    it('should order pendingRefills in natural clockwise turn cycle starting from attackerSeat', () => {
      const state = createInitialGameState({ skipSetup: true });
      // South (seat 2) attacks West (seat 3)
      const combatSouth: any = {
        attackerSeat: PlayerSeat.SOUTH,
        defenderSeat: PlayerSeat.WEST,
        attackerPosIndex: 44,
        defenderPosIndex: 36,
        winnerSeat: PlayerSeat.SOUTH
      };
      processPostCombat(state, combatSouth);
      expect(state.pendingRefills.map(pr => pr.seat)).toEqual([
        PlayerSeat.SOUTH, // 2 (Attacker)
        PlayerSeat.WEST,  // 3 (Defender)
        PlayerSeat.NORTH, // 0 (Attacker Teammate)
        PlayerSeat.EAST   // 1 (Defender Teammate)
      ]);
    });

    it('should deal community cards with burn cards to bottom: flop (3), burn 1, turn (1), burn 1, river (1)', () => {
      // Mock deck with named cards from bottom (index 0) to top (last index)
      const c = (id: string) => ({ id, suit: 'S' as const, rank: 10 as const });
      const deck = [
        c('base1'), c('base2'), c('base3'), // Bottom of deck
        c('flop1'), c('flop2'), c('flop3'), // Flop cards (top)
        c('burn1'),                         // Card before turn (will be burned)
        c('turn'),                          // Turn card
        c('burn2'),                         // Card before river (will be burned)
        c('river')                          // River card (topmost)
      ];
      // Note: pop() pulls from the end of the array.
      // Order of pop():
      // 1. flop3 = river (idx 9)? Wait!
      // In dealCommunityCards:
      // flop draws deck.pop() x 3.
      // Then burn1 draws deck.pop(), unshifts to bottom.
      // Then turn draws deck.pop().
      // Then burn2 draws deck.pop(), unshifts to bottom.
      // Then river draws deck.pop().

      // Let's set the deck array explicitly in the order they will be popped from the top:
      const deck2 = [
        c('bottom1'), c('bottom2'),
        c('river'),
        c('burn2'),
        c('turn'),
        c('burn1'),
        c('flop3'),
        c('flop2'),
        c('flop1') // Top of deck
      ];

      const result = dealCommunityCards(deck2);

      // Flop should have received flop1, flop2, flop3
      expect(result.publicFlop.map(x => x?.id)).toEqual(['flop1', 'flop2', 'flop3']);
      // Turn should have received 'turn'
      expect(result.publicTurnRiver[0]?.id).toBe('turn');
      // River should have received 'river'
      expect(result.publicTurnRiver[1]?.id).toBe('river');

      // Burn cards were placed at the bottom of the deck via unshift:
      // burn1 was unshifted first, then burn2 was unshifted in front of it.
      expect(deck2[0]?.id).toBe('burn2');
      expect(deck2[1]?.id).toBe('burn1');
      expect(deck2[2]?.id).toBe('bottom1');
      expect(deck2[3]?.id).toBe('bottom2');
    });
  });
});



