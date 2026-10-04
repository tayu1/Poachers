import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OverlaysUI, GameOverOptions } from './OverlaysUI';

class MockElement {
  public tagName: string;
  public id: string = '';
  public title: string = '';
  public disabled: boolean = false;
  public style: Record<string, string> = {};
  public innerText: string = '';
  public innerHTML: string = '';
  public children: MockElement[] = [];
  public childNodes: MockElement[] = [];
  public parentElement: MockElement | null = null;
  private _classes = new Set<string>();

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  public get className(): string {
    return Array.from(this._classes).join(' ');
  }

  public set className(val: string) {
    this._classes = new Set(val.split(/\s+/).filter(Boolean));
  }

  public classList = {
    add: (...tokens: string[]) => {
      tokens.forEach(t => this._classes.add(t));
    },
    remove: (...tokens: string[]) => {
      tokens.forEach(t => this._classes.delete(t));
    },
    contains: (token: string) => this._classes.has(token),
    toggle: (token: string) => {
      if (this._classes.has(token)) {
        this._classes.delete(token);
        return false;
      } else {
        this._classes.add(token);
        return true;
      }
    }
  };

  private listeners: Record<string, ((e?: any) => void)[]> = {};

  public addEventListener(event: string, handler: (e?: any) => void): void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(handler);
  }

  public click(): void {
    if (this.disabled) return;
    if (this.listeners['click']) {
      this.listeners['click'].forEach(h => h({ currentTarget: this, target: this }));
    }
  }

  public appendChild(child: MockElement): MockElement {
    child.parentElement = this;
    this.children.push(child);
    this.childNodes.push(child);
    return child;
  }

  public querySelector(selector: string): MockElement | null {
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      if (this.classList.contains(cls)) return this;
      for (const child of this.children) {
        const found = child.querySelector(selector);
        if (found) return found;
      }
    }
    return null;
  }

  public querySelectorAll(selector: string): MockElement[] {
    const results: MockElement[] = [];
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      if (this.classList.contains(cls)) results.push(this);
      for (const child of this.children) {
        results.push(...child.querySelectorAll(selector));
      }
    }
    return results;
  }
}

describe('OverlaysUI', () => {
  let container: MockElement;
  let overlaysUI: OverlaysUI;
  let options: GameOverOptions;

  beforeEach(() => {
    (globalThis as any).document = {
      createElement: (tagName: string) => new MockElement(tagName)
    };
    container = new MockElement('DIV');
    overlaysUI = new OverlaysUI(container as any);
    options = {
      onRematch: vi.fn(),
      onAcceptRematch: vi.fn(),
      onReviewGame: vi.fn(),
      onBackToLobby: vi.fn()
    };
  });

  it('renders game over modal with lobby style buttons', () => {
    overlaysUI.showGameOver('A', options);

    expect(container.className).toBe('overlay');
    const card = container.querySelector('.overlay-card')!;
    expect(card).toBeDefined();

    const rematchBtn = container.querySelector('.btn-rematch')!;
    expect(rematchBtn).toBeDefined();
    expect(rematchBtn.className).toContain('btn-overlay');
    expect(rematchBtn.className).toContain('btn-primary');
    expect(rematchBtn.innerText).toBe('🔄 Rematch');

    const lobbyBtn = container.querySelector('.btn-back-lobby')!;
    expect(lobbyBtn).toBeDefined();
    expect(lobbyBtn.className).toContain('btn-overlay');
    expect(lobbyBtn.className).toContain('btn-secondary');
    expect(lobbyBtn.innerText).toBe('🏠 Back to Lobby');

    const reviewBtn = container.querySelector('.btn-review-game')!;
    expect(reviewBtn).toBeDefined();
    expect(reviewBtn.className).toContain('btn-overlay');
    expect(reviewBtn.className).toContain('btn-secondary');
    expect(reviewBtn.innerText).toBe('🔍 Review Game');
  });

  it('invokes callbacks when buttons are clicked', () => {
    overlaysUI.showGameOver('B', options);

    const rematchBtn = container.querySelector('.btn-rematch')!;
    rematchBtn.click();
    expect(options.onRematch).toHaveBeenCalledTimes(1);

    const lobbyBtn = container.querySelector('.btn-back-lobby')!;
    lobbyBtn.click();
    expect(options.onBackToLobby).toHaveBeenCalledTimes(1);
    expect(container.className).toContain('hidden');

    overlaysUI.showGameOver('B', options);
    const reviewBtn = container.querySelector('.btn-review-game')!;
    reviewBtn.click();
    expect(options.onReviewGame).toHaveBeenCalledTimes(1);
    expect(container.className).toContain('hidden');
  });

  it('handles rematchMode = "disabled"', () => {
    overlaysUI.showGameOver('A', options, undefined, null, null, 'disabled');

    const rematchBtn = container.querySelector('.btn-rematch')!;
    expect(rematchBtn.innerText).toBe('🚫 Rematch (Unavailable)');
    expect(rematchBtn.disabled).toBe(true);

    rematchBtn.click();
    expect(options.onRematch).not.toHaveBeenCalled();
  });

  it('handles rematchMode = "return_to_lobby"', () => {
    overlaysUI.showGameOver('A', options, undefined, null, null, 'return_to_lobby');

    const rematchBtn = container.querySelector('.btn-rematch')!;
    expect(rematchBtn.innerText).toBe('🔄 Rematch (Seat Setup)');
    expect(rematchBtn.disabled).toBe(false);

    rematchBtn.click();
    expect(options.onRematch).toHaveBeenCalledTimes(1);
  });

  it('handles rematchOffer requested by current player (waiting state)', () => {
    const offer = {
      requestedByPlayerId: 'p1',
      requestedByName: 'Alice',
      acceptedPlayerIds: ['p1']
    };

    overlaysUI.showGameOver('A', options, undefined, offer, 'p1', 'available');

    const rematchBtn = container.querySelector('.btn-rematch')!;
    expect(rematchBtn.innerText).toBe('⏳ Waiting for Opponent...');
    expect(rematchBtn.disabled).toBe(true);
  });

  it('handles rematchOffer accepted by current player', () => {
    const offer = {
      requestedByPlayerId: 'p2',
      requestedByName: 'Bob',
      acceptedPlayerIds: ['p2', 'p1']
    };

    overlaysUI.showGameOver('A', options, undefined, offer, 'p1', 'available');

    const rematchBtn = container.querySelector('.btn-rematch')!;
    expect(rematchBtn.innerText).toBe('✓ Rematch Accepted');
    expect(rematchBtn.classList.contains('btn-ready-active')).toBe(true);
    expect(rematchBtn.disabled).toBe(true);
  });

  it('handles rematchOffer offered by opponent (accept rematch state)', () => {
    const offer = {
      requestedByPlayerId: 'p2',
      requestedByName: 'Bob',
      acceptedPlayerIds: ['p2']
    };

    overlaysUI.showGameOver('A', options, undefined, offer, 'p1', 'available');

    const rematchBtn = container.querySelector('.btn-rematch')!;
    expect(rematchBtn.innerText).toBe('✓ Accept Rematch');
    expect(rematchBtn.classList.contains('btn-ready-active')).toBe(true);
    expect(rematchBtn.disabled).toBe(false);

    rematchBtn.click();
    expect(options.onAcceptRematch).toHaveBeenCalledTimes(1);
  });
});
