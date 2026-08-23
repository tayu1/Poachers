import { createInitialGameState, applyAction, getAllLegalActions, checkWinCondition, isSeatKingAlive } from '../src/core/engine';
import { getBestBotAction, evaluateActionTopK, evaluateState, getTopKMoves, DEFAULT_BOT_PROFILE } from '../src/bot/bot';
import { generateFullThreatMap } from '../src/core/moves';
import { PlayerSeat, ActionType, decType, decOrigin, decEnd, actionIntToGameAction } from '../src/core/types';
import { DEFAULT_PVALS } from '../src/bot/pvals';

const state = createInitialGameState();
state.board.fill(0);

// Row 0
state.board[2] = 4; // White Rook
state.board[3] = 5; // White King
state.board[5] = 2; // White Knight

// Row 1
state.board[11] = 3;      // White Bishop (just moved from 4 to 11)
state.board[12] = 1 | 16; // White Pawn bunkered
state.board[13] = 1 | 16; // White Pawn bunkered

// Row 2
state.board[16] = 4 | 8;      // Black Rook
state.board[17] = 1;          // White Pawn
state.board[18] = 1;          // White Pawn
state.board[22] = 1 | 8 | 16; // Black Pawn bunkered
state.board[23] = 2 | 8;      // Black Knight

// Row 3
state.board[25] = 1 | 8;      // Black Pawn
state.board[31] = 5 | 8;      // East Black King

// Row 4
state.board[32] = 3 | 8;      // Black Bishop
state.board[33] = 1 | 8 | 16; // Black Pawn bunkered
state.board[35] = 1 | 8;      // Black Pawn on Hill!
state.board[37] = 2;          // White Knight (attacking 31!)
state.board[39] = 3 | 8;      // Black Bishop

// Row 5
state.board[40] = 2 | 8;      // Black Knight
state.board[41] = 1 | 8 | 16; // Black Pawn bunkered
state.board[46] = 1 | 8 | 16; // Black Pawn bunkered
state.board[47] = 4 | 8;      // Black Rook

// Row 6
state.board[50] = 1 | 16;     // White Pawn bunkered
state.board[52] = 1;          // White Pawn
state.board[53] = 1 | 16;     // White Pawn bunkered

// Row 7
state.board[59] = 5;          // White King
state.board[60] = 3;          // White Bishop
state.board[61] = 4;          // White Rook

state.deadPoolCounts.fill(0);
state.deadPoolCounts[5 | 8] = 1; // West Black King is dead

state.threatMap = generateFullThreatMap(state.board);
state.activePlayer = PlayerSeat.EAST;

console.log('=== TRACING Move 31 -> 30 ===');
const kingMove = (31 << 14) | (30 << 8);

// Step 1: Apply King 31 -> 30 (Ply 0, East turn)
const s1 = createInitialGameState();
s1.board.set(state.board);
s1.deadPoolCounts.set(state.deadPoolCounts);
s1.activePlayer = PlayerSeat.EAST;
s1.threatMap = generateFullThreatMap(s1.board);
applyAction(s1, kingMove);

console.log('After Ply 0 (East King 31->30):');
console.log('  Active Player:', PlayerSeat[s1.activePlayer]); // Should be SOUTH
console.log('  GameOver:', s1.isGameOver);
console.log('  Eval for East:', evaluateState(s1, PlayerSeat.EAST));

// Now South (Seat 2, Team A - Minimizing from East perspective) chooses Top-K moves
const southTopK = getTopKMoves(s1, PlayerSeat.SOUTH, 4);
console.log('\nSouth Top-K moves:');
for (const sm of southTopK) {
  const sf = (sm >>> 14) & 0x3F;
  const st = (sm >>> 8) & 0x3F;
  const sType = decType(sm);
  console.log(`  South Move: type=${ActionType[sType]} from=${sf} to=${st}`);

  // Step 2: Apply South move (Ply 1)
  const s2 = createInitialGameState();
  s2.board.set(s1.board);
  s2.deadPoolCounts.set(s1.deadPoolCounts);
  s2.activePlayer = PlayerSeat.SOUTH;
  s2.threatMap = generateFullThreatMap(s2.board);
  applyAction(s2, sm);

  console.log(`    After South move ${sf}->${st}:`);
  console.log(`      Active Player: ${PlayerSeat[s2.activePlayer]}, GameOver: ${s2.isGameOver}, Winner: ${s2.winnerTeam}`);
  console.log(`      Eval for East: ${evaluateState(s2, PlayerSeat.EAST)}`);

  // Now West (Seat 3, Team B - Maximizing from East perspective) chooses Top-K moves
  const westTopK = getTopKMoves(s2, PlayerSeat.WEST, 4);
  console.log(`      West Top-K moves count: ${westTopK.length}`);
  for (const wm of westTopK) {
    const wf = (wm >>> 14) & 0x3F;
    const wt = (wm >>> 8) & 0x3F;
    const wType = decType(wm);
    const pieceCode = wm & 0xFF;
    console.log(`        West Move: type=${ActionType[wType]} from=${wf} to=${wt} piece=${pieceCode}`);

    // Step 3: Apply West move (Ply 2)
    const s3 = createInitialGameState();
    s3.board.set(s2.board);
    s3.deadPoolCounts.set(s2.deadPoolCounts);
    s3.activePlayer = PlayerSeat.WEST;
    s3.threatMap = generateFullThreatMap(s3.board);
    applyAction(s3, wm);

    console.log(`          After West move: Active Player: ${PlayerSeat[s3.activePlayer]}, GameOver: ${s3.isGameOver}, Winner: ${s3.winnerTeam}`);
    console.log(`          Eval for East: ${evaluateState(s3, PlayerSeat.EAST)}`);

    // Now North (Seat 0, Team A - Minimizing from East perspective) chooses Top-K moves
    const northTopK = getTopKMoves(s3, PlayerSeat.NORTH, 4);
    console.log(`          North Top-K moves count: ${northTopK.length}`);
    for (const nm of northTopK) {
      const nf = (nm >>> 14) & 0x3F;
      const nt = (nm >>> 8) & 0x3F;
      const nType = decType(nm);
      const s4 = createInitialGameState();
      s4.board.set(s3.board);
      s4.deadPoolCounts.set(s3.deadPoolCounts);
      s4.activePlayer = PlayerSeat.NORTH;
      s4.threatMap = generateFullThreatMap(s4.board);
      applyAction(s4, nm);
      console.log(`            North move ${nf}->${nt}: GameOver=${s4.isGameOver}, Winner=${s4.winnerTeam}, Eval for East=${evaluateState(s4, PlayerSeat.EAST)}`);
    }
  }
}
