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

  it('should correctly determine isInMatch based on local and multiplayer state', () => {
    // 1. Initial / Lobby state
    store.leaveLocalGame();
    store.leaveMultiplayerRoom();
    expect(store.isInMatch()).toBe(false);

    // 2. Local game active
    store.startBotFastMatch();
    expect(store.isInMatch()).toBe(true);

    // 3. Left local game
    store.leaveLocalGame();
    expect(store.isInMatch()).toBe(false);

    // 4. In multiplayer waiting room
    store.setRoomState({
      roomCode: 'TEST',
      status: 'waiting',
      hostPlayerId: 'p1',
      players: {},
      seats: {
        [PlayerSeat.NORTH]: { isBot: false, isReady: false },
        [PlayerSeat.EAST]: { isBot: false, isReady: false },
        [PlayerSeat.SOUTH]: { isBot: false, isReady: false },
        [PlayerSeat.WEST]: { isBot: false, isReady: false }
      }
    });
    expect(store.isInMatch()).toBe(false);

    // 5. In multiplayer playing room
    store.setRoomState({
      roomCode: 'TEST',
      status: 'playing',
      hostPlayerId: 'p1',
      players: {},
      seats: {
        [PlayerSeat.NORTH]: { isBot: false, isReady: true },
        [PlayerSeat.EAST]: { isBot: false, isReady: true },
        [PlayerSeat.SOUTH]: { isBot: false, isReady: true },
        [PlayerSeat.WEST]: { isBot: false, isReady: true }
      }
    });
    expect(store.isInMatch()).toBe(true);

    // Clean up
    store.leaveMultiplayerRoom();
    expect(store.isInMatch()).toBe(false);
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

describe('GameStore Rematch Validation', () => {
  it('should allow rematch in local game', () => {
    store.leaveLocalGame();
    store.startBotFastMatch();
    expect(store.getRematchMode()).toBe('available');
    expect(store.canRematch()).toBe(true);
  });

  it('should allow rematch when 1 human takes 2 seats and 2 are bots (1B1B)', () => {
    store.setRoomState({
      roomCode: 'TEST',
      hostPlayerId: 'player1',
      status: 'playing',
      gameStarted: true,
      autoCardPick: true,
      isPublic: true,
      turnTimeLimit: 30,
      startingPlayerIds: ['player1'],
      players: {
        player1: {
          playerId: 'player1',
          name: 'Player 1',
          seat: PlayerSeat.NORTH,
          team: 'A',
          isHost: true,
          isReady: true,
          isOnline: true
        }
      },
      seats: {
        [PlayerSeat.NORTH]: { playerId: 'player1', name: 'Player 1', isBot: false, isReady: true },
        [PlayerSeat.EAST]: { playerId: null, name: null, isBot: true, isReady: true },
        [PlayerSeat.SOUTH]: { playerId: 'player1', name: 'Player 1', isBot: false, isReady: true },
        [PlayerSeat.WEST]: { playerId: null, name: null, isBot: true, isReady: true }
      }
    });

    expect(store.getRematchMode()).toBe('available');
    expect(store.canRematch()).toBe(true);
  });

  it('should allow instant rematch for 11BB (1 human on North & East, 2 bots on South & West)', () => {
    store.setRoomState({
      roomCode: 'TEST',
      hostPlayerId: 'player1',
      status: 'playing',
      gameStarted: true,
      autoCardPick: true,
      isPublic: true,
      turnTimeLimit: 30,
      startingPlayerIds: ['player1'],
      players: {
        player1: {
          playerId: 'player1',
          name: 'Player 1',
          seat: PlayerSeat.NORTH,
          team: 'A',
          isHost: true,
          isReady: true,
          isOnline: true
        }
      },
      seats: {
        [PlayerSeat.NORTH]: { playerId: 'player1', name: 'Player 1', isBot: false, isReady: true },
        [PlayerSeat.EAST]: { playerId: 'player1', name: 'Player 1', isBot: false, isReady: true },
        [PlayerSeat.SOUTH]: { playerId: null, name: null, isBot: true, isReady: true },
        [PlayerSeat.WEST]: { playerId: null, name: null, isBot: true, isReady: true }
      }
    });

    expect(store.getRematchMode()).toBe('available');
    expect(store.canRematch()).toBe(true);
  });

  it('should allow instant rematch for 1B1B after resignation', () => {
    store.setRoomState({
      roomCode: 'TEST',
      hostPlayerId: 'player1',
      status: 'ended',
      gameStarted: false,
      autoCardPick: true,
      isPublic: true,
      turnTimeLimit: 30,
      startingPlayerIds: ['player1'],
      players: {
        player1: {
          playerId: 'player1',
          name: 'Player 1',
          seat: PlayerSeat.NORTH,
          team: 'A',
          isHost: true,
          isReady: true,
          isOnline: true
        }
      },
      seats: {
        [PlayerSeat.NORTH]: { playerId: 'player1', name: 'Player 1', isBot: false, isReady: true },
        [PlayerSeat.EAST]: { playerId: null, name: null, isBot: true, isReady: true },
        [PlayerSeat.SOUTH]: { playerId: 'player1', name: 'Player 1', isBot: false, isReady: true },
        [PlayerSeat.WEST]: { playerId: null, name: null, isBot: true, isReady: true }
      }
    });

    expect(store.getRematchMode()).toBe('available');
    expect(store.canRematch()).toBe(true);
  });

  it('should allow instant rematch for B1B1 after resignation', () => {
    store.setRoomState({
      roomCode: 'TEST',
      hostPlayerId: 'player1',
      status: 'ended',
      gameStarted: false,
      autoCardPick: true,
      isPublic: true,
      turnTimeLimit: 30,
      startingPlayerIds: ['player1'],
      players: {
        player1: {
          playerId: 'player1',
          name: 'Player 1',
          seat: PlayerSeat.EAST,
          team: 'B',
          isHost: true,
          isReady: true,
          isOnline: true
        }
      },
      seats: {
        [PlayerSeat.NORTH]: { playerId: null, name: null, isBot: true, isReady: true },
        [PlayerSeat.EAST]: { playerId: 'player1', name: 'Player 1', isBot: false, isReady: true },
        [PlayerSeat.SOUTH]: { playerId: null, name: null, isBot: true, isReady: true },
        [PlayerSeat.WEST]: { playerId: 'player1', name: 'Player 1', isBot: false, isReady: true }
      }
    });

    expect(store.getRematchMode()).toBe('available');
    expect(store.canRematch()).toBe(true);
  });

  it('should disable rematch when there was 1 other human (1B2B -> startingPlayerIds length 2) and they left', () => {
    store.setRoomState({
      roomCode: 'TEST',
      hostPlayerId: 'player1',
      status: 'playing',
      gameStarted: true,
      autoCardPick: true,
      isPublic: true,
      turnTimeLimit: 30,
      startingPlayerIds: ['player1', 'player2'],
      players: {
        player1: {
          playerId: 'player1',
          name: 'Player 1',
          seat: PlayerSeat.NORTH,
          team: 'A',
          isHost: true,
          isReady: true,
          isOnline: true
        },
        player2: {
          playerId: 'player2',
          name: 'Player 2',
          seat: null,
          team: null,
          isHost: false,
          isReady: false,
          isOnline: false
        }
      },
      seats: {
        [PlayerSeat.NORTH]: { playerId: 'player1', name: 'Player 1', isBot: false, isReady: true },
        [PlayerSeat.EAST]: { playerId: null, name: null, isBot: true, isReady: true },
        [PlayerSeat.SOUTH]: { playerId: null, name: null, isBot: false, isReady: false },
        [PlayerSeat.WEST]: { playerId: null, name: null, isBot: true, isReady: true }
      }
    });

    expect(store.getRematchMode()).toBe('disabled');
    expect(store.canRematch()).toBe(false);
  });

  it('should allow rematch when 2 humans (1B2B) both remain online', () => {
    store.setRoomState({
      roomCode: 'TEST',
      hostPlayerId: 'player1',
      status: 'playing',
      gameStarted: true,
      autoCardPick: true,
      isPublic: true,
      turnTimeLimit: 30,
      startingPlayerIds: ['player1', 'player2'],
      players: {
        player1: {
          playerId: 'player1',
          name: 'Player 1',
          seat: PlayerSeat.NORTH,
          team: 'A',
          isHost: true,
          isReady: true,
          isOnline: true
        },
        player2: {
          playerId: 'player2',
          name: 'Player 2',
          seat: PlayerSeat.SOUTH,
          team: 'A',
          isHost: false,
          isReady: true,
          isOnline: true
        }
      },
      seats: {
        [PlayerSeat.NORTH]: { playerId: 'player1', name: 'Player 1', isBot: false, isReady: true },
        [PlayerSeat.EAST]: { playerId: null, name: null, isBot: true, isReady: true },
        [PlayerSeat.SOUTH]: { playerId: 'player2', name: 'Player 2', isBot: false, isReady: true },
        [PlayerSeat.WEST]: { playerId: null, name: null, isBot: true, isReady: true }
      }
    });

    expect(store.getRematchMode()).toBe('available');
    expect(store.canRematch()).toBe(true);
  });

  it('should return to lobby when there were 3+ humans (123B or 1234) and anyone left', () => {
    store.setRoomState({
      roomCode: 'TEST',
      hostPlayerId: 'player1',
      status: 'playing',
      gameStarted: true,
      autoCardPick: true,
      isPublic: true,
      turnTimeLimit: 30,
      startingPlayerIds: ['player1', 'player2', 'player3'],
      players: {
        player1: {
          playerId: 'player1',
          name: 'Player 1',
          seat: PlayerSeat.NORTH,
          team: 'A',
          isHost: true,
          isReady: true,
          isOnline: true
        },
        player2: {
          playerId: 'player2',
          name: 'Player 2',
          seat: PlayerSeat.SOUTH,
          team: 'A',
          isHost: false,
          isReady: true,
          isOnline: true
        },
        player3: {
          playerId: 'player3',
          name: 'Player 3',
          seat: null,
          team: null,
          isHost: false,
          isReady: false,
          isOnline: false
        }
      },
      seats: {
        [PlayerSeat.NORTH]: { playerId: 'player1', name: 'Player 1', isBot: false, isReady: true },
        [PlayerSeat.EAST]: { playerId: null, name: null, isBot: false, isReady: false },
        [PlayerSeat.SOUTH]: { playerId: 'player2', name: 'Player 2', isBot: false, isReady: true },
        [PlayerSeat.WEST]: { playerId: null, name: null, isBot: true, isReady: true }
      }
    });

    expect(store.getRematchMode()).toBe('return_to_lobby');
    expect(store.canRematch()).toBe(true);
  });
});

describe('GameStore History Replay and Indexing', () => {
  it('should support stepping through logbook entries', () => {
    store.resetGame(false, true); // initial state, history and logs empty
    expect(store.historyLength).toBe(0);
    expect(store.logs.length).toBe(0);

    // Simulate 3 moves with snapshots and logs
    store.recordSnapshot(); // history index 0 (Move 1)
    store.addLogEntry({ turnNumber: 1, seat: 'N', text: 'P : e2 -> e4' }); // log 0

    store.recordSnapshot(); // history index 1 (Move 2)
    store.addLogEntry({ turnNumber: 2, seat: 'E', text: 'N : c3 -> d5' }); // log 1

    store.recordSnapshot(); // history index 2 (Move 2)
    store.addLogEntry({ turnNumber: 3, seat: 'S', text: 'P : d7 -> d5' }); // log 2

    expect(store.logs.length).toBe(3);
    expect(store.historyLength).toBe(3);
    expect(store.activeLogIndex).toBe(2); // Last log by default in live state
    expect(store.isReplaying).toBe(false);

    // Step back to Log 1
    store.stepReplay('prev');
    expect(store.isReplaying).toBe(true);
    expect(store.activeLogIndex).toBe(1);
    expect(store.historyIndex).toBe(1);

    // Step back to Log 0 (first move)
    store.stepReplay('prev');
    expect(store.isReplaying).toBe(true);
    expect(store.activeLogIndex).toBe(0);
    expect(store.historyIndex).toBe(0);

    // Cannot step back before Log 0
    store.stepReplay('prev');
    expect(store.activeLogIndex).toBe(0);

    // Step forward to Log 1
    store.stepReplay('next');
    expect(store.activeLogIndex).toBe(1);
    expect(store.isReplaying).toBe(true);

    // Step forward to Log 2 (last log -> resumes live)
    store.stepReplay('next');
    expect(store.activeLogIndex).toBe(2);
    expect(store.isReplaying).toBe(false);

    // Direct scrub to Log 0 and live jump
    store.scrubToHistoryIndex(store.logs[0].historyIndex);
    expect(store.isReplaying).toBe(true);
    expect(store.activeLogIndex).toBe(0);

    store.stepReplay('live');
    expect(store.isReplaying).toBe(false);
    expect(store.activeLogIndex).toBe(2);
  });
});
