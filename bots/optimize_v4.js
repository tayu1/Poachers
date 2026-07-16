const fs = require('fs');
const path = require('path');
const { runSimulation } = require('./simulator.js');

const BOT_PATH = './bots/v4_networth/bot.js';
const WEIGHTS_FILE = './bots/v4_networth/weights.json';
const botModule = require(BOT_PATH);

// Helper to get weights
function getWeights() {
  const defaultP = [
    1.0, 3.0, 3.5, 5.0, 10000.0, 0.5
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
  // Mutate 1 to 2 parameters randomly (excluding King Value at index 4)
  const numMutations = 1 + Math.floor(Math.random() * 2);
  for (let i = 0; i < numMutations; i++) {
    let idx = Math.floor(Math.random() * mutated.length);
    if (idx === 4) {
      // Don't mutate King value, or pick another one
      idx = (idx + 1) % mutated.length;
      if (idx === 4) idx = 0;
    }
    
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
const maxGenerations = 10;

console.log("Starting v4_networth optimizer...");
console.log("Current best P:", bestP);

const originalConsoleLog = console.log;

function runGeneration() {
  if (generation > maxGenerations) {
    originalConsoleLog("\nOptimization complete!");
    process.exit(0);
  }
  originalConsoleLog(`\n--- Generation ${generation} / ${maxGenerations} ---`);
  
  const testP = mutate(bestP);
  originalConsoleLog("Testing mutant P:", testP);
  
  const numGames = 4;
  
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
  setImmediate(runGeneration);
}

runGeneration();
