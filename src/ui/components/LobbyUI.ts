import { DEFAULT_TURN_TIME_LIMIT } from '../../config';
import { generateLobbyName } from '../../core/lobbyNames';
import { PlayerSeat } from '../../core/types';
import { RoomState } from '../../net/events';
import { socketClient } from '../../net/socketClient';
import { GameStore, store } from '../../store/store';
import rulesText from '../../../rules_explained.md?raw';

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
    let modal = document.getElementById('rules-overlay');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'rules-overlay';
      modal.className = 'rules-backdrop hidden';

      const parseMarkdown = (md: string) => {
        return md
          .replace(/^### (.*$)/gim, '<h3>$1</h3>')
          .replace(/^## (.*$)/gim, '<h2>$1</h2>')
          .replace(/^# (.*$)/gim, '<h1>$1</h1>')
          .replace(/^(?!<h)(?!$)(.*)$/gim, '<p>$1</p>')
          .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/gim, '<em>$1</em>')
          .replace(/\n/g, '');
      };

      const htmlContent = parseMarkdown(rulesText);

      modal.innerHTML = `
        <div class="rules-modal">
          <button id="btn-close-rules" class="rules-close-btn">X Close</button>
          <div class="rules-content">${htmlContent}</div>
        </div>
      `;
      document.body.appendChild(modal);

      const btnClose = modal.querySelector('#btn-close-rules');
      if (btnClose) {
        btnClose.addEventListener('click', () => {
          modal!.classList.add('hidden');
        });
      }

      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal!.classList.add('hidden');
        }
      });
    }
    modal.classList.remove('hidden');
  }

  private renderPublicRoomsList(): string {
    const rooms = socketClient.publicRooms;
    if (!rooms || rooms.length === 0) {
      return `<div style="font-size: 13px; color: #64748b; font-style: italic; padding: 6px 0;">No active rooms right now. Create one above!</div>`;
    }

    return `
      <div style="display: flex; flex-direction: column; gap: 6px; max-height: 140px; overflow-y: auto;">
        ${rooms.map(r => {
      const isPlaying = r.status === 'playing' || r.status === 'ended';
      const isPrivate = r.isPublic === false;
      const displayCode = isPrivate ? '----' : r.roomCode;
      return `
          <div style="display: flex; justify-content: space-between; align-items: center; background: #1e293b; padding: 8px 12px; border-radius: 6px; border: 1px solid ${isPlaying ? '#475569' : (isPrivate ? '#334155' : '#38bdf8')}; opacity: ${isPlaying || isPrivate ? '0.85' : '1'};">
            <div>
              <span style="font-weight: 700; color: #f59e0b; font-size: 14px;">ROOM ${displayCode}</span>
              <span style="font-size: 12px; color: #94a3b8; margin-left: 8px;">Host: ${r.hostName}</span>
              ${isPlaying
          ? `<span style="font-size: 11px; background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444; color: #f87171; padding: 1px 6px; border-radius: 4px; font-weight: 700; margin-left: 8px;">IN GAME</span>`
          : (isPrivate
            ? `<span style="font-size: 11px; background: rgba(148, 163, 184, 0.2); border: 1px solid #64748b; color: #cbd5e1; padding: 1px 6px; border-radius: 4px; font-weight: 700; margin-left: 8px;">🔒 PRIVATE</span>`
            : `<span style="font-size: 11px; color: #38bdf8; margin-left: 8px; font-weight: 600;">(${r.seatsTaken}/4 Seats)</span>`
          )
        }
            </div>
            ${isPlaying
          ? `<button class="copy-btn" disabled style="background: #334155; color: #64748b; padding: 4px 10px; font-weight: 600; cursor: not-allowed; opacity: 0.6;" title="Game is already in progress">In Game</button>`
          : (isPrivate
            ? `<button class="copy-btn" disabled style="background: #334155; color: #64748b; padding: 4px 10px; font-weight: 600; cursor: not-allowed; opacity: 0.6;" title="Private room - enter code below to join">Private</button>`
            : `<button class="btn-join-public-room copy-btn" data-code="${r.roomCode}" style="background: #2563eb; color: #fff; padding: 4px 10px; font-weight: 600; cursor: pointer;">Join Game</button>`
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
          <div class="lobby-header" style="position: relative;">
            <button class="btn-show-rules copy-btn" style="position: absolute; right: 0; top: 0; background: #10b981; color: #fff; padding: 6px 12px; font-weight: bold; border-radius: 6px;">📜 RULES</button>
            <h1 class="lobby-title">POACHERS - LOBBY</h1>
            <p class="lobby-subtitle">Create a room or select an open room to join</p>
          </div>

          ${store.netError ? `<div class="error-banner">${store.netError}</div>` : ''}

          <div class="lobby-auth-form">
            <div class="input-group">
              <label class="input-label" for="player-name-input">Your Display Name</label>
              <input type="text" id="player-name-input" class="lobby-input" value="${this.playerNameInputVal || defaultName}" placeholder="Enter name..." />
            </div>

            <div class="form-actions-row" style="align-items: center;">
              <button id="btn-create-room" class="btn-primary" style="flex: 2;">Create New Room</button>
              <label style="display: flex; align-items: center; gap: 6px; font-size: 13px; color: #cbd5e1; cursor: pointer; flex: 1;">
                <input type="checkbox" id="chk-is-public" ${this.isPublicRoomVal ? 'checked' : ''} style="cursor: pointer; width: 16px; height: 16px;" />
                <span>Public Room</span>
              </label>
            </div>

            <!-- Public / Active Rooms Section -->
            <div class="public-rooms-section" style="margin-top: 6px; background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 12px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="font-size: 12px; font-weight: 700; color: #38bdf8; text-transform: uppercase; letter-spacing: 0.5px;">🌐 ACTIVE ROOMS</span>
                <button id="btn-refresh-rooms" class="copy-btn">Refresh</button>
              </div>
              ${this.renderPublicRoomsList()}
            </div>

            <div style="display: flex; align-items: center; gap: 12px; margin: 4px 0;">
              <div style="flex: 1; height: 1px; background: #334155;"></div>
              <span style="font-size: 12px; color: #64748b; font-weight: 600;">OR JOIN BY PRIVATE CODE</span>
              <div style="flex: 1; height: 1px; background: #334155;"></div>
            </div>

            <div class="input-group">
              <label class="input-label" for="room-code-input">4-Letter Room Code</label>
              <input type="text" id="room-code-input" class="lobby-input" maxlength="4" style="text-transform: uppercase; letter-spacing: 2px; font-weight: 700;" value="${this.roomCodeInputVal}" placeholder="e.g. POAC" />
            </div>

            <div class="form-actions-row">
              <button id="btn-join-room" class="btn-secondary">Join by Code</button>
            </div>
          </div>
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
          <div class="lobby-header" style="position: relative;">
            <button class="btn-show-rules copy-btn" style="position: absolute; right: 0; top: 0; background: #10b981; color: #fff; padding: 6px 12px; font-weight: bold; border-radius: 6px;">📜 RULES</button>
            <h1 class="lobby-title">GAME ROOM</h1>
            <p class="lobby-subtitle" style="font-size: 13px; color: #94a3b8; margin-top: 2px;">Pick seats and click READY to start match</p>
            <div class="lobby-room-code-badge" style="margin-top: 6px; display: flex; align-items: center; justify-content: center; gap: 8px;">
              <span style="display: inline-flex; align-items: center; gap: 4px;">
                ROOM: ${roomState.roomCode}
                <button id="btn-copy-code" class="copy-btn-icon" title="Copy Room Code" style="background: none; border: none; cursor: pointer; font-size: 14px; padding: 2px; color: #cbd5e1;" aria-label="Copy Code">📋</button>
              </span>
              ${isHost
        ? `<button id="btn-toggle-privacy" class="copy-btn" style="background: #1e293b; border: 1px solid #334155; color: ${roomState.isPublic ? '#38bdf8' : '#cbd5e1'}; padding: 2px 8px; border-radius: 4px; font-weight: 700; cursor: pointer;">${roomState.isPublic ? 'Public' : 'Private'}</button>`
        : `<span style="font-size: 11px; background: #1e293b; border: 1px solid #334155; padding: 2px 8px; border-radius: 4px; color: ${roomState.isPublic ? '#38bdf8' : '#cbd5e1'}; font-weight: 700;">${roomState.isPublic ? 'Public' : 'Private'}</span>`
      }
              ${isHost
        ? `<button id="btn-toggle-timer" class="copy-btn" style="background: #1e293b; border: 1px solid #d97706; padding: 2px 8px; border-radius: 4px; color: #f59e0b; font-weight: 700; cursor: pointer;">⏱️ ${roomState.turnTimeLimit === 0 ? '∞' : (roomState.turnTimeLimit ?? DEFAULT_TURN_TIME_LIMIT)}s</button>`
        : `<span style="font-size: 11px; background: #1e293b; border: 1px solid #d97706; padding: 2px 8px; border-radius: 4px; color: #f59e0b; font-weight: 700;">⏱️ ${roomState.turnTimeLimit === 0 ? '∞' : (roomState.turnTimeLimit ?? DEFAULT_TURN_TIME_LIMIT)}s</span>`
      }
            </div>
          </div>

          ${store.netError ? `<div class="error-banner">${store.netError}</div>` : ''}

          <div class="teams-container">
            <!-- Team A Column -->
            <div class="team-column team-a">
              ${this.renderSeatCard(PlayerSeat.NORTH, 'NORTH', roomState, store, isHost)}
              ${this.renderSeatCard(PlayerSeat.SOUTH, 'SOUTH', roomState, store, isHost)}
            </div>

            <!-- Team B Column -->
            <div class="team-column team-b">
              ${this.renderSeatCard(PlayerSeat.EAST, 'EAST', roomState, store, isHost)}
              ${this.renderSeatCard(PlayerSeat.WEST, 'WEST', roomState, store, isHost)}
            </div>
          </div>

          <div class="lobby-footer">
            <div style="text-align: center; font-size: 13px; color: #94a3b8; font-weight: 600; padding: 4px 0;">
              ⚡ Game starts once all 4 seats are sat & READY.
            </div>
            <div class="lobby-controls-bar" style="display: flex; gap: 10px; flex-wrap: wrap;">
              ${isSeated
        ? `<button id="btn-toggle-ready" class="btn-primary ${isMyReady ? 'btn-ready-active' : ''}" style="flex: 2; min-width: 140px; padding: 10px 16px; font-weight: 700; background: ${isMyReady ? '#22c55e' : '#f59e0b'}; color: #000;">${isMyReady ? '✓ READY' : '⚡ READY UP'}</button>`
        : ''
      }
              ${isHost && [0, 1, 2, 3].some(s => !roomState.seats[s as PlayerSeat].isBot && !roomState.seats[s as PlayerSeat].playerId)
        ? (() => {
          const allHumansReady = Object.values(roomState.players).filter(p => p.isOnline).every(p => p.isReady);
          return `<button id="btn-assign-bots-start" class="btn-primary" ${allHumansReady ? '' : 'disabled'} style="flex: 2; min-width: 180px; padding: 10px 16px; font-weight: 700; background: ${allHumansReady ? '#10b981' : '#334155'}; color: ${allHumansReady ? '#fff' : '#64748b'}; cursor: ${allHumansReady ? 'pointer' : 'not-allowed'}; opacity: ${allHumansReady ? '1' : '0.7'};" title="${allHumansReady ? 'Fill empty seats with bots and start match' : 'All players must be ready first'}">🤖 Assign Bots & Start</button>`;
        })()
        : ''
      }
              <button id="btn-leave-lobby" class="btn-secondary" style="flex: 1; min-width: 100px;">Leave Room</button>
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
      <div id="seat-card-${seat}" class="seat-card ${isMySeat ? 'my-seat' : ''} ${isClickable ? 'clickable-seat' : ''}">
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
