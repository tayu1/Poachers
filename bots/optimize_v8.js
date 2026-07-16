const fs = require('fs');
const path = require('path');
const { runSimulation } = require('./simulator.js');

const BOT_V8_PATH = './bots/v8_networth/bot.js';
const WEIGHTS_V8_FILE = './bots/v8_networth/weights.json';
const botV8 = require(BOT_V8_PATH);

const BOT_V7_PATH = './bots/v7_networth/bot.js';
const WEIGHTS_V7_FILE = './bots/v7_networth/weights.json';
const botV7 = require(BOT_V7_PATH);

function getWeights() {
  const defaultP = [
    0.8, 3.38, 7.45, 3.26, 13.02, 0, 0.62, 0.61, 1.83, 0.2, 7.99, 1.17, 0.41
  ];
  try {
    if (fs.existsSync(WEIGHTS_V8_FILE)) {
      return JSON.parse(fs.readFileSync(WEIGHTS_V8_FILE, 'utf8'));
    }
  } catch(e) {}
  return [...defaultP];
}

function getV7Weights() {
  try {
    if (fs.existsSync(WEIGHTS_V7_FILE)) {
      return JSON.parse(fs.readFileSync(WEIGHTS_V7_FILE, 'utf8'));
    }
  } catch(e) {}
  return [1.68, 3.57, 6.19, 3.04, 13.02, 5.46, 0.3, 1.74, 2.37, 0.48, 6.71, 0.47, 0.59];
}

let bestP = getWeights();
const v7Weights = getV7Weights();

// Cache for Best vs V7 score
let cacheBestVsV7 = null;
const gamesPerSide = 1;

const originalConsoleLog = console.log;

function getBestVsV7Score() {
  if (cacheBestVsV7 === null) {
    originalConsoleLog("Evaluating baseline Best vs V7...");
    console.log = () => {};
    const r1 = runSimulation(gamesPerSide, bestP, v7Weights, botV8, botV7);
    const r2 = runSimulation(gamesPerSide, v7Weights, bestP, botV7, botV8);
    console.log = originalConsoleLog;
    cacheBestVsV7 = r1.winsA + r2.winsB;
  }
  return cacheBestVsV7;
}

function mutate(pArray) {
  const mutated = [...pArray];
  const numMutations = 1;
  for (let i = 0; i < numMutations; i++) {
    let idx = Math.floor(Math.random() * mutated.length);
    // Don't mutate King value (index 4)
    if (idx === 4) {
      idx = (idx + 1) % mutated.length;
      if (idx === 4) idx = 0;
    }

    const factor = 0.7 + (Math.random() * 0.6); // 0.7 to 1.3
    let val = mutated[idx] * factor;

    if (Math.random() > 0.5) {
      val += (Math.random() * 2 - 1) * 0.5;
    }

    if (val < 0) val = 0;

    mutated[idx] = parseFloat(val.toFixed(2));
  }
  return mutated;
}

let generation = 1;
const maxGenerations = 100;

console.log("Starting v8_networth optimizer (VS itself & VS v7) - Speed Optimized...");
console.log("Current best P:", bestP);
console.log("V7 weights:", v7Weights);

function runGeneration() {
  if (generation > maxGenerations) {
    originalConsoleLog("\nOptimization complete!");
    originalConsoleLog("Final best weights:", bestP);
    process.exit(0);
  }
  originalConsoleLog(`\n--- Generation ${generation} / ${maxGenerations} ---`);

  const testP = mutate(bestP);
  originalConsoleLog("Testing mutant P:", testP);

  console.log = () => {};
  
  // --- Round 1: Mutant vs Best (V8 vs V8) ---
  const resultsSelf1 = runSimulation(gamesPerSide, bestP, testP, botV8, botV8);
  const resultsSelf2 = runSimulation(gamesPerSide, testP, bestP, botV8, botV8);

  // --- Round 2: Mutant vs V7 ---
  const resultsV7Mutant1 = runSimulation(gamesPerSide, testP, v7Weights, botV8, botV7);
  const resultsV7Mutant2 = runSimulation(gamesPerSide, v7Weights, testP, botV7, botV8);

  // --- Round 3: Best vs V7 (from Cache) ---
  const bestVsV7 = getBestVsV7Score();

  console.log = originalConsoleLog;

  // Calculate scores
  let mutantVsSelf = resultsSelf1.winsB + resultsSelf2.winsA;
  let bestVsMutant = resultsSelf1.winsA + resultsSelf2.winsB;

  let mutantVsV7 = resultsV7Mutant1.winsA + resultsV7Mutant2.winsB;

  let totalMutant = mutantVsSelf + mutantVsV7;
  let totalBest = bestVsMutant + bestVsV7;

  originalConsoleLog(`Self  -> Best: ${bestVsMutant} | Mutant: ${mutantVsSelf}`);
  originalConsoleLog(`Vs V7 -> Best: ${bestVsV7} | Mutant: ${mutantVsV7}`);
  originalConsoleLog(`Total -> Best: ${totalBest} | Mutant: ${totalMutant}`);

  if (totalMutant > totalBest) {
    originalConsoleLog(">>> Mutant WON! Updating best weights.");
    bestP = testP;
    fs.writeFileSync(WEIGHTS_V8_FILE, JSON.stringify(bestP, null, 2));
    cacheBestVsV7 = mutantVsV7; // Update cache with the winning mutant's score
  } else {
    originalConsoleLog("<<< Mutant failed to beat the current best.");
  }

  generation++;
  setImmediate(runGeneration);
}

runGeneration();
