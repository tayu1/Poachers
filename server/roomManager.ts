import { Server } from 'socket.io';
import { DEFAULT_TURN_TIME_LIMIT } from '../src/config';
import { getSeatCode } from '../src/core/notation';
import { PlayerSeat, Team } from '../src/core/types';
import { ClientToServerEvents, PublicRoomSummary, RoomPlayerInfo, RoomSeatSlot, RoomState, ServerToClientEvents } from '../src/net/events';
import { ServerPlayer, ServerRoom } from './types';

import { generateLobbyName } from '../src/core/lobbyNames';

export const rooms = new Map<string, ServerRoom>();

export function findRoom(code: string): ServerRoom | undefined {
  if (!code) return undefined;
  const trimmed = code.trim();
  return rooms.get(trimmed.toLowerCase()) || rooms.get(trimmed) || rooms.get(trimmed.toUpperCase());
}

export function getSeatTeam(seat: PlayerSeat): Team {
  return seat === PlayerSeat.NORTH || seat === PlayerSeat.SOUTH ? 'A' : 'B';
}

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

export function createEmptySeats(): Record<PlayerSeat, RoomSeatSlot> {
  return {
    [PlayerSeat.NORTH]: { playerId: null, name: null, isBot: false, isReady: false },
    [PlayerSeat.EAST]: { playerId: null, name: null, isBot: false, isReady: false },
    [PlayerSeat.SOUTH]: { playerId: null, name: null, isBot: false, isReady: false },
    [PlayerSeat.WEST]: { playerId: null, name: null, isBot: false, isReady: false }
  };
}

export function getSeatAssignmentCode(room: ServerRoom | RoomState): string {
  const idToNumber: Record<string, string> = {};
  if (room.hostPlayerId) {
    idToNumber[room.hostPlayerId] = '1';
  }

  let nextNum = 2;
  const playerEntries = room.players instanceof Map ? Array.from(room.players.values()) : Object.values(room.players);
  for (const p of playerEntries) {
    if (p.playerId && !idToNumber[p.playerId]) {
      idToNumber[p.playerId] = String(nextNum++);
    }
  }

  const seats = [PlayerSeat.NORTH, PlayerSeat.EAST, PlayerSeat.SOUTH, PlayerSeat.WEST];
  return seats.map(s => {
    const slot = room.seats[s];
    if (slot.isBot) return 'B';
    if (slot.playerId && idToNumber[slot.playerId]) return idToNumber[slot.playerId];
    return 'E';
  }).join('');
}

export function getSeatsForPlayer(room: ServerRoom, playerId: string): PlayerSeat[] {
  const seats: PlayerSeat[] = [];
  for (let s = 0; s < 4; s++) {
    if (room.seats[s as PlayerSeat]?.playerId === playerId) {
      seats.push(s as PlayerSeat);
    }
  }
  return seats;
}

export function assignInitialHostSeats(
  room: ServerRoom,
  player: ServerPlayer,
  forceTeam?: Team
): PlayerSeat[] {
  const chosenTeam: Team = forceTeam ?? (Math.random() < 0.5 ? 'A' : 'B');
  const targetSeats = chosenTeam === 'A'
    ? [PlayerSeat.NORTH, PlayerSeat.SOUTH]
    : [PlayerSeat.EAST, PlayerSeat.WEST];

  for (const seat of targetSeats) {
    room.seats[seat] = {
      playerId: player.playerId,
      name: player.name,
      isBot: false,
      isReady: false
    };
  }

  player.seat = targetSeats[0];
  player.team = chosenTeam;
  return targetSeats;
}

export function autoAssignSeat(room: ServerRoom, player: ServerPlayer): PlayerSeat | null {
  const existingSeats = getSeatsForPlayer(room, player.playerId);
  if (existingSeats.length > 0) {
    player.seat = existingSeats[0];
    player.team = getSeatTeam(existingSeats[0]);
    return existingSeats[0];
  }

  const seatPriority = [PlayerSeat.NORTH, PlayerSeat.SOUTH, PlayerSeat.EAST, PlayerSeat.WEST];

  // 1. Look for an open empty seat
  const openSeat = seatPriority.find(s => !room.seats[s].isBot && room.seats[s].playerId === null);
  if (openSeat !== undefined) {
    room.seats[openSeat] = {
      playerId: player.playerId,
      name: player.name,
      isBot: false,
      isReady: false
    };
    player.seat = openSeat;
    player.team = getSeatTeam(openSeat);
    return openSeat;
  }

  // 2. Look for a bot seat to replace
  const botSeat = seatPriority.find(s => room.seats[s].isBot);
  if (botSeat !== undefined) {
    room.seats[botSeat] = {
      playerId: player.playerId,
      name: player.name,
      isBot: false,
      isReady: false
    };
    player.seat = botSeat;
    player.team = getSeatTeam(botSeat);
    return botSeat;
  }

  // 3. Room full of human players
  return null;
}

export function assignSeat(
  room: ServerRoom,
  playerId: string,
  seat: PlayerSeat | null
): { success: boolean; error?: string } {
  const player = room.players.get(playerId);
  if (!player) {
    return { success: false, error: 'Player not in room' };
  }

  if (room.gameStarted) {
    return { success: false, error: 'Game already in progress' };
  }

  const currentSeats = getSeatsForPlayer(room, playerId);

  if (seat === null) {
    return { success: false, error: 'You must maintain at least one assigned seat' };
  }

  const slot = room.seats[seat];

  if (slot.playerId === playerId) {
    if (currentSeats.length <= 1) {
      return { success: false, error: 'You must maintain at least one assigned seat' };
    }
    room.seats[seat] = { playerId: null, name: null, isBot: false, isReady: false };
    const remaining = getSeatsForPlayer(room, playerId);
    player.seat = remaining[0];
    player.team = getSeatTeam(remaining[0]);
    player.isReady = false;
    return { success: true };
  }

  if (slot.playerId && slot.playerId !== playerId && !slot.isBot) {
    return { success: false, error: 'Seat already occupied by another player' };
  }

  room.seats[seat] = {
    playerId,
    name: player.name,
    isBot: false,
    isReady: false
  };

  player.seat = seat;
  player.team = getSeatTeam(seat);
  player.isReady = false;

  return { success: true };
}

export function toggleBot(
  room: ServerRoom,
  hostPlayerId: string,
  seat: PlayerSeat
): { success: boolean; error?: string } {
  const host = room.players.get(hostPlayerId);
  if (!host || !host.isHost) {
    return { success: false, error: 'Only room host can toggle bots' };
  }

  if (room.gameStarted || room.status !== 'lobby') {
    return { success: false, error: 'Cannot toggle bots during a game' };
  }

  const slot = room.seats[seat];

  if (slot.playerId && !slot.isBot) {
    const playerSeats = getSeatsForPlayer(room, slot.playerId);
    if (playerSeats.length <= 1) {
      return { success: false, error: 'Cannot replace a human player with a bot' };
    }
    const player = room.players.get(slot.playerId);
    if (player) {
      const remaining = playerSeats.filter(s => s !== seat);
      player.seat = remaining[0];
      player.team = getSeatTeam(remaining[0]);
      player.isReady = false;
    }
  }

  // Do not allow all 4 seats to become bots
  if (!slot.isBot) {
    let botCount = 0;
    for (let s = 0; s < 4; s++) {
      if (s === seat || room.seats[s as PlayerSeat].isBot) {
        botCount++;
      }
    }
    if (botCount >= 4) {
      return { success: false, error: 'Cannot set all 4 seats to bots in a room' };
    }
  }

  slot.isBot = !slot.isBot;
  slot.playerId = slot.isBot ? `bot_${seat}` : null;
  slot.name = slot.isBot ? `BOT (${getSeatCode(seat)})` : null;
  slot.isReady = slot.isBot;

  return { success: true };
}

export function clearPlayerSeats(room: ServerRoom, playerId: string): void {
  for (let s = 0; s < 4; s++) {
    if (room.seats[s as PlayerSeat].playerId === playerId) {
      room.seats[s as PlayerSeat] = { playerId: null, name: null, isBot: false, isReady: false };
    }
  }
}

export function ensureAllHumansSeated(room: ServerRoom): void {
  for (const player of room.players.values()) {
    if (player.isOnline) {
      const seats = getSeatsForPlayer(room, player.playerId);
      if (seats.length === 0) {
        autoAssignSeat(room, player);
      }
    }
  }
}

export function getPublicRoomsSummary(): PublicRoomSummary[] {
  const list: PublicRoomSummary[] = [];
  for (const room of rooms.values()) {
    const hasOnlineHuman = Array.from(room.players.values()).some(p => p.isOnline);
    if (hasOnlineHuman) {
      let taken = 0;
      for (let s = 0; s < 4; s++) {
        if (room.seats[s as PlayerSeat].playerId || room.seats[s as PlayerSeat].isBot) taken++;
      }
      const host = room.players.get(room.hostPlayerId);
      list.push({
        roomCode: room.isPublic ? room.roomCode : '----',
        hostName: host ? host.name : 'Host',
        seatsTaken: taken,
        status: room.status,
        isPublic: room.isPublic
      });
    }
  }
  return list;
}

export function broadcastPublicRooms(io: Server<ClientToServerEvents, ServerToClientEvents>): void {
  io.emit('public_rooms_update', getPublicRoomsSummary());
}

export function serializeRoomState(room: ServerRoom): RoomState {
  const playersObj: Record<string, RoomPlayerInfo> = {};
  for (const [id, p] of room.players.entries()) {
    playersObj[id] = {
      playerId: p.playerId,
      name: p.name,
      seat: p.seat,
      team: p.team,
      isHost: p.isHost,
      isReady: p.isReady,
      isOnline: p.isOnline
    };
  }

  return {
    roomCode: room.roomCode,
    hostPlayerId: room.hostPlayerId,
    seats: room.seats,
    players: playersObj,
    gameStarted: room.gameStarted,
    status: room.status,
    autoCardPick: room.autoCardPick,
    isPublic: room.isPublic,
    turnTimeLimit: room.turnTimeLimit ?? DEFAULT_TURN_TIME_LIMIT,
    startingPlayerIds: room.startingPlayerIds ?? []
  };
}


const HIDDEN_CARD = Object.freeze({ id: 'hidden', suit: 'S', rank: 0 });

export function sanitizeGameStateForClient(
  state: any,
  recipientSeats: PlayerSeat | PlayerSeat[] | null
): any {
  if (!state) return null;
  if (recipientSeats === null) return state;

  const allowedSeats = new Set<PlayerSeat>(
    Array.isArray(recipientSeats) ? recipientSeats : [recipientSeats]
  );

  const sanitizedPlayers: any = {};
  for (let s = 0; s < 4; s++) {
    const seatKey = s as PlayerSeat;
    const player = state.players[seatKey];
    if (allowedSeats.has(seatKey)) {
      sanitizedPlayers[seatKey] = player;
    } else if (player) {
      sanitizedPlayers[seatKey] = {
        ...player,
        baseDeck: player.baseDeck ? player.baseDeck.map(() => HIDDEN_CARD) : []
      };
    }
  }

  return {
    ...state,
    board: state.board instanceof Uint8Array ? Array.from(state.board) : state.board,
    threatMap: state.threatMap instanceof Uint8Array ? Array.from(state.threatMap) : state.threatMap,
    deadPoolCounts: state.deadPoolCounts instanceof Uint8Array ? Array.from(state.deadPoolCounts) : state.deadPoolCounts,
    deck: state.deck ? state.deck.map(() => HIDDEN_CARD) : [],
    players: sanitizedPlayers
  };
}

export function emitGameStateToRoom(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  room: ServerRoom
): void {
  if (!room.gameState) return;
  const hasHumanOnline = Array.from(room.players.values()).some(p => p.isOnline);
  if (!hasHumanOnline) {
    io.to(room.roomCode).emit('game_state_update', {
      gameState: room.gameState,
      logs: room.logs
    });
    return;
  }

  for (const player of room.players.values()) {
    if (player.socketId && player.isOnline) {
      const seats = getSeatsForPlayer(room, player.playerId);
      const sanitized = sanitizeGameStateForClient(room.gameState, seats);
      io.to(player.socketId).emit('game_state_update', {
        gameState: sanitized,
        logs: room.logs
      });
    }
  }
}
