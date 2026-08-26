/**
 * Lobby Name Word List & Generator
 * 
 * Generates fun, memorable lobby names from a single list of words:
 * colors, materials, adjectives, fruits, animals, birds, plants, elements,
 * and a random number 1-100.
 * Allows duplicate words (e.g. 'cottoncotton44', 'bananared65', 'wolfcotton100').
 */

export const LOBBY_WORDS = [
  // Colors
  'red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'black', 'white',
  'gold', 'silver', 'bronze', 'ruby', 'amber', 'emerald', 'sapphire', 'jade',
  'coral', 'azure', 'crimson', 'violet', 'indigo', 'teal', 'copper', 'scarlet',
  'topaz', 'cyan', 'ivory', 'magenta', 'lavender', 'rose',

  // Materials
  'metal', 'stone', 'cotton', 'wood', 'silk', 'iron', 'glass', 'clay', 'steel',
  'marble', 'velvet', 'leather', 'paper', 'wool', 'canvas', 'obsidian', 'flint',
  'crystal', 'brick', 'granite', 'brass', 'diamond', 'porcelain', 'linen',

  // Adjectives
  'swift', 'brave', 'silent', 'wild', 'ancient', 'bright', 'dark', 'calm',
  'epic', 'shadow', 'solar', 'lunar', 'mystic', 'frost', 'storm', 'grand',
  'bold', 'fierce', 'quiet', 'rapid', 'royal', 'noble', 'clever', 'lucky',
  'keen', 'cozy', 'frosty', 'shining', 'golden', 'sharp', 'gentle',

  // Fruits
  'banana', 'apple', 'cherry', 'mango', 'peach', 'lemon', 'berry', 'melon',
  'plum', 'grape', 'lime', 'fig', 'pear', 'coconut', 'papaya', 'kiwi',
  'apricot', 'guava', 'olive',

  // Animals, weird/cute creatures & specific birds
  'wolf', 'tiger', 'eagle', 'bear', 'hawk', 'lion', 'fox', 'stag', 'owl',
  'viper', 'falcon', 'panther', 'badger', 'raven', 'cobra', 'otter', 'shark',
  'dragon', 'crane', 'lynx', 'bison', 'whale', 'seal', 'hare', 'elk', 'panda',
  'cheetah', 'koala', 'deer', 'capybara', 'piranha', 'axolotl', 'platypus',
  'wombat', 'hedgehog', 'sloth', 'ferret', 'chinchilla', 'lemur', 'gecko',
  'frog', 'toad', 'crab', 'squid', 'octopus', 'snail', 'hamster', 'alpaca',
  'quokka', 'beaver', 'moth', 'beetle', 'cat', 'mouse', 'mice', 'worm',
  'bird', 'toucan', 'penguin', 'flamingo', 'sparrow', 'pigeon', 'duck',
  'robin', 'finch',

  // Plants
  'pine', 'oak', 'lotus', 'fern', 'moss', 'ivy', 'cedar', 'leaf', 'birch',
  'willow', 'bamboo', 'cactus', 'clover', 'tulip', 'orchid', 'blossom',
  'thorn', 'reed', 'elm', 'maple', 'daisy', 'jasmine', 'flora',

  // Sun, Moon, Wind & Elements
  'sun', 'moon', 'wind', 'star', 'sky', 'cloud', 'rain', 'flame', 'dawn',
  'dusk', 'ocean', 'river', 'gale', 'breeze', 'comet', 'ember', 'thunder',
  'wave', 'tide', 'aurora', 'blaze', 'flare', 'fog', 'mist'
] as const;

/**
 * Generates a random lobby name by picking 2 words from the list (can be the same word)
 * and appending a random number from 1 to 100.
 *
 * @param words Optional custom word pool (defaults to LOBBY_WORDS)
 * @param minNum Minimum random number (default: 1)
 * @param maxNum Maximum random number (default: 100)
 * @returns A lowercase lobby name (e.g., 'bananared65', 'cottonwolf3', 'wolfwolf100')
 */
export function generateLobbyName(
  words: readonly string[] = LOBBY_WORDS,
  minNum: number = 1,
  maxNum: number = 100
): string {
  const pool = words && words.length > 0 ? words : LOBBY_WORDS;

  const word1 = pool[Math.floor(Math.random() * pool.length)];
  const word2 = pool[Math.floor(Math.random() * pool.length)];
  const num = Math.floor(Math.random() * (maxNum - minNum + 1)) + minNum;

  return `${word1}${word2}${num}`.toLowerCase();
}
