import { describe, it, expect } from 'vitest';
import { createInitialGameState, applyAction, getAllLegalActions } from './engine';
import { getLegalMoves1D, generateFullThreatMap, getPlayerBunkerCount } from './moves';
import { PlayerSeat, Pc, ActionType, decEnd } from './types';

describe('Bunker Mechanics', () => {
  it('should allow initial bunkered flank pawns to move to empty squares', () => {
    const state = createInitialGameState({ skipSetup: true, startingPlayer: PlayerSeat.NORTH });
    // Square 10 is North bunkered pawn (1 | 16 = 17)
    expect(state.board[10]).toBe(17);
    expect((state.board[10] & Pc.BUNKER_BIT)).toBe(16);

    const legalActions = getLegalMoves1D(state.board, 10, PlayerSeat.NORTH, state.threatMap);
    const targets = legalActions.map(a => decEnd(a));

    // Squares 9 (left) and 18 (forward/south) are empty
    expect(targets).toContain(9);
    expect(targets).toContain(18);

    // Square 2 (Rook) and 11 (Pawn) are friendly, not empty -> not in targets
    expect(targets).not.toContain(2);
    expect(targets).not.toContain(11);
  });

  it('should not allow bunkered pieces to move onto squares with enemy pieces (cannot attack)', () => {
    const state = createInitialGameState({ skipSetup: true, startingPlayer: PlayerSeat.NORTH });
    // Put an enemy piece at square 18
    state.board[18] = Pc.B_PAWN; // 9
    state.threatMap = generateFullThreatMap(state.board);

    const legalActions = getLegalMoves1D(state.board, 10, PlayerSeat.NORTH, state.threatMap);
    const targets = legalActions.map(a => decEnd(a));

    // Square 18 is occupied by enemy piece -> bunkered pawn CANNOT attack it
    expect(targets).not.toContain(18);
    // Square 9 is still empty -> can move there
    expect(targets).toContain(9);
  });

  it('should not exert threat from bunkered pieces', () => {
    const state = createInitialGameState({ skipSetup: true, startingPlayer: PlayerSeat.NORTH });
    // North has bunkered pawn at 10
    // Squares diagonally adjacent to 10 (e.g. 17, 19) should NOT be threatened by North Team A from square 10
    const rowOffset = 10 << 6;
    expect(state.threatMap[rowOffset + 17] & 2).toBe(0); // CellMark.THREAT is 0
    expect(state.threatMap[rowOffset + 19] & 2).toBe(0);
    expect(state.threatMap[rowOffset + 18] & 2).toBe(0);
    expect(state.threatMap[rowOffset + 9] & 2).toBe(0);
  });

  it('should strip the bunker flag when a bunkered piece moves', () => {
    const state = createInitialGameState({ skipSetup: true, startingPlayer: PlayerSeat.NORTH });
    expect(state.board[10]).toBe(17); // 1 | 16

    // Move North bunkered pawn to square 18
    const result = applyAction(state, {
      type: 'MOVE',
      input1: 10,
      input2: 18
    });

    expect(state.board[10]).toBe(0);
    // Square 18 now has the pawn WITHOUT the bunker bit
    expect(state.board[18]).toBe(1); // unbunkered Team A Pawn
    expect(state.board[18] & Pc.BUNKER_BIT).toBe(0);
    expect(result.logText).toContain('P : c7 -> c6');
  });

  it('should prevent bunkered pieces from attacking even if forced via executeTurnAction', () => {
    const state = createInitialGameState({ skipSetup: true, startingPlayer: PlayerSeat.NORTH });
    state.board[18] = Pc.B_PAWN;

    expect(() => {
      applyAction(state, {
        type: 'MOVE',
        input1: 10,
        input2: 18
      });
    }).toThrow('Bunkered pieces cannot attack');
  });

  it('should preserve bunker defense when enemy attacks a bunkered defender', () => {
    const state = createInitialGameState({ skipSetup: true, startingPlayer: PlayerSeat.EAST });
    // East turn, attacking North's bunkered pawn at square 10
    // Place East piece (Knight at square 18, which is adjacent to 10)
    state.board[18] = Pc.B_KNIGHT; // 10
    state.threatMap = generateFullThreatMap(state.board);

    // Force combat winner to be defender (North)
    const result = applyAction(state, {
      type: 'MOVE',
      input1: 18,
      input2: 10
    }, { forceCombatWinner: PlayerSeat.NORTH });

    // Defender won: attacker at 18 is destroyed; bunkered pawn at 10 remains bunkered!
    expect(state.board[18]).toBe(0);
    expect(state.board[10]).toBe(17);
    expect(result.logText).toContain('(X)');
  });

  it('should enforce the maximum of 2 bunkers per player limit', () => {
    const state = createInitialGameState({ skipSetup: true, startingPlayer: PlayerSeat.NORTH });
    // North initially has 2 bunkers (flank pawns at 10 and 13)
    expect(getPlayerBunkerCount(state.board, PlayerSeat.NORTH)).toBe(2);

    // Attempting to bunker a 3rd piece (Knight at square 5) must throw
    expect(() => {
      applyAction(state, {
        type: 'SET_BUNKER',
        input1: 5
      });
    }).toThrow('maximum of 2 bunkered pieces');

    // Move North bunkered pawn 10 -> 18 (loses bunker)
    applyAction(state, {
      type: 'MOVE',
      input1: 10,
      input2: 18
    });
    // North now has only 1 bunker (at square 13)
    expect(getPlayerBunkerCount(state.board, PlayerSeat.NORTH)).toBe(1);

    // Fast forward to North's turn again (East, South, West skip or move)
    state.activePlayer = PlayerSeat.NORTH;

    // Now North can bunker square 5 (Knight)
    expect(state.board[5]).toBe(2);
    const result = applyAction(state, {
      type: 'SET_BUNKER',
      input1: 5
    });

    // Square 5 is now bunkered (2 | 16 = 18)
    expect(state.board[5]).toBe(18);
    expect((state.board[5] & Pc.BUNKER_BIT)).toBe(16);
    expect(result.logText).toContain('bunker . f8');

    // North has 2 bunkers again (at 13 and 5)
    expect(getPlayerBunkerCount(state.board, PlayerSeat.NORTH)).toBe(2);

    // Attempting to bunker yet another piece (e.g. Bishop at square 4) must fail
    state.activePlayer = PlayerSeat.NORTH;
    expect(() => {
      applyAction(state, {
        type: 'SET_BUNKER',
        input1: 4
      });
    }).toThrow('maximum of 2 bunkered pieces');
  });

  it('should reject bunkering on Hill squares or opponent half', () => {
    const state = createInitialGameState({ skipSetup: true, startingPlayer: PlayerSeat.NORTH });
    // Free up a bunker slot so count < 2
    state.board[10] &= ~Pc.BUNKER_BIT;
    expect(getPlayerBunkerCount(state.board, PlayerSeat.NORTH)).toBe(1);

    // Place North piece on Hill square 27
    state.board[27] = Pc.A_PAWN;

    expect(() => {
      applyAction(state, {
        type: 'SET_BUNKER',
        input1: 27
      });
    }).toThrow('Cannot bunker piece on Hill square');

    // Place North piece on South half (row >= 4, e.g. square 40)
    state.board[40] = Pc.A_PAWN;
    expect(() => {
      applyAction(state, {
        type: 'SET_BUNKER',
        input1: 40
      });
    }).toThrow('not contain a piece controlled by active player');
  });

  it('should include moves for bunkered pieces and omit SET_BUNKER from getAllLegalActions for bots', () => {
    const state = createInitialGameState({ skipSetup: true, startingPlayer: PlayerSeat.NORTH });
    const actions = getAllLegalActions(state, PlayerSeat.NORTH);

    // Should not contain any SET_BUNKER actions
    const bunkerActions = actions.filter(a => ((a >>> 20) & 0x0F) === ActionType.SET_BUNKER);
    expect(bunkerActions.length).toBe(0);

    // Should contain moves from square 10 (bunkered pawn)
    const movesFrom10 = actions.filter(a => ((a >>> 14) & 0x3F) === 10);
    expect(movesFrom10.length).toBeGreaterThan(0);
  });
});
