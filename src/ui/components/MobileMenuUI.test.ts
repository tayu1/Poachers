import { describe, it, expect, beforeEach } from 'vitest';
import { MobileMenuUI, MobileMenuTab } from './MobileMenuUI';

class MockElement {
  public tagName: string;
  public id: string = '';
  public className: string = '';
  public children: MockElement[] = [];
  public childNodes: MockElement[] = [];
  public parentElement: MockElement | null = null;
  public style: Record<string, string> = {};
  private _innerHTML: string = '';
  public get innerHTML(): string {
    return this._innerHTML;
  }
  public set innerHTML(val: string) {
    this._innerHTML = val;
    if (val === '') {
      this.children = [];
      this.childNodes = [];
    }
  }
  public classList = {
    add: (cls: string) => {
      const set = new Set(this.className.split(/\s+/).filter(Boolean));
      set.add(cls);
      this.className = Array.from(set).join(' ');
    },
    remove: (cls: string) => {
      const set = new Set(this.className.split(/\s+/).filter(Boolean));
      set.delete(cls);
      this.className = Array.from(set).join(' ');
    },
    toggle: (cls: string, force?: boolean) => {
      const set = new Set(this.className.split(/\s+/).filter(Boolean));
      const shouldAdd = force !== undefined ? force : !set.has(cls);
      if (shouldAdd) set.add(cls); else set.delete(cls);
      this.className = Array.from(set).join(' ');
      return shouldAdd;
    },
    contains: (cls: string) => this.className.split(/\s+/).includes(cls)
  };
  private listeners: Record<string, ((e?: any) => void)[]> = {};

  constructor(tagName: string) {
    this.tagName = tagName;
  }

  public appendChild(child: MockElement): MockElement {
    this.children.push(child);
    this.childNodes.push(child);
    child.parentElement = this;
    return child;
  }

  public addEventListener(event: string, cb: (e?: any) => void): void {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(cb);
  }

  public click(): void {
    if (this.listeners['click']) {
      this.listeners['click'].forEach(cb => cb({}));
    }
  }

  public querySelector(_selector: string): MockElement | null {
    return null;
  }

  public scrollIntoView(): void {}
}

describe('MobileMenuUI', () => {
  let container: MockElement;
  let centerArea: MockElement;
  let statusPanel: MockElement;
  let controlsPanel: MockElement;
  let logPanel: MockElement;
  let capturesPanel: MockElement;
  let leftUnifiedPanel: MockElement;
  let rightUnifiedPanel: MockElement;

  beforeEach(() => {
    container = new MockElement('div');
    centerArea = new MockElement('div');
    statusPanel = new MockElement('div');
    controlsPanel = new MockElement('div');
    logPanel = new MockElement('div');
    capturesPanel = new MockElement('div');
    leftUnifiedPanel = new MockElement('div');
    rightUnifiedPanel = new MockElement('div');

    const elementsById: Record<string, MockElement> = {
      'status-panel': statusPanel,
      'controls-panel': controlsPanel,
      'log-panel': logPanel,
      'captures-panel': capturesPanel,
      'unified-left-panel': leftUnifiedPanel,
      'unified-right-panel': rightUnifiedPanel
    };

    (globalThis as any).document = {
      querySelector: (selector: string) => {
        if (selector === '.center-area') return centerArea;
        return null;
      },
      querySelectorAll: () => [],
      getElementById: (id: string) => elementsById[id] || null,
      createElement: (tag: string) => new MockElement(tag)
    };

    (globalThis as any).window = {
      innerWidth: 400
    };
  });

  it('renders exactly 5 tabs and does not include "all"', () => {
    const menu = new MobileMenuUI(container as unknown as HTMLElement);

    expect(container.children.length).toBe(5);

    const labels = container.children.map(c => c.innerHTML);
    expect(labels.some(html => html.includes('Board'))).toBe(true);
    expect(labels.some(html => html.includes('Status'))).toBe(true);
    expect(labels.some(html => html.includes('Controls'))).toBe(true);
    expect(labels.some(html => html.includes('Log'))).toBe(true);
    expect(labels.some(html => html.includes('Captures'))).toBe(true);
    expect(labels.some(html => html.includes('All'))).toBe(false);
  });

  it('defaults activeTab to "board"', () => {
    const menu = new MobileMenuUI(container as unknown as HTMLElement);
    expect(menu.getActiveTab()).toBe('board');
    expect(container.children[0].className).toContain('active');
  });

  it('changes activeTab when button clicked', () => {
    const menu = new MobileMenuUI(container as unknown as HTMLElement);

    // Click "Status" button (index 1)
    container.children[1].click();
    expect(menu.getActiveTab()).toBe('status');
    expect(container.children[1].className).toContain('active');
    expect(container.children[0].className).not.toContain('active');
  });

  it('applies tab visibility correctly on mobile (<900px)', () => {
    const menu = new MobileMenuUI(container as unknown as HTMLElement);

    // Initial state: 'board' -> only statusPanel (message-timer) is shown
    menu.applyTabVisibility();
    expect(statusPanel.style.display).toBe('flex');
    expect(capturesPanel.style.display).toBe('none');
    expect(controlsPanel.style.display).toBe('none');
    expect(logPanel.style.display).toBe('none');

    // Switch to 'status' tab -> entire right menu (statusPanel + capturesPanel) is shown
    menu.setTab('status');
    expect(statusPanel.style.display).toBe('flex');
    expect(capturesPanel.style.display).toBe('flex');
    expect(controlsPanel.style.display).toBe('none');
    expect(logPanel.style.display).toBe('none');

    // Switch to 'controls' tab
    menu.setTab('controls');
    expect(statusPanel.style.display).toBe('none');
    expect(capturesPanel.style.display).toBe('none');
    expect(controlsPanel.style.display).toBe('flex');
    expect(logPanel.style.display).toBe('none');

    // Switch to 'log' tab
    menu.setTab('log');
    expect(statusPanel.style.display).toBe('none');
    expect(capturesPanel.style.display).toBe('none');
    expect(controlsPanel.style.display).toBe('none');
    expect(logPanel.style.display).toBe('flex');

    // Switch to 'captures' tab
    menu.setTab('captures');
    expect(statusPanel.style.display).toBe('none');
    expect(capturesPanel.style.display).toBe('flex');
    expect(controlsPanel.style.display).toBe('none');
    expect(logPanel.style.display).toBe('none');
  });

  it('resets display on desktop (>900px)', () => {
    const menu = new MobileMenuUI(container as unknown as HTMLElement);
    menu.setTab('status');

    (globalThis as any).window.innerWidth = 1200;
    menu.applyTabVisibility();

    expect(statusPanel.style.display).toBe('');
    expect(controlsPanel.style.display).toBe('');
    expect(logPanel.style.display).toBe('');
    expect(capturesPanel.style.display).toBe('');
  });

  it('toggles show-sit-map class on statusPanel only when status button is chosen', () => {
    const menu = new MobileMenuUI(container as unknown as HTMLElement);

    // Initial tab is 'board' - show-sit-map should be false
    menu.applyTabVisibility();
    expect(statusPanel.classList.contains('show-sit-map')).toBe(false);

    // Click 'status' tab - show-sit-map should be true
    menu.setTab('status');
    expect(statusPanel.classList.contains('show-sit-map')).toBe(true);

    // Switch back to 'board' tab - show-sit-map should be false
    menu.setTab('board');
    expect(statusPanel.classList.contains('show-sit-map')).toBe(false);
  });
});
