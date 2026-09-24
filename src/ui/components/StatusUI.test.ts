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
    if (selector === '.turn-timer') {
      return this.findChild(c => c.className.includes('turn-timer'));
    }
    return null;
  }

  private findChild(predicate: (el: MockElement) => boolean): MockElement | null {
    for (const child of this.children) {
      if (predicate(child)) return child;
      const found = child.findChild(predicate);
      if (found) return found;
    }
    return null;
  }
}

describe('StatusUI', () => {
  beforeEach(() => {
    (globalThis as any).document = {
      createElement: (tag: string) => new MockElement(tag)
    };
  });

  it('displays the total card count (0-6) of each player combining trench cards and backup cards', () => {
    const container = new MockElement('div');
    const statusUI = new StatusUI(container as any);
    const state = createInitialGameState();

    // North has 3 trench cards and 0 backup cards -> total 3
    state.players[PlayerSeat.NORTH].trenchCards = [
      { id: 'N1', suit: 'H', rank: 10 },
      { id: 'N2', suit: 'S', rank: 11 },
      { id: 'N3', suit: 'D', rank: 12 }
    ];
    state.players[PlayerSeat.NORTH].backupCards = [null, null, null];

    // East has 3 trench cards and 2 backup cards -> total 5
    state.players[PlayerSeat.EAST].trenchCards = [
      { id: 'E1', suit: 'H', rank: 5 },
      { id: 'E2', suit: 'C', rank: 6 },
      { id: 'E3', suit: 'S', rank: 7 }
    ];
    state.players[PlayerSeat.EAST].backupCards = [
      { id: 'EB1', suit: 'D', rank: 8 },
      { id: 'EB2', suit: 'H', rank: 9 },
      null
    ];

    // South has 3 trench cards and 3 backup cards -> total 6
    state.players[PlayerSeat.SOUTH].trenchCards = [
      { id: 'S1', suit: 'C', rank: 2 },
      { id: 'S2', suit: 'D', rank: 3 },
      { id: 'S3', suit: 'H', rank: 4 }
    ];
    state.players[PlayerSeat.SOUTH].backupCards = [
      { id: 'SB1', suit: 'S', rank: 10 },
      { id: 'SB2', suit: 'H', rank: 11 },
      { id: 'SB3', suit: 'C', rank: 12 }
    ];

    // West has 1 trench card and 0 backup cards -> total 1
    state.players[PlayerSeat.WEST].trenchCards = [
      { id: 'W1', suit: 'S', rank: 14 },
      null,
      null
    ];
    state.players[PlayerSeat.WEST].backupCards = [null, null, null];

    statusUI.render(state);

    const playersBox = container.children.find(c => c.className === 'players-status-box')!;
    expect(playersBox).toBeTruthy();
    expect(playersBox.children.length).toBe(4);

    // Row 0: North -> total 3
    const northRow = playersBox.children[0];
    const northIndicators = northRow.children[1];
    const northBadge = northIndicators.children[2];
    expect(northBadge.innerText).toBe('3');
    expect(northBadge.title).toBe('Total Cards: 3 (Trench: 3, Backup: 0)');

    // Row 1: East -> total 5
    const eastRow = playersBox.children[1];
    const eastIndicators = eastRow.children[1];
    const eastBadge = eastIndicators.children[2];
    expect(eastBadge.innerText).toBe('5');
    expect(eastBadge.title).toBe('Total Cards: 5 (Trench: 3, Backup: 2)');

    // Row 2: South -> total 6
    const southRow = playersBox.children[2];
    const southIndicators = southRow.children[1];
    const southBadge = southIndicators.children[2];
    expect(southBadge.innerText).toBe('6');
    expect(southBadge.title).toBe('Total Cards: 6 (Trench: 3, Backup: 3)');

    // Row 3: West -> total 1
    const westRow = playersBox.children[3];
    const westIndicators = westRow.children[1];
    const westBadge = westIndicators.children[2];
    expect(westBadge.innerText).toBe('1');
    expect(westBadge.title).toBe('Total Cards: 1 (Trench: 1, Backup: 0)');
  });

  it('correctly displays 0 when a player has no trench or backup cards', () => {
    const container = new MockElement('div');
    const statusUI = new StatusUI(container as any);
    const state = createInitialGameState();

    state.players[PlayerSeat.NORTH].trenchCards = [null, null, null];
    state.players[PlayerSeat.NORTH].backupCards = [null, null, null];

    statusUI.render(state);

    const playersBox = container.children.find(c => c.className === 'players-status-box')!;
    const northBadge = playersBox.children[0].children[1].children[2];
    expect(northBadge.innerText).toBe('0');
    expect(northBadge.title).toBe('Total Cards: 0 (Trench: 0, Backup: 0)');
  });
});
