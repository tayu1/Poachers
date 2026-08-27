import { applyAction, createInitialGameState, fastCloneState, toUint8Array } from '../core/engine';
import { getSeatCode } from '../core/notation';
import { generateFullThreatMap, INITIAL_THREAT_MAP } from '../core/moves';

import { BOT_SPEED_MS, POST_COMBAT_DELAY_MS, DEFAULT_TURN_TIME_LIMIT, TurnTimeLimit, TURN_RIVER_DELAY_MS } from '../config';
import { ActionInt, GameState, Move, PieceType, PlayerSeat, Team } from '../core/types';
import { NetworkLogEntry, RematchOfferState, RoomState } from '../net/events';

export interface LogEntry {
  turnNumber: number;
  seat: 'N' | 'E' | 'S' | 'W';
  text: string;
  pokerText?: string;
  historyIndex: number;
}

export enum StoreChannel {
  BOARD = 1,
  CARDS = 2,
  GAME_FLOW = 4,
  TIMER = 8,
  UI_STATE = 16,
  ALL = 31
}

export type StoreSubscriber = (state: GameState, store: GameStore) => void;

interface ChannelSubscriber {
  callback: StoreSubscriber;
  channels: number;
}

export class GameStore {
  private state: GameState;
  private channelSubscribers: Set<ChannelSubscriber> = new Set();
  private timerSubscribers: Set<StoreSubscriber> = new Set();
  private history: GameState[] = [];
  public historyIndex: number = -1;
  public logs: LogEntry[] = [];
  public selectedSquare: number | null = null;
  public legalMoves: (ActionInt | Move)[] = [];
  public selectedBaseCardIndex: number | null = null;
  public selectedTrenchCardIndex: number | null = null;
  public selectedPromotionPiece: PieceType | number | null = null;
  public selectedDraftIndices: number[] = [];
  public isSettingBunker: boolean = false;
  public sourceBunkerIndex: number | null = null;
  public boardRotationAngle: number = 0; // 0, 90, 180, 270 degrees
  public isReplaying: boolean = false;
  private _isCombatDelaying: boolean = false;
  public get isCombatDelaying(): boolean {
    return this._isCombatDelaying;
  }
  private combatTimer: any = null;
  private turnRiverTimer: any = null;
  public botSeats: Record<PlayerSeat, boolean> = {
    [PlayerSeat.NORTH]: false,
    [PlayerSeat.EAST]: true,
    [PlayerSeat.SOUTH]: true,
    [PlayerSeat.WEST]: true
  };
  private _botSpeedMs: number = BOT_SPEED_MS;
  public get botSpeedMs(): number {
    return this._botSpeedMs;
  }
  public turnTimeLimit: TurnTimeLimit = DEFAULT_TURN_TIME_LIMIT;
  public autoCardPick: boolean = true;

  // Timer State
  public turnEndsAt: number | null = null;
  public timerActiveSeat: PlayerSeat = PlayerSeat.NORTH;

  // Multiplayer State
  public isMultiplayer: boolean = false;
  public roomState: RoomState | null = null;
  public myPlayerId: string | null = null;
  public mySeat: PlayerSeat | null = null;
  public mySeats: PlayerSeat[] = [];
  public myTeam: Team | null = null;
  public netError: string | null = null;
  public rematchOffer: RematchOfferState | null = null;
  public matchScore: { teamA: number; teamB: number } = { teamA: 0, teamB: 0 };
  public startingSeatIndex: number = PlayerSeat.NORTH;
  public isLocalGame: boolean = false;

  constructor() {
    this.startingSeatIndex = PlayerSeat.NORTH;
    this.state = createInitialGameState({
      botSeats: this.botSeats,
      autoCardPick: this.autoCardPick,
      turnTimeLimit: this.turnTimeLimit,
      startingPlayer: this.startingSeatIndex as PlayerSeat
    });
  }

  public get timerRemainingSeconds(): number {
    if (!this.turnEndsAt) return this.turnTimeLimit;
    return Math.max(0, Math.ceil((this.turnEndsAt - Date.now()) / 1000));
  }

  public setMyPlayerId(id: string): void {
    this.myPlayerId = id;
    this.notify();
  }

  public setTurnTimeLimit(limit: TurnTimeLimit): void {
    this.turnTimeLimit = limit;
    this.turnEndsAt = limit > 0 ? Date.now() + limit * 1000 : null;
    this.notify();
  }

  public setRematchOffer(offer: RematchOfferState | null): void {
    this.rematchOffer = offer;
    this.notify();
  }

  public setRoomState(roomState: RoomState): void {
    this.roomState = roomState;
    this.isMultiplayer = true;
    this.netError = null;
    if (roomState.turnTimeLimit !== undefined) {
      this.turnTimeLimit = roomState.turnTimeLimit;
    }

    const mySeats: PlayerSeat[] = [];
    if (this.myPlayerId) {
      for (let s = 0; s < 4; s++) {
        if (roomState.seats[s as PlayerSeat]?.playerId === this.myPlayerId) {
          mySeats.push(s as PlayerSeat);
        }
      }
    }
    this.mySeats = mySeats;
    this.mySeat = mySeats.length > 0 ? mySeats[0] : null;

    this.botSeats = {
      [PlayerSeat.NORTH]: roomState.seats[PlayerSeat.NORTH].isBot,
      [PlayerSeat.EAST]: roomState.seats[PlayerSeat.EAST].isBot,
      [PlayerSeat.SOUTH]: roomState.seats[PlayerSeat.SOUTH].isBot,
      [PlayerSeat.WEST]: roomState.seats[PlayerSeat.WEST].isBot
    };

    this.notify();
  }

  public isInMatch(): boolean {
    if (this.isLocalGame) return true;
    if (this.isMultiplayer && this.roomState && (this.roomState.status === 'playing' || this.roomState.status === 'ended')) {
      return true;
    }
    return false;
  }

  public getRematchMode(): 'available' | 'disabled' | 'return_to_lobby' {
    if (!this.isMultiplayer || !this.roomState) {
      return 'available';
    }
    const roomState = this.roomState;
    const startingHumans = roomState.startingPlayerIds ?? (roomState.hostPlayerId ? [roomState.hostPlayerId] : []);
    const onlineStartingHumans = startingHumans.filter(id => roomState.players[id]?.isOnline);
    const allPresent = onlineStartingHumans.length === startingHumans.length;

    if (allPresent || startingHumans.length <= 1) {
      return 'available';
    }

    if (startingHumans.length === 2) {
      return 'disabled';
    }

    if (startingHumans.length >= 3) {
      return 'return_to_lobby';
    }

    return 'available';
  }

  public canRematch(): boolean {
    return this.getRematchMode() !== 'disabled';
  }

  public updateTimerState(remainingSeconds: number, activeSeat: PlayerSeat): void {
    this.turnEndsAt = remainingSeconds > 0 ? Date.now() + remainingSeconds * 1000 : null;
    this.timerActiveSeat = activeSeat;
    this.triggerTimerUpdate();
  }

  public setTurnDeadline(turnEndsAt: number | null, activeSeat: PlayerSeat): void {
    this.turnEndsAt = turnEndsAt;
    this.timerActiveSeat = activeSeat;
    this.triggerTimerUpdate();
  }

  public applyServerGameState(gameState: GameState, logs: NetworkLogEntry[]): void {
    if (gameState) {
      gameState.board = toUint8Array(gameState.board, 64);
      gameState.threatMap = gameState.threatMap ? toUint8Array(gameState.threatMap, 4096) : generateFullThreatMap(gameState.board);
      let hasData = false;
      if (gameState.threatMap && gameState.threatMap.length === 4096) {
        for (let i = 0; i < 4096; i++) {
          if (gameState.threatMap[i] !== 0) {
            hasData = true;
            break;
          }
        }
      }
      if (!hasData) {
        gameState.threatMap = generateFullThreatMap(gameState.board);
      }
      gameState.deadPoolCounts = toUint8Array(gameState.deadPoolCounts, 16);
    }
    this.state = gameState;
    if (gameState.score) {
      this.matchScore = { ...gameState.score };
    }
    this.logs = logs.map((l) => ({
      turnNumber: l.turnNumber,
      seat: l.seat,
      text: l.text,
      pokerText: l.pokerText,
      historyIndex: l.historyIndex
    }));
    while (this.history.length < this.logs.length) {
      this.history.push(fastCloneState(this.state));
    }
    this.isReplaying = false;
    this.selectedSquare = null;
    this.legalMoves = [];
    this.selectedBaseCardIndex = null;
    this.selectedTrenchCardIndex = null;
    this.selectedPromotionPiece = null;
    this.notify();
  }

  public setNetError(msg: string | null): void {
    this.netError = msg;
    this.notify();
  }

  public startBotFastMatch(): void {
    this.isLocalGame = true;
    this.botSeats = {
      [PlayerSeat.NORTH]: true,
      [PlayerSeat.EAST]: true,
      [PlayerSeat.SOUTH]: true,
      [PlayerSeat.WEST]: true
    };
    this.setBotSpeedMs(10);
    this.resetGame(false, true); // skipSetup = true for Bot Fast Match
  }

  public leaveLocalGame(): void {
    this.isLocalGame = false;
    this.setBotSpeedMs(BOT_SPEED_MS);
    this.botSeats = {
      [PlayerSeat.NORTH]: false,
      [PlayerSeat.EAST]: true,
      [PlayerSeat.SOUTH]: false,
      [PlayerSeat.WEST]: true
    };
    this.resetGame(false);
  }

  public leaveMultiplayerRoom(): void {
    this.isMultiplayer = false;
    this.roomState = null;
    this.mySeat = null;
    this.myTeam = null;
    this.netError = null;
    this.notify();
  }

  public scheduleTurnRiverDelay(onComplete: () => void): void {
    if (this.turnRiverTimer) {
      clearTimeout(this.turnRiverTimer);
      this.turnRiverTimer = null;
    }
    this._isCombatDelaying = true;

    const delay = this._botSpeedMs <= 50 ? this._botSpeedMs : TURN_RIVER_DELAY_MS;
    this.turnRiverTimer = setTimeout(() => {
      this.turnRiverTimer = null;
      onComplete();
    }, delay);
  }

  public scheduleCombatDelay(onComplete: () => void): void {
    if (this.combatTimer) {
      clearTimeout(this.combatTimer);
      this.combatTimer = null;
    }
    this._isCombatDelaying = true;

    const delay = this._botSpeedMs <= 50 ? this._botSpeedMs : POST_COMBAT_DELAY_MS;
    this.combatTimer = setTimeout(() => {
      this.combatTimer = null;
      this._isCombatDelaying = false;
      onComplete();
    }, delay);
  }

  public cancelCombatTimers(): void {
    if (this.turnRiverTimer) {
      clearTimeout(this.turnRiverTimer);
      this.turnRiverTimer = null;
    }
    if (this.combatTimer) {
      clearTimeout(this.combatTimer);
      this.combatTimer = null;
    }
    this._isCombatDelaying = false;
  }

  public get historyLength(): number {
    return this.history.length;
  }

  public getState(): GameState {
    return this.isReplaying && this.historyIndex >= 0 && this.historyIndex < this.history.length
      ? this.history[this.historyIndex]
      : this.state;
  }

  public subscribe(callback: StoreSubscriber, channels: number = StoreChannel.ALL): () => void {
    const entry: ChannelSubscriber = { callback, channels };
    this.channelSubscribers.add(entry);
    callback(this.getState(), this);
    return () => this.channelSubscribers.delete(entry);
  }

  public subscribeToTimer(callback: StoreSubscriber): () => void {
    this.timerSubscribers.add(callback);
    return () => this.timerSubscribers.delete(callback);
  }

  private _isNotifying: boolean = false;
  private _pendingNotifyChannels: number = 0;

  private notify(channel: number = StoreChannel.ALL): void {
    if (this._isNotifying) {
      this._pendingNotifyChannels |= channel;
      return;
    }
    this._isNotifying = true;
    try {
      const currentState = this.getState();
      this.channelSubscribers.forEach(sub => {
        if ((sub.channels & channel) !== 0) {
          sub.callback(currentState, this);
        }
      });
      if ((channel & StoreChannel.TIMER) !== 0) {
        this.notifyTimer();
      }
    } finally {
      this._isNotifying = false;
    }

    if (this._pendingNotifyChannels !== 0) {
      const pending = this._pendingNotifyChannels;
      this._pendingNotifyChannels = 0;
      this.notify(pending);
    }
  }

  public notifyTimer(): void {
    const currentState = this.getState();
    this.timerSubscribers.forEach(sub => sub(currentState, this));
  }

  public triggerUIUpdate(): void {
    this.notify();
  }

  public triggerTimerUpdate(): void {
    this.notifyTimer();
  }

  public recordSnapshot(): void {
    const snapshot: GameState = fastCloneState(this.state);
    this.history.push(snapshot);
    if (!this.isReplaying) {
      this.historyIndex = this.history.length - 1;
    }
  }

  public addLogEntry(entry: Omit<LogEntry, 'historyIndex'>): void {
    const historyIdx = this.history.length - 1;
    this.logs.push({
      ...entry,
      historyIndex: historyIdx
    });
    this.notify();
  }

  public rotateBoard(): void {
    this.boardRotationAngle = (this.boardRotationAngle + 90) % 360;
    this.notify();
  }

  public toggleBotSeat(seat: PlayerSeat): void {
    this.botSeats[seat] = !this.botSeats[seat];
    this.notify();
  }

  public setBotSpeedMs(speedMs: number): void {
    this._botSpeedMs = speedMs;
    this.notify();
  }

  public toggleAutoCardPick(): void {
    this.autoCardPick = !this.autoCardPick;
    this.notify();
  }

  public selectSquare(index: number | null, legalMoves: (ActionInt | Move)[] = []): void {
    this.selectedSquare = index;
    this.legalMoves = legalMoves;
    this.notify();
  }

  public setSettingBunker(isSetting: boolean, sourceIndex: number | null = null): void {
    this.isSettingBunker = isSetting;
    this.sourceBunkerIndex = isSetting ? sourceIndex : null;
    this.notify();
  }

  public selectBaseCard(index: number | null): void {
    this.selectedBaseCardIndex = index;
    this.notify();
  }

  public selectTrenchCard(index: number | null): void {
    this.selectedTrenchCardIndex = index;
    this.notify();
  }

  public selectPromotionPiece(piece: PieceType | number | null): void {
    this.selectedPromotionPiece = piece;
    this.notify();
  }

  public get activeLogIndex(): number {
    if (this.logs.length === 0) return -1;
    if (!this.isReplaying) return this.logs.length - 1;
    if (this.historyIndex >= 0 && this.historyIndex < this.logs.length) {
      return this.historyIndex;
    }
    const exactIdx = this.logs.findIndex(e => e.historyIndex === this.historyIndex);
    if (exactIdx !== -1) return exactIdx;
    for (let i = this.logs.length - 1; i >= 0; i--) {
      if (this.historyIndex >= this.logs[i].historyIndex) return i;
    }
    return 0;
  }

  public scrubToHistoryIndex(historyIndex: number): void {
    if (this.history.length === 0) return;
    const target = Math.max(0, Math.min(historyIndex, this.history.length - 1));
    this.historyIndex = target;
    this.isReplaying = target < this.history.length - 1;
    this.notify();
  }

  public stepReplay(direction: 'prev' | 'next' | 'live'): void {
    if (direction === 'live') {
      this.isReplaying = false;
      this.historyIndex = Math.max(0, this.history.length - 1);
      this.notify();
      return;
    }

    if (this.logs.length === 0 || this.history.length === 0) return;

    const currentIdx = this.activeLogIndex;

    if (direction === 'prev' && currentIdx > 0) {
      this.scrubToHistoryIndex(currentIdx - 1);
    } else if (direction === 'next' && currentIdx < this.logs.length - 1) {
      this.scrubToHistoryIndex(currentIdx + 1);
    }
  }

  public reviewGame(): void {
    this.isReplaying = true;
    if (this.history.length > 0) {
      this.historyIndex = this.history.length - 1;
    }
    this.selectedSquare = null;
    this.legalMoves = [];
    this.selectedBaseCardIndex = null;
    this.selectedTrenchCardIndex = null;
    this.selectedPromotionPiece = null;
    this.notify();
  }

  public resignGame(): { winnerTeam: Team; logText: string } | null {
    if (this.state.isGameOver) return null;
    const resigningSeat = this.mySeat !== null ? this.mySeat : this.state.activePlayer;
    const result = applyAction(this.state, {
      type: 'RESIGN',
      input1: resigningSeat,
      input2: 0
    });
    this.recordSnapshot();
    this.addLogEntry({
      turnNumber: this.state.turnCount,
      seat: getSeatCode(resigningSeat) as 'N' | 'E' | 'S' | 'W',
      text: result.logText
    });
    this.notify();
    return { winnerTeam: result.winnerTeam!, logText: result.logText };
  }

  public resetGame(isRematch: boolean = false, skipSetup: boolean = false): void {
    if (this.combatTimer) {
      clearTimeout(this.combatTimer);
      this.combatTimer = null;
    }
    this._isCombatDelaying = false;

    if (isRematch) {
      this.matchScore = { ...this.state.score };
      this.startingSeatIndex = (this.startingSeatIndex + 1) % 4;
    } else {
      this.matchScore = { teamA: 0, teamB: 0 };
      this.startingSeatIndex = PlayerSeat.NORTH;
    }

    this.state = createInitialGameState({
      botSeats: this.botSeats,
      autoCardPick: this.autoCardPick,
      score: this.matchScore,
      startingPlayer: this.startingSeatIndex as PlayerSeat,
      turnTimeLimit: this.turnTimeLimit,
      skipSetup: skipSetup
    });
    this.history = [];
    this.historyIndex = -1;
    this.logs = [];
    this.selectedSquare = null;
    this.legalMoves = [];
    this.selectedBaseCardIndex = null;
    this.selectedTrenchCardIndex = null;
    this.selectedPromotionPiece = null;
    this.isReplaying = false;
    this.notify();
  }
}

export const store = new GameStore();
