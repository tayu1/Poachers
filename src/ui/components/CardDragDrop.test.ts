import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameStore } from '../../store/store';
import { TurnManager } from '../../services/TurnManager';
import { InputHandler } from '../../services/InputHandler';
import { CardDragManager, CardRef } from './CardDragManager';
import { TrenchCardsUI, TRENCHContainers } from './TrenchCardsUI';
import { BaseDeckUI } from './BaseDeckUI';
import { PlayerSeat } from '../../core/types';

class MockElement {
  public tagName: string;
  private _className: string = '';
  private _classes: Set<string> = new Set();
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
  public innerHTML: string = '';
  public textContent: string = '';
  public title: string = '';
  private listeners: Record<string, ((e: any) => void)[]> = {};

  public get className(): string {
    return this._className;
  }

  public set className(value: string) {
    this._className = value;
    this._classes = new Set(value.split(/\s+/).filter(Boolean));
  }

  constructor(tagName: string) {
    this.tagName = tagName;
    this.classList = {
      add: (cls: string) => {
        this._classes.add(cls);
        this._className = Array.from(this._classes).join(' ');
      },
      remove: (cls: string) => {
        this._classes.delete(cls);
        this._className = Array.from(this._classes).join(' ');
      },
      contains: (cls: string) => this._classes.has(cls)
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

  public insertBefore(newChild: MockElement, _refChild: MockElement | null): MockElement {
    return this.appendChild(newChild);
  }

  public contains(child: MockElement): boolean {
    if (child === this) return true;
    return this.children.some(c => c.contains(child));
  }

  public hasChildNodes(): boolean {
    return this.children.length > 0;
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

  public trigger(type: string, event: any = {}): void {
    if (this.listeners[type]) {
      this.listeners[type].forEach(l => l(event));
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
    if (selector.startsWith('.')) {
      const cls = selector.slice(1).split(',')[0].trim();
      if (this.className.split(' ').includes(cls)) return this;
    }
    return this.parentElement ? this.parentElement.closest(selector) : null;
  }

  public getBoundingClientRect(): { left: number; top: number; width: number; height: number; right: number; bottom: number } {
    return { left: 50, top: 50, width: 42, height: 56, right: 92, bottom: 106 };
  }
}

describe('Card Drag-and-Drop Swapping', () => {
  let store: GameStore;
  let turnManager: TurnManager;
  let inputHandler: InputHandler;
  let cardDragManager: CardDragManager;
  let mockBody: MockElement;
  let windowListeners: Record<string, ((e: any) => void)[]> = {};
  let pointElementTarget: MockElement | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    windowListeners = {};
    mockBody = new MockElement('body');

    const mockDocument: any = {
      createElement: (tag: string) => new MockElement(tag),
      getElementById: () => null,
      body: mockBody,
      elementFromPoint: (_x: number, _y: number) => pointElementTarget
    };

    (global as any).document = mockDocument;
    (global as any).window = {
      addEventListener: (type: string, listener: any) => {
        if (!windowListeners[type]) windowListeners[type] = [];
        windowListeners[type].push(listener);
      },
      removeEventListener: (type: string, listener: any) => {
        if (windowListeners[type]) {
          windowListeners[type] = windowListeners[type].filter(l => l !== listener);
        }
      }
    };

    store = new GameStore();
    const mockOverlays: any = { showGameOver: vi.fn(), hideAll: vi.fn() };
    turnManager = new TurnManager(store, mockOverlays);
    inputHandler = new InputHandler(store, turnManager);
    cardDragManager = new CardDragManager(store, (from, to) =>
      inputHandler.handleCardDrop(from, to)
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('successfully swaps two Trench cards via handleCardDrop', () => {
    const state = store.getState();
    state.setupState.inSetup = false;
    state.activePlayer = PlayerSeat.NORTH;
    state.hasSwappedThisTurn = false;

    const dispatchSpy = vi.spyOn(turnManager, 'dispatchAction');

    const result = inputHandler.handleCardDrop(
      { type: 'trench', seat: PlayerSeat.NORTH, cardIndex: 0 },
      { type: 'trench', seat: PlayerSeat.NORTH, cardIndex: 1 }
    );

    expect(result).toBe(true);
    expect(dispatchSpy).toHaveBeenCalledWith({
      type: 'CARD_SWAP',
      input1: 0,
      input2: 1
    });
  });

  it('successfully swaps a Base deck card into a Trench card slot via handleCardDrop', () => {
    const state = store.getState();
    state.setupState.inSetup = false;
    state.activePlayer = PlayerSeat.NORTH;
    state.hasSwappedThisTurn = false;

    const dispatchSpy = vi.spyOn(turnManager, 'dispatchAction');

    // Base card index 0 -> slot 3 + 0 = 3
    const result = inputHandler.handleCardDrop(
      { type: 'base', cardIndex: 0 },
      { type: 'trench', seat: PlayerSeat.NORTH, cardIndex: 2 }
    );

    expect(result).toBe(true);
    expect(dispatchSpy).toHaveBeenCalledWith({
      type: 'CARD_SWAP',
      input1: 3,
      input2: 2
    });
  });

  it('rejects drag drops when the destination is not a Trench card', () => {
    const state = store.getState();
    state.setupState.inSetup = false;
    state.activePlayer = PlayerSeat.NORTH;
    state.hasSwappedThisTurn = false;

    const dispatchSpy = vi.spyOn(turnManager, 'dispatchAction');

    // Attempting to drop onto a base card (disallowed: per user spec, destinations are strictly trench)
    const result = inputHandler.handleCardDrop(
      { type: 'trench', seat: PlayerSeat.NORTH, cardIndex: 0 },
      { type: 'base', cardIndex: 1 }
    );

    expect(result).toBe(false);
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('rejects drag drop of trench card onto itself (same index and seat)', () => {
    const state = store.getState();
    state.setupState.inSetup = false;
    state.activePlayer = PlayerSeat.NORTH;
    state.hasSwappedThisTurn = false;

    const dispatchSpy = vi.spyOn(turnManager, 'dispatchAction');

    const result = inputHandler.handleCardDrop(
      { type: 'trench', seat: PlayerSeat.NORTH, cardIndex: 0 },
      { type: 'trench', seat: PlayerSeat.NORTH, cardIndex: 0 }
    );

    expect(result).toBe(false);
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('rejects drag drop targeting opponent trench cards', () => {
    const state = store.getState();
    state.setupState.inSetup = false;
    state.activePlayer = PlayerSeat.NORTH; // Active is North
    state.hasSwappedThisTurn = false;

    const dispatchSpy = vi.spyOn(turnManager, 'dispatchAction');

    // Drop targeting South's trench card
    const result = inputHandler.handleCardDrop(
      { type: 'base', cardIndex: 0 },
      { type: 'trench', seat: PlayerSeat.SOUTH, cardIndex: 0 }
    );

    expect(result).toBe(false);
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('rejects drag drop when card swap was already used this turn', () => {
    const state = store.getState();
    state.setupState.inSetup = false;
    state.activePlayer = PlayerSeat.NORTH;
    state.hasSwappedThisTurn = true; // Already swapped

    const dispatchSpy = vi.spyOn(turnManager, 'dispatchAction');

    const result = inputHandler.handleCardDrop(
      { type: 'base', cardIndex: 0 },
      { type: 'trench', seat: PlayerSeat.NORTH, cardIndex: 0 }
    );

    expect(result).toBe(false);
    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(cardDragManager.canDragCard({ type: 'base', cardIndex: 0 })).toBe(false);
  });

  it('rejects drag during bot turn or opponent turn in multiplayer', () => {
    const state = store.getState();
    state.setupState.inSetup = false;
    state.activePlayer = PlayerSeat.EAST;
    store.botSeats[PlayerSeat.EAST] = true;

    expect(cardDragManager.canDragCard({ type: 'trench', seat: PlayerSeat.EAST, cardIndex: 0 })).toBe(false);

    // Multiplayer opponent turn
    store.botSeats[PlayerSeat.EAST] = false;
    store.isMultiplayer = true;
    store.mySeats = [PlayerSeat.NORTH]; // Local is North, active is East

    expect(cardDragManager.canDragCard({ type: 'trench', seat: PlayerSeat.EAST, cardIndex: 0 })).toBe(false);
  });

  it('allows dragging base card to trench refill target slot during refill stage', () => {
    const state = store.getState();
    state.setupState.inSetup = false;
    state.activePlayer = PlayerSeat.NORTH;
    state.pendingRefills = [{ seat: PlayerSeat.NORTH, slot: 1 }];

    const dispatchSpy = vi.spyOn(turnManager, 'dispatchAction');

    const result = inputHandler.handleCardDrop(
      { type: 'base', cardIndex: 2 },
      { type: 'trench', seat: PlayerSeat.NORTH, cardIndex: 1 }
    );

    expect(result).toBe(true);
    expect(dispatchSpy).toHaveBeenCalledWith({
      type: 'REFILL_TRENCH',
      input1: 1,
      input2: 2
    });
  });

  it('preserves traditional click-to-swap when clicking without dragging (< 5px)', () => {
    const state = store.getState();
    state.setupState.inSetup = false;
    state.activePlayer = PlayerSeat.NORTH;
    state.hasSwappedThisTurn = false;

    // Click base card 0 -> selects base card 0
    inputHandler.handleBaseCardClick(0);
    expect(store.selectedBaseCardIndex).toBe(0);

    // Click trench card 1 -> completes swap
    const dispatchSpy = vi.spyOn(turnManager, 'dispatchAction');
    inputHandler.handleTrenchCardClick(PlayerSeat.NORTH, 1);

    expect(dispatchSpy).toHaveBeenCalledWith({
      type: 'CARD_SWAP',
      input1: 3,
      input2: 1
    });
    expect(store.selectedBaseCardIndex).toBeNull();
  });

  it('creates drag avatar, highlights target on pointermove, and settles on pointerup', () => {
    const state = store.getState();
    state.setupState.inSetup = false;
    state.activePlayer = PlayerSeat.NORTH;
    state.hasSwappedThisTurn = false;

    const srcCardEl = new MockElement('div');
    srcCardEl.className = 'trench-card card-team-a';
    srcCardEl.dataset.cardType = 'base';
    srcCardEl.dataset.cardIndex = '0';

    const targetCardEl = new MockElement('div');
    targetCardEl.className = 'trench-card card-team-a';
    targetCardEl.dataset.cardType = 'trench';
    targetCardEl.dataset.seat = '0'; // North
    targetCardEl.dataset.cardIndex = '1';

    // Start drag on source card
    cardDragManager.handlePointerDown(
      { button: 0, pointerId: 1, clientX: 100, clientY: 100 } as any,
      srcCardEl as any,
      { type: 'base', cardIndex: 0 }
    );

    // Move < 5px: should not be dragging yet
    windowListeners['pointermove']?.forEach(fn => fn({ pointerId: 1, clientX: 102, clientY: 102, preventDefault: vi.fn() }));
    expect(srcCardEl.classList.contains('drag-source')).toBe(false);

    // Move > 5px: drag begins
    windowListeners['pointermove']?.forEach(fn => fn({ pointerId: 1, clientX: 120, clientY: 120, preventDefault: vi.fn() }));
    expect(srcCardEl.classList.contains('drag-source')).toBe(true);

    const avatar = mockBody.querySelector('.dragged-card-avatar');
    expect(avatar).not.toBeNull();

    // Hover over target card
    pointElementTarget = targetCardEl;
    windowListeners['pointermove']?.forEach(fn => fn({ pointerId: 1, clientX: 150, clientY: 150, preventDefault: vi.fn() }));
    expect(targetCardEl.classList.contains('drop-target-hover')).toBe(true);

    // Pointer up over target: executes swap
    const dispatchSpy = vi.spyOn(turnManager, 'dispatchAction');
    windowListeners['pointerup']?.forEach(fn => fn({ pointerId: 1, clientX: 150, clientY: 150 }));

    expect(dispatchSpy).toHaveBeenCalledWith({
      type: 'CARD_SWAP',
      input1: 3,
      input2: 1
    });

    expect(targetCardEl.classList.contains('drop-target-hover')).toBe(false);
    expect(srcCardEl.classList.contains('drag-source')).toBe(false);

    // Suppress click immediately after drag
    expect(cardDragManager.isSuppressingClick()).toBe(true);
    vi.advanceTimersByTime(70);
    expect(cardDragManager.isSuppressingClick()).toBe(false);
  });

  it('wires TrenchCardsUI and BaseDeckUI with CardDragManager cleanly', () => {
    const containers: TRENCHContainers = {
      north: new MockElement('div') as any,
      east: new MockElement('div') as any,
      south: new MockElement('div') as any,
      west: new MockElement('div') as any
    };
    const baseContainer = new MockElement('div');

    const trenchUI = new TrenchCardsUI(containers, () => {}, cardDragManager);
    const baseDeckUI = new BaseDeckUI(baseContainer as any, () => {}, () => {}, undefined, cardDragManager);

    const state = store.getState();
    state.setupState.inSetup = false;
    state.activePlayer = PlayerSeat.NORTH;

    trenchUI.render(state, store);
    baseDeckUI.render(state, store);

    // Check North slots have dataset and touchAction set properly
    const northSlots = (containers.north as unknown as MockElement).querySelectorAll('.trench-card');
    expect(northSlots.length).toBe(3);
    expect(northSlots[0].dataset.cardType).toBe('trench');
    expect(northSlots[0].dataset.seat).toBe(String(PlayerSeat.NORTH));
    expect(northSlots[0].dataset.cardIndex).toBe('0');
    expect(northSlots[0].style.touchAction).toBe('none');

    // Check Base deck cards have dataset and touchAction set properly
    const baseCards = (baseContainer as unknown as MockElement).querySelectorAll('.trench-card');
    expect(baseCards.length).toBeGreaterThan(0);
    expect(baseCards[0].dataset.cardType).toBe('base');
    expect(baseCards[0].dataset.cardIndex).toBeDefined();
    expect(baseCards[0].style.touchAction).toBe('none');
  });
});
