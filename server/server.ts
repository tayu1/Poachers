import cors from 'cors';
import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';

import { applyAction, completePostCombat, executeCombatResolution } from '../src/core/engine';
import { getSeatCode } from '../src/core/notation';
import { DEFAULT_TURN_TIME_LIMIT, TURN_TIME_LIMIT_OPTIONS, TurnTimeLimit, POST_COMBAT_DELAY_MS, TURN_RIVER_DELAY_MS } from '../src/config';
import { PlayerSeat } from '../src/core/types';
import { ClientToServerEvents, ServerToClientEvents } from '../src/net/events';

import { checkAndAutoStartMatch, clearTurnTimeout, startMatch, startTurnTimeout, triggerBotTurnIfNeeded } from './gameLoop';
import { assignInitialHostSeats, assignSeat, autoAssignSeat, broadcastPublicRooms, clearPlayerSeats, createEmptySeats, emitGameStateToRoom, ensureAllHumansSeated, generateRoomCode, getPublicRoomsSummary, getSeatTeam, getSeatsForPlayer, rooms, sanitizeGameStateForClient, serializeRoomState, toggleBot } from './roomManager';

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

// Grace period: keep rooms alive for 2 minutes after all humans disconnect
// so that a browser refresh (which takes ~0.5s) doesn't destroy the game.
const DISCONNECT_GRACE_PERIOD_MS = 120_000;
const roomCleanupTimers = new Map<string, NodeJS.Timeout>();

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
        startingSeatIndex: PlayerSeat.NORTH,
        startingPlayerIds: [playerId]
      };

      assignInitialHostSeats(room, player);

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
      // Ensure existing player has seat
      autoAssignSeat(room, player);
    } else {
      if (room.status !== 'lobby') {
        if (callback) callback({ success: false, error: 'Game is already in progress' });
        return;
      }
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

      const assignedSeat = autoAssignSeat(room, player);
      if (assignedSeat === null) {
        if (callback) callback({ success: false, error: 'Room is full (all seats occupied by players)' });
        return;
      }

      room.players.set(playerId, player);
    }

    socket.join(code);
    socket.emit('session_assigned', { playerId });

    const roomState = serializeRoomState(room);
    if (callback) callback({ success: true, roomState, playerId });
    io.to(code).emit('room_state_update', roomState);
    broadcastPublicRooms(io);

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

    // Cancel any pending grace-period cleanup — player is back
    const pendingTimer = roomCleanupTimers.get(code);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      roomCleanupTimers.delete(code);
      console.log(`[Grace] Cancelled cleanup timer for room ${code} — player reconnected`);
    }

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

    // Resume game loop if mid-game (timers were paused while no humans were online)
    if (room.status === 'playing' && room.gameState && !room.gameState.isGameOver) {
      startTurnTimeout(room, io);
      triggerBotTurnIfNeeded(room, io);
    }
  });

  socket.on('select_seat', ({ roomCode, playerId, seat }, callback) => {
    const code = roomCode.toUpperCase();
    const room = rooms.get(code);
    if (!room) {
      if (callback) callback({ success: false, error: 'Room not found' });
      return;
    }

    const res = assignSeat(room, playerId, seat);
    if (!res.success) {
      if (callback) callback({ success: false, error: res.error });
      return;
    }

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

    const res = toggleBot(room, playerId, seat);
    if (!res.success) {
      if (callback) callback({ success: false, error: res.error });
      return;
    }

    io.to(code).emit('room_state_update', serializeRoomState(room));
    broadcastPublicRooms(io);
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

    const hasSeatedHuman = [PlayerSeat.NORTH, PlayerSeat.EAST, PlayerSeat.SOUTH, PlayerSeat.WEST].some(
      s => !room.seats[s].isBot && room.seats[s].playerId !== null
    );
    if (!hasSeatedHuman) {
      if (callback) callback({ success: false, error: 'Need at least 1 seated human player' });
      return;
    }

    const allHumansReady = Array.from(room.players.values()).filter(p => p.isOnline).every(p => p.isReady);
    if (!allHumansReady) {
      if (callback) callback({ success: false, error: 'All players must be ready first' });
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
        io.to(code).emit('room_state_update', serializeRoomState(room));
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

    if (result.combatOccurred && result.pendingCombat) {
      clearTurnTimeout(room);
      const combat = result.pendingCombat;
      emitGameStateToRoom(io, room);

      if (room.botTimer) clearTimeout(room.botTimer);
      room.botTimer = setTimeout(() => {
        room.botTimer = null;
        if (!room.gameState) return;

        const combatOutcome = executeCombatResolution(room.gameState, combat, {
          botSeats: room.gameState.botSeats,
          autoCardPick: room.autoCardPick ?? true
        });

        const historyIdx = room.logs.length;
        room.logs.push({
          turnNumber: turnNum,
          seat: seatCode,
          text: combatOutcome.logText,
          pokerText: combatOutcome.pokerText,
          historyIndex: historyIdx
        });

        emitGameStateToRoom(io, room);

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
            io.to(code).emit('room_state_update', serializeRoomState(room));
            broadcastPublicRooms(io);
          }
          if (!room.gameState.isGameOver) {
            startTurnTimeout(room, io);
          }
          emitGameStateToRoom(io, room);
          triggerBotTurnIfNeeded(room, io);
        }, POST_COMBAT_DELAY_MS);
      }, TURN_RIVER_DELAY_MS);
    } else {
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

      if (room.gameState.isGameOver) {
        room.matchScore = { ...room.gameState.score };
        room.status = 'ended';
        io.to(code).emit('room_state_update', serializeRoomState(room));
        broadcastPublicRooms(io);
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

    const startingHumans = room.startingPlayerIds ?? (room.hostPlayerId ? [room.hostPlayerId] : []);
    const onlineStartingHumans = startingHumans.filter(id => room.players.get(id)?.isOnline);
    const allPresent = onlineStartingHumans.length === startingHumans.length;

    if (!allPresent && startingHumans.length > 1) {
      if (startingHumans.length === 2) {
        // There was 1 other human and he left -> rematch not available
        return;
      }
      if (startingHumans.length >= 3) {
        // There was more than 1 other human and anyone left -> return to seat setting room
        room.gameStarted = false;
        room.status = 'lobby';
        room.gameState = null;
        room.logs = [];
        room.rematchOffer = null;
        room.matchScore = { teamA: 0, teamB: 0 };
        for (const p of room.players.values()) {
          p.isReady = false;
        }
        for (let s = 0; s < 4; s++) {
          const slot = room.seats[s as PlayerSeat];
          if (slot.isBot) {
            room.seats[s as PlayerSeat] = { playerId: null, name: null, isBot: false, isReady: false };
          } else {
            slot.isReady = false;
          }
        }
        ensureAllHumansSeated(room);
        io.to(code).emit('rematch_offer_update', null);
        io.to(code).emit('room_state_update', serializeRoomState(room));
        broadcastPublicRooms(io);
        return;
      }
    }

    if (startingHumans.length <= 1) {
      // Solo player against bots -> immediate instant rematch without waiting!
      room.rematchOffer = null;
      io.to(code).emit('rematch_offer_update', null);
      startMatch(room, io, true);
    } else {
      // 2 or more human players -> offer rematch and wait for accept rematch!
      room.rematchOffer = {
        offeredByPlayerId: playerId,
        offeredByName: player.name,
        acceptedPlayerIds: [playerId]
      };
      io.to(code).emit('rematch_offer_update', room.rematchOffer);
    }
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
      const slot = room.seats[s as PlayerSeat];
      if (slot.isBot) {
        room.seats[s as PlayerSeat] = { playerId: null, name: null, isBot: false, isReady: false };
      } else {
        slot.isReady = false;
      }
    }
    ensureAllHumansSeated(room);

    io.to(code).emit('rematch_offer_update', null);
    io.to(code).emit('room_state_update', serializeRoomState(room));
    broadcastPublicRooms(io);
  });

  socket.on('leave_room', ({ roomCode, playerId }) => {
    const code = roomCode.toUpperCase();
    const room = rooms.get(code);
    if (!room) return;

    room.players.delete(playerId);
    clearPlayerSeats(room, playerId);

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

    if (!cleanupRoomIfEmpty(code, room)) {
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
        // Don't delete instantly — schedule a grace period cleanup
        scheduleGracePeriodCleanup(code, room);
        if (!isRoomEffectivelyEmpty(room)) {
          io.to(code).emit('room_state_update', serializeRoomState(room));
        }
      }
    }
    broadcastPublicRooms(io);
  });
});

/** Check if a room has no online human players. */
function isRoomEffectivelyEmpty(room: ServerRoom): boolean {
  return !Array.from(room.players.values()).some(p => p.isOnline);
}

/** Immediately destroy a room and clean up its timers. */
function destroyRoom(code: string, room: ServerRoom): void {
  clearTurnTimeout(room);
  if (room.botTimer) { clearTimeout(room.botTimer); room.botTimer = null; }
  rooms.delete(code);
  const pendingTimer = roomCleanupTimers.get(code);
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    roomCleanupTimers.delete(code);
  }
  console.log(`[Grace] Room ${code} destroyed`);
}

/**
 * Instant cleanup for intentional actions (e.g. leave_room).
 * Returns true if the room was destroyed.
 */
function cleanupRoomIfEmpty(code: string, room: ServerRoom): boolean {
  if (isRoomEffectivelyEmpty(room) || room.players.size === 0) {
    destroyRoom(code, room);
    return true;
  }
  return false;
}

/**
 * Schedule a delayed cleanup after disconnect.
 * If a player reconnects before the timer fires (e.g. browser refresh),
 * the timer is cancelled in the reconnect_session handler.
 */
function scheduleGracePeriodCleanup(code: string, room: ServerRoom): void {
  // Only schedule if no humans are currently online
  if (!isRoomEffectivelyEmpty(room)) return;
  // Don't double-schedule
  if (roomCleanupTimers.has(code)) return;

  console.log(`[Grace] Room ${code} has no online humans — scheduling cleanup in ${DISCONNECT_GRACE_PERIOD_MS / 1000}s`);

  const timer = setTimeout(() => {
    roomCleanupTimers.delete(code);
    const currentRoom = rooms.get(code);
    if (currentRoom && isRoomEffectivelyEmpty(currentRoom)) {
      destroyRoom(code, currentRoom);
      broadcastPublicRooms(io);
    }
  }, DISCONNECT_GRACE_PERIOD_MS);

  roomCleanupTimers.set(code, timer);
}

// Periodic safety-net cleanup: destroy rooms that have been empty for a while
// (the grace period timers handle the primary case, this is a fallback)
setInterval(() => {
  for (const [code, room] of rooms.entries()) {
    if (isRoomEffectivelyEmpty(room) && !roomCleanupTimers.has(code)) {
      destroyRoom(code, room);
    }
  }
  broadcastPublicRooms(io);
}, 60000);

httpServer.listen(PORT, () => {
  console.log(`🚀 Poachers Server running on http://localhost:${PORT}`);
});
