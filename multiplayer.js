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
  let isHost = false;
  let currentSeats = [];
  let onGameStateCallback = null;
  let onGameOverCallback = null;
  let isInGame = false;

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
      refreshRoomList();
    });

    socket.on('disconnect', () => {
      console.log('[Multiplayer] Disconnected');
    });

    socket.on('rooms-updated', (roomList) => {
      renderRoomList(roomList);
    });

    socket.on('room-update', ({ seats, state }) => {
      currentSeats = seats;
      renderRoomSeats(seats);

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

      const canToggle = isHost && s.type !== 'human';
      const toggleAttr = canToggle ? `data-toggle="${i}"` : '';
      const toggleClass = canToggle ? 'seat-toggleable' : '';

      return `
        <div class="room-seat ${statusClass} ${toggleClass} ${mySeatIndex === i ? 'seat-me' : ''}" ${toggleAttr}>
          <div class="seat-direction">${SEAT_SHORT[i]}</div>
          <div class="seat-icon">${icon}</div>
          <div class="seat-name">${statusText}</div>
          <div class="seat-label">${SEAT_NAMES[i]}</div>
          ${canToggle ? '<div class="seat-toggle-hint">Click to toggle</div>' : ''}
        </div>
      `;
    }).join('');

    // Attach toggle handlers
    elRoomSeats.querySelectorAll('[data-toggle]').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.toggle);
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
      elRoomStatus.textContent = isHost
        ? 'You are the host. Toggle seats and start when ready.'
        : 'Waiting for the host to start the game...';
    }
  }

  // --- Actions ---
  function createRoom() {
    const name = (elPlayerNameInput.value || '').trim() || 'Player';
    socket.emit('create-room', { playerName: name }, (res) => {
      if (res.success) {
        myRoomCode = res.roomCode;
        mySeatIndex = res.seatIndex;
        isHost = true;
        currentSeats = res.seats;
        elRoomCode.textContent = res.roomCode;
        showRoom();
        renderRoomSeats(res.seats);
      } else {
        showError(res.error || 'Failed to create room');
      }
    });
  }

  function joinRoom(code) {
    const name = (elPlayerNameInput.value || '').trim() || 'Player';
    socket.emit('join-room', { roomCode: code, playerName: name }, (res) => {
      if (res.success) {
        myRoomCode = res.roomCode;
        mySeatIndex = res.seatIndex;
        isHost = false;
        currentSeats = res.seats;
        elRoomCode.textContent = res.roomCode;
        showRoom();
        renderRoomSeats(res.seats);
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
