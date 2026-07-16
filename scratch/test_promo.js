const engine = require('../engine.js');
const botV7 = require('../bots/v7_networth/bot.js');

// Create a gameState
const gameState = engine.initGame();

// Clear the board and place a pawn on North's hill
for (let r = 0; r < 8; r++) {
  for (let c = 0; c < 8; c++) {
    gameState.board[r][c] = null;
  }
}

// Keep kings alive
gameState.board[0][3] = 'K'; // North King (Team A)
gameState.board[3][7] = 'k'; // East King (Team B)
gameState.board[7][3] = 'K'; // South King (Team A)
gameState.board[3][0] = 'k'; // West King (Team B)

// Put a friendly pawn on North's hill
gameState.board[3][3] = 'P'; // North is Player 0, Team A

// Give North a captured rook
gameState.capturedPieces['A'].rooks = 1;

// Put a friendly pawn at {5, 0}
gameState.board[5][0] = 'P';

// Put an opponent Rook (Team B) at {5, 5} that threatens the pawn at {5,0} but NOT the hill square {3,3}
gameState.board[5][5] = 'r'; 

// Set turn to North (Player 0)
gameState.turn = 0;

gameState.regionProbs = new Array(9).fill({ winsA: 0, winsB: 10, draws: 0, total: 10 });

const weights = [1.68, 3.57, 6.19, 3.04, 13.02, 5.46, 0.3, 1.74, 2.37, 0.48, 6.71, 0.47, 0.59];

// Let's call evaluateBoard for a few states
// State 1: Original
console.log("Original state eval (v7):", botV7.evaluateBoard(gameState, 0, weights));

// State 2: After promotion to Rook at {3,3}
const statePromo = JSON.parse(JSON.stringify(gameState));
statePromo.board[3][3] = 'R';
statePromo.capturedPieces['A'].rooks = 0;
statePromo.capturedPieces['A'].pawns = 1;
console.log("After promotion eval (v7):", botV7.evaluateBoard(statePromo, 0, weights));

// State 3: After moving pawn {3,3} to {4,3}
const stateMove = JSON.parse(JSON.stringify(gameState));
stateMove.board[3][3] = null;
stateMove.board[4][3] = 'P';
console.log("After move to {4,3} eval (v7):", botV7.evaluateBoard(stateMove, 0, weights));
