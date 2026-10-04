import { DEFAULT_TURN_TIME_LIMIT } from '../../config';
import { generateLobbyName } from '../../core/lobbyNames';
import { PlayerSeat } from '../../core/types';
import { RoomState } from '../../net/events';
import { socketClient } from '../../net/socketClient';
import { GameStore, store } from '../../store/store';
import { toggleRulesModal } from './RulesModal';

export class LobbyUI {
  private container: HTMLElement;
  private playerNameInputVal: string = '';
  private roomCodeInputVal: string = '';
  private isPublicRoomVal: boolean = true;

  constructor(container: HTMLElement) {
    this.container = container;
    socketClient.subscribePublicRooms(() => {
      if (!store.roomState) {
        this.renderAuthView(store);
      }
    });
  }

  public render(storeInstance: GameStore): void {
    const roomState = storeInstance.roomState;

    if (storeInstance.isLocalGame || (roomState && (roomState.status === 'playing' || roomState.status === 'ended'))) {
      this.container.classList.add('hidden');
      this.container.innerHTML = '';
      return;
    }

    this.container.classList.remove('hidden');

    if (!roomState) {
      this.renderAuthView(storeInstance);
    } else {
      this.renderLobbyView(storeInstance);
    }
  }

  private toggleRulesModal() {
    toggleRulesModal();
  }

  private renderPublicRoomsList(): string {
    const rooms = socketClient.publicRooms;
    if (!rooms || rooms.length === 0) {
      return `<div style="font-size: 13px; color: var(--Color_Beige); font-style: italic; padding: 6px 0; opacity: 0.85;">No active rooms right now. Create one above!</div>`;
    }

    return `
      <div style="display: flex; flex-direction: column; gap: 6px; max-height: 140px; overflow-y: auto;">
        ${rooms.map(r => {
      const isPlaying = r.status === 'playing' || r.status === 'ended';
      const isPrivate = r.isPublic === false;
      const displayCode = isPrivate ? '----' : r.roomCode;
      return `
          <div class="public-room-row" style="background: transparent; border: 1px solid var(--Color_Beige); opacity: ${isPlaying || isPrivate ? '0.85' : '1'};">
            <div>
              <span class="public-room-code" style="font-weight: 700; color: var(--Color_Beige); font-size: 14px; font-family: var(--Font_card); letter-spacing: 0.5px;">ROOM ${displayCode}</span>
              <span style="font-size: 12px; color: var(--Color_Beige); margin-left: 8px; opacity: 0.85;">Host: ${r.hostName}</span>
              ${isPlaying
          ? `<span style="font-size: 11px; background: transparent; border: 1px solid var(--Color_Beige); color: var(--Color_Beige); padding: 1px 6px; border-radius: 4px; font-weight: 700; margin-left: 8px;">IN GAME</span>`
          : (isPrivate
            ? `<span style="font-size: 11px; background: transparent; border: 1px solid var(--Color_Beige); color: var(--Color_Beige); padding: 1px 6px; border-radius: 4px; font-weight: 700; margin-left: 8px;">🔒 PRIVATE</span>`
            : `<span style="font-size: 11px; color: var(--Color_Beige); margin-left: 8px; font-weight: 600;">(${r.seatsTaken}/4 Seats)</span>`
          )
        }
            </div>
            ${isPlaying
          ? `<button class="copy-btn" disabled style="background: transparent; border: 1px solid rgba(247, 251, 169, 0.4); color: rgba(247, 251, 169, 0.5); padding: 4px 10px; font-weight: 600; cursor: not-allowed;" title="Game is already in progress">⚔️ In Game</button>`
          : (isPrivate
            ? `<button class="copy-btn" disabled style="background: transparent; border: 1px solid rgba(247, 251, 169, 0.4); color: rgba(247, 251, 169, 0.5); padding: 4px 10px; font-weight: 600; cursor: not-allowed;" title="Private room - enter code below to join">🔒 Private</button>`
            : `<button class="btn-join-public-room copy-btn" data-code="${r.roomCode}">🎮 Join Game</button>`
          )
        }
          </div>
        `;
    }).join('')}
      </div>
    `;
  }

  private renderAuthView(store: GameStore): void {
    let savedName = localStorage.getItem('poachers_player_name');
    if (!savedName) {
      savedName = generateLobbyName();
      localStorage.setItem('poachers_player_name', savedName);
    }
    const defaultName = savedName;

    this.container.innerHTML = `
      <div class="lobby-backdrop">
        <div class="lobby-modal">
          <div class="lobby-header">
            <div class="lobby-header-bar">
              <div class="lobby-header-left">
                <div class="lobby-header-spacer" aria-hidden="true">📜 RULES</div>
              </div>
              <div class="lobby-header-center">
                <img src="/assets/poachers_logo.svg" alt="POACHERS" class="lobby-menu-logo" />
              </div>
              <div class="lobby-header-right">
                <button class="btn-show-rules copy-btn">📜 RULES</button>
              </div>
            </div>
            <div class="lobby-tag-title"><span class="lobby-tag-title-text">♦ ♦ ♦ LOBBY ♦ ♦ ♦</span></div>
          </div>

          ${store.netError ? `<div class="error-banner">${store.netError}</div>` : ''}

          <div class="lobby-auth-form">
            <div class="input-group">
              <label class="input-label" for="player-name-input">Your Display Name</label>
              <input type="text" id="player-name-input" class="lobby-input" value="${this.playerNameInputVal || defaultName}" placeholder="Enter name..." />
            </div>

            <div class="form-actions-row" style="align-items: center;">
              <button id="btn-create-room" class="btn-primary" style="flex: 2;">➕ New Game Room</button>
              <label style="display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--Color_Beige); cursor: pointer; flex: 1;">
                <input type="checkbox" id="chk-is-public" ${this.isPublicRoomVal ? 'checked' : ''} style="cursor: pointer; width: 16px; height: 16px; accent-color: #f7fba9;" />
                <span>Public Room</span>
              </label>
            </div>

            <!-- Public / Active Rooms Section -->
            <div class="public-rooms-section">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="font-size: 12px; font-weight: 700; color: var(--Color_Beige); text-transform: uppercase; letter-spacing: 0.5px;">🌐 ACTIVE ROOMS</span>
                <button id="btn-refresh-rooms" class="copy-btn">🔄 Refresh</button>
              </div>
              ${this.renderPublicRoomsList()}
            </div>

            <div style="height: 1px; background: var(--Color_Beige); opacity: 0.4; margin: 4px 0;"></div>

            <div class="form-actions-row" style="align-items: stretch;">
              <input type="text" id="room-code-input" class="lobby-input" maxlength="4" style="flex: 1; min-width: 0; box-sizing: border-box; text-transform: uppercase; letter-spacing: 2px; font-weight: 700; font-family: var(--Font_card);" value="${this.roomCodeInputVal}" placeholder="4 letter Code" />
              <button id="btn-join-room" class="btn-secondary" style="flex: 1; box-sizing: border-box; white-space: nowrap;">🔑 Join by Code</button>
            </div>
          </div>
        </div>
        <div style="position: absolute; bottom: 16px; left: 0; width: 100%; text-align: center; font-size: 11px; color: var(--Color_Beige); opacity: 0.75; pointer-events: auto; user-select: text; -webkit-user-select: text; z-index: 10;">
          All rights reserved . nitai.ieru@gmail.com
        </div>
      </div>
    `;

    const nameInput = this.container.querySelector('#player-name-input') as HTMLInputElement;
    const codeInput = this.container.querySelector('#room-code-input') as HTMLInputElement;
    const chkPublic = this.container.querySelector('#chk-is-public') as HTMLInputElement;

    const btnRules = this.container.querySelector('.btn-show-rules');
    if (btnRules) {
      btnRules.addEventListener('click', () => this.toggleRulesModal());
    }

    if (nameInput) {
      nameInput.addEventListener('input', (e) => {
        this.playerNameInputVal = (e.target as HTMLInputElement).value;
      });
    }

    if (codeInput) {
      codeInput.addEventListener('input', (e) => {
        const val = (e.target as HTMLInputElement).value.toUpperCase();
        this.roomCodeInputVal = val;
        if (val.trim() === 'BOT') {
          store.startBotFastMatch();
        }
      });
    }

    if (chkPublic) {
      chkPublic.addEventListener('change', (e) => {
        this.isPublicRoomVal = (e.target as HTMLInputElement).checked;
      });
    }

    const btnRefresh = this.container.querySelector('#btn-refresh-rooms');
    if (btnRefresh) {
      btnRefresh.addEventListener('click', () => {
        socketClient.fetchPublicRooms();
      });
    }

    this.container.querySelectorAll('.btn-join-public-room').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const targetCode = (e.currentTarget as HTMLElement).getAttribute('data-code');
        if (targetCode) {
          const name = nameInput?.value.trim() || defaultName;
          localStorage.setItem('poachers_player_name', name);
          await socketClient.joinRoom(targetCode, name);
        }
      });
    });


    const btnCreate = this.container.querySelector('#btn-create-room');
    if (btnCreate) {
      btnCreate.addEventListener('click', async () => {
        const name = nameInput?.value.trim() || defaultName;
        const isPublic = chkPublic ? chkPublic.checked : true;
        localStorage.setItem('poachers_player_name', name);
        await socketClient.createRoom(name, isPublic);
      });
    }

    const btnJoin = this.container.querySelector('#btn-join-room');
    if (btnJoin) {
      btnJoin.addEventListener('click', async () => {
        const name = nameInput?.value.trim() || defaultName;
        const code = codeInput?.value.trim().toUpperCase();
        if (code === 'BOT') {
          store.startBotFastMatch();
          return;
        }
        if (!code || code.length !== 4) {
          store.setNetError('Please enter a valid 4-letter room code.');
          return;
        }
        localStorage.setItem('poachers_player_name', name);
        await socketClient.joinRoom(code, name);
      });
    }
  }

  private renderLobbyView(store: GameStore): void {
    const roomState = store.roomState!;
    const isHost = store.myPlayerId === roomState.hostPlayerId;

    let isSeated = false;
    let isMyReady = false;
    if (store.myPlayerId) {
      const playerInfo = roomState.players[store.myPlayerId];
      if (playerInfo) {
        isMyReady = playerInfo.isReady;
      }
      for (let s = 0; s < 4; s++) {
        if (roomState.seats[s as PlayerSeat].playerId === store.myPlayerId) {
          isSeated = true;
          break;
        }
      }
    }

    this.container.innerHTML = `
      <div class="lobby-backdrop">
        <div class="lobby-modal">
          <div class="lobby-header">
            <div class="lobby-header-bar">
              <div class="lobby-header-left">
                <div class="lobby-header-spacer" aria-hidden="true">📜 RULES</div>
              </div>
              <div class="lobby-header-center">
                <img src="/assets/poachers_logo.svg" alt="POACHERS" class="lobby-menu-logo" />
              </div>
              <div class="lobby-header-right">
                <button class="btn-show-rules copy-btn">📜 RULES</button>
              </div>
            </div>

            <div class="lobby-room-code-badge">
              <div class="lobby-room-details-row">
                <span class="room-code-display" style="display: inline-flex; align-items: center; gap: 4px; color: var(--Color_Beige); font-family: var(--Font_card); font-weight: 700; letter-spacing: 1px;">
                  Game Room : ${roomState.roomCode}
                  <button id="btn-copy-code" class="copy-btn-icon" title="Copy Room Code" style="background: none; border: none; cursor: pointer; font-size: 14px; padding: 2px; color: var(--Color_Beige);" aria-label="Copy Code">📋</button>
                </span>
                ${isHost
          ? `<button id="btn-toggle-timer" class="copy-btn" style="padding: 2px 8px; border-radius: 4px; font-weight: 700; cursor: pointer; font-family: var(--Font_card); font-variant-numeric: tabular-nums;">⏱️ ${roomState.turnTimeLimit === 0 ? '∞' : (roomState.turnTimeLimit ?? DEFAULT_TURN_TIME_LIMIT)}s</button>`
          : `<span class="room-timer-badge" style="font-size: 11px; background: transparent; border: 1px solid var(--Color_Beige); padding: 2px 8px; border-radius: 4px; color: var(--Color_Beige); font-weight: 700; font-family: var(--Font_card); font-variant-numeric: tabular-nums;">⏱️ ${roomState.turnTimeLimit === 0 ? '∞' : (roomState.turnTimeLimit ?? DEFAULT_TURN_TIME_LIMIT)}s</span>`
        }
                ${isHost
          ? `<button id="btn-toggle-privacy" class="copy-btn" style="padding: 2px 8px; border-radius: 4px; font-weight: 700; cursor: pointer;">${roomState.isPublic ? '🌐 Public' : '🔒 Private'}</button>`
          : `<span style="font-size: 11px; background: transparent; border: 1px solid var(--Color_Beige); padding: 2px 8px; border-radius: 4px; color: var(--Color_Beige); font-weight: 700;">${roomState.isPublic ? '🌐 Public' : '🔒 Private'}</span>`
        }
              </div>
            </div>
          </div>

          ${store.netError ? `<div class="error-banner">${store.netError}</div>` : ''}

          <div class="teams-container">
            <!-- Team A Column -->
            <div class="team-column team-a">
              <div class="team-header">Team A</div>
              ${this.renderSeatCard(PlayerSeat.NORTH, 'NORTH', roomState, store, isHost)}
              ${this.renderSeatCard(PlayerSeat.SOUTH, 'SOUTH', roomState, store, isHost)}
            </div>

            <div class="teams-separator"></div>

            <!-- Team B Column -->
            <div class="team-column team-b">
              <div class="team-header">Team B</div>
              ${this.renderSeatCard(PlayerSeat.EAST, 'EAST', roomState, store, isHost)}
              ${this.renderSeatCard(PlayerSeat.WEST, 'WEST', roomState, store, isHost)}
            </div>
          </div>

          <div class="lobby-footer">
            <div style="text-align: center; font-size: 13px; color: var(--Color_Beige); font-weight: 600; padding: 4px 0;">
              ⚡ Game starts once all 4 seats are sat & READY.
            </div>
            <div class="lobby-controls-bar" style="display: flex; gap: 10px; flex-wrap: wrap;">
              ${isSeated
        ? `<button id="btn-toggle-ready" class="btn-primary btn-ready ${isMyReady ? 'btn-ready-active' : ''}" style="flex: 2; min-width: 140px; padding: 10px 16px; font-weight: 700; box-shadow: none;">${isMyReady ? '✓ READY' : '⚡ READY UP'}</button>`
        : ''
      }
              ${isHost && [0, 1, 2, 3].some(s => !roomState.seats[s as PlayerSeat].isBot && !roomState.seats[s as PlayerSeat].playerId)
        ? (() => {
          const allHumansReady = Object.values(roomState.players).filter(p => p.isOnline).every(p => p.isReady);
          return `<button id="btn-assign-bots-start" class="btn-primary btn-assign-bots" ${allHumansReady ? '' : 'disabled'} style="flex: 2; min-width: 180px; padding: 10px 16px; font-weight: 700; cursor: ${allHumansReady ? 'pointer' : 'not-allowed'}; opacity: ${allHumansReady ? '1' : '0.45'};" title="${allHumansReady ? 'Fill empty seats with bots and start match' : 'All players must be ready first'}">🤖 Assign Bots & Start</button>`;
        })()
        : ''
      }
              <button id="btn-leave-lobby" class="btn-secondary" style="flex: 1; min-width: 100px;">🚪 Leave Room</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const btnRules = this.container.querySelector('.btn-show-rules');
    if (btnRules) {
      btnRules.addEventListener('click', () => this.toggleRulesModal());
    }

    const btnCopy = this.container.querySelector('#btn-copy-code');
    if (btnCopy) {
      btnCopy.addEventListener('click', () => {
        navigator.clipboard.writeText(roomState.roomCode);
        btnCopy.textContent = '✓';
        setTimeout(() => { btnCopy.textContent = '📋'; }, 1500);
      });
    }

    const btnPrivacy = this.container.querySelector('#btn-toggle-privacy');
    if (btnPrivacy) {
      btnPrivacy.addEventListener('click', () => {
        socketClient.togglePublic();
      });
    }

    const btnTimer = this.container.querySelector('#btn-toggle-timer');
    if (btnTimer) {
      btnTimer.addEventListener('click', () => {
        socketClient.toggleTurnTimeLimit();
      });
    }

    const btnReadyToggle = this.container.querySelector('#btn-toggle-ready');
    if (btnReadyToggle) {
      btnReadyToggle.addEventListener('click', async () => {
        await socketClient.toggleReady();
      });
    }

    const btnAssignBotsStart = this.container.querySelector('#btn-assign-bots-start');
    if (btnAssignBotsStart) {
      btnAssignBotsStart.addEventListener('click', async () => {
        await socketClient.startGame();
      });
    }

    const btnLeave = this.container.querySelector('#btn-leave-lobby');
    if (btnLeave) {
      btnLeave.addEventListener('click', () => {
        socketClient.leaveRoom();
      });
    }

    for (let s = 0; s < 4; s++) {
      const seatEnum = s as PlayerSeat;
      const seatCardEl = this.container.querySelector(`#seat-card-${seatEnum}`);
      if (seatCardEl) {
        seatCardEl.addEventListener('click', async (e) => {
          if ((e.target as HTMLElement).tagName === 'BUTTON') {
            return;
          }
          const slot = roomState.seats[seatEnum];
          if (!slot.isBot && !slot.playerId) {
            await socketClient.selectSeat(seatEnum);
          } else if (slot.playerId === store.myPlayerId) {
            await socketClient.selectSeat(seatEnum);
          } else if (slot.isBot) {
            await socketClient.selectSeat(seatEnum);
          }
        });
      }
    }
  }

  private renderSeatCard(seat: PlayerSeat, label: string, roomState: RoomState, store: GameStore, _isHost: boolean): string {
    const slot = roomState.seats[seat];
    const isMySeat = slot.playerId === store.myPlayerId;

    let badgeClass = 'empty';
    let badgeText = 'EMPTY';

    if (slot.isBot) {
      badgeClass = 'bot';
      badgeText = 'BOT';
    } else if (slot.playerId) {
      badgeText = 'READY';
      if (slot.isReady) {
        badgeClass = 'ready';
      } else {
        badgeClass = 'not-ready';
      }
    }

    let iconHtml = '';
    let occupantName = 'Open Seat / BOT';

    if (slot.isBot) {
      iconHtml = '<span style="font-size: 28px; line-height: 1;">🤖</span>';
      occupantName = 'Bot';
    } else if (slot.playerId) {
      occupantName = `${slot.name} ${isMySeat ? '(YOU)' : ''}`;
      if (slot.playerId === roomState.hostPlayerId) {
        iconHtml = '<img src="/assets/Controller.png" class="controller-img controller-host" alt="host controller" />';
      } else {
        const sortedGuests = Object.keys(roomState.players).filter(id => id !== roomState.hostPlayerId).sort();
        const guestIdx = sortedGuests.indexOf(slot.playerId);
        const guestClasses = ['controller-pink', 'controller-green', 'controller-blue'];
        const colorClass = guestClasses[guestIdx >= 0 ? guestIdx % guestClasses.length : 0];
        iconHtml = `<img src="/assets/Controller.png" class="controller-img ${colorClass}" alt="player controller" />`;
      }
    }

    const canSit = !slot.isBot && !slot.playerId;
    const isClickable = canSit || isMySeat || slot.isBot;

    return `
      <div id="seat-card-${seat}" class="seat-card ${canSit ? 'empty empty-seat' : ''} ${isMySeat ? 'my-seat' : ''} ${isClickable ? 'clickable-seat' : ''}">
        <div class="seat-header">
          <span class="seat-name">${label}</span>
          <span class="seat-badge ${badgeClass}">${badgeText}</span>
        </div>
        <div class="seat-occupant ${canSit ? 'empty-seat-text' : ''}">
          ${iconHtml ? `<div class="seat-icon">${iconHtml}</div>` : ''}
          <div class="seat-occupant-name">${occupantName}</div>
        </div>
      </div>
    `;
  }
}
