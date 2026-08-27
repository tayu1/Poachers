import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildPieceRow, CapturesUI } from './CapturesUI';
import { BaseDeckUI } from './BaseDeckUI';
import { createInitialGameState } from '../../core/engine';
import { GameStore } from '../../store/store';
import { PlayerSeat, Pc } from '../../core/types';

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
  public attributes: Record<string, string> = {};
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
    if (selector === 'img' && this.tagName.toLowerCase() === 'img') return this;
    for (const child of this.children) {
      if (selector === 'img' && child.tagName.toLowerCase() === 'img') return child;
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
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
});
