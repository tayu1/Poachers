/**
 * Poachers - Multiplayer Game Server
 * Express + Socket.IO for real-time multiplayer lobby and game state sync.
 */
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const engine = require('./engine.js');
require('./speeds.js');

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
    if (filePath.endsWith('.js') || filePath.endsWith('.css') || filePath.endsWith('.html')) {
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

function createRoom(hostSocket, hostName, token) {
  const code = generateRoomCode();
  const room = {
    code,
    hostSocketId: hostSocket.id,
    hostToken: token,
    state: 'waiting', // 'waiting' | 'playing' | 'finished'
    seats: [
      // 0=North, 1=East, 2=South, 3=West
      { type: 'human', socketId: hostSocket.id, name: hostName, connected: true, token },
      { type: 'open', socketId: null, name: '', connected: false },
      { type: 'open', socketId: null, name: '', connected: false },
      { type: 'open', socketId: null, name: '', connected: false }
    ],
    gameState: null,
    history: [],
    combatShowdown: null,
    combatTimeout: null,
    botWeights: [2.18, 3.59, 6.16, 2.5, 13.02, 7.21, 0.61, 1.21, 4.36, 0.35, 4.35, 0.47, 0.12],
    matchScores: { A: 0, B: 0 },
    lastStartingPlayer: 0,
    turnTimerLimit: 30, // default limit in seconds
    turnEndTime: null,
    turnTimeout: null
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
    isHost: room.hostToken ? (s.token === room.hostToken) : (s.socketId === room.hostSocketId)
  }));
}

function getSeatIndexesForToken(room, token) {
  return room.seats.reduce((acc, seat, index) => {
    if (seat.type === 'human' && seat.token === token) acc.push(index);
    return acc;
  }, []);
}

function getSeatIndexesBySocket(room, socketId) {
  return room.seats.reduce((acc, seat, index) => {
    if (seat.type === 'human' && seat.socketId === socketId) acc.push(index);
    return acc;
  }, []);
}

function findRoomBySocket(socket) {
  const isObj = typeof socket === 'object' && socket !== null;
  const socketId = isObj ? socket.id : socket;

  if (isObj && socket.rooms) {
    for (const code of socket.rooms) {
      if (rooms.has(code)) {
        const room = rooms.get(code);
        const seatIndexes = getSeatIndexesBySocket(room, socketId);
        return { room, seatIdx: seatIndexes[0] ?? null, seatIndexes };
      }
    }
  }

  for (const [, room] of rooms) {
    const seatIndexes = getSeatIndexesBySocket(room, socketId);
    if (seatIndexes.length > 0) return { room, seatIdx: seatIndexes[0], seatIndexes };
  }
  return null;
}

/** Build a per-player view of the game state (hides other players' base decks) */
function getPlayerView(room, forSeatIdx) {
  if (!room.gameState) return null;
  const gs = room.gameState;

  const targetSeat = room.seats[forSeatIdx];
  const allowedIndices = [];
  if (targetSeat && targetSeat.type === 'human') {
    room.seats.forEach((seat, idx) => {
      if (seat.type === 'human' && (seat.token === targetSeat.token || seat.socketId === targetSeat.socketId)) {
        allowedIndices.push(idx);
      }
    });
  } else {
    allowedIndices.push(forSeatIdx);
  }

  const players = gs.players.map((p, i) => ({
    id: p.id,
    name: room.seats[i].type === 'human' ? room.seats[i].name : 'Bot',
    team: p.team,
    positionalCards: p.positionalCards,
    // Only send base deck to the owning player
    baseDeck: allowedIndices.includes(i) ? p.baseDeck : p.baseDeck.map(() => null),
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
    hillWasVisited: gs.hillWasVisited,
    turnEndTime: room.turnEndTime || null,
    turnTimerLimit: room.turnTimerLimit !== undefined ? room.turnTimerLimit : 30
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

function getBotDecision(gameState, botWeights) {
  if (botModule && botModule.getBestAction) {
    try {
      return botModule.getBestAction(gameState, botWeights);
    } catch (err) {
      console.error('Bot module crashed, falling back to random move:', err);
    }
  }
  if (botModule && botModule.getBestMove) {
    try {
      return { move: botModule.getBestMove(gameState, botWeights) };
    } catch (err) {
      console.error('Bot module crashed, falling back to random move:', err);
    }
  }

  // The bot files are browser-oriented (attach to window), so we need to
  // use the engine's getAllLegalMovesForActivePlayer and pick a random legal move
  // as a fallback. For proper bot AI, we'd need to refactor bots for Node.
  const allMoves = engine.getAllLegalMovesForActivePlayer(gameState);
  if (allMoves.length === 0) return { move: null };

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
        move: {
          type: 'promote',
          to: validSquares[0],
          promoType: pt.type,
          promoSubtype: pt.subtype
        }
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
    if (r <= 0) return { move: entry.move };
  }
  return { move: scored[scored.length - 1].move };
}

// --- Game Execution Helpers ---

function executeMoveOnServer(room, move) {
  const gs = room.gameState;
  const activePlayer = gs.players[gs.turn];

  if (move.to && (move.to.r === 3 || move.to.r === 4) && (move.to.c === 3 || move.to.c === 4)) {
    gs.hillWasVisited = 1;
  }

  // Promotion
  if (move.type === 'promote') {
    engine.executePromotion(move.to.r, move.to.c, move.promoType, move.promoSubtype, activePlayer.id, gs);
    engine.checkHillRefill(gs.turn, gs);
    const gameOver = checkGameOverServer(room);
    if (!gameOver) {
      gs.turn = engine.getNextActiveTurn(gs.turn, gs);
      gs.lastMove = null;
      gs.hasSwappedThisTurn = false;
      room.turnEndTime = room.turnTimerLimit > 0 ? Date.now() + room.turnTimerLimit * 1000 : null;
      startTurnTimeout(room);
    }
    broadcastState(room);
    if (!gameOver) scheduleBotTurn(room);
    return;
  }

  const fromPiece = gs.board[move.from.r][move.from.c];
  const toPiece = gs.board[move.to.r][move.to.c];

  if (move.type === 'attack') {
    clearTurnTimeout(room); // Pause timer during combat showdown
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

    // Resolve after the configured delays
    const winHighlightDelay = (typeof COMBAT_SHOWDOWN_HIGHLIGHT_DELAY !== 'undefined') ? COMBAT_SHOWDOWN_HIGHLIGHT_DELAY : 2000;
    const combatResolveDelay = winHighlightDelay + ((typeof COMBAT_SHOWDOWN_WINNING_CARD_DURATION !== 'undefined') ? COMBAT_SHOWDOWN_WINNING_CARD_DURATION : 2500);

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
        gs.turn = engine.getNextActiveTurn(gs.turn, gs);
        gs.hasSwappedThisTurn = false;
        room.turnEndTime = room.turnTimerLimit > 0 ? Date.now() + room.turnTimerLimit * 1000 : null;
        startTurnTimeout(room);
      }
      broadcastState(room);
      if (!gameOver) scheduleBotTurn(room);
    }, combatResolveDelay);
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
    gs.turn = engine.getNextActiveTurn(gs.turn, gs);
    gs.hasSwappedThisTurn = false;
    room.turnEndTime = room.turnTimerLimit > 0 ? Date.now() + room.turnTimerLimit * 1000 : null;
    startTurnTimeout(room);
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
    clearTurnTimeout(room);
    const winner = kingsA === 0 ? 'B' : 'A';
    
    // Update persistent scores
    if (!room.matchScores) {
      room.matchScores = { A: 0, B: 0 };
    }
    room.matchScores[winner]++;
    
    // Set matchScores inside the broadcasted game state
    if (room.gameState) {
      room.gameState.matchScores = { ...room.matchScores };
    }

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

function broadcastRoomUpdate(room) {
  io.to(room.code).emit('room-update', {
    seats: getSeatInfo(room),
    state: room.state,
    turnTimerLimit: room.turnTimerLimit
  });
}

function clearTurnTimeout(room) {
  if (room.turnTimeout) {
    clearTimeout(room.turnTimeout);
    room.turnTimeout = null;
  }
}

function startTurnTimeout(room) {
  clearTurnTimeout(room);
  
  if (room.state !== 'playing' || !room.gameState) return;
  if (room.combatShowdown) return;
  if (room.turnTimerLimit === 0) return;

  const gs = room.gameState;
  const currentSeat = room.seats[gs.turn];

  if (currentSeat && currentSeat.type === 'human') {
    const delay = room.turnEndTime - Date.now();
    room.turnTimeout = setTimeout(() => {
      handleTurnTimeout(room);
    }, Math.max(0, delay));
  }
}

function handleTurnTimeout(room) {
  if (room.state !== 'playing' || !room.gameState) return;
  const gs = room.gameState;

  // Skip turn on timeout
  gs.turn = engine.getNextActiveTurn(gs.turn, gs);
  gs.hasSwappedThisTurn = false;
  gs.lastMove = null;

  room.turnEndTime = room.turnTimerLimit > 0 ? Date.now() + room.turnTimerLimit * 1000 : null;

  broadcastState(room);
  startTurnTimeout(room);
  scheduleBotTurn(room);
}

function scheduleBotTurn(room) {
  if (room.state !== 'playing' || !room.gameState) return;
  if (room.combatShowdown) return;

  const gs = room.gameState;
  const currentSeat = room.seats[gs.turn];

  if (currentSeat.type === 'bot') {
    const serverBotDelay = (typeof SERVER_BOT_DELAY !== 'undefined') ? SERVER_BOT_DELAY : 1600;
    setTimeout(() => {
      if (room.state !== 'playing' || !room.gameState || room.combatShowdown) return;
      if (room.gameState.turn !== room.seats.indexOf(currentSeat)) return;

      const decision = getBotDecision(room.gameState, room.botWeights);
      const move = decision && decision.move ? decision.move : null;
      if (decision && decision.swap) {
        if (decision.swap.swapType === 'base-to-pos') {
          engine.swapCards(gs.turn, decision.swap.baseCardIdx, decision.swap.posCardIdx, room.gameState);
        } else if (decision.swap.swapType === 'pos-to-pos') {
          engine.swapPositionalCards(gs.turn, decision.swap.posCardIdx1, decision.swap.posCardIdx2, room.gameState);
        }
      }
      if (move) {
        executeMoveOnServer(room, move);
      } else {
        // Bot has no moves, pass
        room.gameState.turn = engine.getNextActiveTurn(room.gameState.turn, room.gameState);
        room.gameState.hasSwappedThisTurn = false;
        room.turnEndTime = room.turnTimerLimit > 0 ? Date.now() + room.turnTimerLimit * 1000 : null;
        broadcastState(room);
        startTurnTimeout(room);
        scheduleBotTurn(room);
      }
    }, serverBotDelay);
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

  socket.on('check-session', ({ token }, callback) => {
    if (!token) {
      if (typeof callback === 'function') callback({ inRoom: false });
      return;
    }
    for (const [code, room] of rooms) {
      const seatIndexes = getSeatIndexesForToken(room, token);
      const isHostSession = room.hostToken === token;
      
      if (seatIndexes.length > 0 || isHostSession) {
        const firstSeatIdx = seatIndexes.length > 0 ? seatIndexes[0] : null;
        if (firstSeatIdx !== null) {
          const seat = room.seats[firstSeatIdx];
          if (seat && seat.disconnectTimeout) {
            clearTimeout(seat.disconnectTimeout);
            seat.disconnectTimeout = null;
          }
        }
        seatIndexes.forEach((idx) => {
          const seatEntry = room.seats[idx];
          if (seatEntry) {
            seatEntry.socketId = socket.id;
            seatEntry.connected = true;
          }
        });

        // Find playerName from seats or default to 'Host'
        const matchedSeat = room.seats.find(s => s.token === token);
        socket.playerName = matchedSeat ? matchedSeat.name : 'Host';
        socket.playerToken = token;

        if (isHostSession) {
          room.hostSocketId = socket.id;
        }
        socket.join(room.code);
        
        if (typeof callback === 'function') {
          callback({
            inRoom: true,
            roomCode: room.code,
            seatIndex: firstSeatIdx,
            seatIndexes,
            isHost: isHostSession,
            seats: getSeatInfo(room),
            state: room.state,
            turnTimerLimit: room.turnTimerLimit
          });
        }
        
        broadcastRoomUpdate(room);
        if (room.state === 'playing' || room.state === 'finished') {
          const view = firstSeatIdx !== null ? getPlayerView(room, firstSeatIdx) : null;
          if (view) {
            view.combatShowdown = room.combatShowdown;
            view.seatIndex = firstSeatIdx;
            io.to(socket.id).emit('game-state', view);
          }
        }
        return;
      }
    }
    if (typeof callback === 'function') callback({ inRoom: false });
  });

  socket.on('update-room-settings', ({ turnTimerLimit }, callback) => {
    const found = findRoomBySocket(socket);
    if (!found) return;
    const { room } = found;

    if (socket.id !== room.hostSocketId) {
      if (typeof callback === 'function') callback({ success: false, error: 'Only the host can change settings' });
      return;
    }
    if (room.state !== 'waiting') return;
    if (turnTimerLimit !== 30 && turnTimerLimit !== 60 && turnTimerLimit !== 90 && turnTimerLimit !== 0) {
      if (typeof callback === 'function') callback({ success: false, error: 'Invalid timer value' });
      return;
    }

    room.turnTimerLimit = turnTimerLimit;
    if (typeof callback === 'function') callback({ success: true });
    broadcastRoomUpdate(room);
  });

  socket.on('create-room', ({ playerName, token }, callback) => {
    const name = (playerName || 'Player').trim().substring(0, 20);
    socket.playerName = name;
    socket.playerToken = token;
    const room = createRoom(socket, name, token);
    if (typeof callback === 'function') {
      callback({ success: true, roomCode: room.code, seatIndex: 0, seatIndexes: [0], seats: getSeatInfo(room), turnTimerLimit: room.turnTimerLimit });
    }
    io.emit('rooms-updated', getRoomList());
  });

  socket.on('join-room', ({ roomCode, playerName, token }, callback) => {
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
    socket.playerName = name;
    socket.playerToken = token;
    room.seats[openIdx] = { type: 'human', socketId: socket.id, name, connected: true, token };
    socket.join(code);

    if (typeof callback === 'function') {
      callback({ success: true, roomCode: code, seatIndex: openIdx, seatIndexes: [openIdx], seats: getSeatInfo(room), turnTimerLimit: room.turnTimerLimit });
    }
    broadcastRoomUpdate(room);
    io.emit('rooms-updated', getRoomList());
  });

  socket.on('switch-seat', ({ seatIndex }, callback) => {
    const found = findRoomBySocket(socket);
    if (!found) return;
    const { room } = found;

    if (room.state !== 'waiting') return;
    if (seatIndex < 0 || seatIndex > 3) return;

    const targetSeat = room.seats[seatIndex];
    const playerName = socket.playerName || 'Player';
    const playerToken = socket.playerToken || '';
    const currentSeatIndexes = getSeatIndexesBySocket(room, socket.id);

    // If the target seat is already occupied by this socket (unclaiming/unclicking a seat)
    if (targetSeat.type === 'human' && targetSeat.socketId === socket.id) {
      // Unclaim this seat
      room.seats[seatIndex] = { type: 'open', socketId: null, name: '', connected: false };
      
      const remainingSeatIdx = currentSeatIndexes.find(idx => idx !== seatIndex) ?? null;
      if (typeof callback === 'function') {
        callback({ 
          success: true, 
          seatIndex: remainingSeatIdx, 
          seatIndexes: getSeatIndexesForToken(room, playerToken),
          seats: getSeatInfo(room)
        });
      }
      broadcastRoomUpdate(room);
      io.emit('rooms-updated', getRoomList());
      return;
    }

    if (targetSeat.type !== 'open') {
      if (typeof callback === 'function') callback({ success: false, error: 'Seat is not open' });
      return;
    }

    // Determine target team and opposite team seats
    // Team A = North (0), South (2)
    // Team B = East (1), West (3)
    const isTargetTeamA = (seatIndex === 0 || seatIndex === 2);
    const oppositeSeatIndices = isTargetTeamA ? [1, 3] : [0, 2];

    // Vacate any seats on the opposite team occupied by this player (socketId or token match)
    oppositeSeatIndices.forEach(idx => {
      const s = room.seats[idx];
      if (s.type === 'human' && (s.socketId === socket.id || s.token === playerToken)) {
        room.seats[idx] = { type: 'open', socketId: null, name: '', connected: false };
      }
    });

    // Recalculate how many seats this player occupies after vacating opposite team seats
    const freshSeatIndexes = getSeatIndexesBySocket(room, socket.id);
    if (freshSeatIndexes.length >= 2) {
      if (typeof callback === 'function') callback({ success: false, error: 'You can only control 2 seats' });
      return;
    }

    room.seats[seatIndex] = {
      type: 'human',
      socketId: socket.id,
      name: playerName,
      connected: true,
      token: playerToken
    };

    if (typeof callback === 'function') {
      callback({ 
        success: true, 
        seatIndex, 
        seatIndexes: getSeatIndexesForToken(room, playerToken),
        seats: getSeatInfo(room)
      });
    }
    broadcastRoomUpdate(room);
    io.emit('rooms-updated', getRoomList());
  });

  socket.on('toggle-seat', ({ seatIndex }, callback) => {
    const found = findRoomBySocket(socket);
    if (!found) return;
    const { room } = found;

    if (socket.id !== room.hostSocketId) {
      if (typeof callback === 'function') callback({ success: false, error: 'Only the host can toggle bots' });
      return;
    }
    if (room.state !== 'waiting') return;
    if (seatIndex < 0 || seatIndex > 3) return;

    const seat = room.seats[seatIndex];
    if (seat.type === 'human') {
      if (typeof callback === 'function') callback({ success: false, error: 'Cannot toggle a human seat' });
      return;
    }

    if (seat.type === 'open') {
      room.seats[seatIndex] = { type: 'bot', socketId: null, name: 'Bot', connected: false };
    } else if (seat.type === 'bot') {
      room.seats[seatIndex] = { type: 'open', socketId: null, name: '', connected: false };
    }

    if (typeof callback === 'function') callback({ success: true });
    broadcastRoomUpdate(room);
    io.emit('rooms-updated', getRoomList());
  });

  socket.on('start-game', (callback) => {
    const found = findRoomBySocket(socket);
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
    room.matchScores = { A: 0, B: 0 };
    room.lastStartingPlayer = 0; // Default to North (0)
    room.gameState = engine.initGame(room.lastStartingPlayer, room.matchScores);
    room.gameState.lastMove = null;
    room.turnEndTime = room.turnTimerLimit > 0 ? Date.now() + room.turnTimerLimit * 1000 : null;

    if (typeof callback === 'function') callback({ success: true });

    // Send room update first so clients transition to game view
    broadcastRoomUpdate(room);

    // Then send initial game state to each player
    broadcastState(room);

    // Start turn timer
    startTurnTimeout(room);

    // If first turn is a bot, schedule it
    scheduleBotTurn(room);

    io.emit('rooms-updated', getRoomList());
  });

  socket.on('player-move', ({ move }, callback) => {
    const found = findRoomBySocket(socket);
    if (!found) return;
    const { room, seatIndexes } = found;

    if (room.state !== 'playing' || !room.gameState) return;
    if (room.combatShowdown) return;

    const activeSeatIdx = room.gameState.turn;
    if (!seatIndexes.includes(activeSeatIdx)) {
      if (typeof callback === 'function') callback({ success: false, error: 'Not your turn' });
      return;
    }
    if (room.seats[activeSeatIdx].type !== 'human') return;

    // Validate the move
    const gs = room.gameState;

    if (move.type === 'promote') {
      const validSquares = engine.find_pawns_to_promot(activeSeatIdx, move.promoType, move.promoSubtype, gs);
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
    const found = findRoomBySocket(socket);
    if (!found) return;
    const { room, seatIndexes } = found;

    if (room.state !== 'playing' || !room.gameState) return;
    const activeSeatIdx = room.gameState.turn;
    if (!seatIndexes.includes(activeSeatIdx)) return;
    if (room.seats[activeSeatIdx].type !== 'human') return;

    const gs = room.gameState;
    let success = false;

    if (type === 'base-to-pos') {
      success = engine.swapCards(activeSeatIdx, baseCardIdx, posCardIdx, gs);
    } else if (type === 'pos-to-pos') {
      success = engine.swapPositionalCards(activeSeatIdx, baseCardIdx, posCardIdx, gs);
    }

    if (typeof callback === 'function') callback({ success });
    if (success) broadcastState(room);
  });

  socket.on('request-rematch', (callback) => {
    const found = findRoomBySocket(socket);
    if (!found) return;
    const { room } = found;

    if (room.state !== 'finished') return;
    if (socket.id !== room.hostSocketId) {
      if (typeof callback === 'function') callback({ success: false, error: 'Only host can restart' });
      return;
    }

    // Reset game
    room.state = 'playing';
    if (!room.matchScores) {
      room.matchScores = { A: 0, B: 0 };
    }
    room.lastStartingPlayer = (room.lastStartingPlayer !== undefined ? room.lastStartingPlayer + 1 : 1) % 4;
    room.gameState = engine.initGame(room.lastStartingPlayer, room.matchScores);
    room.gameState.lastMove = null;
    room.combatShowdown = null;
    if (room.combatTimeout) clearTimeout(room.combatTimeout);
    room.combatTimeout = null;
    room.turnEndTime = room.turnTimerLimit > 0 ? Date.now() + room.turnTimerLimit * 1000 : null;

    if (typeof callback === 'function') callback({ success: true });
    broadcastRoomUpdate(room);
    broadcastState(room);
    startTurnTimeout(room);
    scheduleBotTurn(room);
  });

  socket.on('leave-room', () => {
    handleDisconnect(socket, true);
  });

  socket.on('disconnect', () => {
    console.log(`[Disconnect] ${socket.id}`);
    handleDisconnect(socket, false);
  });

  function handleDisconnect(sock, explicitLeave = false) {
    const found = findRoomBySocket(sock);
    if (!found) return;
    const { room, seatIndexes } = found;

    if (room.state === 'waiting') {
      if (explicitLeave) {
        if (sock.id === room.hostSocketId) {
          // Host left — close the room
          io.to(room.code).emit('room-closed', { reason: 'Host left the room' });
          if (room.combatTimeout) clearTimeout(room.combatTimeout);
          rooms.delete(room.code);
        } else {
          // Non-host left — free all seats this socket controlled
          seatIndexes.forEach((idx) => {
            room.seats[idx] = { type: 'open', socketId: null, name: '', connected: false };
          });
          broadcastRoomUpdate(room);
        }
      } else {
        seatIndexes.forEach((idx) => {
          if (room.seats[idx]) room.seats[idx].connected = false;
        });
        broadcastRoomUpdate(room);

        if (sock.id === room.hostSocketId) {
          seatIndexes.forEach((idx) => {
            if (room.seats[idx]) {
              room.seats[idx].disconnectTimeout = setTimeout(() => {
                if (rooms.has(room.code) && room.seats[idx] && !room.seats[idx].connected) {
                  io.to(room.code).emit('room-closed', { reason: 'Host left the room' });
                  if (room.combatTimeout) clearTimeout(room.combatTimeout);
                  rooms.delete(room.code);
                }
              }, 15000);
            }
          });
        } else {
          seatIndexes.forEach((idx) => {
            if (room.seats[idx]) {
              room.seats[idx].disconnectTimeout = setTimeout(() => {
                if (rooms.has(room.code) && room.seats[idx] && !room.seats[idx].connected) {
                  room.seats[idx] = { type: 'open', socketId: null, name: '', connected: false };
                  broadcastRoomUpdate(room);
                }
              }, 15000);
            }
          });
        }
      }
    } else if (room.state === 'playing' || room.state === 'finished') {
      if (explicitLeave) {
        seatIndexes.forEach((idx) => {
          if (room.seats[idx]) {
            room.seats[idx].type = 'bot';
            room.seats[idx].name = 'Bot';
            room.seats[idx].socketId = null;
            room.seats[idx].token = null;
            room.seats[idx].connected = false;
          }
        });

        broadcastRoomUpdate(room);
        broadcastState(room);

        if (room.gameState && seatIndexes.includes(room.gameState.turn) && room.state === 'playing') {
          clearTurnTimeout(room);
          scheduleBotTurn(room);
        }

        const hasHumans = room.seats.some(s => s.type === 'human' && s.connected);
        if (!hasHumans) {
          if (room.combatTimeout) clearTimeout(room.combatTimeout);
          rooms.delete(room.code);
        }
      } else {
        seatIndexes.forEach((idx) => {
          if (room.seats[idx]) room.seats[idx].connected = false;
        });
        broadcastRoomUpdate(room);

        seatIndexes.forEach((idx) => {
          if (room.seats[idx]) {
            room.seats[idx].disconnectTimeout = setTimeout(() => {
              if (!rooms.has(room.code)) return;
              const seat = room.seats[idx];
              if (seat && !seat.connected) {
                seat.type = 'bot';
                seat.name = 'Bot';
                seat.socketId = null;
                seat.token = null;
                seat.connected = false;

                broadcastRoomUpdate(room);
                broadcastState(room);

                if (room.gameState && room.gameState.turn === idx && room.state === 'playing') {
                  clearTurnTimeout(room);
                  scheduleBotTurn(room);
                }

                const hasHumans = room.seats.some(s => s.type === 'human' && s.connected);
                if (!hasHumans) {
                  if (room.combatTimeout) clearTimeout(room.combatTimeout);
                  rooms.delete(room.code);
                }
              }
            }, 60000);
          }
        });
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
