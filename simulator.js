const engine = require('./engine.js');

function checkGameOver(gameState) {
  let kingsA = 0;
  let kingsB = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = gameState.board[r][c];
      if (piece) {
        if (piece === engine.PIECES.KING_A) kingsA++;
        if (piece === engine.PIECES.KING_B) kingsB++;
      }
    }
  }
  if (kingsA === 0) return engine.TEAMS.B;
  if (kingsB === 0) return engine.TEAMS.A;
  return null;
}

function runSimulation(numGames, P_A, P_B, botA = null, botB = null, maxTurns = 100) {
  if (!botA) botA = require('./bots/v1_basic/bot.js');
  if (!botB) botB = require('./bots/v1_basic/bot.js');

  let winsA = 0;
  let winsB = 0;
  let draws = 0;
  let totalTurns = 0;
  let captures = 0;
  
  let totalTimeA = 0;
  let countA = 0;
  let totalTimeB = 0;
  let countB = 0;
  
  for (let i = 0; i < numGames; i++) {
    let gameState = engine.initGame();
    let turnCount = 0;
    let winner = null;
    let consecutivePasses = 0;
    
    while (turnCount < maxTurns) {
      const activePlayer = gameState.turn;
      const P = engine.PLAYER_TEAMS[activePlayer] === engine.TEAMS.A ? P_A : P_B;
      const activeBot = engine.PLAYER_TEAMS[activePlayer] === engine.TEAMS.A ? botA : botB;
      const isTeamA = engine.PLAYER_TEAMS[activePlayer] === engine.TEAMS.A;
      
      const start = parseFloat(process.hrtime.bigint()) / 1e6;
      const bestMove = activeBot.getBestMove(gameState, P);
      const end = parseFloat(process.hrtime.bigint()) / 1e6;
      
      if (isTeamA) {
        totalTimeA += (end - start);
        countA++;
      } else {
        totalTimeB += (end - start);
        countB++;
      }
      
      if (!bestMove) {
        consecutivePasses++;
        if (consecutivePasses >= 4) {
          break; // True stalemate
        }
        gameState.turn = engine.getNextActiveTurn(gameState.turn, gameState);
        turnCount++;
        continue;
      }
      consecutivePasses = 0;
      
      // Apply move
      if (bestMove.type === 'attack') {
        const turnCard = gameState.deck.pop();
        const riverCard = gameState.deck.pop();
        const combatResult = engine.evaluateCombat(bestMove, [turnCard, riverCard], gameState);
        engine.applyCombatResult(bestMove, combatResult, [turnCard, riverCard], gameState);
        if (combatResult.outcome === 'capture') captures++;
      } else if (bestMove.type === 'capture') {
        // Immediate capture (e.g. king capture without combat)
        const toPiece = gameState.board[bestMove.to.r][bestMove.to.c];
        engine.add_to_captured_pieces(toPiece, bestMove.to.r, bestMove.to.c, gameState);
        gameState.board[bestMove.to.r][bestMove.to.c] = gameState.board[bestMove.from.r][bestMove.from.c];
        gameState.board[bestMove.from.r][bestMove.from.c] = null;
        captures++;
      } else if (bestMove.type === 'move') {
        gameState.board[bestMove.to.r][bestMove.to.c] = gameState.board[bestMove.from.r][bestMove.from.c];
        gameState.board[bestMove.from.r][bestMove.from.c] = null;
      } else if (bestMove.type === 'promote') {
        engine.executePromotion(bestMove.to.r, bestMove.to.c, bestMove.promoType, bestMove.promoSubtype, activePlayer, gameState);
      }
      
      // Hill Refill
      engine.checkHillRefill(activePlayer, gameState);
      
      // Check win condition
      winner = checkGameOver(gameState);
      if (winner) break;
      
      gameState.turn = engine.getNextActiveTurn(gameState.turn, gameState);
      turnCount++;
    }
    
    // If game exceeded maxTurns without a clear winner, resolve by board evaluation
    if (!winner && turnCount >= maxTurns) {
      if (botA && botA.evaluateBoard) {
        const evalA = botA.evaluateBoard(gameState, 0, P_A);
        if (evalA > 0) winner = engine.TEAMS.A;
        else if (evalA < 0) winner = engine.TEAMS.B;
      }
    }
    
    totalTurns += turnCount;
    if (winner === engine.TEAMS.A) winsA++;
    else if (winner === engine.TEAMS.B) winsB++;
    else draws++;
  }
  
  console.log(`--- Simulation Results (${numGames} games) ---`);
  console.log(`Team A (Yellow) Wins: ${winsA} (${((winsA/numGames)*100).toFixed(1)}%)`);
  console.log(`Team B (Blue) Wins:   ${winsB} (${((winsB/numGames)*100).toFixed(1)}%)`);
  console.log(`Draws/Timeouts:       ${draws} (${((draws/numGames)*100).toFixed(1)}%)`);
  console.log(`Average Turns/Game:   ${(totalTurns/numGames).toFixed(1)}`);
  console.log(`Total Captures:       ${captures}`);
  console.log(`Average Move Duration:`);
  console.log(`  Team A: ${(totalTimeA / (countA || 1)).toFixed(2)} ms`);
  console.log(`  Team B: ${(totalTimeB / (countB || 1)).toFixed(2)} ms`);
  
  return { winsA, winsB, draws, totalTurns, captures };
}

const args = process.argv.slice(2);
const numGames = args.length > 0 ? parseInt(args[0]) : 1;
const botAPath = args.length > 1 ? args[1] : './bots/v1_basic/bot.js';
const botBPath = args.length > 2 ? args[2] : './bots/v1_basic/bot.js';

const fs = require('fs');
const path = require('path');

function getWeights(botPath) {
  const defaultP = [
    1.0, 3.0, 3.5, 5.0, 20.0,
    0.5, 0.2, 0.1, 8.0,
    0.2, 10.0, 2.0, 0.5
  ];
  try {
    const dir = path.dirname(botPath);
    const wPath = path.join(dir, 'weights.json');
    if (fs.existsSync(wPath)) {
      return JSON.parse(fs.readFileSync(wPath, 'utf8'));
    }
  } catch(e) {}
  return [...defaultP];
}

const teamAP = getWeights(botAPath);
const teamBP = getWeights(botBPath);

// Make Team B slightly more aggressive for testing if playing itself
if (botAPath === botBPath && JSON.stringify(teamAP) === JSON.stringify(teamBP) && teamBP.length > 12) {
  teamBP[12] = 1.5; 
}

if (require.main === module) {
  console.log(`Running ${numGames} matches...`);
  console.log(`Team A: ${botAPath}`);
  console.log(`Team B: ${botBPath}`);
  
  // require() resolves relative to this file
  const resolvedBotA = botAPath.startsWith('.') ? botAPath : './' + botAPath;
  const resolvedBotB = botBPath.startsWith('.') ? botBPath : './' + botBPath;
  
  runSimulation(numGames, teamAP, teamBP, require(resolvedBotA), require(resolvedBotB));
}

module.exports = { runSimulation, defaultP: getWeights('./bots/v1_basic/bot.js') };
