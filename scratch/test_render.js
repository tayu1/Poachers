const engine = require('../engine.js');

// Mock window, document, etc.
global.window = {
  PoachersEngine: engine
};

const domElements = {};

global.document = {
  getElementById: (id) => {
    if (!domElements[id]) {
      domElements[id] = {
        id,
        classList: {
          classes: new Set(),
          add: function(c) { this.classes.add(c); },
          remove: function(c) { this.classes.delete(c); },
          contains: function(c) { return this.classes.has(c); }
        },
        style: {},
        innerHTML: '',
        textContent: '',
        appendChild: () => {}
      };
    }
    return domElements[id];
  },
  querySelectorAll: () => []
};

// Now mock the renderState logic to test it with a real game state
const gameState = engine.initGame();

// Mock engine functions used in renderState
function testRenderState() {
  // Let's test the status bar update logic
  for (let i = 0; i < 4; i++) {
    const kingAlive = engine.isPlayerKingAlive(i, gameState);
    const isOnHill = engine.isPlayerOnHill(i, gameState);
    const baseSize = engine.getPlayerBaseSize(i, gameState);

    const elRow = document.getElementById(`status-row-${i}`);
    const elKing = document.getElementById(`status-king-${i}`);
    const elHill = document.getElementById(`status-hill-${i}`);
    const elBase = document.getElementById(`status-base-${i}`);

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
}

function runAssertion(testName, setupFn, verifyFn) {
  setupFn();
  testRenderState();
  try {
    verifyFn();
    console.log(`PASS: ${testName}`);
  } catch (err) {
    console.error(`FAIL: ${testName}`);
    console.error(err);
    process.exit(1);
  }
}

// Scenario 1: Initial state (No Kings captured, all on board)
runAssertion("Scenario 1: Initial state (No Kings captured)", 
  () => {
    // Keep starting board
  },
  () => {
    for (let i = 0; i < 4; i++) {
      if (domElements[`status-king-${i}`].className !== 'status-dot dot-on') {
        throw new Error(`Player ${i} king should be dot-on, but got ${domElements[`status-king-${i}`].className}`);
      }
    }
  }
);

// Scenario 2: North's King (Player 0, Team A) is captured (removed from board)
runAssertion("Scenario 2: North King captured (removed from board)",
  () => {
    // Initially North King is on row 0, col 5
    gameState.board[0][5] = engine.PIECES.EMPTY;
  },
  () => {
    if (domElements[`status-king-0`].className !== 'status-dot dot-off') {
      throw new Error(`Player 0 king should be dot-off`);
    }
    if (domElements[`status-king-2`].className !== 'status-dot dot-on') {
      throw new Error(`Player 2 king should remain dot-on when player 0 king is captured`);
    }
  }
);

// Scenario 3: Player on Hill status update
runAssertion("Scenario 3: Player on Hill status update",
  () => {
    // North hill squares are (3,3) and (3,4). Initially they are empty.
    gameState.board[3][3] = engine.PIECES.PAWN_A; // Team A pawn on North's hill
  },
  () => {
    if (domElements[`status-hill-0`].className !== 'status-dot dot-on') {
      throw new Error(`Player 0 should be marked on-hill (dot-on)`);
    }
    if (domElements[`status-hill-1`].className !== 'status-dot dot-off') {
      throw new Error(`Player 1 should not be marked on-hill (dot-off)`);
    }
  }
);

// Scenario 4: Player base deck size check
runAssertion("Scenario 4: Player base deck size update",
  () => {
    // Modify player 0 base deck size
    gameState.players[0].baseDeck = ['2C', '3D']; // size 2
  },
  () => {
    if (domElements[`status-base-0`].textContent !== 2) {
      throw new Error(`Player 0 base deck count should display 2, got ${domElements[`status-base-0`].textContent}`);
    }
  }
);

console.log("All tests completed successfully!");
