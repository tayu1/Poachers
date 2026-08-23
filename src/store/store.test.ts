import { describe, expect, it } from 'vitest';
import { PlayerSeat } from '../core/types';
import { store } from './store';

describe('GameStore Fast Bot Mode', () => {
  it('should initialize fast bot mode when startBotFastMatch is called', () => {
    store.startBotFastMatch();

    expect(store.isLocalGame).toBe(true);
    expect(store.botSpeedMs).toBe(10);
    expect(store.botSeats[PlayerSeat.NORTH]).toBe(true);
    expect(store.botSeats[PlayerSeat.EAST]).toBe(true);
    expect(store.botSeats[PlayerSeat.SOUTH]).toBe(true);
    expect(store.botSeats[PlayerSeat.WEST]).toBe(true);
  });

  it('should restore normal settings when leaveLocalGame is called', () => {
    store.startBotFastMatch();
    store.leaveLocalGame();

    expect(store.isLocalGame).toBe(false);
    expect(store.botSpeedMs).toBe(1500);
    expect(store.botSeats[PlayerSeat.NORTH]).toBe(false);
    expect(store.botSeats[PlayerSeat.EAST]).toBe(true);
    expect(store.botSeats[PlayerSeat.SOUTH]).toBe(false);
    expect(store.botSeats[PlayerSeat.WEST]).toBe(true);
  });
});

describe('GameStore Starting Player Logic', () => {
  it('should assign a valid starting seat index between 0 and 3', () => {
    expect([0, 1, 2, 3]).toContain(store.startingSeatIndex);
    expect(store.getState().activePlayer).toBe(store.startingSeatIndex);
  });

  it('should advance to the next seat on rematch', () => {
    const initialSeat = store.startingSeatIndex;
    store.resetGame(true); // isRematch = true
    const expectedSeat = (initialSeat + 1) % 4;
    expect(store.startingSeatIndex).toBe(expectedSeat);
    expect(store.getState().activePlayer).toBe(expectedSeat as PlayerSeat);
  });

  it('should reset starting seat when non-rematch reset occurs', () => {
    store.resetGame(false); // isRematch = false
    expect([0, 1, 2, 3]).toContain(store.startingSeatIndex);
    expect(store.getState().activePlayer).toBe(store.startingSeatIndex as PlayerSeat);
  });
});

describe('GameStore Network State Deserialization', () => {
  it('should deserialize Buffer/Array board state into proper Uint8Array', () => {
    const rawBoardData = new Array(64).fill(0);
    rawBoardData[0] = 1; // Team A Pawn
    rawBoardData[63] = 9; // Team B Pawn

    const mockBufferObjectState: any = {
      board: { type: 'Buffer', data: rawBoardData },
      deadPoolCounts: { type: 'Buffer', data: new Array(16).fill(0) },
      activePlayer: 0,
      players: {
        0: { baseDeck: [], trenchCards: [null, null, null] },
        1: { baseDeck: [], trenchCards: [null, null, null] },
        2: { baseDeck: [], trenchCards: [null, null, null] },
        3: { baseDeck: [], trenchCards: [null, null, null] }
      },
      deck: [],
      publicFlop: [],
      publicTurnRiver: [],
      isTurnRiverRevealed: false,
      deadPool: [],
      turnCount: 1,
      hasSwappedThisTurn: false,
      isGameOver: false,
      winnerTeam: null,
      score: { teamA: 0, teamB: 0 },
      threatenedKings: []
    };

    store.applyServerGameState(mockBufferObjectState, []);
    const currentState = store.getState();

    expect(currentState.board).toBeInstanceOf(Uint8Array);
    expect(currentState.board.length).toBe(64);
    expect(currentState.board[0]).toBe(1);
    expect(currentState.board[63]).toBe(9);
  });

  it('should deserialize threatMap from ArrayBuffer and allow legal moves generation', () => {
    const rawBoardData = new Array(64).fill(0);
    rawBoardData[11] = 1; // Team A North Pawn at index 11

    const initialBoard = new Uint8Array(64);
    initialBoard[11] = 1;
    const realThreatMap = new Uint8Array(4096);
    realThreatMap[(11 << 6) + 19] = 1; // CellMark.MOVE = 1 to square 19
    const arrayBuffer = realThreatMap.buffer.slice(0);

    const mockStateWithArrayBuffer: any = {
      board: rawBoardData,
      threatMap: arrayBuffer,
      deadPoolCounts: new Array(16).fill(0),
      activePlayer: 0,
      players: {
        0: { baseDeck: [], trenchCards: [null, null, null] },
        1: { baseDeck: [], trenchCards: [null, null, null] },
        2: { baseDeck: [], trenchCards: [null, null, null] },
        3: { baseDeck: [], trenchCards: [null, null, null] }
      },
      deck: [],
      publicFlop: [],
      publicTurnRiver: [],
      isTurnRiverRevealed: false,
      deadPool: [],
      turnCount: 1,
      hasSwappedThisTurn: false,
      isGameOver: false,
      winnerTeam: null,
      score: { teamA: 0, teamB: 0 },
      threatenedKings: []
    };

    store.applyServerGameState(mockStateWithArrayBuffer, []);
    const currentState = store.getState();

    expect(currentState.threatMap).toBeInstanceOf(Uint8Array);
    expect(currentState.threatMap.length).toBe(4096);
    expect(currentState.threatMap[(11 << 6) + 19]).toBe(1);
  });

  it('should regenerate threatMap if all zeros or missing from server state', () => {
    const rawBoardData = new Array(64).fill(0);
    rawBoardData[11] = 1; // Team A North Pawn at index 11 (row 1, col 3)

    const mockStateWithAllZeros: any = {
      board: rawBoardData,
      threatMap: new Uint8Array(4096), // All zeros
      deadPoolCounts: new Array(16).fill(0),
      activePlayer: 0,
      players: {
        0: { baseDeck: [], trenchCards: [null, null, null] },
        1: { baseDeck: [], trenchCards: [null, null, null] },
        2: { baseDeck: [], trenchCards: [null, null, null] },
        3: { baseDeck: [], trenchCards: [null, null, null] }
      },
      deck: [],
      publicFlop: [],
      publicTurnRiver: [],
      isTurnRiverRevealed: false,
      deadPool: [],
      turnCount: 1,
      hasSwappedThisTurn: false,
      isGameOver: false,
      winnerTeam: null,
      score: { teamA: 0, teamB: 0 },
      threatenedKings: []
    };

    store.applyServerGameState(mockStateWithAllZeros, []);
    const currentState = store.getState();

    expect(currentState.threatMap).toBeInstanceOf(Uint8Array);
    expect(currentState.threatMap.length).toBe(4096);

    let hasMoves = false;
    for (let i = 0; i < 64; i++) {
      if (currentState.threatMap[(11 << 6) + i] !== 0) {
        hasMoves = true;
        break;
      }
    }
    expect(hasMoves).toBe(true);
  });
});
