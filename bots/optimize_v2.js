const fs = require('fs');
const path = require('path');
const { runSimulation } = require('./simulator.js');

const BOT_PATH = './bots/v2_minimax/bot.js';
const WEIGHTS_FILE = './bots/v2_minimax/weights.json';
const botModule = require(BOT_PATH);

// Helper to get weights
function getWeights() {
  const defaultP = [
    1.0, 3.0, 3.5, 5.0, 20.0,
    0.5, 0.2, 0.1, 8.0,
    0.2, 10.0, 2.0, 0.5
  ];
  try {
    if (fs.existsSync(WEIGHTS_FILE)) {
      return JSON.parse(fs.readFileSync(WEIGHTS_FILE, 'utf8'));
    }
  } catch(e) {}
  return [...defaultP];
}

let bestP = getWeights();

function mutate(pArray) {
  const mutated = [...pArray];
  // Mutate 1 to 3 parameters randomly
  const numMutations = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < numMutations; i++) {
    const idx = Math.floor(Math.random() * mutated.length);
    // Perturb by +/- 10% to 30%
    const factor = 0.7 + (Math.random() * 0.6); // 0.7 to 1.3
    let val = mutated[idx] * factor;
    
    // Add additive noise to allow zeros to grow
    if (Math.random() > 0.5) {
      val += (Math.random() * 2 - 1) * 0.5;
    }
    
    // Keep weights positive
    if (val < 0) val = 0;
    
    mutated[idx] = parseFloat(val.toFixed(2));
  }
  return mutated;
}

let generation = 1;
const maxGenerations = 3; // Run 3 generations of optimization

console.log("Starting v2_minimax optimizer...");
console.log("Current best P:", bestP);

// Temporarily suppress console.log to keep optimization output clean
const originalConsoleLog = console.log;

function runGeneration() {
  if (generation > maxGenerations) {
    originalConsoleLog("\nOptimization complete!");
    process.exit(0);
  }
  originalConsoleLog(`\n--- Generation ${generation} / ${maxGenerations} ---`);
  
  // Generate a mutant
  const testP = mutate(bestP);
  originalConsoleLog("Testing mutant P:", testP);
  
  // Play matches (Team A = best, Team B = mutant)
  const numGames = 4; // 4 matches to reduce variance
  
  // Suppress output
  console.log = () => {};
  const results = runSimulation(numGames, bestP, testP, botModule, botModule);
  console.log = originalConsoleLog;
  
  let mutantScore = results.winsB;
  let bestScore = results.winsA;
  
  originalConsoleLog(`Results -> Best: ${bestScore} | Mutant: ${mutantScore} | Draws: ${results.draws}`);
  
  if (mutantScore > bestScore) {
    originalConsoleLog(">>> Mutant WON! Updating best weights.");
    bestP = testP;
    fs.writeFileSync(WEIGHTS_FILE, JSON.stringify(bestP, null, 2));
  } else {
    originalConsoleLog("<<< Mutant failed to beat the current best.");
  }
  
  generation++;
  
  // Run next generation (use setImmediate to not overflow stack)
  setImmediate(runGeneration);
}

runGeneration();
