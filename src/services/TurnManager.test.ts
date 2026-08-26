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
    expect(mockOverlays.showGameOver).toHaveBeenCalledWith('A', expect.any(Object), undefined, null, null, 'available');

    vi.useRealTimers();
  });

  it('should immediately show game over popup when showGameOverMenu is called', () => {
    const store = new GameStore();
    const mockOverlays: any = {
      showGameOver: vi.fn(),
      hideAll: vi.fn()
    };

    const tm = new TurnManager(store, mockOverlays);
    const state = store.getState();
    state.isGameOver = true;
    state.winnerTeam = 'B';

    tm.showGameOverMenu();
    expect(mockOverlays.showGameOver).toHaveBeenCalledWith('B', expect.any(Object), undefined, null, null, 'available');
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

  it('should handle 2-stage combat delay: turnriver delay followed by post-combat resolution', () => {
    vi.useFakeTimers();
    const store = new GameStore();
    const mockOverlays: any = {
      showGameOver: vi.fn(),
      hideAll: vi.fn()
    };

    const tm = new TurnManager(store, mockOverlays);
    const state = store.getState();
    state.setupState.inSetup = false;
    state.activePlayer = PlayerSeat.NORTH;

    // Set up attack move from 8 to 16
    state.board[8] = 1; // North pawn
    state.board[16] = 2; // East pawn

    tm.dispatchAction({ type: 'MOVE', input1: 8, input2: 16 }, { deferPostCombat: true });

    // Stage 1: Combat initiated, phase is COMBAT_DELAY, Turn/River is closed
    expect(tm.phase).toBe(TurnPhase.COMBAT_DELAY);
    expect(store.isCombatDelaying).toBe(true);
    expect(store.getState().isTurnRiverRevealed).toBe(false);

    // Fast forward through TURN_RIVER_DELAY_MS (1200ms)
    vi.advanceTimersByTime(1250);

    // Stage 2: Turn/River revealed, combat resolved, but still delaying post-combat
    expect(store.getState().isTurnRiverRevealed).toBe(true);
    expect(store.isCombatDelaying).toBe(true);

    // Fast forward through POST_COMBAT_DELAY_MS (2800ms)
    vi.advanceTimersByTime(2900);

    // Stage 3: Post-combat complete, turn advanced, Turn/River face-down for next turn
    expect(store.isCombatDelaying).toBe(false);
    expect(store.getState().pendingCombat).toBeNull();
    expect(store.getState().isTurnRiverRevealed).toBe(false);

    vi.useRealTimers();
  });

  it('should cancel all timers and not start turn clock when not in match (e.g. lobby)', () => {
    const store = new GameStore();
    const mockOverlays: any = {
      showGameOver: vi.fn(),
      hideAll: vi.fn()
    };

    const tm = new TurnManager(store, mockOverlays);
    expect(store.isInMatch()).toBe(false);

    tm.syncTurn(store.getState());
    // Turn deadline should remain null because game is idle in lobby
    expect(store.turnEndsAt).toBeNull();
  });
});
