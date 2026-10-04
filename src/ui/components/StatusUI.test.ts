import { describe, it, expect, beforeEach } from 'vitest';
import { StatusUI } from './StatusUI';
import { createInitialGameState } from '../../core/engine';
import { PlayerSeat } from '../../core/types';

class MockElement {
  public tagName: string;
  public className: string = '';
  public children: MockElement[] = [];
  public childNodes: MockElement[] = [];
  public parentElement: MockElement | null = null;
  public dataset: Record<string, string> = {};
  public style: Record<string, string> = {};
  public title: string = '';
  public innerHTML: string = '';
  public innerText: string = '';
  public textContent: string = '';

  constructor(tagName: string) {
    this.tagName = tagName;
  }

  public appendChild(child: MockElement): MockElement {
    this.children.push(child);
    this.childNodes.push(child);
    child.parentElement = this;
    return child;
  }

  public contains(child: MockElement): boolean {
    if (child === this) return true;
    return this.children.some(c => c.contains(child));
  }

  public querySelector(selector: string): MockElement | null {
    if (selector.startsWith('.')) {
      const cls = selector.substring(1);
      return this.findChild(c => c.className.split(/\s+/).includes(cls));
    }
    return null;
  }

  public querySelectorAll(selector: string): MockElement[] {
    const results: MockElement[] = [];
    if (selector.startsWith('.')) {
      const cls = selector.substring(1);
      this.collectChildren(c => c.className.split(/\s+/).includes(cls), results);
    }
    return results;
  }

  private findChild(predicate: (el: MockElement) => boolean): MockElement | null {
    for (const child of this.children) {
      if (predicate(child)) return child;
      const found = child.findChild(predicate);
      if (found) return found;
    }
    return null;
  }

  private collectChildren(predicate: (el: MockElement) => boolean, results: MockElement[]): void {
    for (const child of this.children) {
      if (predicate(child)) results.push(child);
      child.collectChildren(predicate, results);
    }
  }
}

describe('StatusUI with Compass Square', () => {
  beforeEach(() => {
    (globalThis as any).document = {
      createElement: (tag: string) => new MockElement(tag)
    };
  });

  it('renders compass square in place of the status bar with 4 directional slots and a center dot', () => {
    const container = new MockElement('div');
    const statusUI = new StatusUI(container as any);
    const state = createInitialGameState();

    statusUI.render(state);

    const compassBox = container.querySelector('.status-compass-box');
    expect(compassBox).toBeTruthy();

    const topSlot = container.querySelector('.compass-slot-top');
    const rightSlot = container.querySelector('.compass-slot-right');
    const bottomSlot = container.querySelector('.compass-slot-bottom');
    const leftSlot = container.querySelector('.compass-slot-left');
    const centerDot = container.querySelector('.compass-center-dot');

    expect(topSlot).toBeTruthy();
    expect(rightSlot).toBeTruthy();
    expect(bottomSlot).toBeTruthy();
    expect(leftSlot).toBeTruthy();
    expect(centerDot).toBeTruthy();
  });

  it('displays full direction names ("North", "East", "South", "West") with player name under each', () => {
    const container = new MockElement('div');
    const statusUI = new StatusUI(container as any);
    const state = createInitialGameState();

    const mockStore: any = {
      boardRotationAngle: 0,
      botSeats: {
        [PlayerSeat.NORTH]: false,
        [PlayerSeat.EAST]: true,
        [PlayerSeat.SOUTH]: false,
        [PlayerSeat.WEST]: true
      },
      roomState: {
        seats: {
          [PlayerSeat.NORTH]: { name: 'Alice' },
          [PlayerSeat.EAST]: { name: 'BOT (E)' },
          [PlayerSeat.SOUTH]: { name: 'Bob' },
          [PlayerSeat.WEST]: { name: 'BOT (W)' }
        }
      }
    };

    statusUI.render(state, mockStore);

    const topSlot = container.querySelector('.compass-slot-top')!;
    const rightSlot = container.querySelector('.compass-slot-right')!;
    const bottomSlot = container.querySelector('.compass-slot-bottom')!;
    const leftSlot = container.querySelector('.compass-slot-left')!;

    // At 0 deg: Top=North, Right=East, Bottom=South, Left=West
    expect(topSlot.children[0].innerText).toBe('North');
    expect(topSlot.children[1].innerText).toBe('Alice');

    expect(rightSlot.children[0].innerText).toBe('East');
    expect(rightSlot.children[1].innerText).toBe('BOT (E)');

    expect(bottomSlot.children[0].innerText).toBe('South');
    expect(bottomSlot.children[1].innerText).toBe('Bob');

    expect(leftSlot.children[0].innerText).toBe('West');
    expect(leftSlot.children[1].innerText).toBe('BOT (W)');
  });

  it('rotates direction and player positions when board rotates (90, 180, 270 deg)', () => {
    const container = new MockElement('div');
    const statusUI = new StatusUI(container as any);
    const state = createInitialGameState();

    const mockStore: any = {
      boardRotationAngle: 90,
      botSeats: {
        [PlayerSeat.NORTH]: false,
        [PlayerSeat.EAST]: true,
        [PlayerSeat.SOUTH]: false,
        [PlayerSeat.WEST]: true
      }
    };

    // At 90 deg: Top=West, Right=North, Bottom=East, Left=South
    statusUI.render(state, mockStore);

    const topSlot = container.querySelector('.compass-slot-top')!;
    const rightSlot = container.querySelector('.compass-slot-right')!;
    const bottomSlot = container.querySelector('.compass-slot-bottom')!;
    const leftSlot = container.querySelector('.compass-slot-left')!;

    expect(topSlot.children[0].innerText).toBe('West');
    expect(rightSlot.children[0].innerText).toBe('North');
    expect(bottomSlot.children[0].innerText).toBe('East');
    expect(leftSlot.children[0].innerText).toBe('South');

    // At 180 deg: Top=South, Right=West, Bottom=North, Left=East
    mockStore.boardRotationAngle = 180;
    statusUI.render(state, mockStore);

    expect(topSlot.children[0].innerText).toBe('South');
    expect(rightSlot.children[0].innerText).toBe('West');
    expect(bottomSlot.children[0].innerText).toBe('North');
    expect(leftSlot.children[0].innerText).toBe('East');

    // At 270 deg: Top=East, Right=South, Bottom=West, Left=North
    mockStore.boardRotationAngle = 270;
    statusUI.render(state, mockStore);

    expect(topSlot.children[0].innerText).toBe('East');
    expect(rightSlot.children[0].innerText).toBe('South');
    expect(bottomSlot.children[0].innerText).toBe('West');
    expect(leftSlot.children[0].innerText).toBe('North');
  });

  it('matches team colors for seat text and highlights current turn seat with transparency on other seats', () => {
    const container = new MockElement('div');
    const statusUI = new StatusUI(container as any);
    const state = createInitialGameState();
    // North is active player
    state.activePlayer = PlayerSeat.NORTH;

    const mockStore: any = {
      boardRotationAngle: 0,
      botSeats: {}
    };

    statusUI.render(state, mockStore);

    const topSlot = container.querySelector('.compass-slot-top')!;
    const rightSlot = container.querySelector('.compass-slot-right')!;
    const bottomSlot = container.querySelector('.compass-slot-bottom')!;
    const leftSlot = container.querySelector('.compass-slot-left')!;

    // North (Top) & South (Bottom) are Team A
    expect(topSlot.children[0].style.color).toContain('var(--Team_A_color');
    expect(topSlot.children[1].style.color).toContain('var(--Team_A_color');
    expect(bottomSlot.children[0].style.color).toContain('var(--Team_A_color');
    expect(bottomSlot.children[1].style.color).toContain('var(--Team_A_color');

    // East (Right) & West (Left) are Team B
    expect(rightSlot.children[0].style.color).toContain('var(--Team_B_color');
    expect(rightSlot.children[1].style.color).toContain('var(--Team_B_color');
    expect(leftSlot.children[0].style.color).toContain('var(--Team_B_color');
    expect(leftSlot.children[1].style.color).toContain('var(--Team_B_color');

    // Active seat (North/Top) is highlighted at full opacity 1.0
    expect(topSlot.style.opacity).toBe('1.0');

    // Other seats are slightly transparent (0.35)
    expect(rightSlot.style.opacity).toBe('0.35');
    expect(bottomSlot.style.opacity).toBe('0.35');
    expect(leftSlot.style.opacity).toBe('0.35');
  });
});
