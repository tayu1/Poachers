import { DEFAULT_BOT_PROFILE, getBestBotAction } from '../bot/bot';
import { DEFAULT_TURN_TIME_LIMIT, POST_COMBAT_DELAY_MS, TURN_RIVER_DELAY_MS } from '../config';
import { applyAction, completePostCombat, executeCombatResolution, getRandomLegalAction, executeTrenchSingleCardSelect, GameAction } from '../core/engine';
import { getSeatCode } from '../core/notation';
import { actionIntToGameAction, ActionType, GameState, PlayerSeat, Team, TurnPhase } from '../core/types';
import { socketClient } from '../net/socketClient';
import { GameStore } from '../store/store';
import { OverlaysUI } from '../ui/components/OverlaysUI';

export class TurnManager {
  private store: GameStore;
  private overlaysUI: OverlaysUI;
  private appElement: HTMLElement;

  public phase: TurnPhase = TurnPhase.IDLE;

  // Timers
  private turnClockInterval: any = null;
  private botTimer: any = null;
  private gameOverTimeoutId: any = null;
  private isGameOverShown = false;
  private pendingWinnerTeam: Team | null = null;
  private pendingMessage: string | undefined = undefined;

  // Turn clock tracking
  private lastSeat: PlayerSeat | null = null;
  private lastTurnCount: number | null = null;
  private lastStage: string | null = null;
  private isExecutingTimeout = false;

  constructor(store: GameStore, overlaysUI: OverlaysUI) {
    this.store = store;
    this.overlaysUI = overlaysUI;
    this.appElement = (typeof document !== 'undefined' ? document.getElementById('app') || document.body : null) as HTMLElement;
  }

  public cancelAllTimers(): void {
    if (this.turnClockInterval !== null) {
      clearInterval(this.turnClockInterval);
      this.turnClockInterval = null;
    }
    if (this.botTimer !== null) {
      clearTimeout(this.botTimer);
      this.botTimer = null;
    }
    this.store.cancelCombatTimers();
    this.lastSeat = null;
    this.lastTurnCount = null;
    this.lastStage = null;
    // Reset execution flag — if a timer was mid-execution when cancelled,
    // this prevents it from permanently blocking all future timer handling.
    this.isExecutingTimeout = false;
  }

  public dispatchAction(
    action: GameAction | number,
    opts?: { deferPostCombat?: boolean; logPrefix?: string; logSuffix?: string; skipLog?: boolean; botStrategies?: any }
  ): void {
    const state = this.store.getState();

    if (this.store.isMultiplayer) {
      socketClient.sendGameAction(typeof action === 'number' ? actionIntToGameAction(action) : action);
      return;
    }

    if (state.isGameOver || this.phase === TurnPhase.COMBAT_DELAY) {
      return;
    }

    const turnNum = state.turnCount;
    const seat = getSeatCode(state.activePlayer);
    const deferPostCombat = opts?.deferPostCombat ?? false;

    const isCardSwap = typeof action === 'number'
      ? (action >>> 20) === ActionType.CARD_SWAP
      : action.type === 'CARD_SWAP' || action.type === ActionType.CARD_SWAP;

    const result = applyAction(state, action, {
      botSeats: this.store.botSeats,
      autoCardPick: this.store.autoCardPick,
      botStrategies: opts?.botStrategies,
      deferPostCombat
    });

    if (isCardSwap) {
      this.phase = TurnPhase.AWAITING_INPUT;
      this.store.recordSnapshot();
      this.store.addLogEntry({
        turnNumber: turnNum,
        seat,
        text: 'card swap'
      });
      this.store.triggerUIUpdate();
      this.syncTurn(this.store.getState());
      return;
    }

    if (result.combatOccurred && result.pendingCombat) {
      const combat = result.pendingCombat;
      this.phase = TurnPhase.COMBAT_DELAY;

      // Stop turn clock & cancel bot while showing river & combat animation
      if (this.turnClockInterval !== null) {
        clearInterval(this.turnClockInterval);
        this.turnClockInterval = null;
      }
      if (this.botTimer !== null) {
        clearTimeout(this.botTimer);
        this.botTimer = null;
      }

      this.store.triggerUIUpdate();

      // Step 1: Wait for turnriver_delay before opening Turn/River & resolving combat
      this.store.scheduleTurnRiverDelay(() => {
        const freshState = this.store.getState();
        const combatOutcome = executeCombatResolution(freshState, combat, {
          botSeats: this.store.botSeats,
          botStrategies: opts?.botStrategies,
          autoCardPick: this.store.autoCardPick
        });

        // Record the resolved combat snapshot (during post combat delay, before cards are cleared)
        this.store.recordSnapshot();

        if (!opts?.skipLog) {
          const prefix = opts?.logPrefix ?? '';
          const suffix = opts?.logSuffix ?? '';
          this.store.addLogEntry({
            turnNumber: turnNum,
            seat,
            text: prefix + combatOutcome.logText + suffix,
            pokerText: combatOutcome.pokerText
          });
        }
        this.store.triggerUIUpdate();

        // Step 2: Wait for combat delay before completing post-combat
        this.store.scheduleCombatDelay(() => {
          const freshState2 = this.store.getState();
          completePostCombat(freshState2, combat, {
            botSeats: this.store.botSeats,
            botStrategies: opts?.botStrategies,
            autoCardPick: this.store.autoCardPick
          });

          this.phase = freshState2.isGameOver ? TurnPhase.GAME_OVER : TurnPhase.AWAITING_INPUT;

          if (freshState2.isGameOver && freshState2.winnerTeam) {
            this.handleGameOver(freshState2.winnerTeam);
          }

          // Frame and log entry for post-combat card refill
          this.store.recordSnapshot();
          this.store.addLogEntry({
            turnNumber: turnNum,
            seat,
            text: 'card refill'
          });
          this.store.triggerUIUpdate();
          this.syncTurn(this.store.getState());
        });
      });
      return;
    }

    if (result.isGameOver && result.winnerTeam) {
      this.phase = TurnPhase.GAME_OVER;
      this.handleGameOver(result.winnerTeam);
    } else {
      this.phase = TurnPhase.AWAITING_INPUT;
    }

    if (!opts?.skipLog) {
      this.store.recordSnapshot();
      const prefix = opts?.logPrefix ?? '';
      const suffix = opts?.logSuffix ?? '';
      this.store.addLogEntry({
        turnNumber: turnNum,
        seat,
        text: prefix + result.logText + suffix,
        pokerText: result.pokerText
      });
    } else {
      this.store.triggerUIUpdate();
    }

    this.syncTurn(this.store.getState());
  }

  public syncTurn(state: GameState): void {
    if (state.isGameOver && !this.store.isReplaying) {
      this.phase = TurnPhase.GAME_OVER;
      this.handleGameOver(state.winnerTeam || null);
      return;
    }

    if (!state.isGameOver) {
      if (this.isGameOverShown || this.gameOverTimeoutId !== null) {
        this.clearGameOverPopupState();
        this.updateScreenGlow(null);
        this.overlaysUI.hideAll();
      }
    }

    if (!this.store.isInMatch() || this.store.isMultiplayer) {
      this.cancelAllTimers();
      return;
    }

    if (this.store.isCombatDelaying || this.phase === TurnPhase.COMBAT_DELAY || this.store.isReplaying) {
      return;
    }

    // Auto-refill for bot seats
    this.checkAndTriggerAutoRefill(state);

    // Sync Turn Clock
    this.syncTurnClock(state);

    // Schedule Bot Turn if active seat is a bot
    const effectiveSeat = state.pendingRefills.length > 0 ? state.pendingRefills[0].seat : state.activePlayer;
    if (this.store.botSeats[effectiveSeat] && !state.isGameOver && !this.store.isCombatDelaying) {
      this.scheduleBotTurn(state);
    } else {
      if (this.botTimer !== null) {
        clearTimeout(this.botTimer);
        this.botTimer = null;
      }
    }
  }

  private checkAndTriggerAutoRefill(state: GameState): void {
    if (state.isGameOver || this.store.isReplaying || this.store.isCombatDelaying || state.pendingRefills.length === 0) {
      return;
    }

    const activeSeat = state.pendingRefills[0].seat;
    const player = state.players[activeSeat];

    if (!player || player.baseDeck.length === 0) {
      state.pendingRefills.shift();
      this.store.triggerUIUpdate();
      return;
    }

    const isMyTurn = !this.store.isMultiplayer || (this.store.mySeats && this.store.mySeats.includes(activeSeat));
    if (!isMyTurn || this.store.botSeats[activeSeat]) {
      if (player.baseDeck.length > 0) {
        let maxIdx = 0;
        for (let i = 1; i < player.baseDeck.length; i++) {
          if (player.baseDeck[i].rank > player.baseDeck[maxIdx].rank) {
            maxIdx = i;
          }
        }
        const slot = state.pendingRefills[0].slot;
        this.dispatchAction(
          {
            type: 'REFILL_TRENCH',
            input1: slot,
            input2: maxIdx
          },
          {
            botStrategies: {
              [PlayerSeat.NORTH]: DEFAULT_BOT_PROFILE.trenchStrategy,
              [PlayerSeat.EAST]: DEFAULT_BOT_PROFILE.trenchStrategy,
              [PlayerSeat.SOUTH]: DEFAULT_BOT_PROFILE.trenchStrategy,
              [PlayerSeat.WEST]: DEFAULT_BOT_PROFILE.trenchStrategy
            }
          }
        );
      }
    }
  }

  private syncTurnClock(state: GameState): void {
    if (this.isExecutingTimeout || this.store.isMultiplayer || state.isGameOver || this.store.isCombatDelaying || this.store.isReplaying) {
      if (this.turnClockInterval !== null) {
        clearInterval(this.turnClockInterval);
        this.turnClockInterval = null;
      }
      return;
    }

    const activeSeat = state.pendingRefills.length > 0
      ? state.pendingRefills[0].seat
      : (state.setupState?.inSetup
          ? (
              ([PlayerSeat.NORTH, PlayerSeat.EAST, PlayerSeat.SOUTH, PlayerSeat.WEST] as PlayerSeat[]).find(s => !state.setupState.setupCompletedSeats.includes(s) && (this.store.mySeats?.includes(s) || this.store.mySeat === s)) ??
              ([PlayerSeat.NORTH, PlayerSeat.EAST, PlayerSeat.SOUTH, PlayerSeat.WEST] as PlayerSeat[]).find(s => !state.setupState.setupCompletedSeats.includes(s)) ??
              state.activePlayer
            )
          : state.activePlayer);
    const limit = this.store.turnTimeLimit ?? DEFAULT_TURN_TIME_LIMIT;

    if (limit === 0) {
      if (this.turnClockInterval !== null) {
        clearInterval(this.turnClockInterval);
        this.turnClockInterval = null;
      }
      this.store.setTurnDeadline(null, activeSeat);
      return;
    }

    const currentStage = state.pendingRefills.length > 0 ? 'COMBAT_REFILL' : (state.setupState?.inSetup ? 'SETUP_DRAFT' : 'PLAYER_TURN');
    const isNewTurn = this.lastSeat !== activeSeat || this.lastTurnCount !== state.turnCount || this.lastStage !== currentStage;

    if (isNewTurn) {
      if (this.turnClockInterval !== null) {
        clearInterval(this.turnClockInterval);
        this.turnClockInterval = null;
      }
      this.lastSeat = activeSeat;
      this.lastTurnCount = state.turnCount;
      this.lastStage = currentStage;

      const durationSec = currentStage === 'COMBAT_REFILL' ? 10 : (currentStage === 'SETUP_DRAFT' ? 60 : limit);
      const deadline = Date.now() + durationSec * 1000;
      this.store.setTurnDeadline(deadline, activeSeat);
    }

    if (!this.turnClockInterval && this.store.turnEndsAt !== null) {
      this.turnClockInterval = setInterval(() => this.checkClockExpiry(), 250);
    }
  }

  private checkClockExpiry(): void {
    const currentState = this.store.getState();
    if (currentState.isGameOver || this.store.isCombatDelaying || this.store.isReplaying || this.phase === TurnPhase.COMBAT_DELAY) {
      if (this.turnClockInterval !== null) {
        clearInterval(this.turnClockInterval);
        this.turnClockInterval = null;
      }
      return;
    }

    if (this.store.turnEndsAt && Date.now() >= this.store.turnEndsAt) {
      if (this.turnClockInterval !== null) {
        clearInterval(this.turnClockInterval);
        this.turnClockInterval = null;
      }
      this.isExecutingTimeout = true;

      const currentSeat = this.store.timerActiveSeat;

      if (currentState.setupState?.inSetup) {
        this.isExecutingTimeout = false;
        const player = currentState.players[currentSeat];
        if (player && player.baseDeck.length > 0) {
          executeTrenchSingleCardSelect(currentState, currentSeat, 0, this.store.botSeats);
          this.store.triggerUIUpdate();
          this.syncTurn(this.store.getState());
        }
      } else if (currentState.pendingRefills.length > 0) {
        this.isExecutingTimeout = false;
        const activeRefill = currentState.pendingRefills[0];
        const player = currentState.players[activeRefill.seat];
        if (player && player.baseDeck.length > 0) {
          this.dispatchAction({
            type: 'REFILL_TRENCH',
            input1: activeRefill.slot,
            input2: 0
          });
        }
      } else {
        const randomAction = getRandomLegalAction(currentState, currentSeat);
        this.isExecutingTimeout = false;
        this.dispatchAction(randomAction, {
          deferPostCombat: true,
          logSuffix: ' (timer)'
        });
      }
    }
  }

  private scheduleBotTurn(state: GameState): void {
    if (state.isGameOver || this.store.isReplaying || state.setupState?.inSetup || this.phase === TurnPhase.COMBAT_DELAY) {
      if (this.botTimer !== null) {
        clearTimeout(this.botTimer);
        this.botTimer = null;
      }
      return;
    }

    const effectiveSeat = state.pendingRefills.length > 0 ? state.pendingRefills[0].seat : state.activePlayer;
    if (!this.store.botSeats[effectiveSeat]) {
      if (this.botTimer !== null) {
        clearTimeout(this.botTimer);
        this.botTimer = null;
      }
      return;
    }

    if (this.botTimer !== null) return;

    this.botTimer = setTimeout(() => {
      this.botTimer = null;
      const currentState = this.store.getState();

      if (currentState.isGameOver || this.store.isReplaying || currentState.setupState?.inSetup || this.store.isCombatDelaying || this.phase === TurnPhase.COMBAT_DELAY) {
        return;
      }

      if (currentState.pendingRefills.length > 0) {
        this.checkAndTriggerAutoRefill(currentState);
        const updatedState = this.store.getState();
        if (updatedState.pendingRefills.length > 0) {
          this.botTimer = setTimeout(() => this.scheduleBotTurn(this.store.getState()), 100);
          return;
        }
      }

      const activeSeat = currentState.pendingRefills.length > 0 ? currentState.pendingRefills[0].seat : currentState.activePlayer;
      if (!this.store.botSeats[activeSeat]) return;

      const botCandidate = getBestBotAction(currentState, DEFAULT_BOT_PROFILE);
      const actionToDispatch: GameAction = botCandidate ? botCandidate.action : { type: 'SKIP_TURN', input1: undefined, input2: null };

      const botStrategies = {
        [PlayerSeat.NORTH]: DEFAULT_BOT_PROFILE.trenchStrategy,
        [PlayerSeat.EAST]: DEFAULT_BOT_PROFILE.trenchStrategy,
        [PlayerSeat.SOUTH]: DEFAULT_BOT_PROFILE.trenchStrategy,
        [PlayerSeat.WEST]: DEFAULT_BOT_PROFILE.trenchStrategy
      };

      this.dispatchAction(actionToDispatch, {
        deferPostCombat: true,
        botStrategies
      });
    }, this.store.botSpeedMs);
  }

  public updateScreenGlow(winnerTeam: Team | null): void {
    if (this.appElement) {
      this.appElement.classList.remove('winning-glow-team-a', 'winning-glow-team-b');
    }
    const boardElement = typeof document !== 'undefined'
      ? (document.querySelector('.board-grid') || document.getElementById('board-container'))
      : null;
    if (!boardElement) return;
    boardElement.classList.remove('winning-glow-team-a', 'winning-glow-team-b');
    if (winnerTeam === 'A') {
      boardElement.classList.add('winning-glow-team-a');
    } else if (winnerTeam === 'B') {
      boardElement.classList.add('winning-glow-team-b');
    }
  }

  public clearGameOverPopupState(): void {
    if (this.gameOverTimeoutId !== null) {
      clearTimeout(this.gameOverTimeoutId);
      this.gameOverTimeoutId = null;
    }
    this.isGameOverShown = false;
    this.pendingWinnerTeam = null;
    this.pendingMessage = undefined;
  }

  public handleGameOver(winnerTeam: Team | null, message?: string): void {
    this.pendingWinnerTeam = winnerTeam;
    if (message !== undefined) {
      this.pendingMessage = message;
    }

    this.updateScreenGlow(this.pendingWinnerTeam);

    if (this.isGameOverShown) {
      this.overlaysUI.showGameOver(
        this.pendingWinnerTeam,
        {
          onRematch: () => this.handleResetOrRematch(),
          onAcceptRematch: () => this.handleAcceptRematch(),
          onBackToLobby: () => this.handleBackToLobby(),
          onReviewGame: () => {
            this.overlaysUI.hideAll();
            this.store.reviewGame();
          }
        },
        this.pendingMessage,
        this.store.rematchOffer,
        this.store.myPlayerId,
        this.store.getRematchMode()
      );
      return;
    }

    if (this.gameOverTimeoutId !== null) return;

    this.gameOverTimeoutId = setTimeout(() => {
      this.gameOverTimeoutId = null;
      this.isGameOverShown = true;
      this.updateScreenGlow(this.pendingWinnerTeam);
      this.overlaysUI.showGameOver(
        this.pendingWinnerTeam,
        {
          onRematch: () => this.handleResetOrRematch(),
          onAcceptRematch: () => this.handleAcceptRematch(),
          onBackToLobby: () => this.handleBackToLobby(),
          onReviewGame: () => {
            this.overlaysUI.hideAll();
            this.store.reviewGame();
          }
        },
        this.pendingMessage,
        this.store.rematchOffer,
        this.store.myPlayerId,
        this.store.getRematchMode()
      );
    }, 600);
  }

  public showGameOverMenu(): void {
    const state = this.store.getState();
    const winnerTeam = this.pendingWinnerTeam ?? state.winnerTeam ?? null;
    if (this.gameOverTimeoutId !== null) {
      clearTimeout(this.gameOverTimeoutId);
      this.gameOverTimeoutId = null;
    }
    this.isGameOverShown = true;
    this.updateScreenGlow(winnerTeam);
    this.overlaysUI.showGameOver(
      winnerTeam,
      {
        onRematch: () => this.handleResetOrRematch(),
        onAcceptRematch: () => this.handleAcceptRematch(),
        onBackToLobby: () => this.handleBackToLobby(),
        onReviewGame: () => {
          this.overlaysUI.hideAll();
          this.store.reviewGame();
        }
      },
      this.pendingMessage,
      this.store.rematchOffer,
      this.store.myPlayerId,
      this.store.getRematchMode()
    );
  }

  public handleResetOrRematch(): void {
    if (this.store.isMultiplayer) {
      if (this.store.getRematchMode() === 'return_to_lobby') {
        this.clearGameOverPopupState();
        this.updateScreenGlow(null);
        this.overlaysUI.hideAll();
        socketClient.resetMatch();
      } else {
        const startingHumans = this.store.roomState?.startingPlayerIds ?? [];
        if (startingHumans.length <= 1) {
          this.clearGameOverPopupState();
          this.updateScreenGlow(null);
          this.overlaysUI.hideAll();
        }
        socketClient.requestRematch();
      }
    } else {
      this.clearGameOverPopupState();
      this.updateScreenGlow(null);
      this.overlaysUI.hideAll();
      this.cancelAllTimers();
      this.phase = TurnPhase.AWAITING_INPUT;
      this.isGameOverShown = false;
      this.store.resetGame(true);
      this.syncTurn(this.store.getState());
    }
  }

  public handleAcceptRematch(): void {
    if (this.store.isMultiplayer) {
      socketClient.acceptRematch();
    }
  }

  public handleBackToLobby(): void {
    this.clearGameOverPopupState();
    this.updateScreenGlow(null);
    this.overlaysUI.hideAll();
    this.cancelAllTimers();
    this.phase = TurnPhase.IDLE;
    if (this.store.isMultiplayer) {
      socketClient.leaveRoom();
    } else {
      this.store.leaveLocalGame();
    }
  }
}
