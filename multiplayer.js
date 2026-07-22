/**
 * Poachers - Client-side Multiplayer Manager
 * Handles Socket.IO connection, lobby UI, and game state synchronization.
 */
(function () {
  'use strict';

  // --- State ---
  let socket = null;
  let myRoomCode = null;
  let mySeatIndex = null;
  let mySeatIndices = [];
  let isHost = false;
  let currentSeats = [];
  let onGameStateCallback = null;
  let onGameOverCallback = null;
  let isInGame = false;

  let sessionToken = localStorage.getItem('poachers_session');
  if (!sessionToken) {
    sessionToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('poachers_session', sessionToken);
  }

  const SEAT_NAMES = ['North', 'East', 'South', 'West'];
  const SEAT_SHORT = ['N', 'E', 'S', 'W'];

  // --- DOM References ---
  const elLobbyOverlay = document.getElementById('lobby-overlay');
  const elRoomOverlay = document.getElementById('room-overlay');
  const elGameContainer = document.querySelector('.game-container');

  // Lobby elements
  const elPlayerNameInput = document.getElementById('lobby-player-name');
  const elBtnCreateRoom = document.getElementById('lobby-create-room');
  const elBtnRefreshRooms = document.getElementById('lobby-refresh-rooms');
  const elRoomsList = document.getElementById('lobby-rooms-list');
  const elJoinCodeInput = document.getElementById('lobby-join-code');
  const elBtnJoinCode = document.getElementById('lobby-join-code-btn');
  const elLobbyError = document.getElementById('lobby-error');

  // Room elements
  const elRoomCode = document.getElementById('room-code-display');
  const elRoomSeats = document.getElementById('room-seats');
  const elBtnStartGame = document.getElementById('room-start-game');
  const elBtnLeaveRoom = document.getElementById('room-leave');
  const elRoomStatus = document.getElementById('room-status');
  const elRoomError = document.getElementById('room-error');
  const elBtnCopyCode = document.getElementById('room-copy-code');

  // --- Socket Connection ---
  function connect() {
    socket = io({
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10
    });

    socket.on('connect', () => {
      console.log('[Multiplayer] Connected:', socket.id);
      clearError();
      socket.emit('check-session', { token: sessionToken }, (res) => {
        const cover = document.getElementById('startup-cover');
        if (cover) {
          cover.style.opacity = '0';
          setTimeout(() => cover.remove(), 200);
        }

        if (res.inRoom) {
          myRoomCode = res.roomCode;
          mySeatIndex = res.seatIndex;
          mySeatIndices = Array.isArray(res.seatIndexes) ? res.seatIndexes : (res.seatIndex !== null ? [res.seatIndex] : []);
          isHost = res.isHost;
          currentSeats = res.seats;
          
          if (elRoomCode) elRoomCode.textContent = res.roomCode;
          
          if (res.state === 'playing' || res.state === 'finished') {
            isInGame = true;
            showGameView();
          } else {
            showRoom();
            renderRoomSeats(res.seats);
            renderRoomSettings(res.turnTimerLimit !== undefined ? res.turnTimerLimit : 30);
          }
        } else {
          showLobby();
        }
      });
    });

    socket.on('disconnect', () => {
      console.log('[Multiplayer] Disconnected');
    });

    socket.on('rooms-updated', (roomList) => {
      renderRoomList(roomList);
    });

    socket.on('room-update', ({ seats, state, turnTimerLimit }) => {
      currentSeats = seats;
      renderRoomSeats(seats);
      renderRoomSettings(turnTimerLimit !== undefined ? turnTimerLimit : 30);

      if (state === 'playing' && !isInGame) {
        isInGame = true;
        showGameView();
      }
    });

    socket.on('game-state', (stateView) => {
      if (onGameStateCallback) {
        onGameStateCallback(stateView);
      }
    });

    socket.on('game-over', ({ winner }) => {
      if (onGameOverCallback) {
        onGameOverCallback(winner);
      }
    });

    socket.on('room-closed', ({ reason }) => {
      showLobby();
      showError(reason || 'Room was closed');
    });

    socket.on('connect_error', () => {
      showError('Connection failed. Retrying...');
    });
  }

  // --- Lobby UI ---
  function showLobby() {
    myRoomCode = null;
    mySeatIndex = null;
    mySeatIndices = [];
    isHost = false;
    currentSeats = [];
    isInGame = false;

    elLobbyOverlay.classList.remove('hidden');
    elRoomOverlay.classList.add('hidden');
    elGameContainer.classList.add('hidden');
    clearError();
    refreshRoomList();
  }

  function showRoom() {
    elLobbyOverlay.classList.add('hidden');
    elRoomOverlay.classList.remove('hidden');
    elGameContainer.classList.add('hidden');
    clearRoomError();
  }

  function showGameView() {
    elLobbyOverlay.classList.add('hidden');
    elRoomOverlay.classList.add('hidden');
    elGameContainer.classList.remove('hidden');
  }

  function showError(msg) {
    if (elLobbyError) {
      elLobbyError.textContent = msg;
      elLobbyError.classList.remove('hidden');
    }
  }
  function clearError() {
    if (elLobbyError) {
      elLobbyError.textContent = '';
      elLobbyError.classList.add('hidden');
    }
  }
  function showRoomError(msg) {
    if (elRoomError) {
      elRoomError.textContent = msg;
      elRoomError.classList.remove('hidden');
    }
  }
  function clearRoomError() {
    if (elRoomError) {
      elRoomError.textContent = '';
      elRoomError.classList.add('hidden');
    }
  }

  function refreshRoomList() {
    if (!socket || !socket.connected) return;
    socket.emit('list-rooms', (roomList) => {
      renderRoomList(roomList);
    });
  }

  function renderRoomList(roomList) {
    if (!elRoomsList) return;

    if (!roomList || roomList.length === 0) {
      elRoomsList.innerHTML = '<div class="no-rooms">No open rooms. Create one!</div>';
      return;
    }

    elRoomsList.innerHTML = roomList.map(r => `
      <div class="room-list-item" data-code="${r.code}">
        <div class="room-list-info">
          <span class="room-list-code">${r.code}</span>
          <span class="room-list-host">Host: ${escapeHtml(r.hostName)}</span>
        </div>
        <div class="room-list-meta">
          <span class="room-list-players">${r.humanCount}/4 players</span>
          <button class="btn lobby-join-btn" data-code="${r.code}">Join</button>
        </div>
      </div>
    `).join('');

    // Attach join handlers
    elRoomsList.querySelectorAll('.lobby-join-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        joinRoom(btn.dataset.code);
      });
    });
  }

  function renderRoomSeats(seats) {
    if (!elRoomSeats) return;

    elRoomSeats.innerHTML = seats.map((s, i) => {
      let statusClass = '';
      let statusText = '';
      let icon = '';

      if (s.type === 'human') {
        statusClass = 'seat-human';
        statusText = escapeHtml(s.name);
        icon = s.isHost ? '👑' : '🎮';
      } else if (s.type === 'bot') {
        statusClass = 'seat-bot';
        statusText = 'Bot';
        icon = '🤖';
      } else {
        statusClass = 'seat-open';
        statusText = 'Open';
        icon = '⏳';
      }

      const isMySeat = mySeatIndices.includes(i);
      const canSwitch = s.type === 'open' || isMySeat;
      const switchAttr = canSwitch ? `data-switch="${i}"` : '';
      const switchClass = canSwitch ? 'seat-toggleable' : '';

      const canToggleBot = isHost && (s.type === 'open' || s.type === 'bot');
      const botToggleHtml = canToggleBot 
        ? `<div style="margin-top: 8px;"><button class="btn btn-secondary" style="font-size: 0.75em; padding: 4px 8px;" data-togglebot="${i}">${s.type === 'bot' ? 'Remove Bot' : 'Add Bot'}</button></div>` 
        : '';

      let hintText = '';
      if (s.type === 'open') {
        hintText = 'Click to claim';
      } else if (isMySeat) {
        hintText = 'Click to unclick';
      }

      return `
        <div class="room-seat ${statusClass} ${switchClass} ${isMySeat ? 'seat-me' : ''}" ${switchAttr}>
          <div class="seat-direction">${SEAT_SHORT[i]}</div>
          <div class="seat-icon">${icon}</div>
          <div class="seat-name">${statusText}</div>
          <div class="seat-label">${SEAT_NAMES[i]}</div>
          ${hintText ? `<div class="seat-toggle-hint">${hintText}</div>` : ''}
          ${botToggleHtml}
        </div>
      `;
    }).join('');

    // Attach switch handlers
    elRoomSeats.querySelectorAll('[data-switch]').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.switch);
        socket.emit('switch-seat', { seatIndex: idx }, (res) => {
          if (res && !res.success) showRoomError(res.error);
          else if (res && res.success) {
            mySeatIndex = res.seatIndex ?? mySeatIndices[0] ?? null;
            mySeatIndices = Array.isArray(res.seatIndexes) ? res.seatIndexes : (mySeatIndex !== null ? [mySeatIndex] : []);
            renderRoomSeats(currentSeats);
          }
        });
      });
    });

    // Attach toggle bot handlers
    elRoomSeats.querySelectorAll('[data-togglebot]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation(); // prevent triggering switch-seat if inside a switchable seat
        const idx = parseInt(btn.dataset.togglebot);
        socket.emit('toggle-seat', { seatIndex: idx }, (res) => {
          if (res && !res.success) showRoomError(res.error);
        });
      });
    });

    // Update start button visibility
    if (elBtnStartGame) {
      if (isHost) {
        elBtnStartGame.classList.remove('hidden');
        const humanCount = seats.filter(s => s.type === 'human').length;
        elBtnStartGame.disabled = humanCount < 1;
      } else {
        elBtnStartGame.classList.add('hidden');
      }
    }

    if (elRoomStatus) {
      const seatStatusText = mySeatIndices.length >= 2
        ? 'You control two seats. Click a seat to keep your setup, or wait for the host to start.'
        : 'Click open seats to claim them. You can take up to 2 seats.';

      elRoomStatus.textContent = isHost
        ? `You are the host. ${seatStatusText}`
        : seatStatusText;
    }
  }

  function renderRoomSettings(turnTimerLimit) {
    const elRoomSettings = document.getElementById('room-settings');
    if (!elRoomSettings) return;

    const limits = [30, 60, 90, 0];
    const optionButtons = limits.map(limit => {
      const activeClass = turnTimerLimit === limit ? 'active' : '';
      const disabledAttr = isHost ? '' : 'disabled';
      const label = limit === 0 ? 'None' : `${limit}s`;
      return `<button class="timer-opt-btn ${activeClass}" data-limit="${limit}" ${disabledAttr}>${label}</button>`;
    }).join('');

    elRoomSettings.innerHTML = `
      <div class="timer-toggle-container">
        <span class="timer-toggle-label">Turn Timer Limit:</span>
        <div class="timer-toggle-group">
          ${optionButtons}
        </div>
      </div>
    `;

    // Attach click listeners for options if host
    if (isHost) {
      elRoomSettings.querySelectorAll('.timer-opt-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const newLimit = parseInt(btn.dataset.limit);
          if (newLimit !== turnTimerLimit) {
            socket.emit('update-room-settings', { turnTimerLimit: newLimit }, (res) => {
              if (res && !res.success) {
                showRoomError(res.error || 'Failed to update settings');
              }
            });
          }
        });
      });
    }
  }

  // --- Actions ---
  function createRoom() {
    const name = (elPlayerNameInput.value || '').trim() || 'Player';
    socket.emit('create-room', { playerName: name, token: sessionToken }, (res) => {
      if (res.success) {
        myRoomCode = res.roomCode;
        mySeatIndex = res.seatIndex;
        mySeatIndices = Array.isArray(res.seatIndexes) ? res.seatIndexes : (res.seatIndex !== null ? [res.seatIndex] : []);
        isHost = true;
        currentSeats = res.seats;
        elRoomCode.textContent = res.roomCode;
        showRoom();
        renderRoomSeats(res.seats);
        renderRoomSettings(res.turnTimerLimit !== undefined ? res.turnTimerLimit : 30);
      } else {
        showError(res.error || 'Failed to create room');
      }
    });
  }

  function joinRoom(code) {
    const name = (elPlayerNameInput.value || '').trim() || 'Player';
    socket.emit('join-room', { roomCode: code, playerName: name, token: sessionToken }, (res) => {
      if (res.success) {
        myRoomCode = res.roomCode;
        mySeatIndex = res.seatIndex;
        mySeatIndices = Array.isArray(res.seatIndexes) ? res.seatIndexes : (res.seatIndex !== null ? [res.seatIndex] : []);
        isHost = false;
        currentSeats = res.seats;
        elRoomCode.textContent = res.roomCode;
        showRoom();
        renderRoomSeats(res.seats);
        renderRoomSettings(res.turnTimerLimit !== undefined ? res.turnTimerLimit : 30);
      } else {
        showError(res.error || 'Failed to join room');
      }
    });
  }

  function startGame() {
    socket.emit('start-game', (res) => {
      if (!res.success) {
        showRoomError(res.error || 'Failed to start game');
      }
    });
  }

  function leaveRoom() {
    if (socket) socket.emit('leave-room');
    showLobby();
  }

  function copyRoomCode() {
    if (myRoomCode) {
      navigator.clipboard.writeText(myRoomCode).then(() => {
        const btn = elBtnCopyCode;
        const origText = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = origText; }, 1500);
      }).catch(() => {});
    }
  }

  // --- Event Listeners ---
  if (elBtnCreateRoom) elBtnCreateRoom.addEventListener('click', createRoom);
  if (elBtnRefreshRooms) elBtnRefreshRooms.addEventListener('click', refreshRoomList);
  if (elBtnJoinCode) {
    elBtnJoinCode.addEventListener('click', () => {
      const code = (elJoinCodeInput.value || '').trim().toUpperCase();
      if (code.length >= 4) joinRoom(code);
      else showError('Enter a valid room code');
    });
  }
  if (elJoinCodeInput) {
    elJoinCodeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const code = (elJoinCodeInput.value || '').trim().toUpperCase();
        if (code.length >= 4) joinRoom(code);
      }
    });
    // Auto uppercase
    elJoinCodeInput.addEventListener('input', () => {
      elJoinCodeInput.value = elJoinCodeInput.value.toUpperCase();
    });
  }
  if (elBtnStartGame) elBtnStartGame.addEventListener('click', startGame);
  if (elBtnLeaveRoom) elBtnLeaveRoom.addEventListener('click', leaveRoom);
  if (elBtnCopyCode) elBtnCopyCode.addEventListener('click', copyRoomCode);

  // Enter key on name input → create room
  if (elPlayerNameInput) {
    elPlayerNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') createRoom();
    });
  }

  // --- Utility ---
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // --- Public API (used by app.js) ---
  window.Multiplayer = {
    get isOnline() { return isInGame; },
    get myPlayerId() { return mySeatIndex; },
    get myPlayerIds() { return mySeatIndices; },
    isMySeat(seatIndex) { return mySeatIndices.includes(seatIndex); },
    get currentSeats() { return currentSeats; },
    get socket() { return socket; },
    get isHost() { return isHost; },
    get roomCode() { return myRoomCode; },

    sendMove(move) {
      return new Promise((resolve) => {
        socket.emit('player-move', { move }, (res) => {
          resolve(res);
        });
      });
    },

    sendSwap(baseCardIdx, posCardIdx, type) {
      return new Promise((resolve) => {
        socket.emit('card-swap', { baseCardIdx, posCardIdx, type }, (res) => {
          resolve(res);
        });
      });
    },

    requestRematch() {
      return new Promise((resolve) => {
        socket.emit('request-rematch', (res) => {
          resolve(res);
        });
      });
    },

    onGameState(callback) {
      onGameStateCallback = callback;
    },

    onGameOver(callback) {
      onGameOverCallback = callback;
    },

    returnToLobby() {
      leaveRoom();
    }
  };

  // --- Initialize ---
  connect();

  // Start in lobby view
  if (elGameContainer) elGameContainer.classList.add('hidden');

})();
