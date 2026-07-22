// Poachers - Interactive Game UI Handler
// Global diagnostic error listener to catch and print console errors directly in the Game Log panel
window.addEventListener('error', (event) => {
  const logBox = document.getElementById('log-entries');
  if (logBox) {
    const entry = document.createElement('div');
    entry.className = 'log-entry system-msg';
    entry.style.color = 'var(--log-error-color)';
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
  const elBaseDeckHeader = document.getElementById('base-deck-header');

  // Community cards
  const elPublicFlop = document.getElementById('public-flop');
  const elPublicTurnRiver = document.getElementById('public-turn-river');

  // Combat announcement
  const elCombatAnnouncement = document.getElementById('combat-announcement');
  const elCombatAnnouncementText = document.getElementById('combat-announcement-text');

  // Buttons & Overlays
  const elBtnNewGame = document.getElementById('btn-new-game');
  const elBtnRotateBoard = document.getElementById('btn-rotate-board');
  const elGameOverOverlay = document.getElementById('game-over-overlay');
  const elWinnerAnnouncement = document.getElementById('winner-announcement');
  const elBtnRestart = document.getElementById('btn-restart-overlay');

  const elGameOverBanner = document.getElementById('game-over-banner');
  const elGameOverBannerTitle = document.getElementById('game-over-banner-title');
  const elBtnRestartBanner = document.getElementById('btn-restart-banner');
  const elBtnReviewGameBanner = document.getElementById('btn-review-game-banner');
  const elBtnBackToLobbyBanner = document.getElementById('btn-back-to-lobby-banner');
  const elBoardFrame = document.querySelector('.board-frame');


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
  let currentMatchScores = { 'A': 0, 'B': 0 };
  let lastStartingPlayer = 0; // North starts first (0 = N, 1 = E, 2 = S, 3 = W)

  let botPlayers = ['manual', 'manual', 'manual', 'manual'];
  let defaultBotWeights = [2.18, 3.59, 6.16, 2.5, 13.02, 7.21, 0.61, 1.21, 4.36, 0.35, 4.35, 0.47, 0.12];

  // Replay state
  let history = [];
  let historyIndex = -1;
  let gameEnded = false;
  let turnIndex = 0;
  let lastAnimatedMove = null;

  // Online mode state
  let onlineState = null;       // The server-provided state view
  let onlineSeatIndex = null;   // Which seat this client is (0-3)
  let turnTimerInterval = null;

  function isOnline() {
    return window.Multiplayer && window.Multiplayer.isOnline;
  }

  function isMyTurn() {
    if (!isOnline()) return true; // Offline: always your turn (hotseat)
    return gameState && window.Multiplayer && window.Multiplayer.isMySeat && window.Multiplayer.isMySeat(gameState.turn);
  }

  fetch('bots/v8_networth/weights.json')
    .then(r => r.json())
    .then(data => defaultBotWeights = data)
    .catch(e => console.error("Could not load bot weights", e));

  function getBotDelay() {
    const elSpeedSlider = document.getElementById('speed-slider');
    const val = elSpeedSlider ? elSpeedSlider.value : '3';
    const baseDelay = (typeof BOT_DELAY !== 'undefined') ? BOT_DELAY : 1000;
    switch (val) {
      case '1': return baseDelay * 4; // Very Slow
      case '2': return baseDelay * 2; // Slow
      case '3': return baseDelay;     // Normal
      case '4': return Math.round(baseDelay / 2);  // Fast
      case '5': return Math.round(baseDelay / 4);  // Very Fast
      default: return baseDelay;
    }
  }

  function applyBotSwap(decision) {
    if (!decision || !decision.swap || !gameState) return false;
    const activePlayerId = gameState.turn;
    const activePlayer = gameState.players[activePlayerId];
    if (!activePlayer) return false;

    let success = false;
    if (decision.swap.swapType === 'base-to-pos') {
      success = engine.swapCards(activePlayerId, decision.swap.baseCardIdx, decision.swap.posCardIdx, gameState);
    } else if (decision.swap.swapType === 'pos-to-pos') {
      success = engine.swapPositionalCards(activePlayerId, decision.swap.posCardIdx1, decision.swap.posCardIdx2, gameState);
    }

    if (success) {
      const swapDescription = decision.swap.swapType === 'base-to-pos'
        ? `base card ${decision.swap.baseCardIdx + 1} with positional card ${decision.swap.posCardIdx + 1}`
        : `positional card ${decision.swap.posCardIdx1 + 1} with positional card ${decision.swap.posCardIdx2 + 1}`;
      logSystemEvent(`[Bot] ${activePlayer.name} used a turn-start swap: ${swapDescription}`);
    }
    return success;
  }

  function getBotDecision(botMode) {
    if (!gameState) return null;
    const weights = defaultBotWeights;
    if (botMode === 'random') {
      if (!window.PoachersRandomBot) return { move: null };
      return { move: window.PoachersRandomBot.getBestMove(gameState, weights) };
    }
    if (botMode === 'v1_basic') {
      if (!window.PoachersBot) return { move: null };
      return window.PoachersBot.getBestAction ? window.PoachersBot.getBestAction(gameState, weights) : { move: window.PoachersBot.getBestMove(gameState, weights) };
    }
    if (botMode === 'v2_no_minimax') {
      if (!window.PoachersBot_no_minimax) return { move: null };
      return window.PoachersBot_no_minimax.getBestAction ? window.PoachersBot_no_minimax.getBestAction(gameState, weights) : { move: window.PoachersBot_no_minimax.getBestMove(gameState, weights) };
    }
    if (botMode === 'v3_fast') {
      if (!window.PoachersBot_v3) return { move: null };
      return window.PoachersBot_v3.getBestAction ? window.PoachersBot_v3.getBestAction(gameState, weights) : { move: window.PoachersBot_v3.getBestMove(gameState, weights) };
    }
    if (botMode === 'v4_networth') {
      if (!window.PoachersBot_v4) return { move: null };
      return window.PoachersBot_v4.getBestAction ? window.PoachersBot_v4.getBestAction(gameState, weights) : { move: window.PoachersBot_v4.getBestMove(gameState, weights) };
    }
    if (botMode === 'v5_networth') {
      if (!window.PoachersBot_v5) return { move: null };
      return window.PoachersBot_v5.getBestAction ? window.PoachersBot_v5.getBestAction(gameState, weights) : { move: window.PoachersBot_v5.getBestMove(gameState, weights) };
    }
    if (botMode === 'v6_networth') {
      if (!window.PoachersBot_v6) return { move: null };
      return window.PoachersBot_v6.getBestAction ? window.PoachersBot_v6.getBestAction(gameState, weights) : { move: window.PoachersBot_v6.getBestMove(gameState, weights) };
    }
    if (botMode === 'v7_networth') {
      if (!window.PoachersBot_v7) return { move: null };
      return window.PoachersBot_v7.getBestAction ? window.PoachersBot_v7.getBestAction(gameState, weights) : { move: window.PoachersBot_v7.getBestMove(gameState, weights) };
    }
    if (botMode === 'v8_networth') {
      if (!window.PoachersBot_v8) return { move: null };
      return window.PoachersBot_v8.getBestAction ? window.PoachersBot_v8.getBestAction(gameState, weights) : { move: window.PoachersBot_v8.getBestMove(gameState, weights) };
    }
    return { move: null };
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
          const decision = getBotDecision(botMode);
          const move = decision && decision.move ? decision.move : null;
          if (decision && decision.swap) {
            applyBotSwap(decision);
          }

          logSystemEvent(`[System] Bot returned move: ${move ? move.type : 'none'}`);

          if (move) {
            executeMove(move);
          } else {
            logSystemEvent(`[Bot] ${gameState.players[activeId].name} has no legal moves. Passing turn.`);
            gameState.turn = engine.getNextActiveTurn(gameState.turn, gameState);
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
  function getCardHTML(cardString, isLocked = false, isSelected = false, isWinning = false) {
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
    const winningClass = isWinning ? 'winning-card-highlight' : '';

    return `
      <div class="playing-card ${colorClass} ${selectedClass} ${winningClass}">
        <div class="card-val-top">${displayVal}</div>
        <div class="card-suit-bottom">${suitSymbol}</div>
      </div>
    `;
  }

  // Helper to append a clean game log entry
  function appendGameLog(message, historyIndexVal = null) {
    const entry = document.createElement('div');
    entry.className = 'log-entry system-msg';
    entry.textContent = message;
    if (historyIndexVal !== null && historyIndexVal !== undefined) {
      entry.dataset.historyIndex = historyIndexVal;
      entry.style.cursor = 'pointer';
      entry.addEventListener('click', () => {
        const idx = parseInt(entry.dataset.historyIndex, 10);
        if (!isNaN(idx) && idx >= 0 && idx < history.length) {
          historyIndex = idx;
          restoreHistoryState();
        }
      });
    }
    elLogEntries.appendChild(entry);
    elLogEntries.scrollTop = elLogEntries.scrollHeight;
  }

  // Helper to format a hand object to a suit-free sorted ranks string with type
  function formatPokerHandLog(hand) {
    if (!hand || !hand.cards) return "";

    const ranks = hand.cards.map(c => c[0]); // Drop suit, e.g. "AH" -> "A", "TD" -> "T"
    const RANK_ORDER = "AKQJT98765432";

    function sortRanksDescending(arr) {
      return arr.slice().sort((a, b) => RANK_ORDER.indexOf(a) - RANK_ORDER.indexOf(b));
    }

    let sortedRanksStr = "";

    // Group cards by rank count to easily place matched/kickers
    const counts = {};
    ranks.forEach(r => counts[r] = (counts[r] || 0) + 1);

    const handName = hand.name;

    if (handName === "Full House") {
      // trips first, then pair
      let trips = "";
      let pair = "";
      for (const r in counts) {
        if (counts[r] === 3) trips = r;
        if (counts[r] === 2) pair = r;
      }
      sortedRanksStr = trips.repeat(3) + pair.repeat(2);
    }
    else if (handName === "Four of a Kind") {
      // quads first, then kicker
      let quads = "";
      let kicker = "";
      for (const r in counts) {
        if (counts[r] === 4) quads = r;
        if (counts[r] === 1) kicker = r;
      }
      sortedRanksStr = quads.repeat(4) + kicker;
    }
    else if (handName === "Three of a Kind") {
      // trips first, then remaining kickers sorted descending
      let trips = "";
      let kickers = [];
      for (const r in counts) {
        if (counts[r] === 3) trips = r;
        else kickers.push(...Array(counts[r]).fill(r));
      }
      sortedRanksStr = trips.repeat(3) + sortRanksDescending(kickers).join('');
    }
    else if (handName === "Two Pair") {
      // higher pair, lower pair, kicker
      let pairs = [];
      let kicker = "";
      for (const r in counts) {
        if (counts[r] === 2) pairs.push(r);
        else kicker = r;
      }
      pairs = sortRanksDescending(pairs);
      sortedRanksStr = pairs[0].repeat(2) + pairs[1].repeat(2) + kicker;
    }
    else if (handName === "One Pair") {
      // pair first, then remaining 3 kickers descending
      let pair = "";
      let kickers = [];
      for (const r in counts) {
        if (counts[r] === 2) pair = r;
        else kickers.push(...Array(counts[r]).fill(r));
      }
      sortedRanksStr = pair.repeat(2) + sortRanksDescending(kickers).join('');
    }
    else {
      // Unpaired hands (Flush, Straight, Straight Flush, High Card)
      // Sort all 5 cards strictly descending
      sortedRanksStr = sortRanksDescending(ranks).join('');
    }

    // Map hand type name
    let typeLabel = handName;
    if (typeLabel === "One Pair") {
      typeLabel = "Pair";
    }

    return `${sortedRanksStr} (${typeLabel})`;
  }

  const CARD_NAMES_SINGULAR = {
    14: "Ace", 13: "King", 12: "Queen", 11: "Jack", 10: "10",
    9: "9", 8: "8", 7: "7", 6: "6", 5: "5", 4: "4", 3: "3", 2: "2"
  };

  const CARD_NAMES_PLURAL = {
    14: "Aces", 13: "Kings", 12: "Queens", 11: "Jacks", 10: "10s",
    9: "9s", 8: "8s", 7: "7s", 6: "6s", 5: "5s", 4: "4s", 3: "3s", 2: "2s"
  };

  function getHandDescription(hand) {
    if (!hand) return "";
    const name = hand.name;
    const kickers = hand.kickers || [];

    switch (name) {
      case "Straight Flush":
        return "a Straight Flush";
      case "Four of a Kind":
        return "Four of a Kind";
      case "Full House":
        return "a Full House";
      case "Flush":
        return "a Flush";
      case "Straight":
        return "a Straight";
      case "Three of a Kind":
        return "Three " + (CARD_NAMES_PLURAL[kickers[0]] || "");
      case "Two Pair":
        return "Two Pair";
      case "One Pair":
        return "a Pair of " + (CARD_NAMES_PLURAL[kickers[0]] || "");
      case "High Card":
        return "High Card";
      default:
        return name;
    }
  }

  // Format and log a turn action:
  // (turn index). (player) ] (piece) : (move/attack/failed(defend square)) : (origin) -> (endposition ).
  function logGameTurn(player, piece, type, origin, end, defendSquare, historyIndexVal = null) {
    turnIndex++;
    let typeStr = type;
    if (type === 'failed') {
      typeStr = `failed(${defendSquare})`;
    }
    const pieceChar = engine.getPieceType(piece).toUpperCase();
    let line;
    if (type === 'move') {
      line = `${turnIndex}. ${player} ] ${pieceChar} : ${origin} -> ${end}.`;
    } else {
      line = `${turnIndex}. ${player} ] ${pieceChar} : ${typeStr} : ${origin} -> ${end}.`;
    }
    appendGameLog(line, historyIndexVal);
  }

  // Format and log a pawn promotion action:
  // (turn index). (player) ] (promoted piece type) : Promotion -> (endPosition).
  function logPawnPromotion(player, promotedPieceChar, endPosition, historyIndexVal = null) {
    turnIndex++;
    appendGameLog(`${turnIndex}. ${player} ] ${promotedPieceChar} : Promotion -> ${endPosition}`, historyIndexVal);
  }

  // Helper to log system events (no longer appended to the UI)
  function logSystemEvent(msg) {
    console.log(`[System] ${msg}`);
  }

  // Save current game state to history
  function saveHistoryState() {
    if (!gameState) return;

    const isViewingPast = historyIndex >= 0 && historyIndex < history.length - 1;

    // Only slice future history if we are offline (e.g. human overwrites timeline)
    if (isViewingPast && !isOnline()) {
      history = history.slice(0, historyIndex + 1);
    }

    // Capture previous state for logging
    if (history.length > 0) {
      const targetHistoryIndex = history.length;
      const prevEntry = history[history.length - 1];
      const prevState = prevEntry.gameState;
      const prevShowdown = prevEntry.combatShowdown;

      // 1. Detect resolved combat
      if (prevShowdown && !combatShowdown) {
        const move = prevShowdown.move;
        const combatResult = prevShowdown.result;
        const fromPiece = prevState.board[move.from.r][move.from.c];
        const fromSquare = getSquareName(move.from.r, move.from.c);
        const toSquare = getSquareName(move.to.r, move.to.c);
        const activePlayer = prevState.players[prevState.turn];
        const shortName = SEAT_SHORT[activePlayer.id] || activePlayer.name;

        if (combatResult.outcome === "capture") {
          const toPiece = prevState.board[move.to.r][move.to.c];
          const pieceType = toPiece ? engine.getPieceType(toPiece) : 'p';
          logGameTurn(shortName, fromPiece, `Takes(${pieceType.toUpperCase()})`, fromSquare, toSquare, null, targetHistoryIndex);
        } else if (combatResult.outcome === "slide") {
          const slideDest = engine.getSlideDestination(move.from, move.to);
          const slideSquareName = getSquareName(slideDest.r, slideDest.c);
          logGameTurn(shortName, fromPiece, 'failed', fromSquare, slideSquareName, toSquare, targetHistoryIndex);
        } else {
          logGameTurn(shortName, fromPiece, 'failed', fromSquare, fromSquare, toSquare, targetHistoryIndex);
        }

        const isAWinning = (combatResult.winnerTeam === engine.TEAMS.A);
        const winningHand = isAWinning ? combatResult.teamAHand : combatResult.teamBHand;
        const losingHand = isAWinning ? combatResult.teamBHand : combatResult.teamAHand;
        const winningHandStr = formatPokerHandLog(winningHand);
        const losingHandStr = formatPokerHandLog(losingHand);
        if (winningHandStr && losingHandStr) {
          appendGameLog(`${winningHandStr} > ${losingHandStr}`, targetHistoryIndex);
        }
      }
      // 2. Detect normal move or immediate capture
      else if (!prevShowdown && !combatShowdown && gameState.lastMove) {
        // Compare with prevState.lastMove to make sure we don't log a duplicate
        const isNewMove = !prevState.lastMove ||
          prevState.lastMove.from.r !== gameState.lastMove.from.r ||
          prevState.lastMove.from.c !== gameState.lastMove.from.c ||
          prevState.lastMove.to.r !== gameState.lastMove.to.r ||
          prevState.lastMove.to.c !== gameState.lastMove.to.c;

        if (isNewMove) {
          const move = gameState.lastMove;
          const fromPiece = prevState.board[move.from.r][move.from.c];
          const fromSquare = getSquareName(move.from.r, move.from.c);
          const toSquare = getSquareName(move.to.r, move.to.c);
          const activePlayer = prevState.players[prevState.turn];
          const shortName = SEAT_SHORT[activePlayer.id] || activePlayer.name;

          const toPiece = prevState.board[move.to.r][move.to.c];
          if (toPiece) {
            logGameTurn(shortName, fromPiece, `Takes(${engine.getPieceType(toPiece).toUpperCase()})`, fromSquare, toSquare, null, targetHistoryIndex);
          } else {
            logGameTurn(shortName, fromPiece, 'move', fromSquare, toSquare, null, targetHistoryIndex);
          }
        }
      }

      // 3. Detect promotion (by comparing boards)
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const prevCell = prevState.board[r][c];
          const newCell = gameState.board[r][c];
          if (prevCell && prevCell !== newCell) {
            const prevType = engine.getPieceType(prevCell);
            if (prevType === 'p') {
              const prevTeam = engine.getPieceTeam(prevCell);
              const newTeam = engine.getPieceTeam(newCell);
              if (prevTeam === newTeam && engine.getPieceType(newCell) !== 'p') {
                const activePlayer = prevState.players[prevState.turn];
                const shortName = SEAT_SHORT[activePlayer.id] || activePlayer.name;
                const promotedPieceChar = engine.getPieceType(newCell).toUpperCase();
                logPawnPromotion(shortName, promotedPieceChar, getSquareName(r, c), targetHistoryIndex);
              }
            }
          }
        }
      }
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

  // Helper to highlight a step in the log book and scroll to it smoothly
  function highlightLogEntry(index) {
    if (!elLogEntries) return;
    const entries = elLogEntries.querySelectorAll('.log-entry');
    entries.forEach(entry => {
      if (entry.dataset.historyIndex !== undefined && parseInt(entry.dataset.historyIndex, 10) === index) {
        entry.classList.add('highlighted');
        entry.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        entry.classList.remove('highlighted');
      }
    });
  }

  // Update Replay buttons state and display counter
  function updateReplayButtons() {
    const elPrev = document.getElementById('btn-replay-prev');
    const elNext = document.getElementById('btn-replay-next');
    const elResume = document.getElementById('btn-replay-resume');

    if (history.length <= 1) {
      if (elPrev) elPrev.disabled = true;
      if (elNext) elNext.disabled = true;
      if (elResume) elResume.disabled = true;
      highlightLogEntry(historyIndex);
      return;
    }

    if (elPrev) {
      elPrev.disabled = (historyIndex === 0);
    }
    if (elNext) {
      elNext.disabled = (historyIndex === history.length - 1);
    }
    if (elResume) {
      elResume.disabled = (historyIndex === history.length - 1);
    }

    highlightLogEntry(historyIndex);
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

    if (elGameOverBanner) elGameOverBanner.classList.add('hidden');
    if (elBoardFrame) elBoardFrame.classList.remove('win-team-a', 'win-team-b');

    gameState = engine.initGame(lastStartingPlayer, currentMatchScores);
    gameState.lastMove = null;
    selectedPiece = null;
    selectedCapturedPiece = null;
    resetCardSelection();
    activeLegalMoves = [];
    combatShowdown = null;
    gameEnded = false;
    history = [];
    historyIndex = -1;
    elLogEntries.innerHTML = '';
    turnIndex = 0;
    appendGameLog("turn Log:", 0);
    saveHistoryState();
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
          if (gameState && !gameEnded) {
            gameState.turn = engine.getNextActiveTurn(gameState.turn, gameState);
            gameState.lastMove = null;
            gameState.hasSwappedThisTurn = false;
            saveHistoryState();
            renderState();
            triggerTurnStartAnimations();
            checkBotTurn();
          } else if (gameEnded) {
            saveHistoryState();
            renderState();
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
      engine.checkHillRefill(gameState.turn, gameState);
      checkGameOver();
      if (gameState && !gameEnded) {
        gameState.turn = engine.getNextActiveTurn(gameState.turn, gameState);
        gameState.lastMove = null;
        gameState.hasSwappedThisTurn = false;
        saveHistoryState();
        renderState();
        triggerTurnStartAnimations();
        checkBotTurn();
      } else if (gameEnded) {
        saveHistoryState();
        renderState();
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
        rowRegion: engine.getRowRegion(move.to.r),
        step: 1
      };

      // Render the showdown immediately (attacker/defender highlights + face-up cards)
      saveHistoryState();
      renderState();

      // Clear selections for UI during showdown
      selectedPiece = null;
      activeLegalMoves = [];

      // Step 2: Highlight winning cards and show announcement message
      const winHighlightDelay = (typeof COMBAT_SHOWDOWN_HIGHLIGHT_DELAY !== 'undefined') ? COMBAT_SHOWDOWN_HIGHLIGHT_DELAY : 2000;
      const combatResolveDelay = winHighlightDelay + ((typeof COMBAT_SHOWDOWN_WINNING_CARD_DURATION !== 'undefined') ? COMBAT_SHOWDOWN_WINNING_CARD_DURATION : 2500);

      setTimeout(() => {
        if (combatShowdown) {
          combatShowdown.step = 2;
          renderState();
        }
      }, winHighlightDelay);

      // 4. Resolve combat state
      setTimeout(() => {
        // Mutate gameState using the evaluation result
        engine.applyCombatResult(move, combatResult, combatCards, gameState);

        // Clear showdown state
        combatShowdown = null;

        // Hill Refill (End of active player's own turn)
        engine.checkHillRefill(gameState.turn, gameState);

        // Check win condition
        checkGameOver();

        if (gameState && !gameEnded) {
          gameState.turn = engine.getNextActiveTurn(gameState.turn, gameState);
          gameState.hasSwappedThisTurn = false;
          saveHistoryState();
          renderState();
          triggerTurnStartAnimations();
          checkBotTurn();
        } else if (gameEnded) {
          saveHistoryState();
          renderState();
        }
      }, combatResolveDelay);

      return;
    }

    // Normal move or immediate capture (e.g. King capture or capturing a King)
    if (toPiece) {
      engine.add_to_captured_pieces(toPiece, move.to.r, move.to.c, gameState);
    }

    // Apply board change
    gameState.board[move.to.r][move.to.c] = fromPiece;
    gameState.board[move.from.r][move.from.c] = null;
    gameState.lastMove = { from: move.from, to: move.to };

    // Clear selection
    selectedPiece = null;
    activeLegalMoves = [];

    // Hill Refill (End of active player's own turn)
    engine.checkHillRefill(gameState.turn, gameState);

    // Check win condition (count Kings for both teams)
    checkGameOver();

    if (gameState && !gameEnded) {
      gameState.turn = engine.getNextActiveTurn(gameState.turn, gameState);
      gameState.hasSwappedThisTurn = false;
      saveHistoryState();
      renderState();
      triggerTurnStartAnimations();
      checkBotTurn();
    } else if (gameEnded) {
      saveHistoryState();
      renderState();
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
      const winnerText = "Team B (E-W) Wins!";
      elWinnerAnnouncement.textContent = winnerText;

      elGameOverBannerTitle.textContent = winnerText;
      if (elGameOverBanner) {
        elGameOverBanner.className = 'game-over-banner team-b-win';
        elGameOverBanner.classList.remove('hidden');
      }
      if (elBoardFrame) {
        elBoardFrame.classList.remove('win-team-a');
        elBoardFrame.classList.add('win-team-b');
      }

      logSystemEvent("Match Over: Team B captured both Team A Kings.");
      gameEnded = true;

      if (!isOnline()) {
        currentMatchScores['B']++;
        if (gameState) {
          gameState.matchScores = { ...currentMatchScores };
        }
        if (elBtnRestartBanner) {
          elBtnRestartBanner.textContent = 'New Game';
          elBtnRestartBanner.disabled = false;
        }
        if (elBtnBackToLobbyBanner) {
          elBtnBackToLobbyBanner.classList.remove('hidden');
        }
      }
    } else if (kingsB === 0) {
      const winnerText = "Team A (N-S) Wins!";
      elWinnerAnnouncement.textContent = winnerText;

      elGameOverBannerTitle.textContent = winnerText;
      if (elGameOverBanner) {
        elGameOverBanner.className = 'game-over-banner team-a-win';
        elGameOverBanner.classList.remove('hidden');
      }
      if (elBoardFrame) {
        elBoardFrame.classList.remove('win-team-b');
        elBoardFrame.classList.add('win-team-a');
      }

      logSystemEvent("Match Over: Team A captured both Team B Kings.");
      gameEnded = true;

      if (!isOnline()) {
        currentMatchScores['A']++;
        if (gameState) {
          gameState.matchScores = { ...currentMatchScores };
        }
        if (elBtnRestartBanner) {
          elBtnRestartBanner.textContent = 'New Game';
          elBtnRestartBanner.disabled = false;
        }
        if (elBtnBackToLobbyBanner) {
          elBtnBackToLobbyBanner.classList.remove('hidden');
        }
      }
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


  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function startTurnTimer() {
    if (turnTimerInterval) clearInterval(turnTimerInterval);

    updateTimerText();

    turnTimerInterval = setInterval(() => {
      updateTimerText();
    }, 250);

    function updateTimerText() {
      const timerSpan = document.getElementById('turn-timer');
      if (!timerSpan) return;

      if (!isOnline() || !gameState || gameState.turnEndTime === null) {
        timerSpan.textContent = '';
        clearInterval(turnTimerInterval);
        turnTimerInterval = null;
        return;
      }

      const timeLeft = Math.max(0, Math.ceil((gameState.turnEndTime - Date.now()) / 1000));
      timerSpan.textContent = ` (${timeLeft}s)`;

      if (timeLeft <= 10) {
        timerSpan.style.color = '#ff3333';
        timerSpan.style.opacity = '1';
        timerSpan.style.fontWeight = '800';
      } else {
        timerSpan.style.color = '#ff3333';
        timerSpan.style.opacity = '0.5';
        timerSpan.style.fontWeight = '700';
      }

      if (timeLeft <= 0) {
        clearInterval(turnTimerInterval);
        turnTimerInterval = null;
      }
    }
  }

  // Render the current game state to the DOM
  function renderState() {
    if (!gameState) return;

    let winningCards = [];
    if (combatShowdown && combatShowdown.step === 2) {
      const winnerHand = (combatShowdown.result.winnerTeam === engine.TEAMS.A)
        ? combatShowdown.result.teamAHand
        : combatShowdown.result.teamBHand;
      if (winnerHand && winnerHand.cards) {
        const valMap = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
        const getVal = c => valMap[c[0]] || 0;
        const rank = winnerHand.rank;
        const kickers = winnerHand.kickers;

        if (rank === 0) {
          // High Card: only highlight the single highest card
          const maxVal = kickers[0];
          const matchedCard = winnerHand.cards.find(c => getVal(c) === maxVal);
          winningCards = matchedCard ? [matchedCard] : [];
        } else if (rank === 1) {
          // One Pair: highlight only the pair cards
          const pairVal = kickers[0];
          winningCards = winnerHand.cards.filter(c => getVal(c) === pairVal);
        } else if (rank === 2) {
          // Two Pair: highlight only the 4 cards forming the two pairs
          const p1 = kickers[0];
          const p2 = kickers[1];
          winningCards = winnerHand.cards.filter(c => getVal(c) === p1 || getVal(c) === p2);
        } else if (rank === 3) {
          // Three of a Kind: highlight only the 3 matching cards
          const tripsVal = kickers[0];
          winningCards = winnerHand.cards.filter(c => getVal(c) === tripsVal);
        } else if (rank === 7) {
          // Four of a Kind: highlight only the 4 matching cards
          const quadVal = kickers[0];
          winningCards = winnerHand.cards.filter(c => getVal(c) === quadVal);
        } else {
          // Straight, Flush, Full House, Straight Flush: all 5 cards
          winningCards = winnerHand.cards;
        }
      }
    }

    // Check if active player's King is threatened on their turn
    const activeKingThreatened = (historyIndex === history.length - 1 && !gameEnded)
      ? engine.isKingThreatened(gameState.turn, gameState)
      : false;



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

    // Render match score
    const scoreA = (gameState && gameState.matchScores && gameState.matchScores[engine.TEAMS.A]) !== undefined
      ? gameState.matchScores[engine.TEAMS.A]
      : 0;
    const scoreB = (gameState && gameState.matchScores && gameState.matchScores[engine.TEAMS.B]) !== undefined
      ? gameState.matchScores[engine.TEAMS.B]
      : 0;
    elScoreA.textContent = scoreA;
    elScoreB.textContent = scoreB;

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

        // Add coordinate labels to border squares
        if (r === 0 || r === 7 || c === 0 || c === 7) {
          let labelText = '';
          let labelClass = 'board-cell-label';

          if (r === 7 && c >= 0 && c <= 6) {
            // 1/a to g (going right): left bottom corners
            if (r === 7 && c === 0) labelText = '1/a';
            else labelText = String.fromCharCode(97 + c);
            labelClass += ' board-cell-label-bl';
          } else if (c === 7 && r >= 1 && r <= 7) {
            // 1/h to 7 (going up): right bottom of the cells
            if (r === 7 && c === 7) labelText = '1/h';
            else labelText = String(8 - r);
            labelClass += ' board-cell-label-br';
          } else if (r === 0 && c >= 1 && c <= 7) {
            // 8/h to b (going left): top right corners
            if (r === 0 && c === 7) labelText = '8/h';
            else labelText = String.fromCharCode(97 + c);
            labelClass += ' board-cell-label-tr';
          } else if (c === 0 && r >= 0 && r <= 6) {
            // 8/a to 2 (going down): top left corners
            if (r === 0 && c === 0) labelText = '8/a';
            else labelText = String(8 - r);
            labelClass += ' board-cell-label-tl';
          }

          if (labelText) {
            const labelSpan = document.createElement('span');
            labelSpan.className = labelClass;
            labelSpan.textContent = labelText;
            cell.appendChild(labelSpan);
          }
        }


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
            // Check if this piece is the active player's King and it is threatened
            const isKing = engine.getPieceType(piece) === 'k';
            let isPlayerKing = false;
            if (isKing) {
              const kingOwner = (engine.getPieceTeam(piece) === engine.TEAMS.A)
                ? (r < 4 ? engine.PLAYERS.NORTH : engine.PLAYERS.SOUTH)
                : (c < 4 ? engine.PLAYERS.WEST : engine.PLAYERS.EAST);
              if (kingOwner === gameState.turn) {
                isPlayerKing = true;
              }
            }

            if (isPlayerKing && activeKingThreatened) {
              pieceDiv.classList.add('threatened-king');
            } else {
              pieceDiv.classList.add('controllable-piece');
            }
          }

          // Piece movement animation
          if (gameState.lastMove && gameState.lastMove.from && gameState.lastMove.to &&
            gameState.lastMove.to.r === r && gameState.lastMove.to.c === c) {
            const hasAlreadyAnimated = lastAnimatedMove &&
              lastAnimatedMove.from.r === gameState.lastMove.from.r &&
              lastAnimatedMove.from.c === gameState.lastMove.from.c &&
              lastAnimatedMove.to.r === gameState.lastMove.to.r &&
              lastAnimatedMove.to.c === gameState.lastMove.to.c;

            if (!hasAlreadyAnimated) {
              const dr = gameState.lastMove.from.r - r;
              const dc = gameState.lastMove.from.c - c;
              if (dr !== 0 || dc !== 0) {
                // Adjust coordinates for the current board rotation to compensate for
                // the piece's CSS counter-rotation
                const angleRad = (boardRotation * Math.PI) / 180;
                const cos = Math.round(Math.cos(angleRad));
                const sin = Math.round(Math.sin(angleRad));
                const animatedDc = dc * cos - dr * sin;
                const animatedDr = dc * sin + dr * cos;

                pieceDiv.style.transition = 'none';
                pieceDiv.style.transform = `translate(${animatedDc * 100}%, ${animatedDr * 100}%)`;
                requestAnimationFrame(() => {
                  pieceDiv.style.transition = 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)';
                  pieceDiv.style.transform = 'translate(0, 0)';
                });
              }
            }
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

    if (elBoardFrame) {
      elBoardFrame.classList.remove('active-turn-0', 'active-turn-1', 'active-turn-2', 'active-turn-3', 'active-team-a', 'active-team-b');
      elBoardFrame.classList.add(`active-turn-${gameState.turn}`);
      elBoardFrame.classList.add(isTeamA ? 'active-team-a' : 'active-team-b');
    }

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
        const cardSlot = document.getElementById(`card-${char}-${cIdx}`);
        if (cardSlot) {
          const isWinning = winningCards.includes(cardVal);
          cardSlot.innerHTML = getCardHTML(cardVal, false, false, isWinning);
          const cardEl = cardSlot.querySelector('.playing-card');
          if (cardEl) {
            cardEl.classList.remove('highlight-team-a', 'highlight-team-b', 'clickable-pos-card', 'selected-base-card', 'winning-card-highlight');
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

              if (isWinning) {
                cardEl.classList.add('winning-card-highlight');
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
    }

    // Render Community Cards
    elPublicFlop.innerHTML = '';
    gameState.publicCards.forEach(c => {
      const isWinning = winningCards.includes(c);
      elPublicFlop.innerHTML += getCardHTML(c, false, false, isWinning);
    });
    if (combatShowdown) {
      Array.from(elPublicFlop.children).forEach((child, idx) => {
        child.classList.add('highlight-public');
        const c = gameState.publicCards[idx];
        if (winningCards.includes(c)) {
          child.classList.add('winning-card-highlight');
        }
      });
    }

    elPublicTurnRiver.innerHTML = '';
    if (combatShowdown) {
      combatShowdown.combatCards.forEach(c => {
        const isWinning = winningCards.includes(c);
        elPublicTurnRiver.innerHTML += getCardHTML(c, false, false, isWinning);
      });
      Array.from(elPublicTurnRiver.children).forEach((child, idx) => {
        child.classList.add('highlight-public');
        const c = combatShowdown.combatCards[idx];
        if (winningCards.includes(c)) {
          child.classList.add('winning-card-highlight');
        }
      });
    } else {
      elPublicTurnRiver.innerHTML += getCardHTML(null, true);
      elPublicTurnRiver.innerHTML += getCardHTML(null, true);
    }

    // Render active player's base deck or combat announcement
    const elBaseDeck = document.getElementById('base-deck');
    if (combatShowdown) {
      if (elBaseDeck) elBaseDeck.classList.add('hidden');
      if (combatShowdown.step === 2 && elCombatAnnouncement && elCombatAnnouncementText) {
        elCombatAnnouncement.classList.remove('hidden');

        const isAttackerWinner = (combatShowdown.result.winnerTeam === combatShowdown.result.attackerTeam);
        const winnerHand = (combatShowdown.result.winnerTeam === engine.TEAMS.A)
          ? combatShowdown.result.teamAHand
          : combatShowdown.result.teamBHand;

        const winnerRole = isAttackerWinner ? "Attacker" : "Defender";
        const handDesc = getHandDescription(winnerHand);

        if (combatShowdown.result.isDraw) {
          elCombatAnnouncementText.textContent = "Draw - attacker wins";
        } else {
          elCombatAnnouncementText.textContent = `${winnerRole} Win with ${handDesc}!`;
        }
        elCombatAnnouncementText.className = 'combat-announcement-text';
        if (isAttackerWinner) {
          elCombatAnnouncementText.classList.add('attacker-win-msg');
        } else {
          elCombatAnnouncementText.classList.add('defender-win-msg');
        }
      } else {
        if (elCombatAnnouncement) elCombatAnnouncement.classList.add('hidden');
      }
    } else {
      if (elCombatAnnouncement) elCombatAnnouncement.classList.add('hidden');
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
    }

    if (elBaseDeckHeader) {
      if (isHumanTurn) {
        elBaseDeckHeader.innerHTML = 'YOUR TURN! Select a piece to move <span id="turn-timer"></span>';
        elBaseDeckHeader.style.color = '#e84c0fc4'; // Vibrant red
        elBaseDeckHeader.style.fontSize = '1.2rem'; // Bigger
        elBaseDeckHeader.style.fontWeight = '700';
      } else {
        elBaseDeckHeader.innerHTML = 'YOUR BASE DECK <span style="font-size: 0.75rem; color: var(--swap-instruction-color); margin-left: 5px; font-weight: 400;">(Select a card and click another to swap)</span>';
        elBaseDeckHeader.style.color = 'var(--text-muted)';
        elBaseDeckHeader.style.fontSize = '0.85rem';
        elBaseDeckHeader.style.fontWeight = '600';
      }
    }

    if (isOnline() && isHumanTurn && gameState && gameState.turnEndTime) {
      startTurnTimer();
    } else {
      if (turnTimerInterval) {
        clearInterval(turnTimerInterval);
        turnTimerInterval = null;
      }
    }

    if (elBaseDeckOwner) elBaseDeckOwner.textContent = displayName;
    if (elBaseDeckCount) elBaseDeckCount.textContent = `${activePlayer.baseDeck.length} / 5`;
    elBaseDeckCards.innerHTML = '';

    if (isHumanTurn && !gameState.hasSwappedThisTurn) {
      activePlayer.baseDeck.forEach((card, idx) => {
        const cardSlot = document.createElement('div');
        cardSlot.style.display = 'inline-block';

        const isSelected = selectedBaseCardIdx === idx;
        cardSlot.innerHTML = getCardHTML(card, false, isSelected);

        const cardEl = cardSlot.querySelector('.playing-card');
        if (cardEl) {
          // If a base card is not selected, it is clickable to select (or to swap if a positional card is selected)
          if (!isSelected) {
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
        elFlankRule.innerHTML = `<strong>Pawn Flanks:</strong> <span style="text-decoration: line-through; opacity: 0.6;">Pawns on red flank squares cannot attack each other.</span> <span style="color: var(--dropped-rule-color); font-weight: bold; text-shadow: 0 0 5px rgba(0,255,0,0.3);">[DROPPED]</span>`;
      } else {
        elFlankRule.innerHTML = `<strong>Pawn Flanks:</strong> Pawns on red flank squares cannot attack each other <span style="color: var(--text-muted); font-size: 0.8em;">(drops when center hill entered)</span>`;
      }
    }

    if (gameState && gameState.lastMove) {
      lastAnimatedMove = {
        from: { r: gameState.lastMove.from.r, c: gameState.lastMove.from.c },
        to: { r: gameState.lastMove.to.r, c: gameState.lastMove.to.c }
      };
    } else {
      lastAnimatedMove = null;
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
  elBtnNewGame.addEventListener('click', () => {
    currentMatchScores = { 'A': 0, 'B': 0 };
    lastStartingPlayer = 0; // PLAYERS.NORTH
    initNewGame();
  });
  elBtnRotateBoard.addEventListener('click', rotateBoard);
  elBtnRestart.addEventListener('click', () => {
    elGameOverOverlay.classList.add('hidden');
    if (isOnline()) {
      window.Multiplayer.requestRematch();
    } else {
      lastStartingPlayer = (lastStartingPlayer + 1) % 4; // Rotate starting player
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

  // New game-over banner buttons
  if (elBtnRestartBanner) {
    elBtnRestartBanner.addEventListener('click', () => {
      if (elGameOverBanner) elGameOverBanner.classList.add('hidden');
      if (elBoardFrame) elBoardFrame.classList.remove('win-team-a', 'win-team-b');
      if (isOnline()) {
        window.Multiplayer.requestRematch();
      } else {
        lastStartingPlayer = (lastStartingPlayer + 1) % 4; // Rotate starting player
        initNewGame();
      }
    });
  }

  if (elBtnReviewGameBanner) {
    elBtnReviewGameBanner.addEventListener('click', () => {
      if (history.length > 1) {
        historyIndex = 0;
        restoreHistoryState();
        if (elGameOverBanner) elGameOverBanner.classList.add('hidden');
        if (elBoardFrame) elBoardFrame.classList.remove('win-team-a', 'win-team-b');
        logSystemEvent('Review mode activated from game-over banner.');
      }
    });
  }

  if (elBtnBackToLobbyBanner) {
    elBtnBackToLobbyBanner.addEventListener('click', () => {
      if (elGameOverBanner) elGameOverBanner.classList.add('hidden');
      if (elBoardFrame) elBoardFrame.classList.remove('win-team-a', 'win-team-b');
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
  const elBtnReplayResume = document.getElementById('btn-replay-resume');
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

  if (elBtnReplayResume) {
    elBtnReplayResume.addEventListener('click', () => {
      if (historyIndex !== history.length - 1) {
        historyIndex = history.length - 1;
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
      // If a new game is detected in online mode, clear the client history and log book
      if (stateView.lastMove === null && history.length > 0) {
        history = [];
        historyIndex = -1;
        elLogEntries.innerHTML = '';
        turnIndex = 0;
        appendGameLog("turn Log:", 0);
      }

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
        hillWasVisited: stateView.hillWasVisited !== undefined ? stateView.hillWasVisited : 0,
        turnEndTime: stateView.turnEndTime || null,
        turnTimerLimit: stateView.turnTimerLimit || 30
      };

      // Set combat showdown from server
      const prevShowdown = combatShowdown;
      const newShowdown = stateView.combatShowdown || null;
      if (newShowdown) {
        // If we don't have this combat showdown locally yet, initialize step 1 and the timer
        const isNewShowdown = !prevShowdown ||
          (prevShowdown.move.from.r !== newShowdown.move.from.r ||
            prevShowdown.move.from.c !== newShowdown.move.from.c ||
            prevShowdown.move.to.r !== newShowdown.move.to.r ||
            prevShowdown.move.to.c !== newShowdown.move.to.c);

        if (isNewShowdown) {
          combatShowdown = JSON.parse(JSON.stringify(newShowdown));
          combatShowdown.step = 1;
          const winHighlightDelay = (typeof COMBAT_SHOWDOWN_HIGHLIGHT_DELAY !== 'undefined') ? COMBAT_SHOWDOWN_HIGHLIGHT_DELAY : 2000;
          setTimeout(() => {
            if (combatShowdown && combatShowdown.step === 1 &&
              combatShowdown.move.from.r === newShowdown.move.from.r &&
              combatShowdown.move.from.c === newShowdown.move.from.c) {
              combatShowdown.step = 2;
              renderState();
            }
          }, winHighlightDelay);
        } else {
          // Keep our current local step so it doesn't get reset if the server broadcasts again
          const currentStep = prevShowdown.step || 1;
          combatShowdown = JSON.parse(JSON.stringify(newShowdown));
          combatShowdown.step = currentStep;
        }
      } else {
        combatShowdown = null;
      }

      // Clear selections on state update
      selectedPiece = null;
      selectedCapturedPiece = null;
      resetCardSelection();
      activeLegalMoves = [];

      let kingsA = 0;
      let kingsB = 0;
      if (stateView && stateView.board) {
        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 8; c++) {
            const piece = stateView.board[r][c];
            if (piece === engine.PIECES.KING_A) kingsA++;
            if (piece === engine.PIECES.KING_B) kingsB++;
          }
        }
      }
      const isOver = (kingsA === 0 || kingsB === 0);

      if (isOver) {
        gameEnded = true;
        const winner = kingsA === 0 ? 'B' : 'A';
        const winnerText = winner === 'A' ? 'Team A (N-S) Wins!' : 'Team B (E-W) Wins!';
        if (elWinnerAnnouncement) elWinnerAnnouncement.textContent = winnerText;
        if (elGameOverBannerTitle) elGameOverBannerTitle.textContent = winnerText;
        if (elGameOverBanner) {
          elGameOverBanner.className = 'game-over-banner ' + (winner === 'A' ? 'team-a-win' : 'team-b-win');
          elGameOverBanner.classList.remove('hidden');
        }
        if (elBoardFrame) {
          elBoardFrame.classList.remove('win-team-a', 'win-team-b');
          elBoardFrame.classList.add(winner === 'A' ? 'win-team-a' : 'win-team-b');
        }
        if (elBtnRestartBanner) {
          elBtnRestartBanner.textContent = window.Multiplayer.isHost ? 'New Game' : 'New Game (Host only)';
          elBtnRestartBanner.disabled = !window.Multiplayer.isHost;
        }
        if (elBtnBackToLobbyBanner) {
          elBtnBackToLobbyBanner.classList.remove('hidden');
        }
      } else {
        gameEnded = false;
        if (elGameOverBanner) elGameOverBanner.classList.add('hidden');
        if (elBoardFrame) elBoardFrame.classList.remove('win-team-a', 'win-team-b');
      }

      const wasViewingPast = (historyIndex >= 0 && historyIndex < history.length - 1);

      // Save to history for replay
      saveHistoryState();

      if (wasViewingPast) {
        // Keep viewing the past state visually
        restoreHistoryState();
      } else {
        // Render the new live state
        renderState();
        if (!isOver) {
          triggerTurnStartAnimations();
        }
      }
    });

    window.Multiplayer.onGameOver((winner) => {
      gameEnded = true;
      const winnerText = winner === 'A' ? 'Team A (N-S) Wins!' : 'Team B (E-W) Wins!';
      elWinnerAnnouncement.textContent = winnerText;

      elGameOverBannerTitle.textContent = winnerText;
      if (elGameOverBanner) {
        elGameOverBanner.className = 'game-over-banner ' + (winner === 'A' ? 'team-a-win' : 'team-b-win');
        elGameOverBanner.classList.remove('hidden');
      }
      if (elBoardFrame) {
        elBoardFrame.classList.remove('win-team-a', 'win-team-b');
        elBoardFrame.classList.add(winner === 'A' ? 'win-team-a' : 'win-team-b');
      }

      logSystemEvent(`Match Over: ${winnerText}`);

      // Show/hide rematch button based on host status
      if (elBtnRestartBanner) {
        elBtnRestartBanner.textContent = window.Multiplayer.isHost ? 'New Game' : 'New Game (Host only)';
        elBtnRestartBanner.disabled = !window.Multiplayer.isHost;
      }
      if (elBtnBackToLobbyBanner) {
        elBtnBackToLobbyBanner.classList.remove('hidden');
      }
    });
  }

  // Initialize (offline mode starts a game, online mode waits for server)
  updateRotateButtonLabel();
  // Don't auto-start a game; the lobby screen will show first.
  // initNewGame() will be called when needed in offline mode.
  // For now, just ensure game container is hidden (lobby is shown by multiplayer.js).
}

// Dynamic board scaling logic for mobile viewports
(function() {
  function updateBoardScale() {
    const isPortrait = window.matchMedia("(max-width: 1024px) and (orientation: portrait)").matches;
    const isLandscape = window.matchMedia("(max-width: 1024px) and (orientation: landscape)").matches;
    let scale = 1;
    if (isPortrait) {
      scale = Math.min(1, (window.innerWidth - 20) / 510);
    } else if (isLandscape) {
      scale = Math.min((window.innerWidth - 170) / 510, (window.innerHeight * 0.96) / 550, 1);
    }
    document.documentElement.style.setProperty('--board-scale', scale);
  }
  window.addEventListener('resize', updateBoardScale);
  window.addEventListener('load', updateBoardScale);
  // Run immediately and also defer slightly to ensure layout is computed
  updateBoardScale();
  setTimeout(updateBoardScale, 100);
})();
