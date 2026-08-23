import cors from 'cors';
import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';

import { applyAction, completePostCombat } from '../src/core/engine';
import { getSeatCode } from '../src/core/notation';
import { DEFAULT_TURN_TIME_LIMIT, TURN_TIME_LIMIT_OPTIONS, TurnTimeLimit, COMBAT_TURN_RIVER_DELAY_MS } from '../src/config';
import { PlayerSeat } from '../src/core/types';
import { ClientToServerEvents, ServerToClientEvents } from '../src/net/events';

import { checkAndAutoStartMatch, clearTurnTimeout, startMatch, startTurnTimeout, triggerBotTurnIfNeeded } from './gameLoop';
import { broadcastPublicRooms, createEmptySeats, emitGameStateToRoom, generateRoomCode, getPublicRoomsSummary, getSeatTeam, getSeatsForPlayer, rooms, sanitizeGameStateForClient, serializeRoomState } from './roomManager';

import { ServerPlayer, ServerRoom } from './types';

process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] Unhandled Rejection at:', promise, 'reason:', reason);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, '../dist');

const app = express();
app.use(cors());
app.use(express.static(distPath));

app.use((req, res, next) => {
  if (req.path.startsWith('/socket.io')) return next();
  if (req.method === 'GET') {
    return res.sendFile(path.join(distPath, 'index.html'));
  }
  next();
});

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3001;

io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  socket.on('get_public_rooms', (callback) => {
    if (typeof callback === 'function') callback(getPublicRoomsSummary());
  });

  socket.on('create_room', (payload, callback) => {
    try {
      const { playerName, isPublic } = payload || {};
      const roomCode = generateRoomCode();
      const playerId = `player_${Math.random().toString(36).substring(2, 9)}`;

      const player: ServerPlayer = {
        playerId,
        name: playerName || 'Player 1',
        socketId: socket.id,
        seat: null,
        team: null,
        isHost: true,
        isReady: false,
        isOnline: true
      };

      const room: ServerRoom = {
        roomCode,
        hostPlayerId: playerId,
        seats: createEmptySeats(),
        players: new Map([[playerId, player]]),
        gameStarted: false,
        status: 'lobby',
        gameState: null,
        logs: [],
        botTimer: null,
        turnTimeout: null,
        autoCardPick: true,
        isPublic: isPublic !== false,
        turnTimeLimit: DEFAULT_TURN_TIME_LIMIT,
        rematchOffer: null,
        matchScore: { teamA: 0, teamB: 0 },
        startingSeatIndex: PlayerSeat.NORTH
      };

      rooms.set(roomCode, room);
      socket.join(roomCode);

      socket.emit('session_assigned', { playerId });

      const roomState = serializeRoomState(room);
      if (typeof callback === 'function') callback({ success: true, roomCode, error: undefined });
      io.to(roomCode).emit('room_state_update', roomState);
      broadcastPublicRooms(io);
    } catch (err: any) {
      console.error('[Server] Error in create_room:', err);
      if (typeof callback === 'function') callback({ success: false, error: err?.message || 'Failed to create room' });
    }
  });

  socket.on('join_room', ({ roomCode, playerName, playerId: existingId }, callback) => {
    const code = roomCode.toUpperCase();
    const room = rooms.get(code);

    if (!room) {
      if (callback) callback({ success: false, error: 'Room not found' });
      return;
    }

    let playerId = existingId;
    let player: ServerPlayer | undefined;

    if (playerId && room.players.has(playerId)) {
      player = room.players.get(playerId)!;
      player.socketId = socket.id;
      player.isOnline = true;
      if (playerName) player.name = playerName;
    } else {
      playerId = `player_${Math.random().toString(36).substring(2, 9)}`;
      player = {
        playerId,
        name: playerName || `Player ${room.players.size + 1}`,
        socketId: socket.id,
        seat: null,
        team: null,
        isHost: false,
        isReady: false,
        isOnline: true
      };
      room.players.set(playerId, player);
    }

    socket.join(code);
    socket.emit('session_assigned', { playerId });

    const roomState = serializeRoomState(room);
    if (callback) callback({ success: true, roomState, playerId });
    io.to(code).emit('room_state_update', roomState);

    if (room.status === 'playing' && room.gameState) {
      socket.emit('game_state_update', {
        gameState: sanitizeGameStateForClient(room.gameState, getSeatsForPlayer(room, player.playerId)),
        logs: room.logs
      });
    }
  });

  socket.on('reconnect_session', ({ roomCode, playerId }, callback) => {
    const code = roomCode.toUpperCase();
    const room = rooms.get(code);

    if (!room || !room.players.has(playerId)) {
      if (callback) callback({ success: false, error: 'Session expired or room unavailable' });
      return;
    }

    const player = room.players.get(playerId)!;
    player.socketId = socket.id;
    player.isOnline = true;
    socket.join(code);

    const roomState = serializeRoomState(room);
    if (callback) {
      callback({
        success: true,
        roomState,
        gameState: sanitizeGameStateForClient(room.gameState, getSeatsForPlayer(room, player.playerId)) || undefined,
        logs: room.logs
      });
    }

    io.to(code).emit('room_state_update', roomState);
  });

  socket.on('select_seat', ({ roomCode, playerId, seat }, callback) => {
    const code = roomCode.toUpperCase();
    const room = rooms.get(code);
    if (!room) {
      if (callback) callback({ success: false, error: 'Room not found' });
      return;
    }

    const player = room.players.get(playerId);
    if (!player) {
      if (callback) callback({ success: false, error: 'Player not in room' });
      return;
    }

    if (room.gameStarted) {
      if (callback) callback({ success: false, error: 'Game already in progress' });
      return;
    }

    if (seat === null) {
      for (let s = 0; s < 4; s++) {
        if (room.seats[s as PlayerSeat].playerId === playerId) {
          room.seats[s as PlayerSeat] = { playerId: null, name: null, isBot: false, isReady: false };
        }
      }
      player.isReady = false;
      player.seat = null;
      io.to(code).emit('room_state_update', serializeRoomState(room));
      if (callback) callback({ success: true });
      return;
    }

    const slot = room.seats[seat];

    if (slot.playerId === playerId) {
      room.seats[seat] = { playerId: null, name: null, isBot: false, isReady: false };

      const remainingSeats = [0, 1, 2, 3].filter(s => room.seats[s as PlayerSeat].playerId === playerId) as PlayerSeat[];
      if (remainingSeats.length > 0) {
        player.seat = remainingSeats[0];
        player.team = getSeatTeam(remainingSeats[0]);
      } else {
        player.seat = null;
        player.team = null;
        player.isReady = false;
      }

      io.to(code).emit('room_state_update', serializeRoomState(room));
      broadcastPublicRooms(io);
      if (callback) callback({ success: true });
      return;
    }

    if (slot.playerId && slot.playerId !== playerId && !slot.isBot) {
      if (callback) callback({ success: false, error: 'Seat already occupied by another player' });
      return;
    }

    const targetTeam = getSeatTeam(seat);

    player.isReady = false;
    player.seat = seat;
    player.team = targetTeam;
    room.seats[seat] = {
      playerId,
      name: player.name,
      isBot: false,
      isReady: false
    };

    io.to(code).emit('room_state_update', serializeRoomState(room));
    broadcastPublicRooms(io);
    if (callback) callback({ success: true });

    checkAndAutoStartMatch(room, io);
  });

  socket.on('toggle_bot_seat', ({ roomCode, playerId, seat }, callback) => {
    const code = roomCode.toUpperCase();
    const room = rooms.get(code);
    if (!room) {
      if (callback) callback({ success: false, error: 'Room not found' });
      return;
    }

    const player = room.players.get(playerId);
    if (!player || !player.isHost) {
      if (callback) callback({ success: false, error: 'Only room host can toggle bots' });
      return;
    }

    const slot = room.seats[seat];
    if (slot.playerId && !slot.isBot) {
      if (callback) callback({ success: false, error: 'Cannot replace an active human player with a bot' });
      return;
    }

    slot.isBot = !slot.isBot;
    slot.playerId = slot.isBot ? `bot_${seat}` : null;
    slot.name = slot.isBot ? `BOT (${getSeatCode(seat)})` : null;
    slot.isReady = slot.isBot;

    io.to(code).emit('room_state_update', serializeRoomState(room));
    if (callback) callback({ success: true });

    checkAndAutoStartMatch(room, io);
  });

  socket.on('toggle_public', ({ roomCode, playerId }) => {
    const code = roomCode.toUpperCase();
    const room = rooms.get(code);
    if (room && room.hostPlayerId === playerId) {
      room.isPublic = !room.isPublic;
      io.to(code).emit('room_state_update', serializeRoomState(room));
      broadcastPublicRooms(io);
    }
  });

  socket.on('toggle_turn_time_limit', ({ roomCode, playerId }) => {
    const code = roomCode.toUpperCase();
    const room = rooms.get(code);
    if (room && room.hostPlayerId === playerId && room.status === 'lobby') {
      const currIdx = TURN_TIME_LIMIT_OPTIONS.indexOf((room.turnTimeLimit ?? DEFAULT_TURN_TIME_LIMIT) as TurnTimeLimit);
      const nextIdx = currIdx === -1 ? 0 : (currIdx + 1) % TURN_TIME_LIMIT_OPTIONS.length;
      room.turnTimeLimit = TURN_TIME_LIMIT_OPTIONS[nextIdx];
      io.to(code).emit('room_state_update', serializeRoomState(room));
    }
  });

  socket.on('toggle_auto_card_pick', ({ roomCode }) => {
    const code = roomCode.toUpperCase();
    const room = rooms.get(code);
    if (room) {
      room.autoCardPick = !room.autoCardPick;
      io.to(code).emit('room_state_update', serializeRoomState(room));
    }
  });

  socket.on('toggle_ready', ({ roomCode, playerId }, callback) => {
    const code = roomCode.toUpperCase();
    const room = rooms.get(code);
    if (!room) {
      if (callback) callback({ success: false, error: 'Room not found' });
      return;
    }

    const player = room.players.get(playerId);
    if (!player) {
      if (callback) callback({ success: false, error: 'Player not in room' });
      return;
    }

    player.isReady = !player.isReady;

    for (let s = 0; s < 4; s++) {
      const slot = room.seats[s as PlayerSeat];
      if (slot.playerId === playerId) {
        slot.isReady = player.isReady;
      }
    }

    io.to(code).emit('room_state_update', serializeRoomState(room));
    if (callback) callback({ success: true });

    checkAndAutoStartMatch(room, io);
  });

  socket.on('start_game', ({ roomCode, playerId }, callback) => {
    const code = roomCode.toUpperCase();
    const room = rooms.get(code);
    if (!room) {
      if (callback) callback({ success: false, error: 'Room not found' });
      return;
    }

    const player = room.players.get(playerId);
    if (!player || !player.isHost) {
      if (callback) callback({ success: false, error: 'Only room host can start the game' });
      return;
    }

    if (room.status === 'playing') {
      if (callback) callback({ success: true });
      return;
    }

    const hasHuman = Array.from(room.players.values()).some(p => p.isOnline);
    if (!hasHuman) {
      if (callback) callback({ success: false, error: 'Need at least 1 human player' });
      return;
    }

    for (let s = 0; s < 4; s++) {
      const seat = s as PlayerSeat;
      const slot = room.seats[seat];
      if (!slot.isBot && !slot.playerId) {
        slot.isBot = true;
        slot.playerId = `bot_${seat}`;
        slot.name = `BOT (${getSeatCode(seat)})`;
        slot.isReady = true;
      }
    }

    startMatch(room, io, false);
    if (callback) callback({ success: true });
  });

  socket.on('game_action', ({ roomCode, playerId, action }) => {
    const code = roomCode.toUpperCase();
    const room = rooms.get(code);
    if (!room || !room.gameState || room.status !== 'playing') return;

    const player = room.players.get(playerId);
    if (!player) return;

    const state = room.gameState;

    if (action.type === 'RESIGN') {
      let resigningSeat: PlayerSeat | null = player.seat;
      if (resigningSeat === null) {
        for (let s = 0; s < 4; s++) {
          if (room.seats[s as PlayerSeat].playerId === playerId) {
            resigningSeat = s as PlayerSeat;
            break;
          }
        }
      }
      if (resigningSeat === null) resigningSeat = state.activePlayer;

      const result = applyAction(state, {
        type: 'RESIGN',
        input1: resigningSeat,
        input2: 0
      });

      const seatCode = getSeatCode(resigningSeat) as 'N' | 'E' | 'S' | 'W';
      const historyIdx = room.logs.length;
      room.logs.push({
        turnNumber: state.turnCount,
        seat: seatCode,
        text: result.logText,
        pokerText: result.pokerText,
        historyIndex: historyIdx
      });

      if (state.isGameOver) {
        room.matchScore = { ...state.score };
        room.status = 'ended';
      }

      emitGameStateToRoom(io, room);
      broadcastPublicRooms(io);
      return;
    }

    let requiredSeat = state.activePlayer;
    if (state.pendingRefills.length > 0) {
      requiredSeat = state.pendingRefills[0].seat;
    }

    const requiredSlot = room.seats[requiredSeat];
    if (requiredSlot.playerId !== playerId) {
      socket.emit('error_message', { message: `It is currently ${getSeatCode(requiredSeat)}'s turn.` });
      return;
    }

    const turnNum = state.turnCount;
    const seatCode = getSeatCode(requiredSeat) as 'N' | 'E' | 'S' | 'W';

    if (state.isCombatDelaying) {
      socket.emit('error_message', { message: 'Combat resolution in progress...' });
      return;
    }

    let result;
    try {
      result = applyAction(state, action, {
        botSeats: state.botSeats,
        autoCardPick: room.autoCardPick ?? true,
        deferPostCombat: true
      });
    } catch (error: any) {
      console.warn(`[Game Action Error] Room ${code}, Player ${playerId}: ${error.message}`);
      socket.emit('error_message', { message: error.message || 'Invalid action' });
      return;
    }

    if (action.type === 'MOVE' || action.type === 'PROMOTION' || action.type === 'SKIP_TURN' || action.type === 'SET_BUNKER') {
      const historyIdx = room.logs.length;
      room.logs.push({
        turnNumber: turnNum,
        seat: seatCode,
        text: result.logText,
        pokerText: result.pokerText,
        historyIndex: historyIdx
      });
    }

    if (result.combatOccurred && result.pendingCombat) {
      clearTurnTimeout(room);
      const combat = result.pendingCombat;
      emitGameStateToRoom(io, room);

      if (room.botTimer) clearTimeout(room.botTimer);
      room.botTimer = setTimeout(() => {
        room.botTimer = null;
        if (!room.gameState) return;
        completePostCombat(room.gameState, combat, {
          botSeats: room.gameState.botSeats,
          autoCardPick: room.autoCardPick ?? true
        });
        if (room.gameState.isGameOver) {
          room.matchScore = { ...room.gameState.score };
          room.status = 'ended';
        }
        if (!room.gameState.isGameOver) {
          startTurnTimeout(room, io);
        }
        emitGameStateToRoom(io, room);
        triggerBotTurnIfNeeded(room, io);
      }, COMBAT_TURN_RIVER_DELAY_MS);
    } else {
      if (room.gameState.isGameOver) {
        room.matchScore = { ...room.gameState.score };
        room.status = 'ended';
      }
      if (!room.gameState.isGameOver && action.type !== 'CARD_SWAP') {
        startTurnTimeout(room, io);
      }
      emitGameStateToRoom(io, room);

      triggerBotTurnIfNeeded(room, io);
    }
  });

  socket.on('request_rematch', ({ roomCode, playerId }) => {
    const code = roomCode.toUpperCase();
    const room = rooms.get(code);
    if (!room) return;

    const player = room.players.get(playerId);
    if (!player) return;

    let hasOpposingHuman = false;
    for (const p of room.players.values()) {
      if (p.playerId !== playerId && p.isOnline) {
        hasOpposingHuman = true;
        break;
      }
    }

    if (!hasOpposingHuman) {
      room.rematchOffer = null;
      io.to(code).emit('rematch_offer_update', null);
      startMatch(room, io, true);
      return;
    }

    room.rematchOffer = {
      requestedByPlayerId: playerId,
      requestedByName: player.name,
      acceptedPlayerIds: [playerId]
    };

    io.to(code).emit('rematch_offer_update', room.rematchOffer);
  });

  socket.on('accept_rematch', ({ roomCode, playerId }) => {
    const code = roomCode.toUpperCase();
    const room = rooms.get(code);
    if (!room || !room.rematchOffer) return;

    const player = room.players.get(playerId);
    if (!player) return;

    if (!room.rematchOffer.acceptedPlayerIds.includes(playerId)) {
      room.rematchOffer.acceptedPlayerIds.push(playerId);
    }

    const onlineHumanPlayerIds = Array.from(room.players.values()).filter(p => p.isOnline).map(p => p.playerId);
    const allAccepted = onlineHumanPlayerIds.every(id => room.rematchOffer!.acceptedPlayerIds.includes(id));

    if (allAccepted) {
      room.rematchOffer = null;
      io.to(code).emit('rematch_offer_update', null);
      startMatch(room, io, true);
    } else {
      io.to(code).emit('rematch_offer_update', room.rematchOffer);
    }
  });

  socket.on('reset_match', ({ roomCode, playerId }) => {
    const code = roomCode.toUpperCase();
    const room = rooms.get(code);
    if (!room) return;

    const player = room.players.get(playerId);
    if (!player || !player.isHost) return;

    room.gameStarted = false;
    room.status = 'lobby';
    room.gameState = null;
    room.logs = [];
    room.rematchOffer = null;
    room.matchScore = { teamA: 0, teamB: 0 };
    room.startingSeatIndex = Math.floor(Math.random() * 4);

    for (const p of room.players.values()) {
      p.isReady = false;
    }
    for (let s = 0; s < 4; s++) {
      if (!room.seats[s as PlayerSeat].isBot) {
        room.seats[s as PlayerSeat].isReady = false;
      }
    }

    io.to(code).emit('rematch_offer_update', null);
    io.to(code).emit('room_state_update', serializeRoomState(room));
  });

  socket.on('leave_room', ({ roomCode, playerId }) => {
    const code = roomCode.toUpperCase();
    const room = rooms.get(code);
    if (!room) return;

    room.players.delete(playerId);

    for (let s = 0; s < 4; s++) {
      if (room.seats[s as PlayerSeat].playerId === playerId) {
        room.seats[s as PlayerSeat] = { playerId: null, name: null, isBot: false, isReady: false };
      }
    }

    socket.leave(code);

    if (room.hostPlayerId === playerId) {
      const remainingPlayers = Array.from(room.players.values());
      const onlinePlayer = remainingPlayers.find(p => p.isOnline);
      if (onlinePlayer) {
        room.hostPlayerId = onlinePlayer.playerId;
        onlinePlayer.isHost = true;
      } else if (remainingPlayers.length > 0) {
        room.hostPlayerId = remainingPlayers[0].playerId;
        remainingPlayers[0].isHost = true;
      }
    }

    const hasOnlineHumans = Array.from(room.players.values()).some(p => p.isOnline);
    if (!hasOnlineHumans || room.players.size === 0) {
      clearTurnTimeout(room);
      if (room.botTimer) clearTimeout(room.botTimer);
      rooms.delete(code);
    } else {
      io.to(code).emit('room_state_update', serializeRoomState(room));
    }

    broadcastPublicRooms(io);
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] Disconnected: ${socket.id}`);
    for (const [code, room] of rooms.entries()) {
      let playerUpdated = false;
      for (const p of room.players.values()) {
        if (p.socketId === socket.id) {
          p.isOnline = false;
          p.socketId = null;
          playerUpdated = true;
        }
      }
      if (playerUpdated) {
        io.to(code).emit('room_state_update', serializeRoomState(room));
      }
    }
    broadcastPublicRooms(io);
  });
});

setInterval(() => {
  for (const [code, room] of rooms.entries()) {
    const hasOnlineHumans = Array.from(room.players.values()).some(p => p.isOnline);
    if (!hasOnlineHumans) {
      clearTurnTimeout(room);
      if (room.botTimer) clearTimeout(room.botTimer);
      rooms.delete(code);
    }
  }
  broadcastPublicRooms(io);
}, 60000);

httpServer.listen(PORT, () => {
  console.log(`🚀 Poachers Server running on http://localhost:${PORT}`);
});
