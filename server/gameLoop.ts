import { Server } from 'socket.io';
import { DEFAULT_BOT_PROFILE, getBestBotAction } from '../src/bot/bot';
import { applyAction, completePostCombat, createInitialGameState, getRandomLegalAction } from '../src/core/engine';
import { getSeatCode } from '../src/core/notation';
import { BOT_SPEED_MS, COMBAT_TURN_RIVER_DELAY_MS, DEFAULT_TURN_TIME_LIMIT } from '../src/config';
import { PlayerSeat } from '../src/core/types';
import { ClientToServerEvents, ServerToClientEvents } from '../src/net/events';
import { emitGameStateToRoom, serializeRoomState } from './roomManager';
import { ServerRoom } from './types';

type IOServer = Server<ClientToServerEvents, ServerToClientEvents>;

export function clearTurnTimeout(room: ServerRoom): void {
  if (room.turnTimeout) {
    clearInterval(room.turnTimeout);
    room.turnTimeout = null;
  }
}

export function startTurnTimeout(room: ServerRoom, io: IOServer): void {
  clearTurnTimeout(room);
  if (!room.gameState || room.gameState.isGameOver || room.status !== 'playing' || room.gameState.isCombatDelaying) return;

  const limit = room.turnTimeLimit ?? DEFAULT_TURN_TIME_LIMIT;
  const activeSeat = room.gameState.pendingRefills.length > 0 ? room.gameState.pendingRefills[0].seat : room.gameState.activePlayer;
  room.timerRemainingSeconds = limit;
  room.timerActiveSeat = activeSeat;

  io.to(room.roomCode).emit('timer_tick', {
    remainingSeconds: room.timerRemainingSeconds,
    activeSeat: room.timerActiveSeat
  });

  const activeSlot = room.seats[activeSeat];

  if (activeSlot && activeSlot.isBot) return;
  if (limit === 0) return;

  room.turnTimeout = setInterval(() => {
    if (!room.gameState || room.gameState.isGameOver || room.status !== 'playing' || room.gameState.isCombatDelaying) {
      clearTurnTimeout(room);
      return;
    }

    if (room.timerRemainingSeconds !== undefined && room.timerActiveSeat !== undefined) {
      room.timerRemainingSeconds = Math.max(0, room.timerRemainingSeconds - 1);

      io.to(room.roomCode).emit('timer_tick', {
        remainingSeconds: room.timerRemainingSeconds,
        activeSeat: room.timerActiveSeat
      });

      if (room.timerRemainingSeconds > 0) {
        return;
      }
    }

    clearTurnTimeout(room);
    if (!room.gameState || room.gameState.isGameOver || room.status !== 'playing' || room.gameState.isCombatDelaying) return;

    const state = room.gameState;

    if (state.setupState?.inSetup) {
      const currentSeat = state.pendingRefills.length > 0 ? state.pendingRefills[0].seat : state.activePlayer;
      const player = state.players[currentSeat];
      if (player && player.baseDeck.length > 0) {
        applyAction(state, { type: 'TRENCH_SELECT', input1: currentSeat, input2: [0, 1, 2] as any });
      }
      emitGameStateToRoom(io, room);

      startTurnTimeout(room, io);
      triggerBotTurnIfNeeded(room, io);
    } else if (state.pendingRefills.length > 0) {
      const activeRefill = state.pendingRefills[0];
      applyAction(state, { type: 'REFILL_TRENCH', input1: activeRefill.slot, input2: 0 });
      emitGameStateToRoom(io, room);

      startTurnTimeout(room, io);
      triggerBotTurnIfNeeded(room, io);
    } else {
      const currentSeat = state.activePlayer;
      const seatCode = getSeatCode(currentSeat) as 'N' | 'E' | 'S' | 'W';
      const randomAction = getRandomLegalAction(state, currentSeat);
      const turnNum = state.turnCount;

      const result = applyAction(state, randomAction, {
        botSeats: state.botSeats,
        autoCardPick: room.autoCardPick ?? true,
        deferPostCombat: true
      });

      if (randomAction.type === 'MOVE' || randomAction.type === 'PROMOTION' || randomAction.type === 'SKIP_TURN' || randomAction.type === 'SET_BUNKER') {
        const historyIdx = room.logs.length;
        room.logs.push({
          turnNumber: turnNum,
          seat: seatCode,
          text: `⏱️ Time Out: ${result.logText}`,
          pokerText: result.pokerText,
          historyIndex: historyIdx
        });
      }

      if (result.combatOccurred && result.pendingCombat) {
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
            clearTurnTimeout(room);
            if (room.botTimer) { clearTimeout(room.botTimer); room.botTimer = null; }
          }
          emitGameStateToRoom(io, room);
          if (!room.gameState.isGameOver) {
            startTurnTimeout(room, io);
          }
          triggerBotTurnIfNeeded(room, io);
        }, COMBAT_TURN_RIVER_DELAY_MS);
      } else {
        if (room.gameState.isGameOver) {
          room.matchScore = { ...room.gameState.score };
          room.status = 'ended';
        }
        emitGameStateToRoom(io, room);

        if (!room.gameState.isGameOver && randomAction.type !== 'CARD_SWAP') {
          startTurnTimeout(room, io);
        }
        triggerBotTurnIfNeeded(room, io);
      }
    }
  }, 1000);
}

export function triggerBotTurnIfNeeded(room: ServerRoom, io: IOServer): void {
  if (!room.gameState || room.gameState.isGameOver || room.status !== 'playing') return;

  const state = room.gameState;
  let activeSeat: PlayerSeat = state.activePlayer;

  if (state.pendingRefills.length > 0) {
    activeSeat = state.pendingRefills[0].seat;
  }

  const isBotSeat = state.botSeats[activeSeat];
  if (!isBotSeat) return;

  if (room.botTimer) clearTimeout(room.botTimer);

  room.botTimer = setTimeout(() => {
    room.botTimer = null;
    if (!room.gameState || room.gameState.isGameOver || room.status !== 'playing') return;

    const currentState = room.gameState;
    const currentBotSeat = currentState.pendingRefills.length > 0 ? currentState.pendingRefills[0].seat : currentState.activePlayer;
    if (!currentState.botSeats[currentBotSeat]) return;

    if (currentState.pendingRefills.length > 0) {
      const activeRefill = currentState.pendingRefills[0];
      const player = currentState.players[activeRefill.seat];
      if (!player || player.baseDeck.length === 0) {
        currentState.pendingRefills.shift();
        emitGameStateToRoom(io, room);
        triggerBotTurnIfNeeded(room, io);
        return;
      }

      let maxIdx = 0;
      for (let i = 1; i < player.baseDeck.length; i++) {
        if (player.baseDeck[i].rank > player.baseDeck[maxIdx].rank) {
          maxIdx = i;
        }
      }

      const botStrategies = {
        [PlayerSeat.NORTH]: DEFAULT_BOT_PROFILE.trenchStrategy,
        [PlayerSeat.EAST]: DEFAULT_BOT_PROFILE.trenchStrategy,
        [PlayerSeat.SOUTH]: DEFAULT_BOT_PROFILE.trenchStrategy,
        [PlayerSeat.WEST]: DEFAULT_BOT_PROFILE.trenchStrategy
      };

      applyAction(currentState, {
        type: 'REFILL_TRENCH',
        input1: activeRefill.slot,
        input2: maxIdx
      }, {
        botSeats: currentState.botSeats,
        botStrategies,
        autoCardPick: room.autoCardPick ?? true
      });

      emitGameStateToRoom(io, room);
      if (!currentState.isGameOver) {
        startTurnTimeout(room, io);
      }
      triggerBotTurnIfNeeded(room, io);
      return;
    }

    const botCandidate = getBestBotAction(currentState, DEFAULT_BOT_PROFILE);
    if (!botCandidate) return;

    const turnNum = currentState.turnCount;
    const seatCode = getSeatCode(currentBotSeat) as 'N' | 'E' | 'S' | 'W';

    const botStrategies = {
      [PlayerSeat.NORTH]: DEFAULT_BOT_PROFILE.trenchStrategy,
      [PlayerSeat.EAST]: DEFAULT_BOT_PROFILE.trenchStrategy,
      [PlayerSeat.SOUTH]: DEFAULT_BOT_PROFILE.trenchStrategy,
      [PlayerSeat.WEST]: DEFAULT_BOT_PROFILE.trenchStrategy
    };

    const result = applyAction(currentState, botCandidate.action, {
      botSeats: currentState.botSeats,
      botStrategies,
      autoCardPick: room.autoCardPick ?? true,
      deferPostCombat: true
    });

    if (botCandidate.action.type === 'MOVE' || botCandidate.action.type === 'PROMOTION' || botCandidate.action.type === 'SKIP_TURN' || botCandidate.action.type === 'SET_BUNKER') {
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
      const combat = result.pendingCombat;
      emitGameStateToRoom(io, room);

      if (room.botTimer) clearTimeout(room.botTimer);
      room.botTimer = setTimeout(() => {
        room.botTimer = null;
        if (!room.gameState) return;
        completePostCombat(room.gameState, combat, {
          botSeats: room.gameState.botSeats,
          botStrategies,
          autoCardPick: room.autoCardPick ?? true
        });
        if (room.gameState.isGameOver) {
          room.matchScore = { ...room.gameState.score };
          room.status = 'ended';
        }
        emitGameStateToRoom(io, room);

        if (!room.gameState.isGameOver) {
          startTurnTimeout(room, io);
        }
        triggerBotTurnIfNeeded(room, io);
      }, COMBAT_TURN_RIVER_DELAY_MS);
    } else {
      if (room.gameState.isGameOver) {
        room.matchScore = { ...room.gameState.score };
        room.status = 'ended';
        clearTurnTimeout(room);
        if (room.botTimer) { clearTimeout(room.botTimer); room.botTimer = null; }
      }
      emitGameStateToRoom(io, room);
      if (!room.gameState.isGameOver && botCandidate.action.type !== 'CARD_SWAP') {
        startTurnTimeout(room, io);
      }
      triggerBotTurnIfNeeded(room, io);
    }
  }, BOT_SPEED_MS);
}

export function startMatch(room: ServerRoom, io: IOServer, isRematch: boolean = false): void {
  if (isRematch) {
    if (room.gameState && room.gameState.score) {
      room.matchScore = { ...room.gameState.score };
    }
    room.startingSeatIndex = (room.startingSeatIndex + 1) % 4;
  }

  const botSeats: Record<PlayerSeat, boolean> = {
    [PlayerSeat.NORTH]: room.seats[PlayerSeat.NORTH].isBot,
    [PlayerSeat.EAST]: room.seats[PlayerSeat.EAST].isBot,
    [PlayerSeat.SOUTH]: room.seats[PlayerSeat.SOUTH].isBot,
    [PlayerSeat.WEST]: room.seats[PlayerSeat.WEST].isBot
  };

  room.gameState = createInitialGameState({
    botSeats,
    autoCardPick: room.autoCardPick ?? true,
    score: room.matchScore,
    startingPlayer: room.startingSeatIndex as PlayerSeat,
    turnTimeLimit: room.turnTimeLimit ?? DEFAULT_TURN_TIME_LIMIT
  });

  room.gameStarted = true;
  room.status = 'playing';
  room.logs = [];

  io.to(room.roomCode).emit('room_state_update', serializeRoomState(room));
  emitGameStateToRoom(io, room);

  triggerBotTurnIfNeeded(room, io);
  startTurnTimeout(room, io);
}

export function checkAndAutoStartMatch(room: ServerRoom, io: IOServer): void {
  if (room.status === 'playing') return;

  let allReady = true;
  for (let s = 0; s < 4; s++) {
    const slot = room.seats[s as PlayerSeat];
    const isOccupied = slot.isBot || (slot.playerId !== null);
    if (!isOccupied || !slot.isReady) {
      allReady = false;
      break;
    }
  }

  if (allReady) {
    startMatch(room, io, false);
  }
}
