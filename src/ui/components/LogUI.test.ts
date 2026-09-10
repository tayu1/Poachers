import { describe, it, expect, beforeEach } from 'vitest';
import { LogUI } from './LogUI';
import { ControlsUI } from './ControlsUI';
import { GameStore } from '../../store/store';

class MockElement {
  public tagName: string;
  public id: string = '';
  public className: string = '';
  public children: MockElement[] = [];
  public childNodes: MockElement[] = [];
  public parentElement: MockElement | null = null;
  public style: Record<string, string> = {};
  public innerText: string = '';
  public innerHTML: string = '';
  public scrollTop: number = 0;
  public scrollHeight: number = 100;
  public clientHeight: number = 100;
  public offsetHeight: number = 100;
  public offsetTop: number = 0;
  public classList = {
    classes: new Set<string>(),
    add: (...tokens: string[]) => tokens.forEach(t => this.classList.classes.add(t)),
    remove: (...tokens: string[]) => tokens.forEach(t => this.classList.classes.delete(t)),
    contains: (token: string) => this.classList.classes.has(token),
    toggle: (token: string) => {
      if (this.classList.classes.has(token)) {
        this.classList.classes.delete(token);
        return false;
      } else {
        this.classList.classes.add(token);
        return true;
      }
    }
  };
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

  public removeChild(child: MockElement): MockElement {
    const idx = this.children.indexOf(child);
    if (idx !== -1) this.children.splice(idx, 1);
    const nIdx = this.childNodes.indexOf(child);
    if (nIdx !== -1) this.childNodes.splice(nIdx, 1);
    child.parentElement = null;
    return child;
  }

  public remove(): void {
    if (this.parentElement) {
      this.parentElement.removeChild(this);
    }
  }

  public querySelector(selector: string): MockElement | null {
    if (selector.startsWith('#')) {
      const targetId = selector.slice(1);
      if (this.id === targetId) return this;
      for (const child of this.children) {
        const found = child.querySelector(selector);
        if (found) return found;
      }
    }
    return null;
  }

  public lastScrollIntoViewOptions: any = null;

  public scrollIntoView(options?: any): void {
    this.lastScrollIntoViewOptions = options;
  }

  public addEventListener(event: string, handler: (e: any) => void): void {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(handler);
  }
}

// Setup global document mock
(globalThis as any).document = {
  createElement: (tag: string) => new MockElement(tag),
  getElementById: (_id: string) => null,
  body: new MockElement('body'),
  head: new MockElement('head'),
  addEventListener: () => {}
};

describe('LogUI and ControlsUI requirements', () => {
  let store: GameStore;

  beforeEach(() => {
    store = new GameStore();
  });

  it('should render standard moves with turn and seat numbering, but unnumbered for card swap and card refill', () => {
    const container = new MockElement('div') as unknown as HTMLElement;
    const logUI = new LogUI(container, () => {});

    // Add 1 standard move, 1 card swap, 1 combat resolution, 1 card refill
    store.addLogEntry({
      turnNumber: 1,
      seat: 'N',
      text: 'P : e2 -> e4'
    });

    store.addLogEntry({
      turnNumber: 2,
      seat: 'E',
      text: 'card swap'
    });

    store.addLogEntry({
      turnNumber: 3,
      seat: 'S',
      text: 'P : Takes(N) : e3 -> e4(X)'
    });

    store.addLogEntry({
      turnNumber: 3,
      seat: 'S',
      text: 'card refill'
    });

    logUI.render(store.getState(), store);

    const logEntries = (container as any).querySelector('#log-entries');
    expect(logEntries).not.toBeNull();
    expect(logEntries.children.length).toBe(5);

    // Entry 0: 1. N] P : e2 -> e4
    expect(logEntries.children[0].children[0].innerText).toBe('1. N] P : e2 -> e4');
    expect(logEntries.children[0].children[0].style.color).toBe('#e2e8f0');

    // Entry 1: ---card change (no numbering like 2. E], grey color)
    expect(logEntries.children[1].children[0].innerText).toBe('---card change');
    expect(logEntries.children[1].children[0].style.color).toBe('#888888');

    // Entry 2: 3. S] P : Takes(N) : e3 -> e4(X)
    expect(logEntries.children[2].children[0].innerText).toBe('3. S] P : Takes(N) : e3 -> e4(X)');
    expect(logEntries.children[2].children[0].style.color).toBe('#e2e8f0');

    // Entry 3: ---card refill (no numbering like 3. S], grey color)
    expect(logEntries.children[3].children[0].innerText).toBe('---card refill');
    expect(logEntries.children[3].children[0].style.color).toBe('#888888');

    // Entry 4: current turn
    expect(logEntries.children[4].children[0].innerText).toBe('current turn');
    expect(logEntries.children[4].classList.contains('log-ui-entry-selected')).toBe(true);
  });

  it('should also render ---card swap or entries with prefix --- as unnumbered in grey color', () => {
    const container = new MockElement('div') as unknown as HTMLElement;
    const logUI = new LogUI(container, () => {});

    store.addLogEntry({
      turnNumber: 4,
      seat: 'W',
      text: '---card swap'
    });

    store.addLogEntry({
      turnNumber: 4,
      seat: 'W',
      text: '---card refill'
    });

    logUI.render(store.getState(), store);

    const logEntries = (container as any).querySelector('#log-entries');
    expect(logEntries.children[0].children[0].innerText).toBe('---card change');
    expect(logEntries.children[0].children[0].style.color).toBe('#888888');
    expect(logEntries.children[1].children[0].innerText).toBe('---card refill');
    expect(logEntries.children[1].children[0].style.color).toBe('#888888');
  });

  it('should render timer up random moves with normal notation and (timer) on the same line', () => {
    const container = new MockElement('div') as unknown as HTMLElement;
    const logUI = new LogUI(container, () => {});

    store.addLogEntry({
      turnNumber: 5,
      seat: 'E',
      text: 'P : e2 -> e4 (timer)'
    });

    logUI.render(store.getState(), store);

    const logEntries = (container as any).querySelector('#log-entries');
    expect(logEntries.children[0].children[0].innerText).toBe('5. E] P : e2 -> e4 (timer)');
  });

  it('should NOT render "REVIEW / REPLAY MODE" banner in ControlsUI menu even when store.isReplaying is true', () => {
    const container = new MockElement('div') as unknown as HTMLElement;
    const controlsUI = new ControlsUI(container, () => {}, () => {});

    store.isReplaying = true;
    controlsUI.render(store.getState(), store);

    // Check innerText of all elements inside panel
    const panel = (container as any).children[0] as MockElement;
    expect(panel).not.toBeUndefined();

    const bannerChild = panel.children.find(c => c.innerText && (c.innerText.includes('REVIEW') || c.innerText.includes('REPLAY')));
    expect(bannerChild).toBeUndefined();
  });

  it('should render POACHERS title and Rules button on the same line in ControlsUI', () => {
    const container = new MockElement('div') as unknown as HTMLElement;
    const controlsUI = new ControlsUI(container, () => {}, () => {});

    controlsUI.render(store.getState(), store);

    const panel = (container as any).children[0] as MockElement;
    expect(panel).not.toBeUndefined();

    const headerRow = panel.children[0];
    expect(headerRow.style.display).toBe('flex');
    expect(headerRow.children.length).toBe(2);

    const titleEl = headerRow.children[0];
    expect(titleEl.innerText).toBe('POACHERS');

    const rulesBtn = headerRow.children[1];
    expect(rulesBtn.innerText).toContain('RULES');
    expect(rulesBtn.className).toContain('btn-show-rules');
  });

  it('should scroll log container internally on new moves without calling scrollIntoView on window/ancestors', () => {
    const container = new MockElement('div') as unknown as HTMLElement;
    const logUI = new LogUI(container, () => {});

    store.addLogEntry({ turnNumber: 1, seat: 'N', text: 'P : e2 -> e4' });
    store.addLogEntry({ turnNumber: 2, seat: 'E', text: 'P : e7 -> e5' });
    store.addLogEntry({ turnNumber: 3, seat: 'S', text: 'N : g1 -> f3' });

    logUI.render(store.getState(), store);

    const logEntries = (container as any).querySelector('#log-entries');
    expect(logEntries).not.toBeNull();
    expect(logEntries.className).toBe('log-entries');
    expect(logEntries.style.paddingRight).toBe('4px');

    // Make sure scrollIntoView was NOT called on any child, which prevents mobile window jumping
    for (const child of logEntries.children) {
      expect(child.lastScrollIntoViewOptions).toBeNull();
    }
    // Make sure logList.scrollTop was set to scrollHeight in live mode
    expect(logEntries.scrollTop).toBe(logEntries.scrollHeight);
  });

  it('should center selected entry within logList container during replay scrubbing without calling scrollIntoView', () => {
    const container = new MockElement('div') as unknown as HTMLElement;
    const logUI = new LogUI(container, () => {});

    store.recordSnapshot();
    store.addLogEntry({ turnNumber: 1, seat: 'N', text: 'P : e2 -> e4' });
    store.recordSnapshot();
    store.addLogEntry({ turnNumber: 2, seat: 'E', text: 'P : e7 -> e5' });
    store.recordSnapshot();
    store.addLogEntry({ turnNumber: 3, seat: 'S', text: 'N : g1 -> f3' });

    // Scrub to history entry 1
    store.scrubToHistoryIndex(1);
    expect(store.isReplaying).toBe(true);

    logUI.render(store.getState(), store);

    const logEntries = (container as any).querySelector('#log-entries');
    expect(logEntries).not.toBeNull();

    // Verify scrollIntoView was never invoked
    for (const child of logEntries.children) {
      expect(child.lastScrollIntoViewOptions).toBeNull();
    }

    // Selected entry (index 1) has offsetTop 0, containerHeight 100, elementHeight 100
    // Math.max(0, 0 - 50 + 50) = 0
    expect(logEntries.scrollTop).toBe(0);
  });

  it('should render victory announcements with gold color and trophy prefix', () => {
    const container = new MockElement('div') as unknown as HTMLElement;
    const logUI = new LogUI(container, () => {});

    store.addLogEntry({
      turnNumber: 39,
      seat: 'N',
      text: '🏆 Team A Victorious! (King Captured)'
    });

    logUI.render(store.getState(), store);

    const logEntries = (container as any).querySelector('#log-entries');
    expect(logEntries.children.length).toBe(1);
    expect(logEntries.children[0].children[0].innerText).toBe('🏆 Team A Victorious! (King Captured)');
    expect(logEntries.children[0].children[0].style.color).toBe('var(--accent-gold)');
    expect(logEntries.children[0].children[0].style.fontWeight).toBe('bold');
  });

  it('should enable < button on Move 1 to allow navigating back to initial setup, and disable at index 0', () => {
    const container = new MockElement('div') as unknown as HTMLElement;
    const logUI = new LogUI(container, () => {});

    store.resetGame(false, true);
    // Index 0: initial setup
    store.recordSnapshot(); // Index 1: Move 1
    store.addLogEntry({ turnNumber: 1, seat: 'N', text: 'P : e2 -> e4' });

    // Scrub to Move 1 (historyIndex: 1)
    store.scrubToHistoryIndex(1);
    expect(store.historyIndex).toBe(1);
    logUI.render(store.getState(), store);

    const btnPrev = (container as any).querySelector('#log-btn-prev');
    const btnNext = (container as any).querySelector('#log-btn-next');
    expect(btnPrev).not.toBeNull();
    expect(btnNext).not.toBeNull();

    // At Move 1, < is ENABLED so player can step back to initial board!
    expect(btnPrev.disabled).toBe(false);

    // Step back to initial board (historyIndex: 0)
    store.stepReplay('prev');
    expect(store.historyIndex).toBe(0);
    expect(store.activeLogIndex).toBe(-1);

    logUI.render(store.getState(), store);

    // At starting position, < is DISABLED and > is ENABLED
    expect(btnPrev.disabled).toBe(true);
    expect(btnNext.disabled).toBe(false);

    // Verify no log entry is selected at starting position
    const logEntries = (container as any).querySelector('#log-entries');
    for (const child of logEntries.children) {
      expect(child.classList.contains('log-ui-entry-selected')).toBe(false);
    }
  });

  it('should render "current turn" line during active game, select it in live mode, deselect on replay, and resume live on click', () => {
    const container = new MockElement('div') as unknown as HTMLElement;
    const logUI = new LogUI(container, () => {});

    store.resetGame(false, true);
    store.recordSnapshot();
    store.addLogEntry({ turnNumber: 1, seat: 'N', text: 'P : c2 -> c4' });
    store.recordSnapshot(); // live state snapshot at index 2

    // Live mode: render active game
    logUI.render(store.getState(), store);

    const logEntries = (container as any).querySelector('#log-entries');
    expect(logEntries).not.toBeNull();
    expect(logEntries.children.length).toBe(2);

    const move1 = logEntries.children[0];
    const currentTurn = logEntries.children[1];

    expect(move1.children[0].innerText).toBe('1. N] P : c2 -> c4');
    expect(move1.classList.contains('log-ui-entry-selected')).toBe(false);

    expect(currentTurn.children[0].innerText).toBe('current turn');
    expect(currentTurn.classList.contains('log-ui-entry-selected')).toBe(true);

    // Scrub back to Move 1 in replay mode
    store.scrubToHistoryIndex(1);
    expect(store.isReplaying).toBe(true);

    logUI.render(store.getState(), store);
    expect(move1.classList.contains('log-ui-entry-selected')).toBe(true);
    expect(currentTurn.classList.contains('log-ui-entry-selected')).toBe(false);

    // Clicking current turn resumes live mode
    (currentTurn as any).listeners['click'][0]({ preventDefault: () => {}, stopPropagation: () => {} });
    expect(store.isReplaying).toBe(false);

    logUI.render(store.getState(), store);
    expect(move1.classList.contains('log-ui-entry-selected')).toBe(false);
    expect(currentTurn.classList.contains('log-ui-entry-selected')).toBe(true);

    // Game Over: Victorious entry replaces current turn
    store.addLogEntry({ turnNumber: 2, seat: 'S', text: '🏆 Team A Victorious! (King Captured)' });
    store.getState().isGameOver = true;

    logUI.render(store.getState(), store);

    // Now logEntries has move 1 and victorious entry, NO current turn!
    expect(logEntries.children.length).toBe(2);
    expect(logEntries.children[0].children[0].innerText).toBe('1. N] P : c2 -> c4');
    expect(logEntries.children[1].children[0].innerText).toBe('🏆 Team A Victorious! (King Captured)');
    expect(logEntries.children[1].classList.contains('log-ui-entry-selected')).toBe(true);
  });
});
