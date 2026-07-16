/**
 * Poachers - Multiplayer Game Server
 * Express + Socket.IO for real-time multiplayer lobby and game state sync.
 */
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const engine = require('./engine.js');

const PORT = process.env.PORT || 8080;

// --- Express Setup ---
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingTimeout: 60000,
  pingInterval: 25000
});

// Serve static files from project root
app.use(express.static(__dirname, {
  extensions: ['html'],
  setHeaders: (res, filePath) => {
    // Cache-bust for development
    if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// --- Room Management ---
const rooms = new Map(); // roomCode -> RoomState

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I/O/0/1 to avoid confusion
  let code;
  do {
    code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}

function createRoom(hostSocket, hostName) {
  const code = generateRoomCode();
  const room = {
    code,
    hostSocketId: hostSocket.id,
    state: 'waiting', // 'waiting' | 'playing' | 'finished'
    seats: [
      // 0=North, 1=East, 2=South, 3=West
      { type: 'human', socketId: hostSocket.id, name: hostName, connected: true },
      { type: 'bot', socketId: null, name: 'Bot', connected: false },
      { type: 'open', socketId: null, name: '', connected: false },
      { type: 'bot', socketId: null, name: 'Bot', connected: false }
    ],
    gameState: null,
    history: [],
    combatShowdown: null,
    combatTimeout: null,
    botWeights: [1, 3, 3.5, 5, 20, 0.5, 0.2, 0.1, 8, 0.2, 10, 2, 0.5]
  };
  rooms.set(code, room);
  hostSocket.join(code);
  return room;
}

function getRoomList() {
  const list = [];
  for (const [code, room] of rooms) {
    if (room.state === 'waiting') {
      const humanCount = room.seats.filter(s => s.type === 'human').length;
      const openCount = room.seats.filter(s => s.type === 'open').length;
      list.push({
        code,
        humanCount,
        openCount,
        totalSlots: 4,
        hostName: room.seats.find(s => s.socketId === room.hostSocketId)?.name || 'Unknown'
      });
    }
  }
  return list;
}

function getSeatInfo(room) {
  return room.seats.map((s, i) => ({
    index: i,
    type: s.type,
    name: s.type === 'human' ? s.name : (s.type === 'bot' ? 'Bot' : ''),
    connected: s.connected,
    isHost: s.socketId === room.hostSocketId
  }));
}

function findRoomBySocket(socketId) {
  for (const [code, room] of rooms) {
    const seatIdx = room.seats.findIndex(s => s.socketId === socketId);
    if (seatIdx !== -1) return { room, seatIdx };
  }
  return null;
}

/** Build a per-player view of the game state (hides other players' base decks) */
function getPlayerView(room, forSeatIdx) {
  if (!room.gameState) return null;
  const gs = room.gameState;

  const players = gs.players.map((p, i) => ({
    id: p.id,
    name: room.seats[i].type === 'human' ? room.seats[i].name : 'Bot',
    team: p.team,
    positionalCards: p.positionalCards,
    // Only send base deck to the owning player
    baseDeck: (i === forSeatIdx) ? p.baseDeck : p.baseDeck.map(() => null),
    baseDeckCount: p.baseDeck.length
  }));

  return {
    board: gs.board,
    players,
    publicCards: gs.publicCards,
    turn: gs.turn,
    hasSwappedThisTurn: gs.hasSwappedThisTurn,
    capturedPieces: gs.capturedPieces,
    matchScores: gs.matchScores,
    lastMove: gs.lastMove || null,
    deckSize: gs.deck.length,
    hillWasVisited: engine.hill_was_visited
  };
}

// --- Bot logic (server-side) ---
// We load the v8 bot for server-side bot moves
let botModule = null;
try {
  botModule = require('./bots/v8_networth/bot.js');
} catch (e) {
  console.warn('Bot module not loadable server-side, bots will pass turns.');
}

function getBotMove(gameState, botWeights) {
  if (botModule && botModule.getBestMove) {
    try {
      return botModule.getBestMove(gameState, botWeights);
    } catch (err) {
      console.error('Bot module crashed, falling back to random move:', err);
    }
  }

  // The bot files are browser-oriented (attach to window), so we need to
  // use the engine's getAllLegalMovesForActivePlayer and pick a random legal move
  // as a fallback. For proper bot AI, we'd need to refactor bots for Node.
  const allMoves = engine.getAllLegalMovesForActivePlayer(gameState);
  if (allMoves.length === 0) return null;

  // Check for promotions first
  const activeId = gameState.turn;
  const team = engine.PLAYER_TEAMS[activeId];
  const pool = gameState.capturedPieces[team];
  const pieceTypes = [];
  if (pool.rooks > 0) pieceTypes.push({ type: 'r', subtype: null });
  if (pool.knights > 0) pieceTypes.push({ type: 'n', subtype: null });
  if (pool.darkBishop > 0) pieceTypes.push({ type: 'b', subtype: 'dark' });
  if (pool.lightBishop > 0) pieceTypes.push({ type: 'b', subtype: 'light' });
  if (pool.king !== null) pieceTypes.push({ type: 'k', subtype: pool.king });

  for (const pt of pieceTypes) {
    const validSquares = engine.find_pawns_to_promot(activeId, pt.type, pt.subtype, gameState);
    if (validSquares.length > 0) {
      return {
        type: 'promote',
        to: validSquares[0],
        promoType: pt.type,
        promoSubtype: pt.subtype
      };
    }
  }

  // Weighted random: prefer captures and attacks
  const scored = allMoves.map(m => {
    let weight = 1;
    if (m.type === 'capture') weight = 10;
    else if (m.type === 'attack') weight = 3;
    return { move: m, weight };
  });
  const totalWeight = scored.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * totalWeight;
  for (const entry of scored) {
    r -= entry.weight;
    if (r <= 0) return entry.move;
  }
  return scored[scored.length - 1].move;
}

// --- Game Execution Helpers ---

function executeMoveOnServer(room, move) {
  const gs = room.gameState;
  const activePlayer = gs.players[gs.turn];

  // Promotion
  if (move.type === 'promote') {
    engine.executePromotion(move.to.r, move.to.c, move.promoType, move.promoSubtype, activePlayer.id, gs);
    engine.checkHillRefill(gs.turn, gs);
    const gameOver = checkGameOverServer(room);
    if (!gameOver) {
      gs.turn = (gs.turn + 1) % 4;
      gs.lastMove = null;
      gs.hasSwappedThisTurn = false;
    }
    broadcastState(room);
    if (!gameOver) scheduleBotTurn(room);
    return;
  }

  const fromPiece = gs.board[move.from.r][move.from.c];
  const toPiece = gs.board[move.to.r][move.to.c];

  if (move.type === 'attack') {
    // Draw combat cards
    const combatCards = [gs.deck.pop(), gs.deck.pop()];
    const combatResult = engine.evaluateCombat(move, combatCards, gs);

    room.combatShowdown = {
      move,
      result: combatResult,
      combatCards,
      colRegion: engine.getColumnRegion(move.to.c),
      rowRegion: engine.getRowRegion(move.to.r)
    };

    // Broadcast showdown state to all
    broadcastState(room);

    // Resolve after 2.5 seconds
    room.combatTimeout = setTimeout(() => {
      let stolenCard = null;
      if (combatResult.outcome === 'capture') {
        const defenderTeam = engine.getPieceTeam(toPiece);
        const defenderPlayerId = (defenderTeam === engine.TEAMS.A)
          ? (move.to.r < 4 ? engine.PLAYERS.NORTH : engine.PLAYERS.SOUTH)
          : (move.to.c < 4 ? engine.PLAYERS.WEST : engine.PLAYERS.EAST);
        const colRegion = engine.getColumnRegion(move.to.c);
        const rowRegion = engine.getRowRegion(move.to.r);
        const defenderCardIdx = (defenderTeam === engine.TEAMS.A) ? colRegion : rowRegion;
        stolenCard = gs.players[defenderPlayerId].positionalCards[defenderCardIdx];
      }

      engine.applyCombatResult(move, combatResult, combatCards, gs);
      room.combatShowdown = null;
      room.combatTimeout = null;

      engine.checkHillRefill(gs.turn, gs);
      const gameOver = checkGameOverServer(room);
      if (!gameOver) {
        gs.turn = (gs.turn + 1) % 4;
        gs.hasSwappedThisTurn = false;
      }
      broadcastState(room);
      if (!gameOver) scheduleBotTurn(room);
    }, 2500);
    return;
  }

  // Normal move or immediate capture
  if (toPiece) {
    engine.add_to_captured_pieces(toPiece, move.to.r, move.to.c, gs);
  }
  gs.board[move.to.r][move.to.c] = fromPiece;
  gs.board[move.from.r][move.from.c] = null;
  gs.lastMove = { from: move.from, to: move.to };

  engine.checkHillRefill(gs.turn, gs);
  const gameOver = checkGameOverServer(room);
  if (!gameOver) {
    gs.turn = (gs.turn + 1) % 4;
    gs.hasSwappedThisTurn = false;
  }
  broadcastState(room);
  if (!gameOver) scheduleBotTurn(room);
}

function checkGameOverServer(room) {
  const gs = room.gameState;
  let kingsA = 0, kingsB = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (gs.board[r][c] === engine.PIECES.KING_A) kingsA++;
      if (gs.board[r][c] === engine.PIECES.KING_B) kingsB++;
    }
  }
  if (kingsA === 0 || kingsB === 0) {
    room.state = 'finished';
    const winner = kingsA === 0 ? 'B' : 'A';
    io.to(room.code).emit('game-over', { winner });
    return true;
  }
  return false;
}

function broadcastState(room) {
  for (const seat of room.seats) {
    if (seat.type === 'human' && seat.socketId) {
      const seatIdx = room.seats.indexOf(seat);
      const view = getPlayerView(room, seatIdx);
      view.combatShowdown = room.combatShowdown;
      view.seatIndex = seatIdx;
      io.to(seat.socketId).emit('game-state', view);
    }
  }
}

function scheduleBotTurn(room) {
  if (room.state !== 'playing' || !room.gameState) return;
  if (room.combatShowdown) return;

  const gs = room.gameState;
  const currentSeat = room.seats[gs.turn];

  if (currentSeat.type === 'bot') {
    setTimeout(() => {
      if (room.state !== 'playing' || !room.gameState || room.combatShowdown) return;
      if (room.gameState.turn !== room.seats.indexOf(currentSeat)) return;

      const move = getBotMove(room.gameState, room.botWeights);
      if (move) {
        executeMoveOnServer(room, move);
      } else {
        // Bot has no moves, pass
        room.gameState.turn = (room.gameState.turn + 1) % 4;
        room.gameState.hasSwappedThisTurn = false;
        broadcastState(room);
        scheduleBotTurn(room);
      }
    }, 800);
  }
}

// Clean up empty rooms periodically
setInterval(() => {
  for (const [code, room] of rooms) {
    const hasHumans = room.seats.some(s => s.type === 'human' && s.connected);
    if (!hasHumans) {
      if (room.combatTimeout) clearTimeout(room.combatTimeout);
      rooms.delete(code);
    }
  }
}, 60000);

// --- Socket.IO Event Handlers ---
io.on('connection', (socket) => {
  console.log(`[Connect] ${socket.id}`);

  socket.on('list-rooms', (callback) => {
    if (typeof callback === 'function') callback(getRoomList());
  });

  socket.on('create-room', ({ playerName }, callback) => {
    const name = (playerName || 'Player').trim().substring(0, 20);
    const room = createRoom(socket, name);
    if (typeof callback === 'function') {
      callback({ success: true, roomCode: room.code, seatIndex: 0, seats: getSeatInfo(room) });
    }
    io.emit('rooms-updated', getRoomList());
  });

  socket.on('join-room', ({ roomCode, playerName }, callback) => {
    const code = (roomCode || '').toUpperCase().trim();
    const room = rooms.get(code);

    if (!room) {
      if (typeof callback === 'function') callback({ success: false, error: 'Room not found' });
      return;
    }
    if (room.state !== 'waiting') {
      if (typeof callback === 'function') callback({ success: false, error: 'Game already in progress' });
      return;
    }

    // Find an open seat
    const openIdx = room.seats.findIndex(s => s.type === 'open');
    if (openIdx === -1) {
      if (typeof callback === 'function') callback({ success: false, error: 'Room is full' });
      return;
    }

    const name = (playerName || 'Player').trim().substring(0, 20);
    room.seats[openIdx] = { type: 'human', socketId: socket.id, name, connected: true };
    socket.join(code);

    if (typeof callback === 'function') {
      callback({ success: true, roomCode: code, seatIndex: openIdx, seats: getSeatInfo(room) });
    }
    io.to(code).emit('room-update', { seats: getSeatInfo(room), state: room.state });
    io.emit('rooms-updated', getRoomList());
  });

  socket.on('toggle-seat', ({ seatIndex }, callback) => {
    const found = findRoomBySocket(socket.id);
    if (!found) return;
    const { room } = found;

    if (socket.id !== room.hostSocketId) {
      if (typeof callback === 'function') callback({ success: false, error: 'Only the host can change seats' });
      return;
    }
    if (room.state !== 'waiting') return;
    if (seatIndex < 0 || seatIndex > 3) return;

    const seat = room.seats[seatIndex];
    if (seat.type === 'human' && seat.socketId !== socket.id) {
      // Can't toggle a human player's seat (kick not implemented)
      if (typeof callback === 'function') callback({ success: false, error: 'Cannot change an occupied seat' });
      return;
    }
    if (seat.type === 'human' && seat.socketId === socket.id) {
      // Host can't toggle their own seat
      if (typeof callback === 'function') callback({ success: false, error: 'Cannot change your own seat' });
      return;
    }

    // Toggle between 'open' and 'bot'
    if (seat.type === 'open') {
      room.seats[seatIndex] = { type: 'bot', socketId: null, name: 'Bot', connected: false };
    } else if (seat.type === 'bot') {
      room.seats[seatIndex] = { type: 'open', socketId: null, name: '', connected: false };
    }

    if (typeof callback === 'function') callback({ success: true });
    io.to(room.code).emit('room-update', { seats: getSeatInfo(room), state: room.state });
    io.emit('rooms-updated', getRoomList());
  });

  socket.on('start-game', (callback) => {
    const found = findRoomBySocket(socket.id);
    if (!found) return;
    const { room } = found;

    if (socket.id !== room.hostSocketId) {
      if (typeof callback === 'function') callback({ success: false, error: 'Only the host can start' });
      return;
    }
    if (room.state !== 'waiting') return;

    const humanCount = room.seats.filter(s => s.type === 'human').length;
    if (humanCount < 1) {
      if (typeof callback === 'function') callback({ success: false, error: 'Need at least 1 human player' });
      return;
    }

    // Fill remaining open seats with bots
    for (let i = 0; i < 4; i++) {
      if (room.seats[i].type === 'open') {
        room.seats[i] = { type: 'bot', socketId: null, name: 'Bot', connected: false };
      }
    }

    // Initialize game via engine
    room.state = 'playing';
    room.gameState = engine.initGame();
    room.gameState.lastMove = null;

    if (typeof callback === 'function') callback({ success: true });

    // Send room update first so clients transition to game view
    io.to(room.code).emit('room-update', { seats: getSeatInfo(room), state: room.state });

    // Then send initial game state to each player
    broadcastState(room);

    // If first turn is a bot, schedule it
    scheduleBotTurn(room);

    io.emit('rooms-updated', getRoomList());
  });

  socket.on('player-move', ({ move }, callback) => {
    const found = findRoomBySocket(socket.id);
    if (!found) return;
    const { room, seatIdx } = found;

    if (room.state !== 'playing' || !room.gameState) return;
    if (room.combatShowdown) return;
    if (room.gameState.turn !== seatIdx) {
      if (typeof callback === 'function') callback({ success: false, error: 'Not your turn' });
      return;
    }
    if (room.seats[seatIdx].type !== 'human') return;

    // Validate the move
    const gs = room.gameState;

    if (move.type === 'promote') {
      const validSquares = engine.find_pawns_to_promot(seatIdx, move.promoType, move.promoSubtype, gs);
      const isValid = validSquares.some(sq => sq.r === move.to.r && sq.c === move.to.c);
      if (!isValid) {
        if (typeof callback === 'function') callback({ success: false, error: 'Invalid promotion' });
        return;
      }
    } else {
      // Validate it's a legal move from the engine
      const legalMoves = engine.getLegalMoves(move.from.r, move.from.c, gs, false);
      const isValid = legalMoves.some(m =>
        m.to.r === move.to.r && m.to.c === move.to.c && m.type === move.type
      );
      if (!isValid) {
        if (typeof callback === 'function') callback({ success: false, error: 'Invalid move' });
        return;
      }
    }

    if (typeof callback === 'function') callback({ success: true });
    executeMoveOnServer(room, move);
  });

  socket.on('card-swap', ({ baseCardIdx, posCardIdx, type }, callback) => {
    const found = findRoomBySocket(socket.id);
    if (!found) return;
    const { room, seatIdx } = found;

    if (room.state !== 'playing' || !room.gameState) return;
    if (room.gameState.turn !== seatIdx) return;
    if (room.seats[seatIdx].type !== 'human') return;

    const gs = room.gameState;
    let success = false;

    if (type === 'base-to-pos') {
      success = engine.swapCards(seatIdx, baseCardIdx, posCardIdx, gs);
    } else if (type === 'pos-to-pos') {
      success = engine.swapPositionalCards(seatIdx, baseCardIdx, posCardIdx, gs);
    }

    if (typeof callback === 'function') callback({ success });
    if (success) broadcastState(room);
  });

  socket.on('request-rematch', (callback) => {
    const found = findRoomBySocket(socket.id);
    if (!found) return;
    const { room } = found;

    if (room.state !== 'finished') return;
    if (socket.id !== room.hostSocketId) {
      if (typeof callback === 'function') callback({ success: false, error: 'Only host can restart' });
      return;
    }

    // Reset game
    room.state = 'playing';
    room.gameState = engine.initGame();
    room.gameState.lastMove = null;
    room.combatShowdown = null;
    if (room.combatTimeout) clearTimeout(room.combatTimeout);
    room.combatTimeout = null;

    if (typeof callback === 'function') callback({ success: true });
    io.to(room.code).emit('room-update', { seats: getSeatInfo(room), state: room.state });
    broadcastState(room);
    scheduleBotTurn(room);
  });

  socket.on('leave-room', () => {
    handleDisconnect(socket);
  });

  socket.on('disconnect', () => {
    console.log(`[Disconnect] ${socket.id}`);
    handleDisconnect(socket);
  });

  function handleDisconnect(sock) {
    const found = findRoomBySocket(sock.id);
    if (!found) return;
    const { room, seatIdx } = found;

    if (room.state === 'waiting') {
      if (sock.id === room.hostSocketId) {
        // Host left — close the room
        io.to(room.code).emit('room-closed', { reason: 'Host left the room' });
        if (room.combatTimeout) clearTimeout(room.combatTimeout);
        rooms.delete(room.code);
      } else {
        // Non-host left — free the seat
        room.seats[seatIdx] = { type: 'open', socketId: null, name: '', connected: false };
        io.to(room.code).emit('room-update', { seats: getSeatInfo(room), state: room.state });
      }
    } else if (room.state === 'playing' || room.state === 'finished') {
      // Replace with bot
      room.seats[seatIdx].type = 'bot';
      room.seats[seatIdx].name = 'Bot';
      room.seats[seatIdx].socketId = null;
      room.seats[seatIdx].connected = false;

      io.to(room.code).emit('room-update', { seats: getSeatInfo(room), state: room.state });
      broadcastState(room);

      // If it was this player's turn, schedule bot
      if (room.gameState && room.gameState.turn === seatIdx && room.state === 'playing') {
        scheduleBotTurn(room);
      }

      // Check if all humans left
      const hasHumans = room.seats.some(s => s.type === 'human' && s.connected);
      if (!hasHumans) {
        if (room.combatTimeout) clearTimeout(room.combatTimeout);
        rooms.delete(room.code);
      }
    }

    sock.leave(room.code);
    io.emit('rooms-updated', getRoomList());
  }
});

// --- Start Server ---
server.listen(PORT, () => {
  const url = `http://localhost:${PORT}/`;
  console.log('===================================================');
  console.log(`  Poachers Game Server is now running!`);
  console.log(`  Access it at: ${url}`);
  console.log('  Press Ctrl+C in this window to stop the server.');
  console.log('===================================================');

  // Auto-open browser in local dev (not on Render)
  if (!process.env.RENDER) {
    const { exec } = require('child_process');
    const startCommand = process.platform === 'win32' ? 'start ""' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    exec(`${startCommand} "${url}"`, (err) => {
      if (err) console.error('Failed to automatically open browser:', err);
    });
  }
});
