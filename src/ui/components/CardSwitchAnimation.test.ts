import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TrenchCardsUI, TRENCHContainers } from './TrenchCardsUI';
import { PublicCardsUI } from './PublicCardsUI';
import { GameStore } from '../../store/store';
import { PlayerSeat } from '../../core/types';
import { CARD_ANIMATION_TIME_MS } from '../../config';

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
  public title: string = '';
  public innerHTML: string = '';
  public textContent: string = '';
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

  public hasChildNodes(): boolean {
    return this.children.length > 0;
  }

  public addEventListener(event: string, handler: (e: any) => void): void {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(handler);
  }

  public querySelector(selector: string): MockElement | null {
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      if (this.className.split(' ').includes(cls)) return this;
      for (const child of this.children) {
        const res = child.querySelector(selector);
        if (res) return res;
      }
    }
    return null;
  }

  public querySelectorAll(selector: string): MockElement[] {
    const results: MockElement[] = [];
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      if (this.className.split(' ').includes(cls)) results.push(this);
    }
    for (const child of this.children) {
      results.push(...child.querySelectorAll(selector));
    }
    return results;
  }
}

describe('Card Switch Animation (Trench Cards)', () => {
  let store: GameStore;
  let containers: TRENCHContainers;
  let publicContainer: MockElement;
  let originalDocument: any;

  beforeEach(() => {
    vi.useFakeTimers();
    store = new GameStore();

    originalDocument = (global as any).document;
    (global as any).document = {
      createElement: (tag: string) => new MockElement(tag)
    };

    containers = {
      north: new MockElement('div') as any,
      east: new MockElement('div') as any,
      south: new MockElement('div') as any,
      west: new MockElement('div') as any
    };

    publicContainer = new MockElement('div');
  });

  afterEach(() => {
    vi.useRealTimers();
    (global as any).document = originalDocument;
  });

  it('TrenchCardsUI initializes persistent slot bay and inner sliding face inside card slots', () => {
    const trenchUI = new TrenchCardsUI(containers, () => {});
    const state = store.getState();

    trenchUI.render(state, store);

    const northSlots = (containers.north as unknown as MockElement).querySelectorAll('.trench-card');
    expect(northSlots.length).toBe(3);

    const firstSlot = northSlots[0];
    const slotBay = firstSlot.querySelector('.card-slot-bay');
    const innerFace = firstSlot.querySelector('.card-inner-face');

    expect(slotBay).toBeTruthy();
    expect(innerFace).toBeTruthy();
  });

  it('TrenchCardsUI triggers 2-phase same-direction slide animation when a trench card is swapped', () => {
    const trenchUI = new TrenchCardsUI(containers, () => {});
    const state = store.getState();
    state.setupState.inSetup = false;

    // Give North player trench cards
    state.players[PlayerSeat.NORTH].trenchCards[0] = { id: 'C_10_H', suit: 'H', rank: 10 };
    state.players[PlayerSeat.NORTH].trenchCards[1] = { id: 'C_11_S', suit: 'S', rank: 11 };
    state.players[PlayerSeat.NORTH].trenchCards[2] = { id: 'C_12_D', suit: 'D', rank: 12 };

    // Initial render
    trenchUI.render(state, store);

    const northSlots = (containers.north as unknown as MockElement).querySelectorAll('.trench-card');
    const firstInner = northSlots[0].querySelector('.card-inner-face')!;
    expect(firstInner.classList.contains('slide-out-right')).toBe(false);
    expect(firstInner.classList.contains('slide-in-right')).toBe(false);

    // Swap card in slot 0 with a new card
    state.players[PlayerSeat.NORTH].trenchCards[0] = { id: 'C_14_A', suit: 'C', rank: 14 };
    trenchUI.render(state, store);

    // Phase 1: Old card slides out to the right
    expect(firstInner.classList.contains('slide-out-right')).toBe(true);

    // Advance CARD_ANIMATION_TIME_MS: slide-out finishes, new card applied, phase 2 starts (slides in from right)
    vi.advanceTimersByTime(CARD_ANIMATION_TIME_MS);
    expect(firstInner.classList.contains('slide-out-right')).toBe(false);
    expect(firstInner.classList.contains('slide-in-right')).toBe(true);
    expect(firstInner.querySelector('.card-val-top')?.textContent).toBe('A');

    // Advance another CARD_ANIMATION_TIME_MS: slide-in finishes, resting at 0
    vi.advanceTimersByTime(CARD_ANIMATION_TIME_MS);
    expect(firstInner.classList.contains('slide-in-right')).toBe(false);
  });

  it('TrenchCardsUI STRICTLY disables swap animations during combat to protect combat sequence', () => {
    const trenchUI = new TrenchCardsUI(containers, () => {});
    const state = store.getState();
    state.setupState.inSetup = false;
    state.players[PlayerSeat.NORTH].trenchCards[0] = { id: 'C_10_H', suit: 'H', rank: 10 };
    trenchUI.render(state, store);

    // Enter combat
    state.pendingCombat = {
      attackerSeat: PlayerSeat.NORTH,
      defenderSeat: PlayerSeat.EAST,
      attackerSquare: 18,
      defenderSquare: 19,
      defenderPosIndex: 19,
      winnerSeat: null,
      attackerHand: null as any,
      defenderHand: null as any,
      capturedPiece: null
    };

    // Card in slot 0 changes during combat
    state.players[PlayerSeat.NORTH].trenchCards[0] = { id: 'C_14_A', suit: 'C', rank: 14 };
    trenchUI.render(state, store);

    const northSlots = (containers.north as unknown as MockElement).querySelectorAll('.trench-card');
    const firstInner = northSlots[0].querySelector('.card-inner-face')!;

    // Must NOT animate during combat!
    expect(firstInner.classList.contains('slide-in-left')).toBe(false);
    // Values must be immediately and synchronously updated
    expect(firstInner.querySelector('.card-val-top')?.textContent).toBe('A');
  });

  it('TrenchCardsUI skips animation when store.isReplaying is active', () => {
    const trenchUI = new TrenchCardsUI(containers, () => {});
    const state = store.getState();
    state.setupState.inSetup = false;
    state.players[PlayerSeat.NORTH].trenchCards[0] = { id: 'C_10_H', suit: 'H', rank: 10 };
    trenchUI.render(state, store);

    store.isReplaying = true;
    state.players[PlayerSeat.NORTH].trenchCards[0] = { id: 'C_14_A', suit: 'C', rank: 14 };
    trenchUI.render(state, store);

    const northSlots = (containers.north as unknown as MockElement).querySelectorAll('.trench-card');
    const firstInner = northSlots[0].querySelector('.card-inner-face')!;

    expect(firstInner.classList.contains('slide-in-left')).toBe(false);
    expect(firstInner.querySelector('.card-val-top')?.textContent).toBe('A');
  });

  it('PublicCardsUI renders community cards synchronously and highlights winning cards during combat', () => {
    const publicCardsUI = new PublicCardsUI(publicContainer as any);
    const state = store.getState();

    state.publicFlop = [
      { id: 'F_1', suit: 'H', rank: 14 },
      { id: 'F_2', suit: 'S', rank: 14 },
      { id: 'F_3', suit: 'D', rank: 9 }
    ];
    state.publicTurnRiver = [
      { id: 'TR_1', suit: 'C', rank: 14 },
      { id: 'TR_2', suit: 'H', rank: 10 }
    ];
    state.isTurnRiverRevealed = true;
    state.pendingCombat = {
      attackerSeat: PlayerSeat.NORTH,
      defenderSeat: PlayerSeat.EAST,
      attackerSquare: 18,
      defenderSquare: 19,
      defenderPosIndex: 19,
      winnerSeat: PlayerSeat.NORTH,
      attackerHand: { winningCards: [{ id: 'F_1' }, { id: 'F_2' }, { id: 'TR_1' }] } as any,
      defenderHand: null as any,
      capturedPiece: null
    };

    publicCardsUI.render(state, store);

    const winningCards = publicContainer.querySelectorAll('.winning-card-highlight');
    // F_1, F_2, and TR_1 must be immediately highlighted
    expect(winningCards.length).toBe(3);

    // Turn & River reveal must NEVER slide out during combat
    const cardInners = publicContainer.querySelectorAll('.card-inner-face');
    expect(cardInners[3].classList.contains('slide-out-right')).toBe(false);
    expect(cardInners[4].classList.contains('slide-out-right')).toBe(false);
  });

  it('PublicCardsUI performs 2-phase swap animation for flop renewals outside combat', () => {
    vi.useFakeTimers();
    const publicCardsUI = new PublicCardsUI(publicContainer as any);
    const state = store.getState();

    state.publicFlop = [
      { id: 'F_1', suit: 'H', rank: 14 },
      { id: 'F_2', suit: 'S', rank: 14 },
      { id: 'F_3', suit: 'D', rank: 9 }
    ];
    publicCardsUI.render(state, store);

    // Post-combat renewal: 3 new flop cards arrive
    state.publicFlop = [
      { id: 'F_NEW_1', suit: 'C', rank: 10 },
      { id: 'F_NEW_2', suit: 'D', rank: 12 },
      { id: 'F_NEW_3', suit: 'S', rank: 8 }
    ];
    publicCardsUI.render(state, store);

    const cardInners = publicContainer.querySelectorAll('.card-inner-face');

    // Phase 1: Old card slides out to the right
    expect(cardInners[0].classList.contains('slide-out-right')).toBe(true);
    expect(cardInners[0].classList.contains('slide-in-right')).toBe(false);
    // Old rank still visible during slide-out
    expect(cardInners[0].querySelector('.card-val-top')?.textContent).toBe('A');

    // Fast-forward CARD_ANIMATION_TIME_MS: slide-out finishes, content swapped to new card, slide-in starts
    vi.advanceTimersByTime(CARD_ANIMATION_TIME_MS);
    expect(cardInners[0].classList.contains('slide-out-right')).toBe(false);
    expect(cardInners[0].classList.contains('slide-in-right')).toBe(true);
    expect(cardInners[0].querySelector('.card-val-top')?.textContent).toBe('10');

    // Fast-forward another CARD_ANIMATION_TIME_MS: slide-in completes
    vi.advanceTimersByTime(CARD_ANIMATION_TIME_MS);
    expect(cardInners[0].classList.contains('slide-in-right')).toBe(false);
    expect(cardInners[0].querySelector('.card-val-top')?.textContent).toBe('10');

    vi.useRealTimers();
  });

  it('PublicCardsUI does not render compass box since it is now in StatusUI', () => {
    const publicCardsUI = new PublicCardsUI(publicContainer as any);
    const state = store.getState();
    publicCardsUI.render(state, store);

    const compassBox = publicContainer.querySelector('.board-compass-box');
    expect(compassBox).toBeNull();
  });

  it('TrenchCardsUI correctly retains has-backup class and toggles underEl when backup cards exist', () => {
    const trenchUI = new TrenchCardsUI(containers, () => {});
    const state = store.getState();
    state.setupState.inSetup = false;

    // Slot 0 has a backup card; Slot 1 does not
    state.players[PlayerSeat.NORTH].trenchCards[0] = { id: 'C_10_H', suit: 'H', rank: 10 };
    state.players[PlayerSeat.NORTH].trenchCards[1] = { id: 'C_11_S', suit: 'S', rank: 11 };
    state.players[PlayerSeat.NORTH].backupCards = [{ id: 'C_5_D', suit: 'D', rank: 5 }, null, null];

    trenchUI.render(state, store);

    const northSlots = (containers.north as unknown as MockElement).querySelectorAll('.trench-card');
    const slot0 = northSlots[0];
    const slot1 = northSlots[1];

    expect(slot0.classList.contains('has-backup')).toBe(true);
    const under0 = slot0.querySelector('.card-under-face');
    expect(under0).toBeTruthy();
    expect((under0 as any).style.display).toBe('block');

    expect(slot1.classList.contains('has-backup')).toBe(false);
    const under1 = slot1.querySelector('.card-under-face');
    expect(under1).toBeTruthy();
    expect((under1 as any).style.display).toBe('none');
  });

  it('TrenchCardsUI automatically replaces top card with backup card (open face-up) when top card is used', () => {
    vi.useFakeTimers();
    const trenchUI = new TrenchCardsUI(containers, () => {});
    const state = store.getState();
    state.setupState.inSetup = false;

    // Slot 0 top card was used (topCard is null), backup card exists
    state.players[PlayerSeat.NORTH].trenchCards[0] = null;
    state.players[PlayerSeat.NORTH].backupCards = [{ id: 'C_9_H', suit: 'H', rank: 9 }, null, null];

    trenchUI.render(state, store);

    const northSlots = (containers.north as unknown as MockElement).querySelectorAll('.trench-card');
    const slot0 = northSlots[0];

    // Backup card automatically replaces top trench card: open face-up, not empty, no under card facing down
    expect(slot0.classList.contains('card-empty')).toBe(false);
    expect(slot0.classList.contains('has-backup')).toBe(false);
    const under0 = slot0.querySelector('.card-under-face');
    const inner0 = slot0.querySelector('.card-inner-face');
    expect((under0 as any).style.display).toBe('none');
    expect((inner0 as any).style.display).toBe('block');
    expect(inner0.querySelector('.card-val-top')?.textContent).toBe('9');

    // When a top card is added over it, underEl becomes visible (closed underneath) and innerEl displays top card
    state.players[PlayerSeat.NORTH].trenchCards[0] = { id: 'C_10_S', suit: 'S', rank: 10 };
    state.players[PlayerSeat.NORTH].backupCards[0] = { id: 'C_9_H', suit: 'H', rank: 9 };
    trenchUI.render(state, store);

    // Fast-forward animation
    vi.advanceTimersByTime(CARD_ANIMATION_TIME_MS * 2);

    expect(slot0.classList.contains('card-empty')).toBe(false);
    expect(slot0.classList.contains('has-backup')).toBe(true);
    expect((under0 as any).style.display).toBe('block');
    expect((inner0 as any).style.display).toBe('block');
    expect(inner0.querySelector('.card-val-top')?.textContent).toBe('10');

    // When the top card is used again (becomes null), backup card replaces it face-up, underEl hidden
    state.players[PlayerSeat.NORTH].trenchCards[0] = null;
    trenchUI.render(state, store);
    vi.advanceTimersByTime(CARD_ANIMATION_TIME_MS * 2);

    expect(slot0.classList.contains('card-empty')).toBe(false);
    expect(slot0.classList.contains('has-backup')).toBe(false);
    expect((under0 as any).style.display).toBe('none');
    expect((inner0 as any).style.display).toBe('block');
    expect(inner0.querySelector('.card-val-top')?.textContent).toBe('9');

    vi.useRealTimers();
  });

  it('TrenchCardsUI correctly matches closed under cards to each player base backup slots (North, East, South, West)', () => {
    const trenchUI = new TrenchCardsUI(containers, () => {});
    const state = store.getState();
    state.setupState.inSetup = false;

    // Give each player top cards in their 3 slots
    for (const seat of [PlayerSeat.NORTH, PlayerSeat.EAST, PlayerSeat.SOUTH, PlayerSeat.WEST]) {
      state.players[seat].trenchCards = [
        { id: `T_${seat}_0`, suit: 'H', rank: 10 },
        { id: `T_${seat}_1`, suit: 'S', rank: 11 },
        { id: `T_${seat}_2`, suit: 'D', rank: 12 }
      ];
    }

    // Configure distinct backup slots for all 4 seats:
    // North: backup in slot 0 only
    state.players[PlayerSeat.NORTH].backupCards = [{ id: 'N_0', suit: 'H', rank: 5 }, null, null];
    // East: backup in slot 1 only
    state.players[PlayerSeat.EAST].backupCards = [null, { id: 'E_1', suit: 'S', rank: 6 }, null];
    // South: backup in slot 2 only
    state.players[PlayerSeat.SOUTH].backupCards = [null, null, { id: 'S_2', suit: 'D', rank: 7 }];
    // West: backup in slot 0 and 2
    state.players[PlayerSeat.WEST].backupCards = [{ id: 'W_0', suit: 'C', rank: 8 }, null, { id: 'W_2', suit: 'H', rank: 9 }];

    trenchUI.render(state, store);

    const getUnderDisplays = (container: MockElement) => {
      const slots = container.querySelectorAll('.trench-card');
      return Array.from(slots).map(slot => {
        const under = slot.querySelector('.card-under-face');
        const hasBackup = slot.classList.contains('has-backup');
        return { display: (under as any).style.display, hasBackup, cardIndex: slot.dataset.cardIndex };
      });
    };

    const northData = getUnderDisplays(containers.north as unknown as MockElement);
    const eastData = getUnderDisplays(containers.east as unknown as MockElement);
    const southData = getUnderDisplays(containers.south as unknown as MockElement);
    const westData = getUnderDisplays(containers.west as unknown as MockElement);

    // North slots 0, 1, 2
    expect(northData.find(d => d.cardIndex === '0')?.display).toBe('block');
    expect(northData.find(d => d.cardIndex === '0')?.hasBackup).toBe(true);
    expect(northData.find(d => d.cardIndex === '1')?.display).toBe('none');
    expect(northData.find(d => d.cardIndex === '2')?.display).toBe('none');

    // East slots 0, 1, 2
    expect(eastData.find(d => d.cardIndex === '0')?.display).toBe('none');
    expect(eastData.find(d => d.cardIndex === '1')?.display).toBe('block');
    expect(eastData.find(d => d.cardIndex === '1')?.hasBackup).toBe(true);
    expect(eastData.find(d => d.cardIndex === '2')?.display).toBe('none');

    // South slots 0, 1, 2
    expect(southData.find(d => d.cardIndex === '0')?.display).toBe('none');
    expect(southData.find(d => d.cardIndex === '1')?.display).toBe('none');
    expect(southData.find(d => d.cardIndex === '2')?.display).toBe('block');
    expect(southData.find(d => d.cardIndex === '2')?.hasBackup).toBe(true);

    // West slots 0, 1, 2
    expect(westData.find(d => d.cardIndex === '0')?.display).toBe('block');
    expect(westData.find(d => d.cardIndex === '1')?.display).toBe('none');
    expect(westData.find(d => d.cardIndex === '2')?.display).toBe('block');
  });
});

