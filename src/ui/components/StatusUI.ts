import { isSeatOccupyingHill, isSeatKingAlive } from '../../core/engine';
import { GameState, Pc, PlayerSeat } from '../../core/types';
import { GameStore } from '../../store/store';

interface SeatRowElements {
  row: HTMLElement;
  nameLabel: HTMLElement;
  turnBadge: HTMLElement;
  kingLed: HTMLElement;
  hillLed: HTMLElement;
  baseDeckBox: HTMLElement;
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
  private statusBox: HTMLElement | null = null;
  private seatRowElements: SeatRowElements[] = [];

  constructor(container: HTMLElement) {
    this.container = container;
  }

  private isKingAlive(state: GameState, seat: PlayerSeat): boolean {
    return isSeatKingAlive(state.board, seat);
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
    this.seatRowElements = [];

    if (this.container.style.display !== 'none') {
      this.container.style.display = 'flex';
    }
    this.container.style.flexDirection = 'column';
    this.container.style.gap = '10px';

    // 1. Separate Message Board Box
    this.messageBox = document.createElement('div');
    this.messageBox.className = 'panel message-board-box';
    this.messageBox.style.display = 'flex';
    this.messageBox.style.alignItems = 'center';
    this.messageBox.style.justifyContent = 'space-between';
    this.messageBox.style.height = '52px';
    this.messageBox.style.minHeight = '52px';
    this.messageBox.style.maxHeight = '52px';
    this.messageBox.style.boxSizing = 'border-box';
    this.messageBox.style.padding = '8px 12px';
    this.messageBox.style.borderRadius = '8px';
    this.messageBox.style.background = 'rgba(15, 23, 42, 0.85)';
    this.messageBox.style.border = '1px solid #1e293b';
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
    this.timerElement.style.fontWeight = '800';
    this.timerElement.style.letterSpacing = '0.5px';
    this.timerElement.style.transition = 'all 0.3s ease';

    this.messageBox.appendChild(this.messageContent);
    this.messageBox.appendChild(this.timerElement);
    this.container.appendChild(this.messageBox);

    // 2. Dedicated Players Status Box
    this.statusBox = document.createElement('div');
    this.statusBox.className = 'panel players-status-box';

    const seats = [PlayerSeat.NORTH, PlayerSeat.EAST, PlayerSeat.SOUTH, PlayerSeat.WEST];

    seats.forEach(() => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.style.alignItems = 'center';
      row.style.marginBottom = '6px';
      row.style.padding = '5px 8px';
      row.style.borderRadius = '6px';
      row.style.transition = 'all 0.25s ease';

      const infoContainer = document.createElement('div');
      infoContainer.style.display = 'flex';
      infoContainer.style.alignItems = 'center';

      const nameLabel = document.createElement('span');
      nameLabel.style.fontSize = '12px';
      infoContainer.appendChild(nameLabel);

      const turnBadge = document.createElement('span');
      turnBadge.className = 'status-turn-badge';
      turnBadge.style.fontSize = '9px';
      turnBadge.style.fontWeight = '800';
      turnBadge.style.padding = '1px 5px';
      turnBadge.style.borderRadius = '3px';
      turnBadge.style.color = '#0b0f19';
      turnBadge.style.marginLeft = '6px';
      turnBadge.style.letterSpacing = '0.5px';
      turnBadge.innerText = 'TURN';
      turnBadge.style.display = 'none';
      infoContainer.appendChild(turnBadge);

      const indicatorsContainer = document.createElement('div');
      indicatorsContainer.style.display = 'flex';
      indicatorsContainer.style.alignItems = 'center';
      indicatorsContainer.style.gap = '8px';

      const kingLed = document.createElement('div');
      kingLed.style.width = '8px';
      kingLed.style.height = '8px';
      kingLed.style.borderRadius = '50%';

      const hillLed = document.createElement('div');
      hillLed.style.width = '8px';
      hillLed.style.height = '8px';
      hillLed.style.borderRadius = '50%';

      const baseDeckBox = document.createElement('div');
      baseDeckBox.style.padding = '1px 6px';
      baseDeckBox.style.borderRadius = '4px';
      baseDeckBox.style.fontSize = '11px';
      baseDeckBox.style.fontWeight = '700';
      baseDeckBox.style.background = 'rgba(30, 41, 59, 0.8)';
      baseDeckBox.style.border = '1px solid rgba(148, 163, 184, 0.25)';
      baseDeckBox.style.color = '#cbd5e1';
      baseDeckBox.style.minWidth = '18px';
      baseDeckBox.style.textAlign = 'center';

      indicatorsContainer.appendChild(kingLed);
      indicatorsContainer.appendChild(hillLed);
      indicatorsContainer.appendChild(baseDeckBox);

      row.appendChild(infoContainer);
      row.appendChild(indicatorsContainer);
      this.statusBox!.appendChild(row);

      this.seatRowElements.push({
        row,
        nameLabel,
        turnBadge,
        kingLed,
        hillLed,
        baseDeckBox
      });
    });

    this.container.appendChild(this.statusBox);
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

    if (state.isGameOver) {
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

      const draftCount = activePlayerState ? activePlayerState.positionalCards.filter(c => c !== null).length : 0;

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
      if (state.isGameOver) {
        this.messageContent.style.color = state.winnerTeam === 'A' ? '#f59e0b' : (state.winnerTeam === 'B' ? '#06b6d4' : '#f8fafc');
      } else {
        const activePlayerState = state.players[state.activePlayer];
        this.messageContent.style.color = isMyTurn ? '#4ade80' : (activePlayerState?.team === 'A' ? '#f59e0b' : '#06b6d4');
      }
    }

    if (this.timerElement) {
      this.timerElement.style.display = state.isGameOver ? 'none' : '';
    }

    const seats = [PlayerSeat.NORTH, PlayerSeat.EAST, PlayerSeat.SOUTH, PlayerSeat.WEST];

    seats.forEach((seat, idx) => {
      const el = this.seatRowElements[idx];
      if (!el) return;

      const playerState = state.players[seat];
      const isTeamA = playerState?.team === 'A';
      const teamColor = isTeamA ? '#f59e0b' : '#06b6d4';
      const isTurn = activeSeat === seat;

      if (isTurn) {
        el.row.style.border = `1.5px solid ${teamColor}`;
        el.row.style.background = isTeamA ? 'rgba(245, 158, 11, 0.16)' : 'rgba(6, 182, 212, 0.16)';
        el.row.style.boxShadow = `0 0 10px ${isTeamA ? 'rgba(245, 158, 11, 0.28)' : 'rgba(6, 182, 212, 0.28)'}`;
      } else {
        el.row.style.border = '1.5px solid transparent';
        el.row.style.background = 'rgba(15, 23, 42, 0.45)';
        el.row.style.boxShadow = 'none';
      }

      const isBot = store ? Boolean(store.botSeats[seat]) : (seat === PlayerSeat.EAST || seat === PlayerSeat.WEST);
      let occupantName = isBot ? 'Bot' : 'Player';
      if (store && store.roomState && store.roomState.seats && store.roomState.seats[seat] && store.roomState.seats[seat].name) {
        occupantName = store.roomState.seats[seat].name!;
      }

      el.nameLabel.style.fontWeight = isTurn ? 'bold' : '500';
      el.nameLabel.style.color = teamColor;
      el.nameLabel.innerText = `${seatBaseNames[idx]} (${occupantName})`;

      if (isTurn) {
        el.turnBadge.style.display = '';
        el.turnBadge.style.background = teamColor;
      } else {
        el.turnBadge.style.display = 'none';
      }

      const isAlive = this.isKingAlive(state, seat);
      const isHill = isSeatOccupyingHill(state.board, seat);

      // King LED
      el.kingLed.title = isAlive ? 'King Alive' : 'King Eliminated';
      if (isAlive) {
        el.kingLed.style.background = '#22c55e';
        el.kingLed.style.boxShadow = '0 0 6px rgba(34, 197, 94, 0.7)';
        el.kingLed.style.opacity = '1';
      } else {
        el.kingLed.style.background = '#ef4444';
        el.kingLed.style.boxShadow = 'none';
        el.kingLed.style.opacity = '0.35';
      }

      // Hill LED
      el.hillLed.title = isHill ? 'On Hill' : 'Not on Hill';
      if (isHill) {
        el.hillLed.style.background = '#f59e0b';
        el.hillLed.style.boxShadow = '0 0 6px rgba(245, 158, 11, 0.8)';
        el.hillLed.style.opacity = '1';
      } else {
        el.hillLed.style.background = '#475569';
        el.hillLed.style.boxShadow = 'none';
        el.hillLed.style.opacity = '0.3';
      }

      // Base Deck count
      const baseDeckCount = playerState?.baseDeck ? playerState.baseDeck.length : 0;
      el.baseDeckBox.innerText = `${baseDeckCount}`;
      el.baseDeckBox.title = `Base Deck: ${baseDeckCount} cards`;
    });

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
