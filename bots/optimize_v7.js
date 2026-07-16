const fs = require('fs');
const path = require('path');
const { runSimulation } = require('./simulator.js');

const BOT_PATH = './bots/v7_networth/bot.js';
const WEIGHTS_FILE = './bots/v7_networth/weights.json';
const botModule = require(BOT_PATH);

function getWeights() {
  const defaultP = [
    0.8, 3.38, 7.45, 3.26, 13.02, 0, 0.62, 0.61, 1.83, 0.2, 7.99, 1.17, 0.41
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

console.log("Starting v7_networth optimizer...");
console.log("Current best P:", bestP);

const originalConsoleLog = console.log;

function runGeneration() {
  if (generation > maxGenerations) {
    originalConsoleLog("\nOptimization complete!");
    originalConsoleLog("Final best weights:", bestP);
    process.exit(0);
  }
  originalConsoleLog(`\n--- Generation ${generation} / ${maxGenerations} ---`);

  const testP = mutate(bestP);
  originalConsoleLog("Testing mutant P:", testP);

  const gamesPerSide = 2;

  console.log = () => {};
  // Run 1: Best is Team A, Mutant is Team B
  const results1 = runSimulation(gamesPerSide, bestP, testP, botModule, botModule);
  // Run 2: Mutant is Team A, Best is Team B
  const results2 = runSimulation(gamesPerSide, testP, bestP, botModule, botModule);
  console.log = originalConsoleLog;

  let mutantScore = results1.winsB + results2.winsA;
  let bestScore = results1.winsA + results2.winsB;
  let totalDraws = results1.draws + results2.draws;

  originalConsoleLog(`Results -> Best: ${bestScore} | Mutant: ${mutantScore} | Draws: ${totalDraws}`);

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
