import { describe, expect, it } from 'vitest';
import { PlayerSeat } from '../src/core/types';
import {
  assignInitialHostSeats,
  assignSeat,
  autoAssignSeat,
  clearPlayerSeats,
  createEmptySeats,
  ensureAllHumansSeated,
  findRoom,
  generateRoomCode,
  getPublicRoomsSummary,
  getSeatAssignmentCode,
  getSeatsForPlayer,
  rooms,
  toggleBot
} from './roomManager';
import { ServerPlayer, ServerRoom } from './types';

function createMockRoom(): { room: ServerRoom; host: ServerPlayer } {
  const host: ServerPlayer = {
    playerId: 'p1',
    name: 'Host Player',
    socketId: 'sock1',
    seat: null,
    team: null,
    isHost: true,
    isReady: false,
    isOnline: true
  };

  const room: ServerRoom = {
    roomCode: 'ABCD',
    hostPlayerId: 'p1',
    seats: createEmptySeats(),
    players: new Map([['p1', host]]),
    gameStarted: false,
    status: 'lobby',
    gameState: null,
    logs: [],
    botTimer: null,
    turnTimeout: null,
    autoCardPick: true,
    isPublic: true,
    turnTimeLimit: 30,
    rematchOffer: null,
    matchScore: { teamA: 0, teamB: 0 },
    startingSeatIndex: PlayerSeat.NORTH,
    startingPlayerIds: ['p1']
  };

  return { room, host };
}

describe('Server RoomManager - Unified Seat Management', () => {
  it('should default assign host to both seats of Team A (1E1E) when forceTeam is A', () => {
    const { room, host } = createMockRoom();
    const seats = assignInitialHostSeats(room, host, 'A');

    expect(seats).toEqual([PlayerSeat.NORTH, PlayerSeat.SOUTH]);
    expect(host.seat).toBe(PlayerSeat.NORTH);
    expect(host.team).toBe('A');
    expect(room.seats[PlayerSeat.NORTH].playerId).toBe('p1');
    expect(room.seats[PlayerSeat.SOUTH].playerId).toBe('p1');
    expect(room.seats[PlayerSeat.EAST].playerId).toBeNull();
    expect(room.seats[PlayerSeat.WEST].playerId).toBeNull();
    expect(getSeatAssignmentCode(room)).toBe('1E1E');
  });

  it('should default assign host to both seats of Team B (E1E1) when forceTeam is B', () => {
    const { room, host } = createMockRoom();
    const seats = assignInitialHostSeats(room, host, 'B');

    expect(seats).toEqual([PlayerSeat.EAST, PlayerSeat.WEST]);
    expect(host.seat).toBe(PlayerSeat.EAST);
    expect(host.team).toBe('B');
    expect(room.seats[PlayerSeat.EAST].playerId).toBe('p1');
    expect(room.seats[PlayerSeat.WEST].playerId).toBe('p1');
    expect(room.seats[PlayerSeat.NORTH].playerId).toBeNull();
    expect(room.seats[PlayerSeat.SOUTH].playerId).toBeNull();
    expect(getSeatAssignmentCode(room)).toBe('E1E1');
  });

  it('should randomly assign either 1E1E or E1E1 on room creation', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const { room, host } = createMockRoom();
      assignInitialHostSeats(room, host);
      const code = getSeatAssignmentCode(room);
      expect(['1E1E', 'E1E1']).toContain(code);
      codes.add(code);
    }
    expect(codes.has('1E1E')).toBe(true);
    expect(codes.has('E1E1')).toBe(true);
  });

  it('should auto-assign a 2nd joining player to open seat when host starts in 1E1E', () => {
    const { room, host } = createMockRoom();
    assignInitialHostSeats(room, host, 'A'); // 1E1E

    const p2: ServerPlayer = {
      playerId: 'p2',
      name: 'Player 2',
      socketId: 'sock2',
      seat: null,
      team: null,
      isHost: false,
      isReady: false,
      isOnline: true
    };
    room.players.set('p2', p2);

    const seat = autoAssignSeat(room, p2);
    expect(seat).toBe(PlayerSeat.EAST);
    expect(p2.seat).toBe(PlayerSeat.EAST);
    expect(p2.team).toBe('B');
    expect(room.seats[PlayerSeat.EAST].playerId).toBe('p2');
    expect(getSeatAssignmentCode(room)).toBe('121E');
  });

  it('should auto-assign a 2nd joining player to open seat when host starts in E1E1', () => {
    const { room, host } = createMockRoom();
    assignInitialHostSeats(room, host, 'B'); // E1E1

    const p2: ServerPlayer = {
      playerId: 'p2',
      name: 'Player 2',
      socketId: 'sock2',
      seat: null,
      team: null,
      isHost: false,
      isReady: false,
      isOnline: true
    };
    room.players.set('p2', p2);

    const seat = autoAssignSeat(room, p2);
    expect(seat).toBe(PlayerSeat.NORTH);
    expect(p2.seat).toBe(PlayerSeat.NORTH);
    expect(p2.team).toBe('A');
    expect(room.seats[PlayerSeat.NORTH].playerId).toBe('p2');
    expect(getSeatAssignmentCode(room)).toBe('21E1');
  });

  it('should auto-assign a 2nd joining player to South (open seat) resulting in 1E2E', () => {
    const { room, host } = createMockRoom();
    autoAssignSeat(room, host); // North

    const p2: ServerPlayer = {
      playerId: 'p2',
      name: 'Player 2',
      socketId: 'sock2',
      seat: null,
      team: null,
      isHost: false,
      isReady: false,
      isOnline: true
    };
    room.players.set('p2', p2);

    const seat = autoAssignSeat(room, p2);
    expect(seat).toBe(PlayerSeat.SOUTH);
    expect(p2.seat).toBe(PlayerSeat.SOUTH);
    expect(p2.team).toBe('A');
    expect(room.seats[PlayerSeat.SOUTH].playerId).toBe('p2');
    expect(getSeatAssignmentCode(room)).toBe('1E2E');
  });

  it('should auto-assign 3rd and 4th players into remaining empty seats', () => {
    const { room, host } = createMockRoom();
    autoAssignSeat(room, host); // North

    const p2: ServerPlayer = { playerId: 'p2', name: 'P2', socketId: 's2', seat: null, team: null, isHost: false, isReady: false, isOnline: true };
    const p3: ServerPlayer = { playerId: 'p3', name: 'P3', socketId: 's3', seat: null, team: null, isHost: false, isReady: false, isOnline: true };
    const p4: ServerPlayer = { playerId: 'p4', name: 'P4', socketId: 's4', seat: null, team: null, isHost: false, isReady: false, isOnline: true };

    room.players.set('p2', p2);
    room.players.set('p3', p3);
    room.players.set('p4', p4);

    autoAssignSeat(room, p2); // South -> 1E2E
    expect(getSeatAssignmentCode(room)).toBe('1E2E');

    const seat3 = autoAssignSeat(room, p3); // East -> 132E
    expect(seat3).toBe(PlayerSeat.EAST);
    expect(getSeatAssignmentCode(room)).toBe('132E');

    const seat4 = autoAssignSeat(room, p4); // West -> 1324
    expect(seat4).toBe(PlayerSeat.WEST);
    expect(getSeatAssignmentCode(room)).toBe('1324');

    // Attempting to add a 5th human returns null (room full)
    const p5: ServerPlayer = { playerId: 'p5', name: 'P5', socketId: 's5', seat: null, team: null, isHost: false, isReady: false, isOnline: true };
    expect(autoAssignSeat(room, p5)).toBeNull();
  });

  it('should correctly produce 11EE and 112E seat codes for multi-seat configs', () => {
    const { room, host } = createMockRoom();
    autoAssignSeat(room, host); // N -> 1EEE

    assignSeat(room, 'p1', PlayerSeat.EAST); // Host takes E -> 11EE
    expect(getSeatAssignmentCode(room)).toBe('11EE');

    const p2: ServerPlayer = { playerId: 'p2', name: 'P2', socketId: 's2', seat: null, team: null, isHost: false, isReady: false, isOnline: true };
    room.players.set('p2', p2);
    autoAssignSeat(room, p2); // P2 gets S -> 112E
    expect(getSeatAssignmentCode(room)).toBe('112E');
  });

  it('should prevent a player with only 1 seat from unseating to 0 seats', () => {
    const { room, host } = createMockRoom();
    autoAssignSeat(room, host); // North

    // Host clicks their own seat
    const res = assignSeat(room, 'p1', PlayerSeat.NORTH);
    expect(res.success).toBe(false);
    expect(res.error).toBe('You must maintain at least one assigned seat');
    expect(room.seats[PlayerSeat.NORTH].playerId).toBe('p1');
  });

  it('should allow a player with 2 seats to unseat one of their seats', () => {
    const { room, host } = createMockRoom();
    autoAssignSeat(room, host); // North

    // Host also claims South (multi-seat / 1B1B)
    const claimRes = assignSeat(room, 'p1', PlayerSeat.SOUTH);
    expect(claimRes.success).toBe(true);
    expect(getSeatsForPlayer(room, 'p1')).toEqual([PlayerSeat.NORTH, PlayerSeat.SOUTH]);

    // Host unseats South
    const unseatRes = assignSeat(room, 'p1', PlayerSeat.SOUTH);
    expect(unseatRes.success).toBe(true);
    expect(getSeatsForPlayer(room, 'p1')).toEqual([PlayerSeat.NORTH]);
    expect(room.seats[PlayerSeat.SOUTH].playerId).toBeNull();
  });

  it('should prevent host from toggling a human player with 1 seat to a bot', () => {
    const { room, host } = createMockRoom();
    autoAssignSeat(room, host); // North

    const p2: ServerPlayer = { playerId: 'p2', name: 'P2', socketId: 's2', seat: null, team: null, isHost: false, isReady: false, isOnline: true };
    room.players.set('p2', p2);
    autoAssignSeat(room, p2); // South

    const toggleRes = toggleBot(room, 'p1', PlayerSeat.SOUTH);
    expect(toggleRes.success).toBe(false);
    expect(toggleRes.error).toBe('Cannot replace a human player with a bot');
    expect(room.seats[PlayerSeat.SOUTH].playerId).toBe('p2');
  });

  it('should clear player seats when player leaves', () => {
    const { room, host } = createMockRoom();
    autoAssignSeat(room, host);
    assignSeat(room, 'p1', PlayerSeat.SOUTH);

    expect(getSeatsForPlayer(room, 'p1').length).toBe(2);

    clearPlayerSeats(room, 'p1');
    expect(getSeatsForPlayer(room, 'p1').length).toBe(0);
    expect(room.seats[PlayerSeat.NORTH].playerId).toBeNull();
    expect(room.seats[PlayerSeat.SOUTH].playerId).toBeNull();
  });

  it('should ensure all online humans are seated on lobby reset', () => {
    const { room, host } = createMockRoom();
    const p2: ServerPlayer = { playerId: 'p2', name: 'P2', socketId: 's2', seat: null, team: null, isHost: false, isReady: false, isOnline: true };
    room.players.set('p2', p2);

    // Both currently unseated
    expect(getSeatsForPlayer(room, 'p1').length).toBe(0);
    expect(getSeatsForPlayer(room, 'p2').length).toBe(0);

    ensureAllHumansSeated(room);

    expect(getSeatsForPlayer(room, 'p1').length).toBe(1);
    expect(getSeatsForPlayer(room, 'p2').length).toBe(1);
    expect(room.seats[PlayerSeat.NORTH].playerId).toBe('p1');
    expect(room.seats[PlayerSeat.SOUTH].playerId).toBe('p2');
  });

  it('should mask private room code as ---- in room summary', () => {
    const { room } = createMockRoom();
    room.isPublic = false;
    room.roomCode = 'SECRET';

    rooms.set('SECRET', room);

    const summaries = getPublicRoomsSummary();
    const secretRoom = summaries.find((r: any) => r.hostName === 'Host Player');

    expect(secretRoom).toBeDefined();
    expect(secretRoom.roomCode).toBe('----');
    expect(secretRoom.isPublic).toBe(false);

    rooms.delete('SECRET');
  });

  it('should prevent setting all 4 seats to bots', () => {
    const { room, host } = createMockRoom();
    autoAssignSeat(room, host); // North

    // Toggle South, East, West to bots
    toggleBot(room, 'p1', PlayerSeat.SOUTH);
    toggleBot(room, 'p1', PlayerSeat.EAST);
    toggleBot(room, 'p1', PlayerSeat.WEST);

    expect(room.seats[PlayerSeat.SOUTH].isBot).toBe(true);
    expect(room.seats[PlayerSeat.EAST].isBot).toBe(true);
    expect(room.seats[PlayerSeat.WEST].isBot).toBe(true);

    // North is the only non-bot seat. Attempting to make North a bot must fail.
    const res = toggleBot(room, 'p1', PlayerSeat.NORTH);
    expect(res.success).toBe(false);
    expect(res.error).toBe('Cannot replace a human player with a bot');
  });

  it('should only include distinct human player IDs in startingPlayerIds when bots are seated', () => {
    const { room, host } = createMockRoom();
    autoAssignSeat(room, host); // N = p1

    toggleBot(room, 'p1', PlayerSeat.EAST);
    toggleBot(room, 'p1', PlayerSeat.SOUTH);
    toggleBot(room, 'p1', PlayerSeat.WEST);

    const seats = [PlayerSeat.NORTH, PlayerSeat.EAST, PlayerSeat.SOUTH, PlayerSeat.WEST];
    const startingHumans = Array.from(new Set(
      seats
        .filter(s => !room.seats[s].isBot && room.seats[s].playerId !== null)
        .map(s => room.seats[s].playerId as string)
    ));

    expect(startingHumans).toEqual(['p1']);
    expect(startingHumans.length).toBe(1);
  });

  it('should generate valid 4-character room codes and find rooms case-insensitively', () => {
    const code = generateRoomCode();
    expect(typeof code).toBe('string');
    expect(code).toHaveLength(4);
    expect(code).toMatch(/^[A-Z0-9]{4}$/);

    const { room } = createMockRoom();
    room.roomCode = code;
    rooms.set(code, room);

    expect(findRoom(code)).toBe(room);
    expect(findRoom(code.toUpperCase())).toBe(room);
    expect(findRoom(`  ${code}  `)).toBe(room);

    rooms.delete(code);
  });
});
