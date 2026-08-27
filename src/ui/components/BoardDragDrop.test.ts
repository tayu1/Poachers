import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GameStore } from '../../store/store';
import { TurnManager } from '../../services/TurnManager';
import { InputHandler } from '../../services/InputHandler';
import { BoardUI } from './BoardUI';
import { PlayerSeat } from '../../core/types';

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

  public contains(child: MockElement): boolean {
    if (child === this) return true;
    return this.children.some(c => c.contains(child));
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

  public get lastChild(): MockElement | null {
    return this.childNodes[this.childNodes.length - 1] || null;
  }
}

describe('Drag-and-Drop & Click Piece Movement', () => {
  let store: GameStore;
  let mockOverlays: any;
  let turnManager: TurnManager;
  let inputHandler: InputHandler;

  beforeEach(() => {
    const mockDocument = {
      createElement: (tag: string) => new MockElement(tag),
      createElementNS: (_ns: string, tag: string) => new MockElement(tag),
      getElementById: () => null,
      body: new MockElement('body'),
      elementFromPoint: () => null
    };

    vi.stubGlobal('document', mockDocument);
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    });

    store = new GameStore();
    mockOverlays = {
      showGameOver: vi.fn(),
      hideAll: vi.fn()
    };
    turnManager = new TurnManager(store, mockOverlays);
    inputHandler = new InputHandler(store, turnManager);
  });

  it('should successfully execute a legal move via handlePieceDrop', () => {
    const state = store.getState();
    state.setupState.inSetup = false;
    state.activePlayer = PlayerSeat.NORTH;

    // North Pawn at index 11 can legally move forward to 19
    const dispatchSpy = vi.spyOn(turnManager, 'dispatchAction');
    const result = inputHandler.handlePieceDrop(11, 19);

    expect(result).toBe(true);
    expect(dispatchSpy).toHaveBeenCalledWith(
      { type: 'MOVE', input1: 11, input2: 19 },
      { deferPostCombat: true }
    );
  });

  it('should reject an illegal move via handlePieceDrop', () => {
    const state = store.getState();
    state.setupState.inSetup = false;
    state.activePlayer = PlayerSeat.NORTH;

    const dispatchSpy = vi.spyOn(turnManager, 'dispatchAction');
    // North Pawn at 11 cannot jump sideways to 48
    const result = inputHandler.handlePieceDrop(11, 48);

    expect(result).toBe(false);
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('should reject drop onto the same square (fromIndex === toIndex)', () => {
    const state = store.getState();
    state.setupState.inSetup = false;
    state.activePlayer = PlayerSeat.NORTH;

    const dispatchSpy = vi.spyOn(turnManager, 'dispatchAction');
    const result = inputHandler.handlePieceDrop(11, 11);

    expect(result).toBe(false);
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('should reject drop if piece belongs to another player or is empty', () => {
    const state = store.getState();
    state.setupState.inSetup = false;
    state.activePlayer = PlayerSeat.NORTH; // North is active (Team A)

    const dispatchSpy = vi.spyOn(turnManager, 'dispatchAction');
    // Square 0 is empty square
    const result = inputHandler.handlePieceDrop(0, 8);

    expect(result).toBe(false);
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('should reject drop when game is over or during combat delay', () => {
    const state = store.getState();
    state.setupState.inSetup = false;
    state.activePlayer = PlayerSeat.NORTH;
    state.isGameOver = true;

    const dispatchSpy = vi.spyOn(turnManager, 'dispatchAction');
    const result = inputHandler.handlePieceDrop(11, 19);

    expect(result).toBe(false);
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('should continue to support traditional click-to-select and click-to-target', () => {
    const state = store.getState();
    state.setupState.inSetup = false;
    state.activePlayer = PlayerSeat.NORTH;

    // Step 1: Click piece at 11
    inputHandler.handleSquareClick(11);
    expect(store.selectedSquare).toBe(11);
    expect(store.legalMoves.length).toBeGreaterThan(0);

    // Step 2: Click legal destination 19
    const dispatchSpy = vi.spyOn(turnManager, 'dispatchAction');
    inputHandler.handleSquareClick(19);

    expect(dispatchSpy).toHaveBeenCalledWith(
      { type: 'MOVE', input1: 11, input2: 19 },
      { deferPostCombat: true }
    );
    expect(store.selectedSquare).toBeNull();
  });

  it('should initialize BoardUI with handlePieceDrop and handle drop callback', () => {
    const onDrop = vi.fn((from, to) => inputHandler.handlePieceDrop(from, to));
    const onClick = vi.fn((idx) => inputHandler.handleSquareClick(idx));

    const mockContainer: any = { innerHTML: '', appendChild: vi.fn(), contains: vi.fn(() => true) };
    const boardUI = new BoardUI(mockContainer, onClick, onDrop);

    // Trigger onPieceDrop callback directly
    (boardUI as any).onPieceDrop(11, 19);
    expect(onDrop).toHaveBeenCalledWith(11, 19);
  });

  it('should keep drag avatar upright (aligned with screen view) even when board is rotated 90deg', () => {
    const onDrop = vi.fn();
    const onClick = vi.fn();
    const mockContainer: any = { innerHTML: '', appendChild: vi.fn(), contains: vi.fn(() => true) };
    const boardUI = new BoardUI(mockContainer, onClick, onDrop);

    store.boardRotationAngle = 90;
    const state = store.getState();
    state.setupState.inSetup = false;
    state.activePlayer = PlayerSeat.NORTH;

    boardUI.render(state, store);

    // Simulate pointer down on controllable piece (11)
    (boardUI as any).handlePointerDown({ isPrimary: true, button: 0, pointerId: 1, clientX: 100, clientY: 100 }, 11);
    // Simulate pointer move beyond threshold
    (boardUI as any).onWindowPointerMove({ pointerId: 1, clientX: 120, clientY: 120, preventDefault: vi.fn() });

    const avatar = (boardUI as any).dragAvatar as HTMLImageElement;
    expect(avatar).not.toBeNull();
    expect(avatar.style.transform).toBe('translate(-50%, -50%)');
  });
});

