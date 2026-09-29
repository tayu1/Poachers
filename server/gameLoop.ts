import { Server } from 'socket.io';
import { DEFAULT_BOT_PROFILE, getBestBotAction } from '../src/bot/bot';
import { applyAction, completePostCombat, executeCombatResolution, createInitialGameState, getRandomLegalAction, fastCloneState } from '../src/core/engine';
import { getSeatCode } from '../src/core/notation';
import { BOT_SPEED_MS, POST_COMBAT_DELAY_MS, DEFAULT_TURN_TIME_LIMIT, TURN_RIVER_DELAY_MS } from '../src/config';
import { ActionType, PlayerSeat } from '../src/core/types';
import { ClientToServerEvents, ServerToClientEvents } from '../src/net/events';
import { emitGameStateToRoom, getSeatTeam, serializeRoomState } from './roomManager';
import { ServerRoom } from './types';
import { logMatchCompletion } from './analytics';

type IOServer = Server<ClientToServerEvents, ServerToClientEvents>;

export function recordRoomSnapshot(room: ServerRoom): number {
  if (!room.history) room.history = [];
  if (room.gameState) room.history.push(fastCloneState(room.gameState));
  return room.history.length - 1;
}

export function clearTurnTimeout(room: ServerRoom): void {
  if (room.turnTimeout) {
    clearInterval(room.turnTimeout);
    room.turnTimeout = null;
  }
}

export function startTurnTimeout(room: ServerRoom, io: IOServer, remainingSeconds?: number): void {
  clearTurnTimeout(room);
  if (!room.gameState || room.gameState.isGameOver || room.status !== 'playing' || room.gameState.isCombatDelaying) return;

  const limit = room.turnTimeLimit ?? DEFAULT_TURN_TIME_LIMIT;
  const activeSeat = room.gameState.pendingRefills.length > 0 ? room.gameState.pendingRefills[0].seat : room.gameState.activePlayer;
  room.timerRemainingSeconds = remainingSeconds !== undefined ? remainingSeconds : limit;
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

      if (room.timerRemainingSeconds <= 5 || room.timerRemainingSeconds % 5 === 0) {
        io.to(room.roomCode).emit('timer_tick', {
          remainingSeconds: room.timerRemainingSeconds,
          activeSeat: room.timerActiveSeat
        });
      }

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
      const currentTeam = getSeatTeam(currentSeat);

      if (!room.teamTimeouts) {
        room.teamTimeouts = { A: 0, B: 0 };
      }
      const timeoutCount = (room.teamTimeouts[currentTeam] || 0) + 1;
      room.teamTimeouts[currentTeam] = timeoutCount;

      if (timeoutCount >= 3) {
        if (room.botTimer) {
          clearTimeout(room.botTimer);
          room.botTimer = null;
        }
        const result = applyAction(state, {
          type: 'RESIGN',
          input1: currentSeat,
          input2: 0
        });

        const historyIdx = recordRoomSnapshot(room);
        const winnerTeam = currentTeam === 'A' ? 'B' : 'A';
        const logText = `Team ${currentTeam} (${seatCode}) timed out (3rd timeout). Team ${winnerTeam} Victorious!`;

        room.logs.push({
          turnNumber: state.turnCount,
          seat: seatCode,
          text: logText,
          pokerText: result.pokerText,
          historyIndex: historyIdx
        });

        room.matchScore = { ...state.score };
        room.status = 'ended';
        logMatchCompletion(room, 'Timeout Resignation');
        io.to(room.roomCode).emit('room_state_update', serializeRoomState(room));
        emitGameStateToRoom(io, room);
        return;
      }

      const randomAction = getRandomLegalAction(state, currentSeat);
      const turnNum = state.turnCount;

      const result = applyAction(state, randomAction, {
        botSeats: state.botSeats,
        autoCardPick: room.autoCardPick ?? true,
        deferPostCombat: true
      });

      if (result.combatOccurred && result.pendingCombat) {
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

          const historyIdx = recordRoomSnapshot(room);
          room.logs.push({
            turnNumber: turnNum,
            seat: seatCode,
            text: `${combatOutcome.logText} (timer ${timeoutCount}/2)`,
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
              if (room.gameState.winnerTeam) {
                const winIdx = recordRoomSnapshot(room);
                room.logs.push({
                  turnNumber: turnNum,
                  seat: seatCode,
                  text: `🏆 Team ${room.gameState.winnerTeam} Victorious! (King Captured)`,
                  historyIndex: winIdx
                });
              }
              room.matchScore = { ...room.gameState.score };
              room.status = 'ended';
              clearTurnTimeout(room);
              if (room.botTimer) { clearTimeout(room.botTimer); room.botTimer = null; }
              room.botTurnStartTime = null;
              logMatchCompletion(room, 'King Captured');
            } else {
              const refillIdx = recordRoomSnapshot(room);
              room.logs.push({
                turnNumber: turnNum,
                seat: seatCode,
                text: 'card refill',
                historyIndex: refillIdx
              });
            }
            emitGameStateToRoom(io, room);
            if (!room.gameState.isGameOver) {
              startTurnTimeout(room, io);
            }
            triggerBotTurnIfNeeded(room, io);
          }, POST_COMBAT_DELAY_MS);
        }, TURN_RIVER_DELAY_MS);
      } else {
        const isCardSwap = typeof randomAction === 'number'
          ? (randomAction >>> 20) === 4
          : (randomAction as any).type === 'CARD_SWAP';

        if (isCardSwap) {
          const swapIdx = recordRoomSnapshot(room);
          room.logs.push({
            turnNumber: turnNum,
            seat: seatCode,
            text: `card swap (timer ${timeoutCount}/2)`,
            historyIndex: swapIdx
          });
        } else {
          const historyIdx = recordRoomSnapshot(room);
          room.logs.push({
            turnNumber: turnNum,
            seat: seatCode,
            text: `${result.logText} (timer ${timeoutCount}/2)`,
            pokerText: result.pokerText,
            historyIndex: historyIdx
          });
        }

        if (room.gameState.isGameOver) {
          if (room.gameState.winnerTeam) {
            const winIdx = recordRoomSnapshot(room);
            room.logs.push({
              turnNumber: turnNum,
              seat: seatCode,
              text: `🏆 Team ${room.gameState.winnerTeam} Victorious!`,
              historyIndex: winIdx
            });
          }
          room.matchScore = { ...room.gameState.score };
          room.status = 'ended';
          logMatchCompletion(room, 'Timeout / Regular Move');
        }
        emitGameStateToRoom(io, room);

        if (!room.gameState.isGameOver && !isCardSwap) {
          startTurnTimeout(room, io);
        }
        triggerBotTurnIfNeeded(room, io);
      }
    }
  }, 1000);
}

export function triggerBotTurnIfNeeded(room: ServerRoom, io: IOServer): void {
  // Bot turns are now calculated entirely on the client by the room's host using a Web Worker.
  // The server just waits to receive the bot's move via the standard 'game_action' socket event,
  // the exact same way it waits for a human move.
}

export function startMatch(room: ServerRoom, io: IOServer, isRematch: boolean = false): void {
  if (room.botTimer) {
    clearTimeout(room.botTimer);
    room.botTimer = null;
  }
  room.botTurnStartTime = null;

  if (isRematch) {
    if (room.gameState && room.gameState.score) {
      room.matchScore = { ...room.gameState.score };
    }
    room.startingSeatIndex = (room.startingSeatIndex + 1) % 4;
  }

  const seats = [PlayerSeat.NORTH, PlayerSeat.EAST, PlayerSeat.SOUTH, PlayerSeat.WEST] as PlayerSeat[];
  room.startingPlayerIds = Array.from(new Set(
    seats
      .filter(s => !room.seats[s].isBot && room.seats[s].playerId !== null)
      .map(s => room.seats[s].playerId as string)
  ));

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
  room.matchStartTime = new Date().toISOString();
  room.hasLoggedMatch = false;
  room.logs = [];
  room.teamTimeouts = { A: 0, B: 0 };
  room.history = [fastCloneState(room.gameState)];

  io.to(room.roomCode).emit('room_state_update', serializeRoomState(room));
  emitGameStateToRoom(io, room);

  triggerBotTurnIfNeeded(room, io);
  startTurnTimeout(room, io);
}

export function checkAndAutoStartMatch(room: ServerRoom, io: IOServer): void {
  if (room.status === 'playing') return;

  const humanSeatsCount = [PlayerSeat.NORTH, PlayerSeat.EAST, PlayerSeat.SOUTH, PlayerSeat.WEST].filter(
    s => !room.seats[s].isBot && room.seats[s].playerId !== null
  ).length;

  if (humanSeatsCount === 0) {
    return;
  }

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
