import { describe, expect, it } from 'vitest';
import { generateLobbyName, LOBBY_WORDS } from './lobbyNames';

describe('Lobby Names Generator', () => {
  it('should have a single long list with over 100 elements', () => {
    expect(Array.isArray(LOBBY_WORDS)).toBe(true);
    expect(LOBBY_WORDS.length).toBeGreaterThanOrEqual(100);
  });

  it('should include specified keywords in the single list', () => {
    // Colors
    expect(LOBBY_WORDS).toContain('red');
    // Materials
    expect(LOBBY_WORDS).toContain('metal');
    expect(LOBBY_WORDS).toContain('stone');
    expect(LOBBY_WORDS).toContain('cotton');
    // Fruits
    expect(LOBBY_WORDS).toContain('banana');
    // Animals & weird/cute creatures
    expect(LOBBY_WORDS).toContain('wolf');
    expect(LOBBY_WORDS).toContain('capybara');
    expect(LOBBY_WORDS).toContain('piranha');
    expect(LOBBY_WORDS).toContain('cat');
    expect(LOBBY_WORDS).toContain('mouse');
    expect(LOBBY_WORDS).toContain('mice');
    expect(LOBBY_WORDS).toContain('worm');
    expect(LOBBY_WORDS).toContain('bird');
    expect(LOBBY_WORDS).toContain('toucan');
    expect(LOBBY_WORDS).toContain('axolotl');
    expect(LOBBY_WORDS).toContain('penguin');
    expect(LOBBY_WORDS).toContain('platypus');
    // Sun, moon, wind
    expect(LOBBY_WORDS).toContain('sun');
    expect(LOBBY_WORDS).toContain('moon');
    expect(LOBBY_WORDS).toContain('wind');
  });

  it('should generate lobby names combining 2 words and a number from 1 to 100', () => {
    for (let i = 0; i < 50; i++) {
      const name = generateLobbyName();
      expect(typeof name).toBe('string');
      expect(name).toMatch(/^[a-z]+[0-9]+$/);

      // Extract number at the end
      const match = name.match(/(\d+)$/);
      expect(match).not.toBeNull();
      const num = parseInt(match![1], 10);
      expect(num).toBeGreaterThanOrEqual(1);
      expect(num).toBeLessThanOrEqual(100);
    }
  });

  it('should allow the same word twice when generating names', () => {
    const singleWordList = ['cotton'];
    const name = generateLobbyName(singleWordList, 44, 44);
    expect(name).toBe('cottoncotton44');
  });

  it('should work with custom word list and custom number range', () => {
    const customWords = ['banana', 'red'];
    const name = generateLobbyName(customWords, 65, 65);
    expect(['bananared65', 'redbanana65', 'bananabanana65', 'redred65']).toContain(name);
  });
});
