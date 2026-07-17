// Poachers - Interactive Game UI Handler
// Global diagnostic error listener to catch and print console errors directly in the Game Log panel
window.addEventListener('error', (event) => {
  const logBox = document.getElementById('log-entries');
  if (logBox) {
    const entry = document.createElement('div');
    entry.className = 'log-entry system-msg';
    entry.style.color = 'var(--color-red)';
    const file = event.filename ? event.filename.split('/').pop() : 'unknown';
    entry.innerHTML = `[Runtime Error] ${event.message} in ${file}:${event.lineno || '?'}`;
    logBox.appendChild(entry);
    logBox.scrollTop = logBox.scrollHeight;
  }
});

const engine = window.PoachersEngine;
if (!engine) {
  console.error("Poachers game engine not found!");
} else {
  // UI elements
  const elBoard = document.getElementById('board');
  const elLogEntries = document.getElementById('log-entries');
  const elScoreA = document.getElementById('score-a');
  const elScoreB = document.getElementById('score-b');
  const elActivePlayerAvatar = document.getElementById('active-player-avatar');
  const elActivePlayerName = document.getElementById('active-player-name');
  const elActivePlayerTeam = document.getElementById('active-player-team');
  const elTurnPhase = document.getElementById('turn-phase');
  const elTurnCard = document.getElementById('turn-card');
  const elCapturedPoolA = document.getElementById('captured-pool-a');
  const elCapturedPoolB = document.getElementById('captured-pool-b');
  const elBaseDeckCards = document.getElementById('base-deck-cards');
  const elBaseDeckOwner = document.getElementById('base-deck-owner');
  const elBaseDeckCount = document.getElementById('base-deck-count');
  const elBaseDeckPromotional = document.getElementById('base-deck-promotional');
  
  // Community cards
  const elPublicFlop = document.getElementById('public-flop');
  const elPublicTurnRiver = document.getElementById('public-turn-river');

  // Buttons & Overlays
  const elBtnNewGame = document.getElementById('btn-new-game');
  const elBtnRotateBoard = document.getElementById('btn-rotate-board');
  const elGameOverOverlay = document.getElementById('game-over-overlay');
  const elWinnerAnnouncement = document.getElementById('winner-announcement');
  const elBtnRestart = document.getElementById('btn-restart-overlay');

  // Online info elements
  const elOnlineInfoCard = document.getElementById('online-info-card');
  const elOnlineRoomCode = document.getElementById('online-room-code');
  const elOnlinePlayersList = document.getElementById('online-players-list');

  // Unicode chess symbols
  const PIECE_SYMBOLS = {
    'p': '♟', 'n': '♞', 'b': '♝', 'r': '♜', 'k': '♚',
    'P': '♟', 'N': '♞', 'B': '♝', 'R': '♜', 'K': '♚'
  };

  // SVG chess pieces paths
  const PIECE_IMAGES = {
    'P': 'assets/w_p.svg',
    'N': 'assets/w_n.svg',
    'B': 'assets/w_b.svg',
    'R': 'assets/w_r.svg',
    'K': 'assets/w_k.svg',
    'p': 'assets/b_p.svg',
    'n': 'assets/b_n.svg',
    'b': 'assets/b_b.svg',
    'r': 'assets/b_r.svg',
    'k': 'assets/b_k.svg'
  };

  // Card suit symbols
  const SUIT_SYMBOLS = {
    'C': '&clubs;',
    'D': '&diams;',
    'H': '&hearts;',
    'S': '&spades;'
  };

  const SUIT_CLASSES = {
    'C': 'card-black',
    'D': 'card-red',
    'H': 'card-red',
    'S': 'card-black'
  };

  const SEAT_NAMES = ['North', 'East', 'South', 'West'];
  const SEAT_SHORT = ['N', 'E', 'S', 'W'];

  // Game UI State
  let gameState = null;
  let boardRotation = 0; // 0, 90, 180, 270 degrees
  
  let botPlayers = ['manual', 'manual', 'manual', 'manual'];
  let defaultBotWeights = [1, 3, 3.5, 5, 20, 0.5, 0.2, 0.1, 8, 0.2, 10, 2, 0.5];
  
  // Replay state
  let history = [];
  let historyIndex = -1;
  let gameEnded = false;

  // Online mode state
  let onlineState = null;       // The server-provided state view
  let onlineSeatIndex = null;   // Which seat this client is (0-3)
  
  function isOnline() {
    return window.Multiplayer && window.Multiplayer.isOnline;
  }

  function isMyTurn() {
    if (!isOnline()) return true; // Offline: always your turn (hotseat)
    return gameState && gameState.turn === window.Multiplayer.myPlayerId;
  }

  fetch('bots/v8_networth/weights.json')
    .then(r => r.json())
    .then(data => defaultBotWeights = data)
    .catch(e => console.error("Could not load bot weights", e));

  function getBotDelay() {
    const elSpeedSlider = document.getElementById('speed-slider');
    const val = elSpeedSlider ? elSpeedSlider.value : '3';
    switch (val) {
      case '1': return 4000; // Very Slow
      case '2': return 2000; // Slow
      case '3': return 1000; // Normal
      case '4': return 500;  // Fast
      case '5': return 250;  // Very Fast
      default: return 1000;
    }
  }

  function checkBotTurn() {
    // In online mode, bots are handled server-side
    if (isOnline()) return;

    logSystemEvent(`[System] checkBotTurn called. Active turn: ${gameState ? gameState.turn : 'null'}`);
    if (!gameState || gameEnded || combatShowdown) return;
    if (historyIndex !== history.length - 1) {
      logSystemEvent(`[System] Bot turn check skipped: viewing replay/history.`);
      return;
    }
    const activeId = gameState.turn;
    const botMode = botPlayers[activeId];
    if (botMode && botMode !== 'manual') {
      resetCardSelection();
      logSystemEvent(`[System] Seat ${activeId} is a bot (${botMode}). Thinking...`);
      setTimeout(() => {
        if (!gameState || gameState.turn !== activeId || combatShowdown) {
          logSystemEvent(`[System] Bot aborted turn. State changed.`);
          return;
        }
        try {
          let move;
          if (botMode === 'random') {
            if (!window.PoachersRandomBot) {
              logSystemEvent(`[ERROR] window.PoachersRandomBot is completely undefined! Did bot.js load?`);
              return;
            }
            logSystemEvent(`[System] Requesting best move from PoachersRandomBot...`);
            move = window.PoachersRandomBot.getBestMove(gameState, defaultBotWeights);
          } else if (botMode === 'v1_basic') {
            if (!window.PoachersBot) {
              logSystemEvent(`[ERROR] window.PoachersBot is completely undefined! Did bot.js load?`);
              return;
            }
            logSystemEvent(`[System] Requesting best move from PoachersBot (v1_basic)...`);
            move = window.PoachersBot.getBestMove(gameState, defaultBotWeights);
          } else if (botMode === 'v2_no_minimax') {
            if (!window.PoachersBot_no_minimax) {
              logSystemEvent(`[ERROR] window.PoachersBot_no_minimax is completely undefined! Did bot.js load?`);
              return;
            }
            logSystemEvent(`[System] Requesting best move from PoachersBot_no_minimax...`);
            move = window.PoachersBot_no_minimax.getBestMove(gameState, defaultBotWeights);
          } else if (botMode === 'v3_fast') {
            if (!window.PoachersBot_v3) {
              logSystemEvent(`[ERROR] window.PoachersBot_v3 is completely undefined! Did bot.js load?`);
              return;
            }
            logSystemEvent(`[System] Requesting best move from PoachersBot_v3...`);
            move = window.PoachersBot_v3.getBestMove(gameState, defaultBotWeights);
          } else if (botMode === 'v4_networth') {
            if (!window.PoachersBot_v4) {
              logSystemEvent(`[ERROR] window.PoachersBot_v4 is completely undefined! Did bot.js load?`);
              return;
            }
            logSystemEvent(`[System] Requesting best move from PoachersBot_v4...`);
            move = window.PoachersBot_v4.getBestMove(gameState, defaultBotWeights);
          } else if (botMode === 'v5_networth') {
            if (!window.PoachersBot_v5) {
              logSystemEvent(`[ERROR] window.PoachersBot_v5 is completely undefined! Did bot.js load?`);
              return;
            }
            logSystemEvent(`[System] Requesting best move from PoachersBot_v5...`);
            move = window.PoachersBot_v5.getBestMove(gameState, defaultBotWeights);
          } else if (botMode === 'v6_networth') {
            if (!window.PoachersBot_v6) {
              logSystemEvent(`[ERROR] window.PoachersBot_v6 is completely undefined! Did bot.js load?`);
              return;
            }
            logSystemEvent(`[System] Requesting best move from PoachersBot_v6...`);
            move = window.PoachersBot_v6.getBestMove(gameState, defaultBotWeights);
          } else if (botMode === 'v7_networth') {
            if (!window.PoachersBot_v7) {
              logSystemEvent(`[ERROR] window.PoachersBot_v7 is completely undefined! Did bot.js load?`);
              return;
            }
            logSystemEvent(`[System] Requesting best move from PoachersBot_v7...`);
            move = window.PoachersBot_v7.getBestMove(gameState, defaultBotWeights);
          } else if (botMode === 'v8_networth') {
            if (!window.PoachersBot_v8) {
              logSystemEvent(`[ERROR] window.PoachersBot_v8 is completely undefined! Did bot.js load?`);
              return;
            }
            logSystemEvent(`[System] Requesting best move from PoachersBot_v8...`);
            move = window.PoachersBot_v8.getBestMove(gameState, defaultBotWeights);
          }
          
          logSystemEvent(`[System] Bot returned move: ${move ? move.type : 'none'}`);
          
          if (move) {
            executeMove(move);
          } else {
            logSystemEvent(`[Bot] ${gameState.players[activeId].name} has no legal moves. Passing turn.`);
            gameState.turn = (gameState.turn + 1) % 4;
            gameState.hasSwappedThisTurn = false;
            renderState();
            triggerTurnStartAnimations();
            checkBotTurn();
          }
        } catch (err) {
          logSystemEvent(`[CRITICAL ERROR] Bot crashed: ${err.message}`);
          console.error(err);
        }
      }, getBotDelay());
    }
  }
  let selectedPiece = null; // { r, c }
  let selectedCapturedPiece = null; // { type, index, validSquares }
  let selectedBaseCardIdx = null; // index of selected card in active player's base deck
  let selectedPosCardIdx = null; // index of selected card in active player's positional cards
  let activeLegalMoves = []; // array of move objects
  let combatShowdown = null; // { move, result, combatCards, colRegion, rowRegion }

  function resetCardSelection() {
    selectedBaseCardIdx = null;
    selectedPosCardIdx = null;
  }

  // Helper to render card
  function getCardHTML(cardString, isLocked = false, isSelected = false) {
    if (!cardString) {
      return `<div class="playing-card card-back"></div>`;
    }
    if (isLocked) {
      return `<div class="playing-card card-back locked"></div>`;
    }
    const val = cardString.slice(0, -1);
    const displayVal = val === 'T' ? '10' : val;
    const suit = cardString.slice(-1);
    const suitSymbol = SUIT_SYMBOLS[suit] || suit;
    const colorClass = SUIT_CLASSES[suit] || '';
    const selectedClass = isSelected ? 'selected-base-card' : '';
    
    return `
      <div class="playing-card ${colorClass} ${selectedClass}">
        <div class="card-val-top">${displayVal}</div>
        <div class="card-suit-bottom">${suitSymbol}</div>
      </div>
    `;
  }

  // Helper to log system events
  function logSystemEvent(msg) {
    const entry = document.createElement('div');
    entry.className = 'log-entry system-msg';
    entry.innerHTML = `[${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}] ${msg}`;
    elLogEntries.appendChild(entry);
    elLogEntries.scrollTop = elLogEntries.scrollHeight;
  }

  // Save current game state to history
  function saveHistoryState() {
    if (!gameState) return;
    
    const isViewingPast = historyIndex >= 0 && historyIndex < history.length - 1;

    // Only slice future history if we are offline (e.g. human overwrites timeline)
    if (isViewingPast && !isOnline()) {
      history = history.slice(0, historyIndex + 1);
    }
    
    history.push({
      gameState: JSON.parse(JSON.stringify(gameState)),
      combatShowdown: combatShowdown ? JSON.parse(JSON.stringify(combatShowdown)) : null
    });
    
    // Only advance the index if we aren't currently viewing the past
    if (!isViewingPast) {
      historyIndex = history.length - 1;
    }
    
    updateReplayButtons();
  }

  // Restore game state from history at current index
  function restoreHistoryState() {
    if (historyIndex < 0 || historyIndex >= history.length) return;
    const entry = history[historyIndex];
    gameState = JSON.parse(JSON.stringify(entry.gameState));
    combatShowdown = entry.combatShowdown ? JSON.parse(JSON.stringify(entry.combatShowdown)) : null;

    // Reset transient UI selection state when scrubbing history
    selectedPiece = null;
    selectedCapturedPiece = null;
    resetCardSelection();
    activeLegalMoves = [];

    renderState();
    updateReplayButtons();
  }

  // Update Replay buttons state and display counter
  function updateReplayButtons() {
    const elPrev = document.getElementById('btn-replay-prev');
    const elNext = document.getElementById('btn-replay-next');
    const elInfo = document.getElementById('replay-step-info');

    if (history.length <= 1) {
      if (elPrev) elPrev.disabled = true;
      if (elNext) elNext.disabled = true;
      if (elInfo) {
        elInfo.textContent = "LIVE GAME";
        elInfo.style.color = "var(--color-green)";
      }
      return;
    }

    if (elPrev) {
      elPrev.disabled = (historyIndex === 0);
    }
    if (elNext) {
      elNext.disabled = (historyIndex === history.length - 1);
    }

    if (elInfo) {
      if (historyIndex === history.length - 1) {
        elInfo.textContent = "LIVE GAME";
        elInfo.style.color = "var(--color-green)";
      } else {
        elInfo.textContent = `STEP ${historyIndex} / ${history.length - 1}`;
        elInfo.style.color = "var(--color-orange)";
      }
    }
  }

  // Helper to map coordinate to chess notation
  function getSquareName(r, c) {
    const file = String.fromCharCode(97 + c);
    const rank = 8 - r;
    return file + rank;
  }

  // Initialize new game state and clear log (OFFLINE only)
  function initNewGame() {
    if (isOnline()) return; // Server handles this in online mode

    gameState = engine.initGame();
    gameState.lastMove = null;
    selectedPiece = null;
    selectedCapturedPiece = null;
    resetCardSelection();
    activeLegalMoves = [];
    combatShowdown = null;
    gameEnded = false;
    history = [];
    historyIndex = -1;
    saveHistoryState();
    elLogEntries.innerHTML = '';
    logSystemEvent("New Match started. Select a piece to see legal moves.");
    renderState();
    triggerTurnStartAnimations();
    checkBotTurn();
  }

  // Handle clicks on the main board grid
  function handleCellClick(r, c) {
    if (!gameState || gameEnded) return;
    if (combatShowdown) return; // Disable clicks during showdown
    if (historyIndex !== history.length - 1) {
      logSystemEvent(`[System] Board click ignored: viewing replay/history.`);
      return;
    }

    // Online mode: only allow clicks on your turn
    if (isOnline()) {
      if (!isMyTurn()) {
        logSystemEvent(`[System] Not your turn.`);
        return;
      }
    } else {
      // Offline mode: disable clicks if it is a bot's turn
      if (botPlayers[gameState.turn] !== 'manual') return;
    }

    const piece = gameState.board[r][c];
    logSystemEvent(`Clicked cell (${r}, ${c}). Piece: ${piece || 'Empty'}`);

    // --- PAWN PROMOTION LOGIC ---
    if (selectedCapturedPiece) {
      const isTarget = selectedCapturedPiece.validSquares.find(sq => sq.r === r && sq.c === c);
      if (isTarget) {
        logSystemEvent(`Executing promotion at (${r}, ${c}) with piece type ${selectedCapturedPiece.type} (${selectedCapturedPiece.subtype || 'standard'})`);
        
        if (isOnline()) {
          // Send promotion to server
          const move = {
            type: 'promote',
            to: { r, c },
            promoType: selectedCapturedPiece.type,
            promoSubtype: selectedCapturedPiece.subtype
          };
          window.Multiplayer.sendMove(move);
          selectedCapturedPiece = null;
          selectedPiece = null;
          resetCardSelection();
          activeLegalMoves = [];
          return;
        }

        if (engine.executePromotion(r, c, selectedCapturedPiece.type, selectedCapturedPiece.subtype, gameState.turn, gameState)) {
          selectedCapturedPiece = null;
          selectedPiece = null;
          resetCardSelection();
          activeLegalMoves = [];
          checkGameOver();
          if (gameState) {
            gameState.turn = (gameState.turn + 1) % 4;
            gameState.lastMove = null;
            gameState.hasSwappedThisTurn = false;
            saveHistoryState();
            renderState();
            triggerTurnStartAnimations();
            checkBotTurn();
          }
        }
        return;
      }
    }

    // Check if clicked cell is a destination of selected piece's legal moves
    const matchedMove = activeLegalMoves.find(m => m.to.r === r && m.to.c === c);
    if (selectedPiece && matchedMove) {
      logSystemEvent(`Executing move from (${selectedPiece.r}, ${selectedPiece.c}) to (${r}, ${c})`);
      
      if (isOnline()) {
        // Send move to server instead of local execution
        window.Multiplayer.sendMove(matchedMove);
        selectedPiece = null;
        activeLegalMoves = [];
        renderState();
        return;
      }

      executeMove(matchedMove);
      return;
    }

    // Otherwise, check if clicked cell has a controllable piece for the current turn
    if (piece && engine.isPieceControllable(r, c, gameState.turn, gameState.board)) {
      selectedPiece = { r, c };
      selectedCapturedPiece = null;
      activeLegalMoves = engine.getLegalMoves(r, c, gameState, false);
      logSystemEvent(`Selected controllable piece ${piece}. Legal moves: ${activeLegalMoves.length}`);
    } else {
      // Clear selection
      selectedPiece = null;
      selectedCapturedPiece = null;
      activeLegalMoves = [];
      if (piece) {
        logSystemEvent(`Piece ${piece} is NOT controllable by active player (Turn: ${gameState.turn})`);
      }
    }

    renderState();
  }

  // Execute the selected move on the board (OFFLINE only)
  function executeMove(move) {
    resetCardSelection();
    const activePlayer = gameState.players[gameState.turn];
    const team = activePlayer.team;

    if (move.to && (move.to.r === 3 || move.to.r === 4) && (move.to.c === 3 || move.to.c === 4)) {
      gameState.hillWasVisited = 1;
    }

    // Check if it's a bot's promotion move
    if (move.type === 'promote') {
      engine.executePromotion(move.to.r, move.to.c, move.promoType, move.promoSubtype, activePlayer.id, gameState);
      logSystemEvent(`[Bot ${activePlayer.name}] Promoted captured piece at ${getSquareName(move.to.r, move.to.c)}`);
      
      const refilledCard = engine.checkHillRefill(gameState.turn, gameState);
      if (refilledCard) {
        logSystemEvent(`[Refill] ${activePlayer.name} drew a card for their base deck.`);
      }
      checkGameOver();
      if (gameState) {
        gameState.turn = (gameState.turn + 1) % 4;
        gameState.lastMove = null;
        gameState.hasSwappedThisTurn = false;
        saveHistoryState();
        renderState();
        triggerTurnStartAnimations();
        checkBotTurn();
      }
      return;
    }

    const fromPiece = gameState.board[move.from.r][move.from.c];
    const toPiece = gameState.board[move.to.r][move.to.c];

    const fromSquare = getSquareName(move.from.r, move.from.c);
    const toSquare = getSquareName(move.to.r, move.to.c);
    const pieceName = engine.getPieceType(fromPiece).toUpperCase();

    if (move.type === 'attack') {
      // 1. Draw 2 Turn/River cards from the deck
      const combatCards = [gameState.deck.pop(), gameState.deck.pop()];

      // 2. Evaluate Combat (read-only)
      const combatResult = engine.evaluateCombat(move, combatCards, gameState);

      // 3. Set the showdown state
      combatShowdown = {
        move,
        result: combatResult,
        combatCards,
        colRegion: engine.getColumnRegion(move.to.c),
        rowRegion: engine.getRowRegion(move.to.r)
      };

      // Log combat details
      const defenderName = engine.getPieceType(toPiece).toUpperCase();
      const outcomeText = combatResult.winnerTeam === team ? "Attacker wins" : "Defender wins";
      
      logSystemEvent(`[Combat] ${activePlayer.name}'s ${pieceName} at ${fromSquare} attacks ${defenderName} at ${toSquare}`);
      logSystemEvent(`Turn/River drawn: ${combatCards.join(', ')}`);
      
      const teamAName = "Team N-S (Yellow)";
      const teamBName = "Team E-W (Blue)";
      logSystemEvent(`${teamAName} Hand: ${combatResult.teamAHand.name}`);
      logSystemEvent(`${teamBName} Hand: ${combatResult.teamBHand.name}`);
      
      if (combatResult.outcome === 'capture') {
        logSystemEvent(`Result: ${outcomeText}! ${pieceName} captures ${defenderName} at ${toSquare}.`);
      } else if (combatResult.outcome === 'slide') {
        const slideDest = engine.getSlideDestination(move.from, move.to);
        const slideSquareName = getSquareName(slideDest.r, slideDest.c);
        logSystemEvent(`Result: ${outcomeText}! ${pieceName} was defeated and slided to ${slideSquareName}.`);
      } else {
        logSystemEvent(`Result: ${outcomeText}! ${pieceName} was defeated and stays in place at ${fromSquare}.`);
      }

      // Render the showdown immediately (attacker/defender highlights + face-up cards)
      saveHistoryState();
      renderState();

      // Clear selections for UI during showdown
      selectedPiece = null;
      activeLegalMoves = [];

      // 4. Resolve combat state after 2 seconds
      setTimeout(() => {
        let stolenCard = null;
        if (combatResult.outcome === "capture") {
          const defenderTeam = engine.getPieceTeam(toPiece);
          const defenderPlayerId = (defenderTeam === engine.TEAMS.A)
            ? (move.to.r < 4 ? engine.PLAYERS.NORTH : engine.PLAYERS.SOUTH)
            : (move.to.c < 4 ? engine.PLAYERS.WEST : engine.PLAYERS.EAST);
          const colRegion = engine.getColumnRegion(move.to.c);
          const rowRegion = engine.getRowRegion(move.to.r);
          const defenderCardIdx = (defenderTeam === engine.TEAMS.A) ? colRegion : rowRegion;
          stolenCard = gameState.players[defenderPlayerId].positionalCards[defenderCardIdx];
        }

        // Mutate gameState using the evaluation result
        engine.applyCombatResult(move, combatResult, combatCards, gameState);

        // Clear showdown state
        combatShowdown = null;

        if (stolenCard) {
          logSystemEvent(`[Steal] ${activePlayer.name} stole the defender's losing positional card (${stolenCard}) to their base deck!`);
        }

        // Hill Refill (End of active player's own turn)
        const refilledCard = engine.checkHillRefill(gameState.turn, gameState);
        if (refilledCard) {
          logSystemEvent(`[Refill] ${activePlayer.name} drew a card for their base deck (Hill center occupied).`);
        }

        // Check win condition
        checkGameOver();

        if (gameState) {
          gameState.turn = (gameState.turn + 1) % 4;
          gameState.hasSwappedThisTurn = false;
          saveHistoryState();
          renderState();
          triggerTurnStartAnimations();
          checkBotTurn();
        }
      }, 2000);

      return;
    }

    // Normal move or immediate capture (e.g. King capture or capturing a King)
    let logMsg = `[${activePlayer.name}] ${pieceName} from ${fromSquare} to ${toSquare}`;

    if (toPiece) {
      engine.add_to_captured_pieces(toPiece, move.to.r, move.to.c, gameState);
      const enemyPieceName = engine.getPieceType(toPiece).toUpperCase();
      logMsg += ` (Immediate Capture: Captured enemy ${enemyPieceName}!)`;
    }
    logSystemEvent(logMsg);

    // Apply board change
    gameState.board[move.to.r][move.to.c] = fromPiece;
    gameState.board[move.from.r][move.from.c] = null;
    gameState.lastMove = { from: move.from, to: move.to };

    // Clear selection
    selectedPiece = null;
    activeLegalMoves = [];

    // Hill Refill (End of active player's own turn)
    const refilledCard = engine.checkHillRefill(gameState.turn, gameState);
    if (refilledCard) {
      logSystemEvent(`[Refill] ${activePlayer.name} drew a card for their base deck (Hill center occupied).`);
    }

    // Check win condition (count Kings for both teams)
    checkGameOver();

    if (gameState) {
      gameState.turn = (gameState.turn + 1) % 4;
      gameState.hasSwappedThisTurn = false;
      saveHistoryState();
      renderState();
      triggerTurnStartAnimations();
      checkBotTurn();
    }
  }

  // Count kings and display game over panel if necessary
  function checkGameOver() {
    let kingsA = 0;
    let kingsB = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = gameState.board[r][c];
        if (piece === engine.PIECES.KING_A) kingsA++;
        if (piece === engine.PIECES.KING_B) kingsB++;
      }
    }

    if (kingsA === 0) {
      elWinnerAnnouncement.textContent = "Team B (E-W) Wins!";
      elGameOverOverlay.classList.remove('hidden');
      logSystemEvent("Match Over: Team B captured both Team A Kings.");
      gameEnded = true;
    } else if (kingsB === 0) {
      elWinnerAnnouncement.textContent = "Team A (N-S) Wins!";
      elGameOverOverlay.classList.remove('hidden');
      logSystemEvent("Match Over: Team A captured both Team B Kings.");
      gameEnded = true;
    }
  }

  // Get the display name for a player seat
  function getPlayerDisplayName(playerIdx) {
    if (isOnline() && window.Multiplayer.currentSeats && window.Multiplayer.currentSeats[playerIdx]) {
      const seat = window.Multiplayer.currentSeats[playerIdx];
      if (seat.type === 'human') {
        return seat.name;
      }
      return 'Bot';
    }
    return SEAT_NAMES[playerIdx];
  }

  // Update the online info card with current room/player info
  function updateOnlineInfoCard() {
    if (!isOnline() || !elOnlineInfoCard) {
      if (elOnlineInfoCard) elOnlineInfoCard.classList.add('hidden');
      return;
    }

    elOnlineInfoCard.classList.remove('hidden');
    
    if (elOnlineRoomCode) {
      elOnlineRoomCode.textContent = `Room: ${window.Multiplayer.roomCode || ''}`;
    }

    if (elOnlinePlayersList && window.Multiplayer.currentSeats) {
      const seats = window.Multiplayer.currentSeats;
      elOnlinePlayersList.innerHTML = seats.map((s, i) => {
        const dir = SEAT_SHORT[i];
        const name = s.type === 'human' ? s.name : 'Bot';
        const cls = s.type === 'human' ? 'online-player-human' : 'online-player-bot';
        const meTag = (i === window.Multiplayer.myPlayerId) ? ' <span class="online-player-me">(You)</span>' : '';
        return `<div class="online-player-entry ${cls}"><span class="online-player-dir">${dir}:</span> ${escapeHtml(name)}${meTag}</div>`;
      }).join('');
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Render the current game state to the DOM
  function renderState() {
    if (!gameState) return;

    // Update online info
    updateOnlineInfoCard();

    // Hide offline-only controls in online mode
    const botTogglesGroup = document.getElementById('bot-toggles-group');
    const speedControlGroup = document.getElementById('speed-control-group');
    if (isOnline()) {
      if (botTogglesGroup) botTogglesGroup.classList.add('hidden');
      if (speedControlGroup) speedControlGroup.classList.add('hidden');
      if (elBtnNewGame) elBtnNewGame.classList.add('hidden');
    } else {
      if (botTogglesGroup) botTogglesGroup.classList.remove('hidden');
      if (speedControlGroup) speedControlGroup.classList.remove('hidden');
      if (elBtnNewGame) elBtnNewGame.classList.remove('hidden');
    }

    // Render match score (statically 0:0 for now)
    elScoreA.textContent = "0";
    elScoreB.textContent = "0";

    // Render active player turn indicator
    const activePlayer = gameState.players[gameState.turn];
    const isTeamA = activePlayer.team === engine.TEAMS.A;

    elActivePlayerAvatar.textContent = activePlayer.name[0];
    elActivePlayerAvatar.style.background = isTeamA ? 'var(--color-team-a)' : 'var(--color-team-b)';
    elActivePlayerAvatar.style.boxShadow = isTeamA ? 'var(--shadow-neon-a)' : 'var(--shadow-neon-b)';
    
    // Show player display name (nickname in online mode)
    const displayName = getPlayerDisplayName(gameState.turn);
    elActivePlayerName.textContent = displayName;
    elActivePlayerTeam.textContent = isTeamA ? "Team N-S (A)" : "Team E-W (B)";
    elTurnCard.style.borderColor = isTeamA ? 'var(--color-team-a)' : 'var(--color-team-b)';
    
    if (isOnline() && !isMyTurn()) {
      elTurnPhase.textContent = `Waiting for ${displayName}...`;
    } else if (selectedPiece) {
      elTurnPhase.textContent = "Choose a destination square";
    } else {
      elTurnPhase.textContent = "Select a piece to move";
    }

    // Check if it's a human's turn that can interact
    const canInteract = isOnline() ? isMyTurn() : (botPlayers[gameState.turn] === 'manual');

    // Render 8x8 Board
    elBoard.innerHTML = '';
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const cell = document.createElement('div');
        cell.className = 'board-cell';
        
        const isDark = (r + c) % 2 !== 0;
        cell.classList.add(isDark ? 'dark-sq' : 'light-sq');

        // Combat showdown highlights
        if (combatShowdown) {
          if (combatShowdown.move.from.r === r && combatShowdown.move.from.c === c) {
            cell.classList.add('combat-attacker');
          }
          if (combatShowdown.move.to.r === r && combatShowdown.move.to.c === c) {
            cell.classList.add('combat-defender');
          }
        }
        
        // Hill highlights
        const isHill = Object.values(engine.HILL_SQUARES).flat().some(sq => sq.r === r && sq.c === c);
        if (isHill) {
          cell.classList.add('hill-sq');
          if (r === 3 && c === 3) cell.classList.add('hill-tl');
          else if (r === 3 && c === 4) cell.classList.add('hill-tr');
          else if (r === 4 && c === 3) cell.classList.add('hill-bl');
          else if (r === 4 && c === 4) cell.classList.add('hill-br');

          // Highlight active player's hill center coordinates if they belong to active player
          const isPlayerHill = engine.HILL_SQUARES[gameState.turn].some(sq => sq.r === r && sq.c === c);
          if (isPlayerHill) {
            cell.classList.add('active-hill');
          }
        }


        // Highlight selected cell
        if (selectedPiece && selectedPiece.r === r && selectedPiece.c === c) {
          cell.classList.add('selected-sq');
        }

        // Highlight destination dots
        const matchedMove = activeLegalMoves.find(m => m.to.r === r && m.to.c === c);
        if (matchedMove) {
          if (matchedMove.type === 'move') {
            cell.classList.add('legal-move');
          } else if (matchedMove.type === 'attack') {
            cell.classList.add('attack-move');
          } else if (matchedMove.type === 'capture') {
            cell.classList.add('capture-move');
          }
        }

        if (selectedCapturedPiece) {
          const isTarget = selectedCapturedPiece.validSquares.find(sq => sq.r === r && sq.c === c);
          if (isTarget) {
            cell.classList.add('promotion-target');
          }
        }

        // Render pieces
        const piece = gameState.board[r][c];
        if (piece) {
          const pieceDiv = document.createElement('div');
          pieceDiv.className = `chess-piece ${engine.getPieceTeam(piece) === engine.TEAMS.A ? 'piece-team-a' : 'piece-team-b'}`;
          if (historyIndex === history.length - 1 && !gameEnded && engine.isPieceControllable(r, c, gameState.turn, gameState.board)) {
            pieceDiv.classList.add('controllable-piece');
          }
          const imgUrl = PIECE_IMAGES[piece];
          if (imgUrl) {
            const img = document.createElement('img');
            img.src = imgUrl;
            img.alt = piece;
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.pointerEvents = 'none';
            pieceDiv.appendChild(img);
          } else {
            pieceDiv.textContent = PIECE_SYMBOLS[piece] || piece;
          }
          cell.appendChild(pieceDiv);
        }

        // Click event listener
        cell.addEventListener('click', () => handleCellClick(r, c));

        elBoard.appendChild(cell);
      }
    }

    // Render Flank Crosses if hill not visited yet
    if (gameState && gameState.hillWasVisited === 0) {
      const crossPositions = [
        { c: 2, r: 2 }, // Top-Left
        { c: 6, r: 2 }, // Top-Right
        { c: 2, r: 6 }, // Bottom-Left
        { c: 6, r: 6 }  // Bottom-Right
      ];
      crossPositions.forEach(pos => {
        const cross = document.createElement('div');
        cross.className = 'flank-cross';
        cross.style.left = `${(pos.c / 8) * 100}%`;
        cross.style.top = `${(pos.r / 8) * 100}%`;
        elBoard.appendChild(cross);
      });
    }

    // Render Territory Highlight Box for Active Player
    const territoryDiv = document.createElement('div');
    territoryDiv.className = `territory-highlight territory-${gameState.turn}`;
    if (isTeamA) territoryDiv.classList.add('territory-team-a');
    else territoryDiv.classList.add('territory-team-b');
    elBoard.appendChild(territoryDiv);

    // Render Board Center Dot
    const centerDot = document.createElement('div');
    centerDot.className = 'board-center-dot';
    elBoard.appendChild(centerDot);

    // Render Last Move Arrow
    if (gameState.lastMove && gameState.lastMove.from && gameState.lastMove.to) {
      const from = gameState.lastMove.from;
      const to = gameState.lastMove.to;
      
      const fromX = from.c * 100 + 50;
      const fromY = from.r * 100 + 50;
      const toX = to.c * 100 + 50;
      const toY = to.r * 100 + 50;

      const dx = toX - fromX;
      const dy = toY - fromY;
      const dist = Math.hypot(dx, dy);

      let x2 = toX;
      let y2 = toY;
      if (dist > 0) {
        // Shorten by 35 units to clear the pieces/centers nicely
        x2 = toX - (35 * dx) / dist;
        y2 = toY - (35 * dy) / dist;
      }

      const svgNS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(svgNS, "svg");
      svg.setAttribute("class", "last-move-arrow-svg");
      svg.setAttribute("viewBox", "0 0 800 800");

      const defs = document.createElementNS(svgNS, "defs");
      const marker = document.createElementNS(svgNS, "marker");
      marker.setAttribute("id", "last-move-arrowhead");
      marker.setAttribute("markerWidth", "8");
      marker.setAttribute("markerHeight", "8");
      marker.setAttribute("refX", "5");
      marker.setAttribute("refY", "4");
      marker.setAttribute("orient", "auto");
      marker.setAttribute("markerUnits", "strokeWidth");

      const path = document.createElementNS(svgNS, "path");
      path.setAttribute("d", "M0,2 L0,6 L6,4 z");
      path.setAttribute("class", "last-move-arrowhead-path");
      
      marker.appendChild(path);
      defs.appendChild(marker);
      svg.appendChild(defs);

      const line = document.createElementNS(svgNS, "line");
      line.setAttribute("x1", fromX);
      line.setAttribute("y1", fromY);
      line.setAttribute("x2", x2);
      line.setAttribute("y2", y2);
      line.setAttribute("class", "last-move-arrow");
      
      svg.appendChild(line);
      elBoard.appendChild(svg);
    }

    // Render LCR Cards for all players
    const positions = ['n', 'e', 's', 'w'];
    const isHumanTurn = canInteract && historyIndex === history.length - 1 && !gameEnded;
    
    for (let pIdx = 0; pIdx < 4; pIdx++) {
      const char = positions[pIdx];
      const p = gameState.players[pIdx];
      const pTeam = p.team;
      for (let cIdx = 0; cIdx < 3; cIdx++) {
        const cardVal = p.positionalCards[cIdx];
        const cardEl = document.getElementById(`card-${char}-${cIdx}`);
        if (cardEl) {
          cardEl.innerHTML = getCardHTML(cardVal);
          cardEl.classList.remove('highlight-team-a', 'highlight-team-b', 'clickable-pos-card', 'selected-base-card');
          cardEl.onclick = null;
          cardEl.style.cursor = '';
          
          if (combatShowdown) {
            // Team A (North 0, South 2) uses column region
            if (pTeam === engine.TEAMS.A && (pIdx === 0 || pIdx === 2) && cIdx === combatShowdown.colRegion) {
              cardEl.classList.add('highlight-team-a');
            }
            // Team B (West 3, East 1) uses row region
            if (pTeam === engine.TEAMS.B && (pIdx === 1 || pIdx === 3) && cIdx === combatShowdown.rowRegion) {
              cardEl.classList.add('highlight-team-b');
            }
          }

          // Card swapping: if active player is a human, they haven't swapped yet this turn
          if (pIdx === gameState.turn && isHumanTurn && !gameState.hasSwappedThisTurn) {
            const lcrLabels = ["Left", "Center", "Right"];
            
            if (selectedBaseCardIdx !== null) {
              // Click to swap base card and positional card
              cardEl.classList.add('clickable-pos-card');
              cardEl.style.cursor = 'pointer';
              cardEl.onclick = () => {
                if (isOnline()) {
                  window.Multiplayer.sendSwap(selectedBaseCardIdx, cIdx, 'base-to-pos');
                  resetCardSelection();
                  return;
                }
                const activePlayerId = gameState.turn;
                const posCardIdx = cIdx;
                const baseCardVal = activePlayer.baseDeck[selectedBaseCardIdx];
                const posCardVal = activePlayer.positionalCards[posCardIdx];
                const swapped = engine.swapCards(activePlayerId, selectedBaseCardIdx, posCardIdx, gameState);
                if (swapped) {
                  logSystemEvent(`[Cards] ${activePlayer.name} swapped base card ${baseCardVal} with positional card ${posCardVal} (${lcrLabels[posCardIdx]})`);
                  resetCardSelection();
                  renderState();
                }
              };
            } else if (selectedPosCardIdx !== null) {
              if (cIdx === selectedPosCardIdx) {
                // Click to deselect
                cardEl.classList.add('selected-base-card');
                cardEl.style.cursor = 'pointer';
                cardEl.onclick = () => {
                  selectedPosCardIdx = null;
                  renderState();
                };
              } else {
                // Click to swap positional cards
                cardEl.classList.add('clickable-pos-card');
                cardEl.style.cursor = 'pointer';
                cardEl.onclick = () => {
                  if (isOnline()) {
                    window.Multiplayer.sendSwap(selectedPosCardIdx, cIdx, 'pos-to-pos');
                    resetCardSelection();
                    return;
                  }
                  const activePlayerId = gameState.turn;
                  const cardVal1 = activePlayer.positionalCards[selectedPosCardIdx];
                  const cardVal2 = activePlayer.positionalCards[cIdx];
                  const swapped = engine.swapPositionalCards(activePlayerId, selectedPosCardIdx, cIdx, gameState);
                  if (swapped) {
                    logSystemEvent(`[Cards] ${activePlayer.name} swapped positional cards: ${lcrLabels[selectedPosCardIdx]} (${cardVal1}) with ${lcrLabels[cIdx]} (${cardVal2})`);
                    resetCardSelection();
                    renderState();
                  }
                };
              }
            } else {
              // Click to select positional card
              cardEl.classList.add('clickable-pos-card');
              cardEl.style.cursor = 'pointer';
              cardEl.onclick = () => {
                selectedPosCardIdx = cIdx;
                renderState();
              };
            }
          }
        }
      }
    }

    // Render Community Cards
    elPublicFlop.innerHTML = '';
    gameState.publicCards.forEach(c => {
      elPublicFlop.innerHTML += getCardHTML(c);
    });
    if (combatShowdown) {
      Array.from(elPublicFlop.children).forEach(child => {
        child.classList.add('highlight-public');
      });
    }

    elPublicTurnRiver.innerHTML = '';
    if (combatShowdown) {
      combatShowdown.combatCards.forEach(c => {
        elPublicTurnRiver.innerHTML += getCardHTML(c);
      });
      Array.from(elPublicTurnRiver.children).forEach(child => {
        child.classList.add('highlight-public');
      });
    } else {
      elPublicTurnRiver.innerHTML += getCardHTML(null, true);
      elPublicTurnRiver.innerHTML += getCardHTML(null, true);
    }

    // Render active player's base deck
    const elBaseDeck = document.getElementById('base-deck');
    if (elBaseDeck) {
      // In online mode, only show base deck on your turn
      if (isOnline()) {
        if (isMyTurn() && !gameEnded) {
          elBaseDeck.classList.remove('hidden');
        } else {
          elBaseDeck.classList.add('hidden');
        }
      } else {
        if (isHumanTurn) {
          elBaseDeck.classList.remove('hidden');
        } else {
          elBaseDeck.classList.add('hidden');
        }
      }
    }

    if (elBaseDeckOwner) elBaseDeckOwner.textContent = displayName;
    if (elBaseDeckCount) elBaseDeckCount.textContent = `${activePlayer.baseDeck.length} / 5`;
    elBaseDeckCards.innerHTML = '';
    
    if (isHumanTurn && !gameState.hasSwappedThisTurn) {
      activePlayer.baseDeck.forEach((card, idx) => {
        const cardSlot = document.createElement('div');
        cardSlot.style.display = 'inline-block';
        cardSlot.innerHTML = getCardHTML(card, false, selectedBaseCardIdx === idx);
        
        // If a positional card is selected, base cards are clickable targets for the swap
        if (selectedPosCardIdx !== null) {
          const cardEl = cardSlot.querySelector('.playing-card');
          if (cardEl) {
            cardEl.classList.add('clickable-pos-card');
          }
        }

        cardSlot.onclick = () => {
          if (selectedPosCardIdx !== null) {
            if (isOnline()) {
              window.Multiplayer.sendSwap(idx, selectedPosCardIdx, 'base-to-pos');
              resetCardSelection();
              return;
            }
            const activePlayerId = gameState.turn;
            const swapped = engine.swapCards(activePlayerId, idx, selectedPosCardIdx, gameState);
            if (swapped) {
              logSystemEvent(`[Cards] ${activePlayer.name} swapped base card ${gameState.players[activePlayerId].baseDeck[idx]} with positional card ${gameState.players[activePlayerId].positionalCards[selectedPosCardIdx]}`);
              resetCardSelection();
              renderState();
            }
          } else {
            if (selectedBaseCardIdx === idx) {
              selectedBaseCardIdx = null;
            } else {
              selectedBaseCardIdx = idx;
              selectedPosCardIdx = null; // Mutual exclusion
            }
            renderState();
          }
        };
        elBaseDeckCards.appendChild(cardSlot);
      });
    } else {
      activePlayer.baseDeck.forEach(card => {
        elBaseDeckCards.innerHTML += getCardHTML(card);
      });
    }

    // Render promotional pieces next to base deck
    if (elBaseDeckPromotional) {
      elBaseDeckPromotional.innerHTML = '';
      
      const activeTeam = isTeamA ? engine.TEAMS.A : engine.TEAMS.B;
      const pool = gameState.capturedPieces[activeTeam];
      
      // Collect unique types that have captured count > 0 or not null (for king)
      const uniquePromotables = [];
      if (pool) {
        // King
        if (pool.king !== null) {
          let label = 'King';
          if (pool.king === engine.PLAYERS.NORTH) label = 'North King';
          if (pool.king === engine.PLAYERS.EAST) label = 'East King';
          if (pool.king === engine.PLAYERS.SOUTH) label = 'South King';
          if (pool.king === engine.PLAYERS.WEST) label = 'West King';
          uniquePromotables.push({ type: 'k', subtype: pool.king, char: activeTeam === engine.TEAMS.A ? 'K' : 'k', label: label });
        }
        // Rooks
        if (pool.rooks > 0) {
          uniquePromotables.push({ type: 'r', subtype: null, char: activeTeam === engine.TEAMS.A ? 'R' : 'r', label: 'Rook' });
        }
        // Dark Bishop
        if (pool.darkBishop > 0) {
          uniquePromotables.push({ type: 'b', subtype: 'dark', char: activeTeam === engine.TEAMS.A ? 'B' : 'b', label: 'Dark Bishop' });
        }
        // Light Bishop
        if (pool.lightBishop > 0) {
          uniquePromotables.push({ type: 'b', subtype: 'light', char: activeTeam === engine.TEAMS.A ? 'B' : 'b', label: 'Light Bishop' });
        }
        // Knights
        if (pool.knights > 0) {
          uniquePromotables.push({ type: 'n', subtype: null, char: activeTeam === engine.TEAMS.A ? 'N' : 'n', label: 'Knight' });
        }
      }

      const promotableItems = [];
      if (isHumanTurn && !gameEnded) {
        uniquePromotables.forEach(item => {
          const validSquares = engine.find_pawns_to_promot(gameState.turn, item.type, item.subtype, gameState);
          if (validSquares.length > 0) {
            promotableItems.push({ ...item, validSquares });
          }
        });
      }

      if (promotableItems.length > 0) {
        elBaseDeckPromotional.classList.remove('hidden');
        
        promotableItems.forEach(item => {
          const pieceSpan = document.createElement('span');
          const teamClass = activeTeam === engine.TEAMS.A ? 'piece-team-a' : 'piece-team-b';
          pieceSpan.className = `promotable-piece ${teamClass}`;
          pieceSpan.dataset.type = item.type;
          
          const imgUrl = PIECE_IMAGES[item.char];
          if (imgUrl) {
            const img = document.createElement('img');
            img.src = imgUrl;
            img.alt = item.label;
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.pointerEvents = 'none';
            pieceSpan.appendChild(img);
          } else {
            pieceSpan.textContent = PIECE_SYMBOLS[item.char] || item.char;
          }
          pieceSpan.title = `${item.label} (Promotable)`;

          if (selectedCapturedPiece && 
              selectedCapturedPiece.type === item.type && 
              selectedCapturedPiece.subtype === item.subtype) {
            pieceSpan.classList.add('selected-captured');
          }

          pieceSpan.addEventListener('click', () => {
            if (selectedCapturedPiece && 
                selectedCapturedPiece.type === item.type && 
                selectedCapturedPiece.subtype === item.subtype) {
              selectedCapturedPiece = null;
            } else {
              selectedCapturedPiece = { type: item.type, subtype: item.subtype, validSquares: item.validSquares };
              selectedPiece = null;
              activeLegalMoves = [];
            }
            renderState();
            if (selectedCapturedPiece) {
              logSystemEvent(`Selected rescued piece ${item.label} for promotion. Choose a valid pawn target.`);
            } else {
              logSystemEvent(`Deselected piece ${item.label}.`);
            }
          });

          elBaseDeckPromotional.appendChild(pieceSpan);
        });
      } else {
        elBaseDeckPromotional.classList.add('hidden');
      }
    }

    // Render captured pieces
    const activeTeam = isTeamA ? engine.TEAMS.A : engine.TEAMS.B;
    let hasPromotionAvailable = false;

    function getPoolItems(pool, team) {
      const items = [];
      // King (if captured)
      if (pool.king !== null) {
        let label = 'King';
        if (pool.king === engine.PLAYERS.NORTH) label = 'North King';
        if (pool.king === engine.PLAYERS.EAST) label = 'East King';
        if (pool.king === engine.PLAYERS.SOUTH) label = 'South King';
        if (pool.king === engine.PLAYERS.WEST) label = 'West King';
        items.push({ type: 'k', subtype: pool.king, char: team === engine.TEAMS.A ? 'K' : 'k', label: label });
      }
      // Rooks
      if (pool.rooks > 0) {
        for (let i = 0; i < pool.rooks; i++) {
          items.push({ type: 'r', subtype: null, char: team === engine.TEAMS.A ? 'R' : 'r', label: 'Rook' });
        }
      }
      // Dark Bishop
      if (pool.darkBishop > 0) {
        for (let i = 0; i < pool.darkBishop; i++) {
          items.push({ type: 'b', subtype: 'dark', char: team === engine.TEAMS.A ? 'B' : 'b', label: 'Dark Bishop' });
        }
      }
      // Light Bishop
      if (pool.lightBishop > 0) {
        for (let i = 0; i < pool.lightBishop; i++) {
          items.push({ type: 'b', subtype: 'light', char: team === engine.TEAMS.A ? 'B' : 'b', label: 'Light Bishop' });
        }
      }
      // Knights
      if (pool.knights > 0) {
        for (let i = 0; i < pool.knights; i++) {
          items.push({ type: 'n', subtype: null, char: team === engine.TEAMS.A ? 'N' : 'n', label: 'Knight' });
        }
      }
      // Pawns (non-promotable)
      if (pool.pawns > 0) {
        for (let i = 0; i < pool.pawns; i++) {
          items.push({ type: 'p', subtype: null, char: team === engine.TEAMS.A ? 'P' : 'p', label: 'Pawn' });
        }
      }
      return items;
    }

    function renderPool(poolElement, pool, team, isActivePlayerPool) {
      const items = getPoolItems(pool, team);
      if (items.length === 0) {
        poolElement.innerHTML = `<span class="no-captures-placeholder">None</span>`;
        return;
      }
      poolElement.innerHTML = '';
      items.forEach((item) => {
        const pieceSpan = document.createElement('span');
        const teamClass = team === engine.TEAMS.A ? 'piece-team-a' : 'piece-team-b';
        pieceSpan.className = `captured-piece ${teamClass}`;
        pieceSpan.dataset.type = item.type;
        const imgUrl = PIECE_IMAGES[item.char];
        if (imgUrl) {
          const img = document.createElement('img');
          img.src = imgUrl;
          img.alt = item.label;
          img.style.width = '100%';
          img.style.height = '100%';
          img.style.pointerEvents = 'none';
          pieceSpan.appendChild(img);
        } else {
          pieceSpan.textContent = PIECE_SYMBOLS[item.char] || item.char;
        }
        pieceSpan.title = item.label;

        if (isActivePlayerPool && item.type !== 'p' && historyIndex === history.length - 1 && !gameEnded) {
          const validSquares = engine.find_pawns_to_promot(gameState.turn, item.type, item.subtype, gameState);
          if (validSquares.length > 0) {
            hasPromotionAvailable = true;
            pieceSpan.classList.add('promotable-piece');
            if (selectedCapturedPiece && 
                selectedCapturedPiece.type === item.type && 
                selectedCapturedPiece.subtype === item.subtype) {
              pieceSpan.classList.add('selected-captured');
            }
            pieceSpan.addEventListener('click', () => {
              selectedCapturedPiece = { type: item.type, subtype: item.subtype, validSquares };
              selectedPiece = null;
              activeLegalMoves = [];
              renderState();
              logSystemEvent(`Selected rescued piece ${item.label} for promotion. Choose a valid pawn target.`);
            });
          }
        }
        poolElement.appendChild(pieceSpan);
      });
    }

    const poolA = gameState.capturedPieces[engine.TEAMS.A];
    renderPool(elCapturedPoolA, poolA, engine.TEAMS.A, activeTeam === engine.TEAMS.A && canInteract);

    const poolB = gameState.capturedPieces[engine.TEAMS.B];
    renderPool(elCapturedPoolB, poolB, engine.TEAMS.B, activeTeam === engine.TEAMS.B && canInteract);

    const elPromotionInstruction = document.getElementById('promotion-instruction');
    if (elPromotionInstruction) {
      if (hasPromotionAvailable) elPromotionInstruction.classList.remove('hidden');
      else elPromotionInstruction.classList.add('hidden');
    }

    // Update Player Status Bars (King, Hill, Base) with nicknames
    for (let i = 0; i < 4; i++) {
      const kingAlive = engine.isPlayerKingAlive(i, gameState);
      const isOnHill = engine.isPlayerOnHill(i, gameState);
      const baseSize = isOnline() ? (gameState.players[i].baseDeckCount || gameState.players[i].baseDeck.length) : engine.getPlayerBaseSize(i, gameState);

      const elRow = document.getElementById(`status-row-${i}`);
      const elKing = document.getElementById(`status-king-${i}`);
      const elHill = document.getElementById(`status-hill-${i}`);
      const elBase = document.getElementById(`status-base-${i}`);
      const elName = document.getElementById(`status-name-${i}`);

      if (elName) {
        const pName = getPlayerDisplayName(i);
        elName.textContent = `${SEAT_SHORT[i]}: ${pName}`;
      }

      if (elRow) {
        if (gameState.turn === i) {
          elRow.classList.add('active-turn');
        } else {
          elRow.classList.remove('active-turn');
        }
      }

      if (elKing) {
        if (kingAlive) {
          elKing.className = 'status-dot dot-on';
        } else {
          elKing.className = 'status-dot dot-off';
        }
      }
      if (elHill) {
        if (isOnHill) {
          elHill.className = 'status-dot dot-on';
        } else {
          elHill.className = 'status-dot dot-off';
        }
      }
      if (elBase) {
        elBase.textContent = baseSize;
      }
    }

    // Update Flank Rule instruction text dynamically
    const elFlankRule = document.getElementById('rule-pawn-flanks');
    if (elFlankRule) {
      if (gameState && gameState.hillWasVisited === 1) {
        elFlankRule.innerHTML = `<strong>Pawn Flanks:</strong> <span style="text-decoration: line-through; opacity: 0.6;">Pawns on red flank squares cannot attack each other.</span> <span style="color: var(--color-green); font-weight: bold; text-shadow: 0 0 5px rgba(0,255,0,0.3);">[DROPPED]</span>`;
      } else {
        elFlankRule.innerHTML = `<strong>Pawn Flanks:</strong> Pawns on red flank squares cannot attack each other <span style="color: var(--text-muted); font-size: 0.8em;">(drops when center hill entered)</span>`;
      }
    }
  }

  function triggerTurnStartAnimations() {
    const pieces = document.querySelectorAll('.controllable-piece');
    pieces.forEach(p => {
      // Force a DOM reflow to ensure the CSS animation triggers instantly
      void p.offsetWidth;
      p.classList.add('flash-piece');
    });
  }

  function updateRotateButtonLabel() {
    let bottomPlayer = 'South';
    if (boardRotation === 90) bottomPlayer = 'East';
    else if (boardRotation === 180) bottomPlayer = 'North';
    else if (boardRotation === 270) bottomPlayer = 'West';
    if (elBtnRotateBoard) {
      elBtnRotateBoard.textContent = `Rotate 90° (Bottom: ${bottomPlayer})`;
    }
  }

  // Rotate board by 90-degree steps
  function rotateBoard() {
    boardRotation = (boardRotation + 90) % 360;
    const gameWrapper = document.querySelector('.game-rotation-wrapper');
    gameWrapper.className = 'game-rotation-wrapper';
    if (boardRotation > 0) {
      gameWrapper.classList.add(`rotate-${boardRotation}`);
    }
    updateRotateButtonLabel();
    logSystemEvent(`Board and cards rotated 90° (current: ${boardRotation}°).`);
  }

  // Event Listeners
  elBtnNewGame.addEventListener('click', initNewGame);
  elBtnRotateBoard.addEventListener('click', rotateBoard);
  elBtnRestart.addEventListener('click', () => {
    elGameOverOverlay.classList.add('hidden');
    if (isOnline()) {
      window.Multiplayer.requestRematch();
    } else {
      initNewGame();
    }
  });

  // Back to lobby button
  const elBtnBackToLobby = document.getElementById('btn-back-to-lobby');
  if (elBtnBackToLobby) {
    elBtnBackToLobby.addEventListener('click', () => {
      elGameOverOverlay.classList.add('hidden');
      if (isOnline()) {
        window.Multiplayer.returnToLobby();
      } else if (window.Multiplayer) {
        window.Multiplayer.returnToLobby();
      }
    });
  }

  const elBtnBackToLobbyMain = document.getElementById('btn-back-to-lobby-main');
  if (elBtnBackToLobbyMain) {
    elBtnBackToLobbyMain.addEventListener('click', () => {
      if (window.Multiplayer) {
        window.Multiplayer.returnToLobby();
      }
    });
  }

  const elBtnReplayPrev = document.getElementById('btn-replay-prev');
  const elBtnReplayNext = document.getElementById('btn-replay-next');
  const elBtnCloseOverlay = document.getElementById('btn-close-overlay');

  if (elBtnReplayPrev) {
    elBtnReplayPrev.addEventListener('click', () => {
      if (historyIndex > 0) {
        historyIndex--;
        restoreHistoryState();
      }
    });
  }

  if (elBtnReplayNext) {
    elBtnReplayNext.addEventListener('click', () => {
      if (historyIndex < history.length - 1) {
        historyIndex++;
        restoreHistoryState();
      }
    });
  }

  if (elBtnCloseOverlay) {
    elBtnCloseOverlay.addEventListener('click', () => {
      elGameOverOverlay.classList.add('hidden');
    });
  }
  
  // Game Speed Slider listener to update UI labels (offline only)
  const elSpeedSliderElement = document.getElementById('speed-slider');
  const elSpeedValueElement = document.getElementById('speed-value');
  if (elSpeedSliderElement && elSpeedValueElement) {
    const speedLabels = {
      '1': 'Very Slow',
      '2': 'Slow',
      '3': 'Normal',
      '4': 'Fast',
      '5': 'Very Fast'
    };
    elSpeedSliderElement.addEventListener('input', () => {
      const val = elSpeedSliderElement.value;
      elSpeedValueElement.textContent = speedLabels[val] || 'Normal';
    });
  }

  // Bot Selectors (offline only)
  const botNames = ['North', 'East', 'South', 'West'];
  for (let i = 0; i < 4; i++) {
    const btn = document.getElementById(`bot-toggle-${i}`);
    if (btn) {
      const isBot = btn.classList.contains('active');
      botPlayers[i] = isBot ? 'v8_networth' : 'manual';
      btn.textContent = `${botNames[i]}: ${isBot ? 'Bot' : 'Human'}`;

      btn.addEventListener('click', () => {
        if (isOnline()) return; // Disabled in online mode

        const currentlyBot = (botPlayers[i] !== 'manual');
        if (currentlyBot) {
          botPlayers[i] = 'manual';
          btn.classList.remove('active');
          btn.textContent = `${botNames[i]}: Human`;
          logSystemEvent(`[System] Seat ${i} (${botNames[i]}) changed to Human`);
        } else {
          botPlayers[i] = 'v8_networth';
          btn.classList.add('active');
          btn.textContent = `${botNames[i]}: Bot`;
          logSystemEvent(`[System] Seat ${i} (${botNames[i]}) changed to Bot`);
          
          if (gameState && gameState.turn === i) {
            checkBotTurn();
          }
        }
      });
    }
  }

  // --- ONLINE MODE: Listen for server state updates ---
  if (window.Multiplayer) {
    window.Multiplayer.onGameState((stateView) => {
      // Build a gameState compatible with the existing renderState() function
      onlineSeatIndex = stateView.seatIndex;

      gameState = {
        board: stateView.board,
        players: stateView.players.map(p => ({
          id: p.id,
          name: p.name,
          team: p.team,
          positionalCards: p.positionalCards,
          baseDeck: p.baseDeck.filter(c => c !== null), // Filter out hidden nulls
          baseDeckCount: p.baseDeckCount
        })),
        publicCards: stateView.publicCards,
        turn: stateView.turn,
        hasSwappedThisTurn: stateView.hasSwappedThisTurn,
        capturedPieces: stateView.capturedPieces,
        matchScores: stateView.matchScores,
        lastMove: stateView.lastMove,
        deck: [], // Deck is server-side only
        hillWasVisited: stateView.hillWasVisited !== undefined ? stateView.hillWasVisited : 0
      };

      // Set combat showdown from server
      combatShowdown = stateView.combatShowdown || null;

      // Clear selections on state update
      selectedPiece = null;
      selectedCapturedPiece = null;
      resetCardSelection();
      activeLegalMoves = [];
      gameEnded = false;

      const wasViewingPast = (historyIndex >= 0 && historyIndex < history.length - 1);

      // Save to history for replay
      saveHistoryState();

      if (wasViewingPast) {
        // Keep viewing the past state visually
        restoreHistoryState();
      } else {
        // Render the new live state
        renderState();
        triggerTurnStartAnimations();
      }
    });

    window.Multiplayer.onGameOver((winner) => {
      gameEnded = true;
      const winnerText = winner === 'A' ? 'Team A (N-S) Wins!' : 'Team B (E-W) Wins!';
      elWinnerAnnouncement.textContent = winnerText;
      elGameOverOverlay.classList.remove('hidden');
      logSystemEvent(`Match Over: ${winnerText}`);

      // Show/hide rematch button based on host status
      if (elBtnRestart) {
        elBtnRestart.textContent = window.Multiplayer.isHost ? 'Rematch' : 'Rematch (Host only)';
        elBtnRestart.disabled = !window.Multiplayer.isHost;
      }
      if (elBtnBackToLobby) {
        elBtnBackToLobby.classList.remove('hidden');
      }
    });
  }

  // Initialize (offline mode starts a game, online mode waits for server)
  updateRotateButtonLabel();
  // Don't auto-start a game; the lobby screen will show first.
  // initNewGame() will be called when needed in offline mode.
  // For now, just ensure game container is hidden (lobby is shown by multiplayer.js).
}
