import { Server } from 'socket.io';
import { DEFAULT_TURN_TIME_LIMIT } from '../src/config';
import { PlayerSeat, Team } from '../src/core/types';
import { ClientToServerEvents, PublicRoomSummary, RoomPlayerInfo, RoomSeatSlot, RoomState, ServerToClientEvents } from '../src/net/events';
import { ServerRoom } from './types';

export const rooms = new Map<string, ServerRoom>();

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
    [PlayerSeat.EAST]: { playerId: null, name: null, isBot: true, isReady: true },
    [PlayerSeat.SOUTH]: { playerId: null, name: null, isBot: false, isReady: false },
    [PlayerSeat.WEST]: { playerId: null, name: null, isBot: true, isReady: true }
  };
}

export function getPublicRoomsSummary(): PublicRoomSummary[] {
  const list: PublicRoomSummary[] = [];
  for (const room of rooms.values()) {
    const hasOnlineHuman = Array.from(room.players.values()).some(p => p.isOnline);
    if (room.isPublic && room.status === 'lobby' && hasOnlineHuman) {
      let taken = 0;
      for (let s = 0; s < 4; s++) {
        if (room.seats[s as PlayerSeat].playerId || room.seats[s as PlayerSeat].isBot) taken++;
      }
      const host = room.players.get(room.hostPlayerId);
      list.push({
        roomCode: room.roomCode,
        hostName: host ? host.name : 'Host',
        seatsTaken: taken
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
    turnTimeLimit: room.turnTimeLimit ?? DEFAULT_TURN_TIME_LIMIT
  };
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
