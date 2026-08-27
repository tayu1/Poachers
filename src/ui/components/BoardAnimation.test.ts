import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameStore } from '../../store/store';
import { BoardUI } from './BoardUI';
import { PlayerSeat, Pc } from '../../core/types';

class MockElement {
  public tagName: string;
  public className: string = '';
  public classList: {
    add: (cls: string) => void;
    remove: (cls: string) => void;
    contains: (cls: string) => boolean;
  };
  public children: MockElement[] = [];
  public childNodes: MockElement[] = [];
  public parentElement: MockElement | null = null;
  public dataset: Record<string, string> = {};
  public style: Record<string, string> = {};
  public isConnected: boolean = true;
  public src: string = '';
  public alt: string = '';
  public title: string = '';
  public innerHTML: string = '';
  public attributes: Record<string, string> = {};
  private listeners: Record<string, ((e: any) => void)[]> = {};

  constructor(tagName: string) {
    this.tagName = tagName;
    const classes = new Set<string>();
    this.classList = {
      add: (cls: string) => {
        classes.add(cls);
        this.className = Array.from(classes).join(' ');
      },
      remove: (cls: string) => {
        classes.delete(cls);
        this.className = Array.from(classes).join(' ');
      },
      contains: (cls: string) => classes.has(cls)
    };
  }

  public appendChild(child: MockElement): MockElement {
    this.children.push(child);
    this.childNodes.push(child);
    child.parentElement = this;
    return child;
  }

  public removeChild(child: MockElement): MockElement {
    this.children = this.children.filter(c => c !== child);
    this.childNodes = this.childNodes.filter(c => c !== child);
    child.parentElement = null;
    return child;
  }

  public remove(): void {
    if (this.parentElement) {
      this.parentElement.removeChild(this);
    }
  }

  public contains(child: MockElement): boolean {
    if (child === this) return true;
    return this.children.some(c => c.contains(child));
  }

  public setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
    if (name === 'class') {
      this.className = value;
    }
  }

  public getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  public addEventListener(type: string, listener: (e: any) => void): void {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(listener);
  }

  public removeEventListener(type: string, listener: (e: any) => void): void {
    if (this.listeners[type]) {
      this.listeners[type] = this.listeners[type].filter(l => l !== listener);
    }
  }

  public querySelector(selector: string): MockElement | null {
    const isClass = selector.startsWith('.');
    const targetClass = isClass ? selector.slice(1).split(',')[0].trim() : '';
    for (const child of this.children) {
      if (isClass && child.className.includes(targetClass)) {
        return child;
      }
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  }

  public querySelectorAll(selector: string): MockElement[] {
    const results: MockElement[] = [];
    const isClass = selector.startsWith('.');
    const targetClass = isClass ? selector.slice(1).trim() : '';
    for (const child of this.children) {
      if (isClass && child.className.includes(targetClass)) {
        results.push(child);
      }
      results.push(...child.querySelectorAll(selector));
    }
    return results;
  }

  public closest(selector: string): MockElement | null {
    const isClass = selector.startsWith('.');
    const targetClass = isClass ? selector.slice(1).trim() : '';
    let current: MockElement | null = this;
    while (current) {
      if (isClass && current.className.includes(targetClass)) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  public get lastChild(): MockElement | null {
    return this.childNodes[this.childNodes.length - 1] || null;
  }

  public get offsetWidth(): number {
    return 54;
  }
}

describe('BoardUI Move and Combat Animations', () => {
  let container: MockElement;
  let store: GameStore;
  let boardUI: BoardUI;

  beforeEach(() => {
    container = new MockElement('div');
    const mockDocument = {
      createElement: (tag: string) => new MockElement(tag),
      createElementNS: (_ns: string, tag: string) => new MockElement(tag),
      body: new MockElement('body'),
      elementFromPoint: () => null
    };

    vi.stubGlobal('document', mockDocument);
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    });
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });

    store = new GameStore();
    boardUI = new BoardUI(container as any, () => {}, () => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('animates the moved piece on a normal non-attack move', () => {
    const state = store.getState();
    state.setupState.inSetup = false;
    state.turnCount = 2;
    state.board[11] = 0;
    state.board[19] = Pc.A_PAWN; // Pawn moved from 11 to 19
    state.lastMove = { fromIndex: 11, toIndex: 19, type: 'move', moveId: 'm1' };
    state.pendingCombat = null;

    boardUI.render(state, store);

    const squares = container.querySelectorAll('.sq');
    const img19 = squares[19]?.children.find(c => c.tagName === 'img');
    expect(img19).toBeTruthy();
    expect(img19?.style.display).toBe('block');
    // Transition was applied
    expect(img19?.style.transition).toContain('transform');
  });

  it('does NOT animate defender during pending unresolved combat and renders arrow immediately', () => {
    const state = store.getState();
    state.setupState.inSetup = false;
    state.turnCount = 2;
    // North Knight at 10 attacks East Pawn at 18
    state.board[10] = Pc.A_KNIGHT; // Attacker at fromIndex
    state.board[18] = Pc.B_PAWN; // Defender at toIndex
    state.lastMove = { fromIndex: 10, toIndex: 18, type: 'move', moveId: 'm1' };
    state.pendingCombat = {
      attackerSeat: PlayerSeat.NORTH,
      defenderSeat: PlayerSeat.EAST,
      attackerPosIndex: 10,
      defenderPosIndex: 18,
      attackerHand: {} as any,
      defenderHand: {} as any,
      winnerSeat: null,
      capturedPiece: Pc.B_PAWN
    };
    state.isTurnRiverRevealed = false;

    boardUI.render(state, store);

    const squares = container.querySelectorAll('.sq');
    // Defender piece at 18 should NOT have a transition animation
    const img18 = squares[18]?.children.find(c => c.tagName === 'img');
    expect(img18).toBeTruthy();
    expect(img18?.style.transition).not.toContain('transform');

    // Attacker piece at 10 should also NOT have a transition animation
    const img10 = squares[10]?.children.find(c => c.tagName === 'img');
    expect(img10).toBeTruthy();
    expect(img10?.style.transition).not.toContain('transform');

    // Attack arrow is rendered immediately
    const arrow = container.querySelector('.last-move-arrow');
    expect(arrow).toBeTruthy();
  });

  it('animates attacker into target square when combat resolves with capture', () => {
    const state = store.getState();
    state.setupState.inSetup = false;
    state.turnCount = 2;

    // 1. Initial pending combat
    state.board[10] = Pc.A_KNIGHT;
    state.board[18] = Pc.B_PAWN;
    state.lastMove = { fromIndex: 10, toIndex: 18, type: 'move', moveId: 'm1' };
    state.pendingCombat = {
      attackerSeat: PlayerSeat.NORTH,
      defenderSeat: PlayerSeat.EAST,
      attackerPosIndex: 10,
      defenderPosIndex: 18,
      attackerHand: {} as any,
      defenderHand: {} as any,
      winnerSeat: null,
      capturedPiece: Pc.B_PAWN
    };
    state.isTurnRiverRevealed = false;
    boardUI.render(state, store);

    // 2. Combat resolves: attacker wins -> Knight moves to 18, fromIndex 10 is 0
    state.board[10] = 0;
    state.board[18] = Pc.A_KNIGHT;
    state.lastMove = { fromIndex: 10, toIndex: 18, type: 'capture', moveId: 'm2' };
    state.pendingCombat = {
      attackerSeat: PlayerSeat.NORTH,
      defenderSeat: PlayerSeat.EAST,
      attackerPosIndex: 10,
      defenderPosIndex: 18,
      attackerHand: {} as any,
      defenderHand: {} as any,
      winnerSeat: PlayerSeat.NORTH,
      capturedPiece: Pc.B_PAWN
    };
    state.isTurnRiverRevealed = true;

    boardUI.render(state, store);

    const squares = container.querySelectorAll('.sq');
    const img18 = squares[18]?.children.find(c => c.tagName === 'img' && !c.className.includes('ghost'));
    expect(img18).toBeTruthy();
    expect(img18?.style.transition).toContain('transform');

    // Defender ghost was rendered on square 18
    const ghost = squares[18]?.children.find(c => c.className.includes('captured-piece-ghost'));
    expect(ghost).toBeTruthy();
  });

  it('renders failed attack arrow without phantom slide when attack fails', () => {
    const state = store.getState();
    state.setupState.inSetup = false;
    state.turnCount = 2;

    // Attacker remained at 10, defender remained at 18
    state.board[10] = Pc.A_KNIGHT;
    state.board[18] = Pc.B_PAWN;
    state.lastMove = { fromIndex: 10, toIndex: 18, type: 'failed_attack', moveId: 'm2' };
    state.pendingCombat = {
      attackerSeat: PlayerSeat.NORTH,
      defenderSeat: PlayerSeat.EAST,
      attackerPosIndex: 10,
      defenderPosIndex: 18,
      attackerHand: {} as any,
      defenderHand: {} as any,
      winnerSeat: PlayerSeat.EAST,
      capturedPiece: Pc.B_PAWN
    };
    state.isTurnRiverRevealed = true;

    boardUI.render(state, store);

    const squares = container.querySelectorAll('.sq');
    const img18 = squares[18]?.children.find(c => c.tagName === 'img');
    expect(img18?.style.transition).not.toContain('transform');
    const img10 = squares[10]?.children.find(c => c.tagName === 'img');
    expect(img10?.style.transition).not.toContain('transform');

    // Failed attack arrow rendered
    const line = container.querySelector('.failed-attack-line');
    expect(line).toBeTruthy();
  });

  it('animates sliding piece to destIndex on failed attack when destIndex !== fromIndex', () => {
    const state = store.getState();
    state.setupState.inSetup = false;
    state.turnCount = 2;

    // Rook at 2 attacks 50, but fails and stops at 42 (destIndex)
    state.board[2] = 0;
    state.board[42] = Pc.A_ROOK; // Attacker at destIndex
    state.board[50] = Pc.B_PAWN; // Defender still at toIndex
    state.lastMove = { fromIndex: 2, toIndex: 50, destIndex: 42, type: 'failed_attack', moveId: 'm2' };
    state.pendingCombat = {
      attackerSeat: PlayerSeat.NORTH,
      defenderSeat: PlayerSeat.EAST,
      attackerPosIndex: 2,
      defenderPosIndex: 50,
      attackerHand: {} as any,
      defenderHand: {} as any,
      winnerSeat: PlayerSeat.EAST,
      capturedPiece: Pc.B_PAWN
    };
    state.isTurnRiverRevealed = true;

    boardUI.render(state, store);

    const squares = container.querySelectorAll('.sq');
    const img42 = squares[42]?.children.find(c => c.tagName === 'img');
    expect(img42).toBeTruthy();
    expect(img42?.style.transition).toContain('transform');
  });

  it('does NOT animate when replaying history', () => {
    const state = store.getState();
    store.isReplaying = true;
    state.setupState.inSetup = false;
    state.turnCount = 2;
    state.board[11] = 0;
    state.board[19] = Pc.A_PAWN;
    state.lastMove = { fromIndex: 11, toIndex: 19, type: 'move', moveId: 'm1' };

    boardUI.render(state, store);

    const squares = container.querySelectorAll('.sq');
    const img19 = squares[19]?.children.find(c => c.tagName === 'img');
    expect(img19?.style.transition).not.toContain('transform');
  });

  it('does NOT animate a normal move when executed via drag mode and lands immediately in place', () => {
    const state = store.getState();
    state.setupState.inSetup = false;
    state.turnCount = 2;
    state.activePlayer = PlayerSeat.NORTH;
    state.board[11] = Pc.A_PAWN;

    boardUI.render(state, store);

    // Simulate drag and drop from square 11 to square 19
    const targetSq = (boardUI as any).squareElements[19];
    (document as any).elementFromPoint = vi.fn(() => targetSq);

    (boardUI as any).handlePointerDown({ isPrimary: true, button: 0, pointerId: 1, clientX: 100, clientY: 100 }, 11);
    (boardUI as any).onWindowPointerMove({ pointerId: 1, clientX: 120, clientY: 120, preventDefault: vi.fn() });
    (boardUI as any).onWindowPointerUp({ pointerId: 1, clientX: 120, clientY: 120 });

    // Normal move state update after drop
    state.board[11] = 0;
    state.board[19] = Pc.A_PAWN;
    state.lastMove = { fromIndex: 11, toIndex: 19, type: 'move', moveId: 'm1' };
    state.pendingCombat = null;

    boardUI.render(state, store);

    const squares = container.querySelectorAll('.sq');
    const img19 = squares[19]?.children.find(c => c.tagName === 'img');
    expect(img19).toBeTruthy();
    expect(img19?.style.display).toBe('block');
    // Animation is disabled for normal move on drag mode
    expect(img19?.style.transition).not.toContain('transform');

    // Last move arrow is rendered immediately
    const arrow = container.querySelector('.last-move-arrow');
    expect(arrow).toBeTruthy();
  });

  it('still animates combat capture even when move was initiated via drag mode', () => {
    const state = store.getState();
    state.setupState.inSetup = false;
    state.turnCount = 2;
    state.activePlayer = PlayerSeat.NORTH;
    state.board[10] = Pc.A_KNIGHT;
    state.board[18] = Pc.B_PAWN;

    boardUI.render(state, store);

    // Simulate drag and drop from square 10 to square 18 (combat target)
    const targetSq18 = (boardUI as any).squareElements[18];
    (document as any).elementFromPoint = vi.fn(() => targetSq18);

    (boardUI as any).handlePointerDown({ isPrimary: true, button: 0, pointerId: 1, clientX: 100, clientY: 100 }, 10);
    (boardUI as any).onWindowPointerMove({ pointerId: 1, clientX: 120, clientY: 120, preventDefault: vi.fn() });
    (boardUI as any).onWindowPointerUp({ pointerId: 1, clientX: 120, clientY: 120 });

    // 1. Pending combat state
    state.lastMove = { fromIndex: 10, toIndex: 18, type: 'move', moveId: 'm1' };
    state.pendingCombat = {
      attackerSeat: PlayerSeat.NORTH,
      defenderSeat: PlayerSeat.EAST,
      attackerPosIndex: 10,
      defenderPosIndex: 18,
      attackerHand: {} as any,
      defenderHand: {} as any,
      winnerSeat: null,
      capturedPiece: Pc.B_PAWN
    };
    state.isTurnRiverRevealed = false;
    boardUI.render(state, store);

    // 2. Combat resolution: attacker wins
    state.board[10] = 0;
    state.board[18] = Pc.A_KNIGHT;
    state.lastMove = { fromIndex: 10, toIndex: 18, type: 'capture', moveId: 'm2' };
    state.pendingCombat = {
      attackerSeat: PlayerSeat.NORTH,
      defenderSeat: PlayerSeat.EAST,
      attackerPosIndex: 10,
      defenderPosIndex: 18,
      attackerHand: {} as any,
      defenderHand: {} as any,
      winnerSeat: PlayerSeat.NORTH,
      capturedPiece: Pc.B_PAWN
    };
    state.isTurnRiverRevealed = true;

    boardUI.render(state, store);

    const squares = container.querySelectorAll('.sq');
    const img18 = squares[18]?.children.find(c => c.tagName === 'img' && !c.className.includes('ghost'));
    expect(img18).toBeTruthy();
    // Combat animation remains enabled
    expect(img18?.style.transition).toContain('transform');

    // Defender ghost displayed
    const ghost = squares[18]?.children.find(c => c.className.includes('captured-piece-ghost'));
    expect(ghost).toBeTruthy();
  });

  it('does NOT re-animate the last move when returning to live mode from replay', () => {
    const state = store.getState();
    state.setupState.inSetup = false;
    state.turnCount = 2;
    state.activePlayer = PlayerSeat.NORTH;
    state.board[11] = 0;
    state.board[19] = Pc.A_PAWN;
    state.lastMove = { fromIndex: 11, toIndex: 19, type: 'move', moveId: 'm1' };

    // 1. Initial live render (animates once)
    store.isReplaying = false;
    boardUI.render(state, store);

    // 2. Scrub back in history
    store.isReplaying = true;
    boardUI.render(state, store);

    // 3. Return to live mode
    store.isReplaying = false;
    boardUI.render(state, store);

    const squares = container.querySelectorAll('.sq');
    const img19 = squares[19]?.children.find(c => c.tagName === 'img');
    expect(img19).toBeTruthy();
    // It should NOT animate again upon return to live mode
    expect(img19?.style.transition).not.toContain('transform');
  });
});
