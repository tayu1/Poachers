import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildPieceRow, CapturesUI } from './CapturesUI';
import { BaseDeckUI } from './BaseDeckUI';
import { createInitialGameState, getTeamCapturedPieces } from '../../core/engine';
import { GameStore } from '../../store/store';
import { PlayerSeat, Pc, HandRank } from '../../core/types';

class MockElement {
  public tagName: string;
  public className: string = '';
  public children: MockElement[] = [];
  public childNodes: MockElement[] = [];
  public parentElement: MockElement | null = null;
  public get parentNode(): MockElement | null {
    return this.parentElement;
  }
  public dataset: Record<string, string> = {};
  public style: Record<string, string> = {};
  public src: string = '';
  public alt: string = '';
  public title: string = '';
  public innerHTML: string = '';
  public innerText: string = '';
  public attributes: Record<string, string> = {};
  public textContent: string = '';
  private listeners: Record<string, ((e: any) => void)[]> = {};

  constructor(tagName: string) {
    this.tagName = tagName;
  }

  public appendChild(child: MockElement): MockElement {
    this.children.push(child);
    this.childNodes.push(child);
    child.parentElement = this;
    return child;
  }

  public insertBefore(newNode: MockElement, referenceNode: MockElement | null): MockElement {
    if (!referenceNode) {
      return this.appendChild(newNode);
    }
    const idx = this.children.indexOf(referenceNode);
    if (idx === -1) {
      return this.appendChild(newNode);
    }
    this.children.splice(idx, 0, newNode);
    this.childNodes.splice(idx, 0, newNode);
    newNode.parentElement = this;
    return newNode;
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
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      if (this.className.split(/\s+/).includes(cls)) return this;
      for (const child of this.children) {
        const found = child.querySelector(selector);
        if (found) return found;
      }
      return null;
    }
    if (selector === 'button' && this.tagName.toLowerCase() === 'button') return this;
    if (selector === 'img' && this.tagName.toLowerCase() === 'img') return this;
    for (const child of this.children) {
      if (selector === 'img' && child.tagName.toLowerCase() === 'img') return child;
      if (selector === 'button' && child.tagName.toLowerCase() === 'button') return child;
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  }

  public click(): void {
    if (this.listeners['click']) {
      for (const l of this.listeners['click']) {
        l({ stopPropagation: () => {} });
      }
    }
  }

  public querySelectorAll(selector: string): MockElement[] {
    const results: MockElement[] = [];
    for (const child of this.children) {
      if (selector === 'img' && child.tagName.toLowerCase() === 'img') {
        results.push(child);
      }
      results.push(...child.querySelectorAll(selector));
    }
    return results;
  }
}

describe('Promotion and Resurrect Piece Icons (Team Color Support)', () => {
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
  });

  it('buildPieceRow creates black piece icons when given Team B pieces', () => {
    // 10 = B_KNIGHT, 11 = B_BISHOP, 12 = B_ROOK, 13 = B_KING
    const row = buildPieceRow([10, 11, 12, 13], 40) as unknown as MockElement;
    const imgs = row.querySelectorAll('img');
    expect(imgs.length).toBe(4);
    
    // Sort order: King(13) -> Rook(12) -> Bishop(11) -> Knight(10)
    expect(imgs[0].src).toBe('/assets/b_k.svg');
    expect(imgs[1].src).toBe('/assets/b_r.svg');
    expect(imgs[2].src).toBe('/assets/b_b.svg');
    expect(imgs[3].src).toBe('/assets/b_n.svg');
  });

  it('buildPieceRow creates black piece icons when given Team B explicitly with unshifted pieces', () => {
    const row = buildPieceRow([2, 3, 4, 5], 40, undefined, null, undefined, undefined, 'B') as unknown as MockElement;
    const imgs = row.querySelectorAll('img');
    expect(imgs.length).toBe(4);
    
    // Sort order: King(5) -> Rook(4) -> Bishop(3) -> Knight(2)
    expect(imgs[0].src).toBe('/assets/b_k.svg');
    expect(imgs[1].src).toBe('/assets/b_r.svg');
    expect(imgs[2].src).toBe('/assets/b_b.svg');
    expect(imgs[3].src).toBe('/assets/b_n.svg');
  });

  it('buildPieceRow creates white piece icons when given Team A explicitly', () => {
    const row = buildPieceRow([2, 3, 4, 5], 40, undefined, null, undefined, undefined, 'A') as unknown as MockElement;
    const imgs = row.querySelectorAll('img');
    expect(imgs.length).toBe(4);
    
    // Sort order: King(5) -> Rook(4) -> Bishop(3) -> Knight(2)
    expect(imgs[0].src).toBe('/assets/w_k.svg');
    expect(imgs[1].src).toBe('/assets/w_r.svg');
    expect(imgs[2].src).toBe('/assets/w_b.svg');
    expect(imgs[3].src).toBe('/assets/w_n.svg');
  });

  it('BaseDeckUI renders black piece promotion icons for Team B (East)', () => {
    const container = document.createElement('div') as unknown as MockElement;
    const baseDeckUI = new BaseDeckUI(container as unknown as HTMLElement, () => {}, () => {});
    const state = createInitialGameState();
    const store = new GameStore();
    store.botSeats[PlayerSeat.EAST] = false;

    // Set active player to EAST (Team B)
    state.activePlayer = PlayerSeat.EAST;
    // Put a Team B Pawn on East's hill square (e4 = index 28)
    state.board[28] = Pc.B_PAWN;
    // Add captured Knight to dead pool for Team B (10 = B_KNIGHT)
    state.deadPoolCounts[10] = 1;

    baseDeckUI.render(state, store);

    const imgs = container.querySelectorAll('img');
    expect(imgs.length).toBeGreaterThan(0);
    for (const img of imgs) {
      expect(img.src).toMatch(/\/assets\/b_/);
    }
  });

  it('BaseDeckUI renders white piece promotion icons for Team A (North)', () => {
    const container = document.createElement('div') as unknown as MockElement;
    const baseDeckUI = new BaseDeckUI(container as unknown as HTMLElement, () => {}, () => {});
    const state = createInitialGameState();
    const store = new GameStore();
    store.botSeats[PlayerSeat.NORTH] = false;

    // Set active player to NORTH (Team A)
    state.activePlayer = PlayerSeat.NORTH;
    // Put a Team A Pawn on North's hill square (d4 = index 27)
    state.board[27] = Pc.A_PAWN;
    // Add a captured Knight to dead pool for Team A (2 = A_KNIGHT)
    state.deadPoolCounts[2] = 1;

    baseDeckUI.render(state, store);

    const imgs = container.querySelectorAll('img');
    expect(imgs.length).toBeGreaterThan(0);
    for (const img of imgs) {
      expect(img.src).toMatch(/\/assets\/w_/);
    }
  });

  it('BaseDeckUI renders pass button when a card is selected and teammate has < 3 cards', () => {
    const container = document.createElement('div') as unknown as MockElement;
    const onPassSpy = vi.fn();
    const baseDeckUI = new BaseDeckUI(container as unknown as HTMLElement, () => {}, () => {}, onPassSpy);
    const state = createInitialGameState({ skipSetup: true });
    const store = new GameStore();
    store.botSeats[PlayerSeat.NORTH] = false;

    // Active player is North, teammate is South
    state.activePlayer = PlayerSeat.NORTH;
    // South has 2 cards (< 3)
    state.players[PlayerSeat.SOUTH].baseDeck = state.players[PlayerSeat.SOUTH].baseDeck.slice(0, 2);
    state.players[PlayerSeat.SOUTH].backupCards[2] = null;
    // North selects card index 0
    store.selectedBaseCardIndex = 0;

    baseDeckUI.render(state, store);

    const passBtn = container.querySelector('.pass-card-btn');
    expect(passBtn).not.toBeNull();
    expect(passBtn?.style.display).toBe('inline-flex');
    expect(passBtn?.textContent).toBe('➦');

    // Click pass button
    passBtn?.click();
    expect(onPassSpy).toHaveBeenCalledTimes(1);
  });

  it('BaseDeckUI hides pass button when teammate already has 3 cards', () => {
    const container = document.createElement('div') as unknown as MockElement;
    const baseDeckUI = new BaseDeckUI(container as unknown as HTMLElement, () => {}, () => {});
    const state = createInitialGameState({ skipSetup: true });
    const store = new GameStore();
    store.botSeats[PlayerSeat.NORTH] = false;

    state.activePlayer = PlayerSeat.NORTH;
    // South already has 3 cards
    expect(state.players[PlayerSeat.SOUTH].baseDeck.length).toBe(3);
    // North selects card
    store.selectedBaseCardIndex = 0;

    baseDeckUI.render(state, store);

    const passBtn = container.querySelector('.pass-card-btn');
    expect(passBtn?.style.display).toBe('none');
  });

  it('BaseDeckUI hides pass button when swap was already used this turn', () => {
    const container = document.createElement('div') as unknown as MockElement;
    const baseDeckUI = new BaseDeckUI(container as unknown as HTMLElement, () => {}, () => {});
    const state = createInitialGameState({ skipSetup: true });
    const store = new GameStore();
    store.botSeats[PlayerSeat.NORTH] = false;

    state.activePlayer = PlayerSeat.NORTH;
    state.players[PlayerSeat.SOUTH].baseDeck = state.players[PlayerSeat.SOUTH].baseDeck.slice(0, 3);
    store.selectedBaseCardIndex = 0;
    state.hasSwappedThisTurn = true;

    baseDeckUI.render(state, store);

    const passBtn = container.querySelector('.pass-card-btn');
    expect(passBtn?.style.display).toBe('none');
  });

  it('BaseDeckUI renders bunker button left of base cards on active player turn', () => {
    const container = document.createElement('div') as unknown as MockElement;
    let bunkerClicked = false;
    const baseDeckUI = new BaseDeckUI(
      container as unknown as HTMLElement,
      () => {},
      () => {},
      undefined,
      undefined,
      () => { bunkerClicked = true; }
    );
    const state = createInitialGameState({ skipSetup: true });
    const store = new GameStore();
    store.botSeats[PlayerSeat.NORTH] = false;
    state.activePlayer = PlayerSeat.NORTH;

    baseDeckUI.render(state, store);

    const bunkerBtn = container.querySelector('.bunker-action-btn') as HTMLElement;
    expect(bunkerBtn).not.toBeNull();
    expect(bunkerBtn.style.display).toBe('inline-flex');
    expect(bunkerBtn.className).toContain('team-a');

    // Test click handler
    bunkerBtn.click();
    expect(bunkerClicked).toBe(true);

    // When store.isSettingBunker is true, it should have the 'active' class
    store.isSettingBunker = true;
    baseDeckUI.render(state, store);
    expect(bunkerBtn.className).toContain('active');
  });

  it('BaseDeckUI hides bunker and pass card buttons during a poker win message', () => {
    const container = document.createElement('div') as unknown as MockElement;
    let bunkerClicked = false;
    let passClicked = false;
    const baseDeckUI = new BaseDeckUI(
      container as unknown as HTMLElement,
      () => {},
      () => {},
      () => { passClicked = true; },
      undefined,
      () => { bunkerClicked = true; }
    );
    const state = createInitialGameState({ skipSetup: true });
    const store = new GameStore();
    store.botSeats[PlayerSeat.NORTH] = false;
    state.activePlayer = PlayerSeat.NORTH;

    // Normal state where both pass and bunker buttons would be displayed
    state.players[PlayerSeat.SOUTH].backupCards[2] = null;
    state.players[PlayerSeat.NORTH].backupCards[0] = { id: 'c1', suit: 'H', rank: 14 };
    store.selectedBaseCardIndex = 0;

    baseDeckUI.render(state, store);

    const bunkerBtn = container.querySelector('.bunker-action-btn') as HTMLElement;
    const passBtn = container.querySelector('.pass-card-btn') as HTMLElement;
    expect(bunkerBtn).not.toBeNull();
    expect(bunkerBtn.style.display).toBe('inline-flex');
    expect(passBtn).not.toBeNull();
    expect(passBtn.style.display).toBe('inline-flex');

    // Introduce a resolved poker combat with win announcement message
    state.pendingCombat = {
      attackerSeat: PlayerSeat.NORTH,
      defenderSeat: PlayerSeat.EAST,
      attackerPosIndex: 45,
      defenderPosIndex: 35,
      attackerHand: {
        rank: HandRank.FULL_HOUSE,
        cards: [],
        score: 7000000,
        winningCards: []
      },
      defenderHand: {
        rank: HandRank.TWO_PAIR,
        cards: [],
        score: 3000000,
        winningCards: []
      },
      winnerSeat: PlayerSeat.NORTH,
      capturedPiece: 0
    };
    state.isTurnRiverRevealed = true;

    baseDeckUI.render(state, store);

    // Verify poker win announcement is visible
    const combatWrapper = container.querySelector('.combat-announcement-wrapper') as HTMLElement;
    const combatText = container.querySelector('.combat-announcement-text') as any;
    expect(combatWrapper).not.toBeNull();
    expect(combatWrapper.style.display).toBe('flex');
    expect(combatText.innerText).toContain('Attacker Wins with a Full House!');

    // Verify both bunker and pass card buttons are strictly hidden
    expect(bunkerBtn.style.display).toBe('none');
    expect(passBtn.style.display).toBe('none');
  });

  it('BaseDeckUI hides bunker and pass card buttons during pending combat delay', () => {
    const container = document.createElement('div') as unknown as MockElement;
    const baseDeckUI = new BaseDeckUI(
      container as unknown as HTMLElement,
      () => {},
      () => {},
      () => {},
      undefined,
      () => {}
    );
    const state = createInitialGameState({ skipSetup: true });
    const store = new GameStore();
    store.botSeats[PlayerSeat.NORTH] = false;
    state.activePlayer = PlayerSeat.NORTH;

    state.players[PlayerSeat.SOUTH].backupCards[2] = null;
    state.players[PlayerSeat.NORTH].backupCards[0] = { id: 'c1', suit: 'H', rank: 14 };
    store.selectedBaseCardIndex = 0;

    // Combat pending before river is revealed
    state.pendingCombat = {
      attackerSeat: PlayerSeat.NORTH,
      defenderSeat: PlayerSeat.EAST,
      attackerPosIndex: 45,
      defenderPosIndex: 35,
      attackerHand: {
        rank: HandRank.HIGH_CARD,
        cards: [],
        score: 1000000,
        winningCards: []
      },
      defenderHand: {
        rank: HandRank.HIGH_CARD,
        cards: [],
        score: 1000000,
        winningCards: []
      },
      winnerSeat: null,
      capturedPiece: 0
    };
    state.isTurnRiverRevealed = false;

    baseDeckUI.render(state, store);

    const bunkerBtn = container.querySelector('.bunker-action-btn') as HTMLElement;
    const passBtn = container.querySelector('.pass-card-btn') as HTMLElement;
    expect(bunkerBtn.style.display).toBe('none');
    expect(passBtn.style.display).toBe('none');
  });

  it('CapturesUI highlights Team A box border with #f59e0b when Team A is active', () => {
    const container = document.createElement('div') as unknown as MockElement;
    const capturesUI = new CapturesUI(container as unknown as HTMLElement);
    const state = createInitialGameState();
    const store = new GameStore();

    // Active player NORTH is Team A
    state.activePlayer = PlayerSeat.NORTH;
    capturesUI.render(state, store);

    const panel = container.children[0];
    expect(panel.className).toBe('panel');
    // panel children: [header, groupDivA, groupDivB]
    const groupDivA = panel.children[1];
    const groupDivB = panel.children[2];

    expect(groupDivA.style.border).toBe('1.5px solid #f59e0b');
    expect(groupDivB.style.border).toBe('1.5px solid transparent');
  });

  it('CapturesUI highlights Team B box border with #06b6d4 when Team B is active', () => {
    const container = document.createElement('div') as unknown as MockElement;
    const capturesUI = new CapturesUI(container as unknown as HTMLElement);
    const state = createInitialGameState();
    const store = new GameStore();

    // Active player EAST is Team B
    state.activePlayer = PlayerSeat.EAST;
    capturesUI.render(state, store);

    const panel = container.children[0];
    const groupDivA = panel.children[1];
    const groupDivB = panel.children[2];

    expect(groupDivA.style.border).toBe('1.5px solid transparent');
    expect(groupDivB.style.border).toBe('1.5px solid #06b6d4');
  });

  it('getTeamCapturedPieces includes captured pawns for both teams', () => {
    const state = createInitialGameState();
    // 1 = A_PAWN, 9 = B_PAWN
    state.deadPoolCounts[1] = 2; // 2 Team A pawns
    state.deadPoolCounts[4] = 1; // 1 Team A rook
    state.deadPoolCounts[9] = 3; // 3 Team B pawns
    state.deadPoolCounts[10] = 1; // 1 Team B knight

    const teamAPieces = getTeamCapturedPieces(state, 'A');
    expect(teamAPieces).toEqual([1, 1, 4]);

    const teamBPieces = getTeamCapturedPieces(state, 'B');
    expect(teamBPieces).toEqual([9, 9, 9, 10]);
  });

  it('CapturesUI renders captured pawns and does not allow selecting pawns for promotion', () => {
    const container = document.createElement('div') as unknown as MockElement;
    const capturesUI = new CapturesUI(container as unknown as HTMLElement);
    const state = createInitialGameState();
    const store = new GameStore();

    state.activePlayer = PlayerSeat.NORTH; // Team A
    state.deadPoolCounts[1] = 2; // 2 Team A pawns
    state.deadPoolCounts[4] = 1; // 1 Team A rook

    capturesUI.render(state, store);

    const panel = container.children[0];
    const groupDivA = panel.children[1];
    const imgs = groupDivA.querySelectorAll('img');

    // Expected order: Rook (4) -> Pawn (1) -> Pawn (1)
    expect(imgs.length).toBe(3);
    expect(imgs[0].src).toBe('/assets/w_r.svg');
    expect(imgs[1].src).toBe('/assets/w_p.svg');
    expect(imgs[2].src).toBe('/assets/w_p.svg');

    // Pawns should not have pointer cursor
    const rookWrapper = imgs[0].parentElement!;
    const pawnWrapper = imgs[1].parentElement!;
    expect(rookWrapper.style.cursor).toBe('pointer');
    expect(pawnWrapper.style.cursor).toBeUndefined();
  });
});

