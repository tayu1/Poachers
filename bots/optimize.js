const fs = require('fs');
const { runSimulation, defaultP } = require('./simulator.js');

const WEIGHTS_FILE = './bots/v1_basic/weights.json';
let bestP = [...defaultP];

if (fs.existsSync(WEIGHTS_FILE)) {
  try {
    const saved = JSON.parse(fs.readFileSync(WEIGHTS_FILE, 'utf8'));
    if (Array.isArray(saved) && saved.length === defaultP.length) {
      bestP = saved;
      console.log('Loaded best weights from disk.');
    }
  } catch(e) {
    console.error('Error loading weights, using defaults.', e);
  }
}

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

console.log("Starting optimizer...");
console.log("Current best P:", bestP);

// Temporarily suppress console.log to keep optimization output clean
const originalConsoleLog = console.log;

function runGeneration() {
  originalConsoleLog(`\n--- Generation ${generation} ---`);
  
  // Generate a mutant
  const testP = mutate(bestP);
  originalConsoleLog("Testing mutant P:", testP);
  
  // Play matches (Team A = best, Team B = mutant)
  const numGames = 4; // 4 matches to reduce variance
  
  // Suppress output
  console.log = () => {};
  const results = runSimulation(numGames, bestP, testP);
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
