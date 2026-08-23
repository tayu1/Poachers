import { describe, it, expect, vi } from 'vitest';
import { GameStore } from '../store/store';
import { TurnManager } from './TurnManager';
import { PlayerSeat, TurnPhase } from '../core/types';

describe('TurnManager State Machine', () => {
  it('should initialize with TurnPhase.IDLE', () => {
    const store = new GameStore();
    const mockOverlays: any = {
      showGameOver: vi.fn(),
      hideAll: vi.fn()
    };

    const tm = new TurnManager(store, mockOverlays);
    expect(tm.phase).toBe(TurnPhase.IDLE);
  });

  it('should transition through turns and handle reset', () => {
    const store = new GameStore();
    const mockOverlays: any = {
      showGameOver: vi.fn(),
      hideAll: vi.fn()
    };

    const tm = new TurnManager(store, mockOverlays);
    store.startBotFastMatch();
    tm.syncTurn(store.getState());

    // Bot fast match sets up all 4 bots and advances through initial draft
    expect(store.getState().setupState.inSetup).toBe(false);
    expect(store.botSeats[PlayerSeat.NORTH]).toBe(true);
    expect(store.botSeats[PlayerSeat.EAST]).toBe(true);

    tm.cancelAllTimers();
  });

  it('should handle game over state and invoke showGameOver on overlays', () => {
    vi.useFakeTimers();
    const store = new GameStore();
    const mockOverlays: any = {
      showGameOver: vi.fn(),
      hideAll: vi.fn()
    };

    const tm = new TurnManager(store, mockOverlays);
    const state = store.getState();
    state.isGameOver = true;
    state.winnerTeam = 'A';

    tm.syncTurn(state);
    expect(tm.phase).toBe(TurnPhase.GAME_OVER);

    // Fast-forward timeout
    vi.advanceTimersByTime(600);
    expect(mockOverlays.showGameOver).toHaveBeenCalledWith('A', expect.any(Object), undefined, null, null);

    vi.useRealTimers();
  });

  it('should apply winning glow to the board grid element and not the app element', () => {
    const store = new GameStore();
    const mockOverlays: any = {
      showGameOver: vi.fn(),
      hideAll: vi.fn()
    };

    const makeMockElement = () => {
      const classes = new Set<string>();
      return {
        classList: {
          add: (c: string) => classes.add(c),
          remove: (...cs: string[]) => cs.forEach(c => classes.delete(c)),
          contains: (c: string) => classes.has(c)
        }
      };
    };

    const appMock = makeMockElement();
    const boardMock = makeMockElement();

    const originalDocument = (globalThis as any).document;
    (globalThis as any).document = {
      getElementById: (id: string) => (id === 'app' ? appMock : null),
      querySelector: (selector: string) => (selector === '.board-grid' ? boardMock : null)
    };

    const tm = new TurnManager(store, mockOverlays);

    // Team A win
    tm.updateScreenGlow('A');
    expect(boardMock.classList.contains('winning-glow-team-a')).toBe(true);
    expect(boardMock.classList.contains('winning-glow-team-b')).toBe(false);
    expect(appMock.classList.contains('winning-glow-team-a')).toBe(false);

    // Team B win
    tm.updateScreenGlow('B');
    expect(boardMock.classList.contains('winning-glow-team-b')).toBe(true);
    expect(boardMock.classList.contains('winning-glow-team-a')).toBe(false);
    expect(appMock.classList.contains('winning-glow-team-b')).toBe(false);

    // Clear glow
    tm.updateScreenGlow(null);
    expect(boardMock.classList.contains('winning-glow-team-a')).toBe(false);
    expect(boardMock.classList.contains('winning-glow-team-b')).toBe(false);
    expect(appMock.classList.contains('winning-glow-team-a')).toBe(false);

    (globalThis as any).document = originalDocument;
  });
});
