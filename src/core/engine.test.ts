import { describe, it, expect } from 'vitest';
import { createInitialGameState, applyAction, completePostCombat, executeCombatResolution, fastCloneState, isSeatOccupyingHill, grantHillCardReward, autoFillEmptySlots, advanceTurn, getPlayerEmptySlot, addCardToPlayerSlots } from './engine';
import { processPostCombat, dealCommunityCards, swapPlayerCards, syncPlayerReserve, isValidCardSwap } from './cards';
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
    // Each player starts with 3 top trench cards and 3 backup cards (6 cards total)
    expect(state.players[PlayerSeat.NORTH].trenchCards.every(c => c !== null)).toBe(true);
    expect(state.players[PlayerSeat.NORTH].trenchCards.length).toBe(3);
    expect(state.players[PlayerSeat.NORTH].backupCards?.every(c => c !== null)).toBe(true);
    expect(state.players[PlayerSeat.NORTH].backupCards?.length).toBe(3);
    expect(state.players[PlayerSeat.NORTH].baseDeck.length).toBe(3);
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
      state.players[PlayerSeat.NORTH].backupCards = [null, null, null];
      state.players[PlayerSeat.NORTH].baseDeck = [];
      const initialNorthDeckCount = 0;
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
        state.players[seat].backupCards = [null, null, null];
        state.players[seat].baseDeck = [];
        const initialCount = 0;

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

    it('should not grant card if baseDeck is already at MAX_BASE_DECK_SIZE (3)', () => {
      const state = createInitialGameState({ skipSetup: true });
      state.board[27] = 1;
      expect(state.players[PlayerSeat.NORTH].baseDeck.length).toBe(3);

      const granted = grantHillCardReward(state, PlayerSeat.NORTH);
      expect(granted).toBe(false);
      expect(state.players[PlayerSeat.NORTH].baseDeck.length).toBe(3);
    });

    it('should grant hill bonus on combat victory when attacker moves onto hill', () => {
      const state = createInitialGameState({ skipSetup: true });
      state.players[PlayerSeat.NORTH].backupCards = [null, null, null];
      state.players[PlayerSeat.NORTH].baseDeck = [];
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

      const initialNorthDeckCount = 0;

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
      state.players[PlayerSeat.NORTH].backupCards = [null, null, null];
      state.players[PlayerSeat.NORTH].baseDeck = [];
      // North pawn on hill square 27
      state.board[27] = 1;
      // Add dead rook to pool
      state.deadPoolCounts[4] = 1;

      const initialNorthDeckCount = 0;

      applyAction(state, {
        type: 'PROMOTION',
        input1: 4, // Rook
        input2: 27 // square 27
      });

      // North promoted on square 27 and remains on hill
      expect(state.board[27]).toBe(4); // Rook
      expect(state.players[PlayerSeat.NORTH].baseDeck.length).toBe(initialNorthDeckCount + 1);
    });

    it('should grant hill bonus on bunker action when occupying hill', () => {
      const state = createInitialGameState({ skipSetup: true });
      state.players[PlayerSeat.NORTH].backupCards = [null, null, null];
      state.players[PlayerSeat.NORTH].baseDeck = [];
      // Free up North flank bunkers so bunker count is < 2
      state.board[10] &= ~16;
      state.board[13] &= ~16;
      // North piece on hill square 27
      state.board[27] = 1;
      // North unbunkered pawn on square 10
      state.board[10] = 1;

      const initialNorthDeckCount = 0;

      applyAction(state, {
        type: 'SET_BUNKER',
        input1: 10
      });

      expect(state.players[PlayerSeat.NORTH].baseDeck.length).toBe(initialNorthDeckCount + 1);
    });

    it('should grant hill bonus to South when South moves onto South hill (square 35)', () => {
      const state = createInitialGameState({ skipSetup: true, startingPlayer: PlayerSeat.SOUTH });
      expect(state.activePlayer).toBe(PlayerSeat.SOUTH);
      state.players[PlayerSeat.SOUTH].backupCards = [null, null, null];
      state.players[PlayerSeat.SOUTH].baseDeck = [];
      state.players[PlayerSeat.NORTH].backupCards = [null, null, null];
      state.players[PlayerSeat.NORTH].baseDeck = [];
      const initialSouthDeckCount = 0;
      const initialNorthDeckCount = 0;

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
      state.players[PlayerSeat.NORTH].backupCards = [null, null, null];
      state.players[PlayerSeat.NORTH].baseDeck = [];
      // North piece on hill square 27
      state.board[27] = 1;

      const initialNorthDeckCount = 0;

      applyAction(state, {
        type: 'SKIP_TURN',
        input1: undefined,
        input2: null
      });

      expect(state.players[PlayerSeat.NORTH].baseDeck.length).toBe(initialNorthDeckCount + 1);
    });

    it('should grant hill bonus when advancing onto the hill at turn end', () => {
      const state = createInitialGameState({ skipSetup: true });
      state.players[PlayerSeat.NORTH].backupCards = [null, null, null];
      state.players[PlayerSeat.NORTH].baseDeck = [];
      // Place North pawn at square 19
      state.board[19] = 1;
      expect(isSeatOccupyingHill(state.board, PlayerSeat.NORTH)).toBe(false);

      const initialNorthDeckCount = 0;

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
      state.players[PlayerSeat.NORTH].backupCards = [null, null, null];
      state.players[PlayerSeat.NORTH].baseDeck = [];
      // East enemy piece on hill square 27
      state.board[27] = 1 | 8;
      // North pawn on square 19
      state.board[19] = 1;

      const initialNorthDeckCount = 0;

      // North attacks hill square 27 from square 19
      const result = applyAction(state, {
        type: 'MOVE',
        input1: 19,
        input2: 27
      }, { deferPostCombat: true, forceCombatWinner: PlayerSeat.NORTH });

      expect(result.combatOccurred).toBe(true);
      expect(result.pendingCombat).toBeDefined();

      // North poaches defender card (refills used trench slot via invariant) and gains hill bonus in baseDeck (+1)
      executeCombatResolution(state, result.pendingCombat!, { forceCombatWinner: PlayerSeat.NORTH });
      completePostCombat(state, result.pendingCombat!);

      expect(isSeatOccupyingHill(state.board, PlayerSeat.NORTH)).toBe(true);
      expect(state.players[PlayerSeat.NORTH].baseDeck.length).toBe(initialNorthDeckCount + 1);
      expect(state.players[PlayerSeat.NORTH].trenchCards.includes(null)).toBe(false);
    });

    it('should grant hill bonus and refill used trench slot with stolen card on combat victory', () => {
      const state = createInitialGameState({ skipSetup: true });
      state.players[PlayerSeat.NORTH].backupCards = [null, null, null];
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
      // 1) North steals defender card (refills empty trench slot via invariant)
      // 2) North occupies hill square 27, receives hill bonus in baseDeck (+1)
      executeCombatResolution(state, result.pendingCombat!, { forceCombatWinner: PlayerSeat.NORTH });
      completePostCombat(state, result.pendingCombat!);

      expect(isSeatOccupyingHill(state.board, PlayerSeat.NORTH)).toBe(true);
      expect(state.players[PlayerSeat.NORTH].baseDeck.length).toBe(1);
      expect(state.players[PlayerSeat.NORTH].trenchCards.includes(null)).toBe(false);
    });

    it('should refill empty trench slot when granted hill bonus per base-trench invariant', () => {
      const state = createInitialGameState({ skipSetup: true });
      // North has 0 baseDeck cards and an empty trench slot (slot 1)
      state.players[PlayerSeat.NORTH].backupCards = [null, null, null];
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
      // 1) Hill bonus granted to slot 1
      // 2) Base-trench invariant: trench slot 1 was empty, so card jumps from base 1 to trench 1
      expect(isSeatOccupyingHill(state.board, PlayerSeat.NORTH)).toBe(true);
      expect(state.players[PlayerSeat.NORTH].trenchCards[1]).not.toBeNull();
      expect(state.players[PlayerSeat.NORTH].backupCards[1]).toBeNull();
    });

    it('should grant hill bonus to refill empty trench slot when attacker on hill loses combat', () => {
      const state = createInitialGameState({ skipSetup: true });
      state.players[PlayerSeat.NORTH].backupCards = [null, null, null];
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
      // 2) North still occupies hill square 27, receives hill bonus.
      // 3) Following slot refill logic, the empty trench slot (slot 0) is refilled by the hill bonus card.
      executeCombatResolution(state, result.pendingCombat!, { forceCombatWinner: PlayerSeat.EAST });
      completePostCombat(state, result.pendingCombat!);

      expect(isSeatOccupyingHill(state.board, PlayerSeat.NORTH)).toBe(true);
      expect(state.players[PlayerSeat.NORTH].trenchCards.includes(null)).toBe(false);
      expect(state.players[PlayerSeat.NORTH].trenchCards[0]).not.toBeNull();
      expect(state.players[PlayerSeat.NORTH].baseDeck.length).toBe(0);
    });

    it('should allow player to refill empty trench slot from baseDeck on pre-turn swap', () => {
      const state = createInitialGameState({ skipSetup: true });
      state.players[PlayerSeat.NORTH].backupCards = [null, null, null];
      state.players[PlayerSeat.NORTH].baseDeck = [];
      state.board[27] = 1 | 8; // East enemy on hill
      state.board[19] = 1; // North pawn

      const result = applyAction(state, {
        type: 'MOVE',
        input1: 19,
        input2: 27
      }, { deferPostCombat: true, forceCombatWinner: PlayerSeat.NORTH });

      executeCombatResolution(state, result.pendingCombat!, { forceCombatWinner: PlayerSeat.NORTH });
      completePostCombat(state, result.pendingCombat!);

      // Post-combat: North has 1 card in baseDeck (hill bonus card) and full trench cards (stolen card jumped to trench)
      expect(state.players[PlayerSeat.NORTH].baseDeck.length).toBe(1);
      expect(state.pendingRefills.length).toBe(0);

      // On North's turn, North swaps trench card 0 with backup card 4
      state.activePlayer = PlayerSeat.NORTH;
      state.hasSwappedThisTurn = false;

      const swapResult = applyAction(state, {
        type: 'CARD_SWAP',
        input1: 0,
        input2: 4 // Center backup slot
      });

      expect(state.hasSwappedThisTurn).toBe(true);
      expect(state.players[PlayerSeat.NORTH].trenchCards[0]).not.toBeNull();
    });

    it('should allow player to refill empty trench slot from another trench slot on pre-turn swap', () => {
      const state = createInitialGameState({ skipSetup: true });
      const north = state.players[PlayerSeat.NORTH];
      north.backupCards = [null, null, null];
      north.trenchCards[0] = { id: 'C_AS', rank: 14, suit: 'S' };
      north.trenchCards[1] = null; // Empty slot
      north.trenchCards[2] = { id: 'C_KH', rank: 13, suit: 'H' };

      state.activePlayer = PlayerSeat.NORTH;
      state.hasSwappedThisTurn = false;

      // Move card from slot 0 into empty slot 1
      const swapResult = applyAction(state, {
        type: 'CARD_SWAP',
        input1: 0,
        input2: 1
      });

      expect(state.hasSwappedThisTurn).toBe(true);
      expect(north.trenchCards[0]).toBeNull();
      expect(north.trenchCards[1]?.id).toBe('C_AS');
      expect(swapResult.logText).toContain('Moved card to Trench slot 2.');
    });

    it('should not duplicate or auto-mutate cards on pre-pre-turn', () => {
      const state = createInitialGameState({ skipSetup: true });
      const north = state.players[PlayerSeat.NORTH];
      north.backupCards = [null, null, null];
      north.trenchCards = [null, null, null]; // All 3 slots completely empty

      state.activePlayer = PlayerSeat.NORTH;
      state.hasSwappedThisTurn = false;

      // Call autoFillEmptySlots
      const filled = autoFillEmptySlots(state, PlayerSeat.NORTH);

      expect(filled.length).toBe(0);
      expect(north.backupCards[0]).toBeNull();
      expect(north.backupCards[1]).toBeNull();
      expect(north.backupCards[2]).toBeNull();
      // CRITICAL: hasSwappedThisTurn must remain false!
      expect(state.hasSwappedThisTurn).toBe(false);
    });

    it('should not modify anything when turn advances via advanceTurn (no card duplication)', () => {
      const state = createInitialGameState({ skipSetup: true });
      const east = state.players[PlayerSeat.EAST];
      east.backupCards = [null, null, null];
      east.trenchCards = [
        { id: 'c_t0', rank: 10, suit: 'S' },
        null, // Slot 1 empty
        { id: 'c_t2', rank: 12, suit: 'H' },
      ];

      // Active player is North
      state.activePlayer = PlayerSeat.NORTH;
      state.turnCount = 1;

      // Advance turn to East
      advanceTurn(state);

      expect(state.activePlayer).toBe(PlayerSeat.EAST);
      expect(state.turnCount).toBe(2);
      expect(state.hasSwappedThisTurn).toBe(false);
      // Empty trench slot remains empty; no cards are created out of thin air
      expect(east.trenchCards[1]).toBeNull();
      expect(east.backupCards[1]).toBeNull();
    });

    it('should automatically replace consumed trench card with backup card at the end of combat without stealing defender card', () => {
      const state = createInitialGameState({ skipSetup: true });
      // South (seat 2) attacks West (seat 3) on square 36 (row 4, col 4 -> slot 1 for both)
      const southInitialBackup1 = state.players[PlayerSeat.SOUTH].backupCards[1];
      const westInitialBackup1 = state.players[PlayerSeat.WEST].backupCards[1];

      const combatSouth: any = {
        attackerSeat: PlayerSeat.SOUTH,
        defenderSeat: PlayerSeat.WEST,
        attackerPosIndex: 44,
        defenderPosIndex: 36,
        winnerSeat: PlayerSeat.SOUTH
      };
      processPostCombat(state, combatSouth);
      expect(state.pendingRefills).toEqual([]);
      // South's trench slot 1 was replaced by South's backup card 1:
      expect(state.players[PlayerSeat.SOUTH].trenchCards[1]?.id).toBe(southInitialBackup1?.id);
      // West's trench slot 1 was replaced by West's backup card 1:
      expect(state.players[PlayerSeat.WEST].trenchCards[1]?.id).toBe(westInitialBackup1?.id);
      expect(state.players[PlayerSeat.WEST].backupCards[1]).toBeNull();
      // South steals West's used card into backup cards:
      expect(state.players[PlayerSeat.SOUTH].backupCards[1]).not.toBeNull();
    });

    it('should clear pendingRefills post-combat and leave used slots null when no backup card exists and attacker loses', () => {
      const state = createInitialGameState({ skipSetup: true });
      state.players[PlayerSeat.SOUTH].backupCards = [null, null, null];
      state.players[PlayerSeat.WEST].backupCards = [null, null, null];
      // South (seat 2) attacks West (seat 3) and loses
      const combatSouth: any = {
        attackerSeat: PlayerSeat.SOUTH,
        defenderSeat: PlayerSeat.WEST,
        attackerPosIndex: 44,
        defenderPosIndex: 36,
        winnerSeat: PlayerSeat.WEST
      };
      processPostCombat(state, combatSouth);
      expect(state.pendingRefills).toEqual([]);
      expect(state.players[PlayerSeat.SOUTH].trenchCards.some(c => c === null)).toBe(true);
      expect(state.players[PlayerSeat.WEST].trenchCards.some(c => c === null)).toBe(true);
    });

    it('should swap cards between Trench slot and Backup slot (0..2 <-> 3..5)', () => {
      const state = createInitialGameState({ skipSetup: true });
      const north = state.players[PlayerSeat.NORTH];
      north.trenchCards[0] = { id: 'top_0', rank: 10, suit: 'D' };
      north.backupCards = [{ id: 'backup_0', rank: 9, suit: 'C' }, null, null];
      syncPlayerReserve(north);

      state.activePlayer = PlayerSeat.NORTH;
      state.hasSwappedThisTurn = false;

      // Swap Trench slot 0 with Backup slot 0 (index 3)
      const swapResult = applyAction(state, {
        type: 'CARD_SWAP',
        input1: 0,
        input2: 3
      });

      expect(swapResult.logText).toContain('Swapped Trench slot 1 with base deck.');
      expect(north.trenchCards[0]?.id).toBe('backup_0');
      expect(north.backupCards[0]?.id).toBe('top_0');
      expect(north.baseDeck[0]?.id).toBe('top_0');
    });

    it('should correctly execute trench-to-trench and backup-to-backup swaps', () => {
      const state = createInitialGameState({ skipSetup: true });
      const north = state.players[PlayerSeat.NORTH];
      state.activePlayer = PlayerSeat.NORTH;

      // 1. Trench-to-trench swap (0 <-> 1)
      north.trenchCards = [
        { id: 'top_0', rank: 10, suit: 'H' },
        { id: 'top_1', rank: 12, suit: 'S' },
        null
      ];
      state.hasSwappedThisTurn = false;
      const swapTrench = applyAction(state, { type: 'CARD_SWAP', input1: 0, input2: 1 });
      expect(swapTrench.logText).toContain('Swapped cards between Trench slot 1 and slot 2.');
      expect(north.trenchCards[0]?.id).toBe('top_1');
      expect(north.trenchCards[1]?.id).toBe('top_0');

      // 2. Backup-to-backup swap (3 <-> 4)
      north.backupCards = [
        { id: 'backup_0', rank: 5, suit: 'D' },
        { id: 'backup_1', rank: 6, suit: 'C' },
        null
      ];
      syncPlayerReserve(north);
      state.hasSwappedThisTurn = false;
      const swapBackup = applyAction(state, { type: 'CARD_SWAP', input1: 3, input2: 4 });
      expect(swapBackup.logText).toContain('Swapped Backup slot 1 and slot 2.');
      expect(north.backupCards[0]?.id).toBe('backup_1');
      expect(north.backupCards[1]?.id).toBe('backup_0');
    });

    it('should use backup card in combat when top card is absent and consume it, leaving slot empty', () => {
      const state = createInitialGameState({ skipSetup: true });
      const south = state.players[PlayerSeat.SOUTH];
      const west = state.players[PlayerSeat.WEST];

      // Setup slot 0 for South: top card is null, but has backup card
      south.trenchCards[0] = null;
      south.backupCards = [{ id: 'backup_S0', rank: 14, suit: 'S' }, null, null];
      syncPlayerReserve(south);

      // Setup slot 0 for West: top card is null, but has backup card
      west.trenchCards[0] = null;
      west.backupCards = [{ id: 'backup_W0', rank: 13, suit: 'H' }, null, null];
      syncPlayerReserve(west);

      // Combat occurs on defender pos 8 (col 0, row 1 -> attCardIdx: 0, defCardIdx: 0), defender wins
      const combat: any = {
        attackerSeat: PlayerSeat.SOUTH,
        defenderSeat: PlayerSeat.WEST,
        attackerPosIndex: 16,
        defenderPosIndex: 8,
        winnerSeat: PlayerSeat.WEST
      };

      processPostCombat(state, combat);

      // Both South and West backup cards were used in combat and are now consumed
      expect(south.backupCards[0]).toBeNull();
      expect(south.trenchCards[0]).toBeNull();
      expect(west.backupCards[0]).toBeNull();
      expect(west.trenchCards[0]).toBeNull();

      // Now South refills the completely empty trench slot 0 from backup card:
      south.backupCards = [{ id: 'card_1', rank: 10, suit: 'D' }, { id: 'card_2', rank: 11, suit: 'C' }, null];
      syncPlayerReserve(south);
      swapPlayerCards(state, PlayerSeat.SOUTH, 0, 3);
      expect(south.trenchCards[0]?.id).toBe('card_1');
      expect(south.backupCards[0]).toBeNull();
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

  describe('CARD_PASS Action (Passing base deck card to teammate)', () => {
    it('should successfully pass a card from active player to teammate when teammate has < 3 cards', () => {
      const state = createInitialGameState({ skipSetup: true });
      // Active player is North (Team A), teammate is South (Team A)
      expect(state.activePlayer).toBe(PlayerSeat.NORTH);
      // Give South room to receive a card (< 3 cards)
      state.players[PlayerSeat.SOUTH].backupCards[2] = null;
      syncPlayerReserve(state.players[PlayerSeat.SOUTH]);
      expect(state.players[PlayerSeat.SOUTH].baseDeck.length).toBe(2);

      const northCardToPass = state.players[PlayerSeat.NORTH].backupCards[1]!;
      const initialNorthCount = state.players[PlayerSeat.NORTH].baseDeck.length;

      const result = applyAction(state, { type: 'CARD_PASS', origin: 1 });

      expect(result.logText).toContain('Passed card');
      expect(state.players[PlayerSeat.NORTH].baseDeck.length).toBe(initialNorthCount - 1);
      expect(state.players[PlayerSeat.SOUTH].baseDeck.length).toBe(3);
      expect(state.players[PlayerSeat.SOUTH].backupCards[2]?.id).toBe(northCardToPass.id);

      // It counts as a card swap, not a full turn
      expect(state.hasSwappedThisTurn).toBe(true);
      expect(state.activePlayer).toBe(PlayerSeat.NORTH);
      expect(state.turnCount).toBe(1);
    });

    it('should immediately fill teammate empty trench slot when teammate has empty trench card', () => {
      const state = createInitialGameState({ skipSetup: true });
      expect(state.activePlayer).toBe(PlayerSeat.NORTH);

      // South has empty center trench slot
      state.players[PlayerSeat.SOUTH].trenchCards[1] = null;

      const northCardToPass = state.players[PlayerSeat.NORTH].backupCards[0]!;
      const result = applyAction(state, { type: 'CARD_PASS', origin: 0 });

      expect(result.logText).toContain('Passed card');
      // South's empty center trench card is immediately filled!
      expect(state.players[PlayerSeat.SOUTH].trenchCards[1]?.id).toBe(northCardToPass.id);
      expect(state.players[PlayerSeat.NORTH].backupCards[0]).toBeNull();
      expect(state.hasSwappedThisTurn).toBe(true);
    });

    it('should throw error if teammate already has 3 or more cards', () => {
      const state = createInitialGameState({ skipSetup: true });
      expect(state.players[PlayerSeat.SOUTH].baseDeck.length).toBe(3);

      expect(() => {
        applyAction(state, { type: 'CARD_PASS', origin: 0 });
      }).toThrow(/Teammate base deck is full/);
    });

    it('should throw error if swap has already been used this turn', () => {
      const state = createInitialGameState({ skipSetup: true });
      state.players[PlayerSeat.SOUTH].baseDeck = state.players[PlayerSeat.SOUTH].baseDeck.slice(0, 3);
      state.hasSwappedThisTurn = true;

      expect(() => {
        applyAction(state, { type: 'CARD_PASS', origin: 0 });
      }).toThrow(/already used this turn/);
    });

    it('should throw error for invalid card index', () => {
      const state = createInitialGameState({ skipSetup: true });
      state.players[PlayerSeat.SOUTH].baseDeck = state.players[PlayerSeat.SOUTH].baseDeck.slice(0, 3);

      expect(() => {
        applyAction(state, { type: 'CARD_PASS', origin: 99 });
      }).toThrow(/Invalid card selected to pass/);
    });
  });

  describe('New Card Slot Refill Logic (Card Steal / Hill Bonus / Card Pass)', () => {
    it('should determine empty slot priority: Trench Center (1) -> Right (2) -> Left (0) -> Backup Center (1) -> Right (2) -> Left (0)', () => {
      const state = createInitialGameState({ skipSetup: true });
      const north = state.players[PlayerSeat.NORTH];

      // 1. All empty: should pick Trench Center (1)
      north.trenchCards = [null, null, null];
      north.backupCards = [null, null, null];
      expect(getPlayerEmptySlot(north)).toEqual({ slotType: 'trench', slotIndex: 1 });

      // 2. Trench Center full, others empty: should pick Trench Right (2)
      north.trenchCards = [null, { id: 'c1', rank: 10, suit: 'H' }, null];
      expect(getPlayerEmptySlot(north)).toEqual({ slotType: 'trench', slotIndex: 2 });

      // 3. Trench Center & Right full, Left empty: should pick Trench Left (0)
      north.trenchCards = [null, { id: 'c1', rank: 10, suit: 'H' }, { id: 'c2', rank: 11, suit: 'S' }];
      expect(getPlayerEmptySlot(north)).toEqual({ slotType: 'trench', slotIndex: 0 });

      // 4. All Trench full, all Backup empty: should pick Backup Center (1)
      north.trenchCards = [
        { id: 'c0', rank: 9, suit: 'D' },
        { id: 'c1', rank: 10, suit: 'H' },
        { id: 'c2', rank: 11, suit: 'S' }
      ];
      north.backupCards = [null, null, null];
      expect(getPlayerEmptySlot(north)).toEqual({ slotType: 'backup', slotIndex: 1 });

      // 5. All Trench full, Backup Center full, others empty: should pick Backup Right (2)
      north.backupCards = [null, { id: 'b1', rank: 5, suit: 'C' }, null];
      expect(getPlayerEmptySlot(north)).toEqual({ slotType: 'backup', slotIndex: 2 });

      // 6. All Trench full, Backup Center & Right full, Left empty: should pick Backup Left (0)
      north.backupCards = [null, { id: 'b1', rank: 5, suit: 'C' }, { id: 'b2', rank: 6, suit: 'D' }];
      expect(getPlayerEmptySlot(north)).toEqual({ slotType: 'backup', slotIndex: 0 });

      // 7. All 6 slots full: should return null
      north.backupCards = [
        { id: 'b0', rank: 4, suit: 'H' },
        { id: 'b1', rank: 5, suit: 'C' },
        { id: 'b2', rank: 6, suit: 'D' }
      ];
      expect(getPlayerEmptySlot(north)).toBeNull();
    });

    it('Card Steal: should refill Center trench slot first even when combat occurred in Left slot', () => {
      const state = createInitialGameState({ skipSetup: true });
      const north = state.players[PlayerSeat.NORTH];
      const south = state.players[PlayerSeat.SOUTH];
      const east = state.players[PlayerSeat.EAST];

      // North has Left slot 0 full, Center slot 1 EMPTY, Right slot 2 full.
      // North has no backup cards.
      north.trenchCards = [
        { id: 'N_0', rank: 10, suit: 'H' },
        null, // Center empty
        { id: 'N_2', rank: 12, suit: 'S' }
      ];
      north.backupCards = [null, null, null];
      syncPlayerReserve(north);

      // East defender has card in slot 0
      east.trenchCards[0] = { id: 'E_0', rank: 9, suit: 'C' };

      // Combat on square 16 (Col 0 -> Left slot 0 for both North and East)
      const combat: any = {
        attackerSeat: PlayerSeat.NORTH,
        defenderSeat: PlayerSeat.EAST,
        attackerPosIndex: 24,
        defenderPosIndex: 16,
        winnerSeat: PlayerSeat.NORTH
      };

      processPostCombat(state, combat);

      // North used slot 0 in combat (consumed).
      // North won and steals East's card (E_0).
      // Slots needing refill: Center (1) and Left (0).
      // Per slot refill logic (first empty slots, starting from center):
      // The stolen card E_0 MUST go to Center (slot 1), not slot 0!
      expect(north.trenchCards[1]?.id).toBe('E_0');
      expect(north.trenchCards[0]).toBeNull();
    });

    it('Hill Bonus: should refill first empty Trench slot starting from center (not bypass to backup)', () => {
      const state = createInitialGameState({ skipSetup: true });
      const north = state.players[PlayerSeat.NORTH];

      // North has Center slot 1 empty, but slots 0 and 2 full.
      north.trenchCards = [
        { id: 'N_0', rank: 10, suit: 'H' },
        null, // Center empty
        { id: 'N_2', rank: 12, suit: 'S' }
      ];
      north.backupCards = [null, null, null];
      syncPlayerReserve(north);

      // Put North on North hill square 27
      state.board[27] = 1;
      expect(isSeatOccupyingHill(state.board, PlayerSeat.NORTH)).toBe(true);

      const topCard = state.deck[state.deck.length - 1];
      const granted = grantHillCardReward(state, PlayerSeat.NORTH);

      expect(granted).toBe(true);
      // Hill bonus card should fill Center trench slot (1)
      expect(north.trenchCards[1]?.id).toBe(topCard.id);
      expect(north.backupCards[1]).toBeNull();
      expect(north.baseDeck.length).toBe(0);

      // Next turn on hill: Trench is now full. Hill bonus should go to Backup Center (1).
      const nextTopCard = state.deck[state.deck.length - 1];
      const secondGranted = grantHillCardReward(state, PlayerSeat.NORTH);

      expect(secondGranted).toBe(true);
      expect(north.backupCards[1]?.id).toBe(nextTopCard.id);
      expect(north.baseDeck.length).toBe(1);
    });

    it('Card Pass: should refill teammate empty slot starting from center (trench first, then backup)', () => {
      const state = createInitialGameState({ skipSetup: true });
      state.activePlayer = PlayerSeat.NORTH;
      state.hasSwappedThisTurn = false;

      const south = state.players[PlayerSeat.SOUTH];
      // South has Center slot 1 full, Right slot 2 empty, Left slot 0 empty
      south.trenchCards = [
        null,
        { id: 'S_1', rank: 10, suit: 'D' },
        null
      ];
      south.backupCards = [null, null, null];
      syncPlayerReserve(south);

      const northCardToPass = state.players[PlayerSeat.NORTH].backupCards[0]!;
      // Pass card to teammate (South)
      applyAction(state, { type: 'CARD_PASS', origin: 0 });

      // Priority Center (1) -> Right (2) -> Left (0):
      // Center (1) is full, so Right (2) must be filled first!
      expect(south.trenchCards[2]?.id).toBe(northCardToPass.id);
      expect(south.trenchCards[0]).toBeNull();
    });

    it('Card Swap Rule: rejects moving a card from a trench slot without backup to an empty backup slot', () => {
      const state = createInitialGameState({ skipSetup: true });
      const north = state.players[PlayerSeat.NORTH];
      const c = (id: string, rank: number) => ({ id, suit: 'S' as const, rank: rank as any });

      // Setup North: Trench has cards, but slot 0 has NO backup (slot 3 is null)
      north.trenchCards = [c('t0', 10), c('t1', 11), c('t2', 12)];
      north.backupCards = [null, c('b1', 13), null]; // slot 3 is null, slot 4 has card, slot 5 is null
      syncPlayerReserve(north);

      // 1. Origin 0 (no backup) -> Target 3 (empty backup slot): REJECTED
      expect(isValidCardSwap(north, 0, 3)).toBe(false);
      expect(isValidCardSwap(north, 3, 0)).toBe(false);
      expect(swapPlayerCards(state, PlayerSeat.NORTH, 0, 3)).toBe(false);

      // 2. Origin 0 (no backup) -> Target 5 (empty backup slot): REJECTED
      expect(isValidCardSwap(north, 0, 5)).toBe(false);
      expect(isValidCardSwap(north, 5, 0)).toBe(false);
      expect(swapPlayerCards(state, PlayerSeat.NORTH, 0, 5)).toBe(false);

      // 3. Origin 0 (no backup) -> Target 4 (OCCUPIED backup slot): ALLOWED (swap/exchange)
      expect(isValidCardSwap(north, 0, 4)).toBe(true);
      expect(isValidCardSwap(north, 4, 0)).toBe(true);

      // 4. Origin 1 (HAS backup in slot 4) -> Target 3 (empty backup slot): ALLOWED
      expect(isValidCardSwap(north, 1, 3)).toBe(true);
      expect(isValidCardSwap(north, 3, 1)).toBe(true);

      // 5. Trench-to-trench: Origin 0 -> Target 1: ALLOWED
      expect(isValidCardSwap(north, 0, 1)).toBe(true);

      // 6. Backup-to-trench: Slot 4 (occupied) -> Slot 2 (if trench slot 2 was empty):
      north.trenchCards[2] = null;
      expect(isValidCardSwap(north, 4, 2)).toBe(true);
      expect(isValidCardSwap(north, 2, 4)).toBe(true);

      // 7. Verify engine applyAction throws for illegal swap
      state.activePlayer = PlayerSeat.NORTH;
      state.hasSwappedThisTurn = false;
      expect(() => {
        applyAction(state, { type: 'CARD_SWAP', input1: 0, input2: 5 });
      }).toThrow('Invalid card swap action');
    });
  });
});



