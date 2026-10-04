import { GameState, PlayerSeat } from '../../core/types';
import { GameStore } from '../../store/store';

export interface CompassSeatSlot {
  slot: HTMLElement;
  dirLabel: HTMLElement;
  nameLabel: HTMLElement;
}

export interface CompassSlots {
  top: CompassSeatSlot;
  right: CompassSeatSlot;
  bottom: CompassSeatSlot;
  left: CompassSeatSlot;
}

export class StatusUI {
  private container: HTMLElement;
  private timerInterval: any = null;
  private lastDisplayedSecs: number | null = null;
  private lastWarningState: boolean | null = null;

  // Cached DOM elements for in-place updates
  private messageBox: HTMLElement | null = null;
  private messageContent: HTMLElement | null = null;
  private timerElement: HTMLElement | null = null;
  private compassBox: HTMLElement | null = null;
  private compassSlots: CompassSlots | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public stopTimerCountdown(): void {
    if (this.timerInterval !== null) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.lastDisplayedSecs = null;
    this.lastWarningState = null;
  }

  private initDOMStructure(): void {
    this.container.innerHTML = '';

    if (this.container.style.display !== 'none') {
      this.container.style.display = 'flex';
    }
    this.container.style.flexDirection = 'column';
    this.container.style.gap = '0px';

    // 1. Message Board Box (message + timer)
    this.messageBox = document.createElement('div');
    this.messageBox.className = 'message-board-box';
    this.messageBox.style.display = 'flex';
    this.messageBox.style.alignItems = 'center';
    this.messageBox.style.justifyContent = 'space-between';
    this.messageBox.style.height = '48px';
    this.messageBox.style.minHeight = '48px';
    this.messageBox.style.maxHeight = '48px';
    this.messageBox.style.boxSizing = 'border-box';
    this.messageBox.style.padding = '6px 10px';
    this.messageBox.style.borderRadius = '8px';
    this.messageBox.style.flexShrink = '0';
    this.messageBox.style.gap = '8px';
    this.messageBox.style.overflow = 'hidden';

    this.messageContent = document.createElement('div');
    this.messageContent.className = 'message-content';
    this.messageContent.style.flex = '1';
    this.messageContent.style.minWidth = '0';
    this.messageContent.style.fontWeight = '700';
    this.messageContent.style.fontSize = '13px';
    this.messageContent.style.lineHeight = '1.25';
    this.messageContent.style.display = '-webkit-box';
    (this.messageContent.style as any).webkitLineClamp = '2';
    (this.messageContent.style as any).webkitBoxOrient = 'vertical';
    this.messageContent.style.overflow = 'hidden';
    this.messageContent.style.wordBreak = 'break-word';

    this.timerElement = document.createElement('div');
    this.timerElement.className = 'turn-timer';
    this.timerElement.style.flexShrink = '0';
    this.timerElement.style.whiteSpace = 'nowrap';
    this.timerElement.style.padding = '4px 8px';
    this.timerElement.style.borderRadius = '4px';
    this.timerElement.style.fontSize = '12px';
    this.timerElement.style.fontWeight = '700';
    this.timerElement.style.fontFamily = "var(--Font_card, 'Outfit', sans-serif)";
    this.timerElement.style.fontVariantNumeric = 'tabular-nums';
    this.timerElement.style.letterSpacing = '0.5px';
    this.timerElement.style.transition = 'all 0.3s ease';

    this.messageBox.appendChild(this.messageContent);
    this.messageBox.appendChild(this.timerElement);
    this.container.appendChild(this.messageBox);

    // 2. Dedicated Compass Square Box (replacing the status bar)
    this.compassBox = document.createElement('div');
    this.compassBox.className = 'status-compass-box board-compass-box';
    this.compassBox.title = 'Compass (North, East, South, West)';

    const innerGrid = document.createElement('div');
    innerGrid.className = 'compass-inner-grid';

    const createSlot = (slotClass: string): CompassSeatSlot => {
      const slot = document.createElement('div');
      slot.className = `compass-seat-slot ${slotClass}`;

      const dirLabel = document.createElement('div');
      dirLabel.className = 'compass-seat-direction';

      const nameLabel = document.createElement('div');
      nameLabel.className = 'compass-seat-player';

      slot.appendChild(dirLabel);
      slot.appendChild(nameLabel);
      innerGrid.appendChild(slot);

      return { slot, dirLabel, nameLabel };
    };

    const top = createSlot('compass-slot-top compass-top');
    const right = createSlot('compass-slot-right compass-right');
    const bottom = createSlot('compass-slot-bottom compass-bottom');
    const left = createSlot('compass-slot-left compass-left');

    const centerDot = document.createElement('div');
    centerDot.className = 'compass-center-dot';
    innerGrid.appendChild(centerDot);

    this.compassBox.appendChild(innerGrid);
    this.container.appendChild(this.compassBox);

    this.compassSlots = { top, right, bottom, left };
  }

  public render(state: GameState, store?: GameStore): void {
    this.stopTimerCountdown();

    if (!this.messageBox || !this.container.contains(this.messageBox)) {
      this.initDOMStructure();
    }

    const seatBaseNames = ['North', 'East', 'South', 'West'];
    const activeSeat = state.pendingRefills?.length > 0
      ? state.pendingRefills[0].seat
      : (state.setupState?.inSetup
          ? ([PlayerSeat.NORTH, PlayerSeat.EAST, PlayerSeat.SOUTH, PlayerSeat.WEST] as PlayerSeat[]).find(s => !state.setupState.setupCompletedSeats.includes(s)) ?? state.activePlayer
          : state.activePlayer);

    let isMyTurn = false;
    let messageText = '';

    if (store?.isReplaying) {
      isMyTurn = false;
      if (store.historyIndex === 0) {
        messageText = 'REPLAY — Starting Position';
      } else if (store.activeLogIndex >= 0 && store.activeLogIndex < store.logs.length) {
        const currentLog = store.logs[store.activeLogIndex];
        messageText = `REPLAY — ${currentLog.turnNumber}. ${currentLog.seat}] ${currentLog.text}`;
      } else {
        messageText = 'REPLAY';
      }
    } else if (state.isGameOver) {
      const winner = state.winnerTeam;
      const isTeamA = winner === 'A';
      messageText = winner
        ? `🏆 GAME OVER — TEAM ${isTeamA ? 'GOLD (A)' : 'CYAN (B)'} WON!`
        : '🏆 GAME OVER — DRAW!';
      isMyTurn = false;
    } else {
      const activeSeatName = seatBaseNames[activeSeat];
      const activePlayerState = state.players[activeSeat];
      const activeTeamName = activePlayerState?.team === 'A' ? 'Team Gold' : 'Team Cyan';
      const isBotActive = store ? Boolean(store.botSeats[activeSeat]) : (activeSeat === PlayerSeat.EAST || activeSeat === PlayerSeat.WEST);
      const occupantType = isBotActive ? 'Bot' : 'Player';

      const draftCount = activePlayerState ? activePlayerState.trenchCards.filter(c => c !== null).length : 0;

      if (store && store.isMultiplayer && store.mySeats && store.mySeats.length > 0) {
        isMyTurn = store.mySeats.includes(activeSeat);
        if (isMyTurn) {
          messageText = state.setupState?.inSetup
            ? `YOUR TURN — ${activeSeatName}: Pick Trench Card ${draftCount + 1}/3`
            : (state.pendingRefills?.length > 0 ? `YOUR TURN — ${activeSeatName} (Refill Trench)` : `YOUR TURN — ${activeSeatName} (${activeTeamName})`);
        } else {
          messageText = `${activeSeatName.toUpperCase()}'S TURN — ${occupantType} (${activeTeamName})`;
        }
      } else {
        const isHumanSeat = store ? !store.botSeats[activeSeat] : true;
        isMyTurn = isHumanSeat;
        if (isHumanSeat) {
          messageText = state.setupState?.inSetup
            ? `YOUR TURN — ${activeSeatName}: Pick Trench Card ${draftCount + 1}/3`
            : (state.pendingRefills?.length > 0 ? `YOUR TURN — ${activeSeatName} (Refill Trench)` : `YOUR TURN — ${activeSeatName} (${activeTeamName})`);
        } else {
          messageText = `${activeSeatName.toUpperCase()}'S TURN — Bot (${activeTeamName})`;
        }
      }
    }

    if (this.messageContent) {
      this.messageContent.innerText = messageText;
      if (store?.isReplaying) {
        if (store.historyIndex === 0) {
          this.messageContent.style.color = 'var(--Team_A_color, #ffd900)';
        } else if (store.activeLogIndex >= 0 && store.activeLogIndex < store.logs.length) {
          const currentLog = store.logs[store.activeLogIndex];
          const isTeamA = currentLog.seat === 'N' || currentLog.seat === 'S';
          this.messageContent.style.color = isTeamA ? 'var(--Team_A_color, #ffd900)' : 'var(--Team_B_color, #00d9ff)';
        } else {
          this.messageContent.style.color = 'var(--Team_A_color, #ffd900)';
        }
      } else if (state.isGameOver) {
        this.messageContent.style.color = state.winnerTeam === 'A' ? 'var(--Team_A_color, #ffd900)' : (state.winnerTeam === 'B' ? 'var(--Team_B_color, #00d9ff)' : '#f8fafc');
      } else {
        const activePlayerState = state.players[state.activePlayer];
        this.messageContent.style.color = isMyTurn ? '#4ade80' : (activePlayerState?.team === 'A' ? 'var(--Team_A_color, #ffd900)' : 'var(--Team_B_color, #00d9ff)');
      }
    }

    if (this.timerElement) {
      this.timerElement.style.display = (state.isGameOver || Boolean(store?.isReplaying)) ? 'none' : '';
    }

    // Compass Square rendering & rotation logic
    if (this.compassSlots) {
      const rawAngle = store ? store.boardRotationAngle : 0;
      const angle = ((rawAngle % 360) + 360) % 360;

      const ROTATION_SEAT_MAP: Record<number, { top: PlayerSeat; right: PlayerSeat; bottom: PlayerSeat; left: PlayerSeat }> = {
        0:   { top: PlayerSeat.NORTH, right: PlayerSeat.EAST,  bottom: PlayerSeat.SOUTH, left: PlayerSeat.WEST },
        90:  { top: PlayerSeat.WEST,  right: PlayerSeat.NORTH, bottom: PlayerSeat.EAST,  left: PlayerSeat.SOUTH },
        180: { top: PlayerSeat.SOUTH, right: PlayerSeat.WEST,  bottom: PlayerSeat.NORTH, left: PlayerSeat.EAST },
        270: { top: PlayerSeat.EAST,  right: PlayerSeat.SOUTH, bottom: PlayerSeat.WEST,  left: PlayerSeat.NORTH }
      };

      const mapping = ROTATION_SEAT_MAP[angle] || ROTATION_SEAT_MAP[0];

      const getOccupantName = (seat: PlayerSeat): string => {
        const isBot = store ? Boolean(store.botSeats[seat]) : (seat === PlayerSeat.EAST || seat === PlayerSeat.WEST);
        let occupantName = isBot ? 'Bot' : 'Player';
        if (store && store.roomState && store.roomState.seats && store.roomState.seats[seat]?.name) {
          occupantName = store.roomState.seats[seat].name!;
        }
        return occupantName;
      };

      const updateSlot = (slotElements: CompassSeatSlot, seat: PlayerSeat) => {
        const playerState = state.players[seat];
        const isTeamA = playerState ? playerState.team === 'A' : (seat === PlayerSeat.NORTH || seat === PlayerSeat.SOUTH);
        const teamColor = isTeamA ? 'var(--Team_A_color, #ffd900)' : 'var(--Team_B_color, #00d9ff)';
        const isTurn = !store?.isReplaying && !state.isGameOver && activeSeat === seat;

        const directionName = seatBaseNames[seat];
        slotElements.dirLabel.innerText = directionName;
        slotElements.dirLabel.textContent = directionName;

        const occupant = getOccupantName(seat);
        slotElements.nameLabel.innerText = occupant;
        slotElements.nameLabel.textContent = occupant;
        slotElements.nameLabel.title = occupant;

        // Match team color the sits text
        slotElements.dirLabel.style.color = teamColor;
        slotElements.nameLabel.style.color = teamColor;

        // Highlight current turn sit by making the other sits color text slightly transparent
        if (state.isGameOver) {
          slotElements.slot.style.opacity = '0.75';
          slotElements.slot.style.fontWeight = '500';
          slotElements.slot.style.filter = 'none';
        } else if (isTurn) {
          slotElements.slot.style.opacity = '1.0';
          slotElements.slot.style.fontWeight = '700';
          slotElements.slot.style.filter = 'none';
        } else {
          slotElements.slot.style.opacity = '0.35';
          slotElements.slot.style.fontWeight = '500';
          slotElements.slot.style.filter = 'none';
        }
      };

      updateSlot(this.compassSlots.top, mapping.top);
      updateSlot(this.compassSlots.right, mapping.right);
      updateSlot(this.compassSlots.bottom, mapping.bottom);
      updateSlot(this.compassSlots.left, mapping.left);
    }

    this.startTimerCountdown(store);
  }

  public startTimerCountdown(store?: GameStore): void {
    this.stopTimerCountdown();

    const timerElement = this.timerElement || (this.container.querySelector('.turn-timer') as HTMLElement);
    if (!timerElement) return;

    if (store && store.turnTimeLimit === 0) {
      timerElement.innerText = '⏱️ ∞s';
      timerElement.style.opacity = '0.5';
      timerElement.style.background = 'rgba(51, 65, 85, 0.4)';
      timerElement.style.border = '1px solid rgba(148, 163, 184, 0.3)';
      timerElement.style.color = '#cbd5e1';
      timerElement.style.boxShadow = 'none';
      return;
    }

    const updateDisplay = () => {
      if (!timerElement.isConnected) {
        this.stopTimerCountdown();
        return;
      }

      let remainingSecs = 30;
      if (store) {
        remainingSecs = store.timerRemainingSeconds;
      }

      const isWarning = remainingSecs <= 10;

      if (this.lastDisplayedSecs !== remainingSecs) {
        this.lastDisplayedSecs = remainingSecs;
        timerElement.innerText = `⏱️ ${remainingSecs}s`;
      }

      if (this.lastWarningState !== isWarning) {
        this.lastWarningState = isWarning;
        if (!isWarning) {
          timerElement.style.opacity = '0.5';
          timerElement.style.background = 'rgba(51, 65, 85, 0.4)';
          timerElement.style.border = '1px solid rgba(148, 163, 184, 0.3)';
          timerElement.style.color = '#cbd5e1';
          timerElement.style.boxShadow = 'none';
        } else {
          timerElement.style.opacity = '1.0';
          timerElement.style.background = 'rgba(239, 68, 68, 0.25)';
          timerElement.style.border = '1px solid #ef4444';
          timerElement.style.color = '#ef4444';
          timerElement.style.boxShadow = '0 0 8px rgba(239, 68, 68, 0.5)';
        }
      }

      if (!store || !store.turnEndsAt || store.turnEndsAt <= Date.now()) {
        this.stopTimerCountdown();
      }
    };

    updateDisplay();
    this.timerInterval = setInterval(updateDisplay, 250);
  }
}
