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
  createElement: (tag: string) => new MockElement(tag)
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
    expect(logEntries.children.length).toBe(4);

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
});
