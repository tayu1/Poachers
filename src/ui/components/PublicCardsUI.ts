import { Card, GameState } from '../../core/types';

export class PublicCardsUI {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  private renderCard(
    card: Card | null,
    label?: string,
    isWinningCard: boolean = false,
    winningTeamClass: string = ''
  ): HTMLElement {
    const el = document.createElement('div');

    if (card) {
      const isRed = card.suit === 'H' || card.suit === 'D';
      const suitSymbol = { S: '♠', H: '♥', D: '♦', C: '♣' }[card.suit];
      const rankSymbol =
        ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' } as Record<number, string>)[card.rank] ||
        card.rank.toString();
      const colorClass = isRed ? 'card-red' : 'card-black';
      const winClass = isWinningCard ? `winning-card-highlight ${winningTeamClass}` : '';
      const tenClass = card.rank === 10 ? ' rank-ten' : '';

      el.className = `public-card ${colorClass} ${winClass}`.trim();
      el.innerHTML = `<div class="card-val-top${tenClass}">${rankSymbol}</div><div class="card-suit-bottom">${suitSymbol}</div>`;
    } else {
      el.className = 'public-card card-back face-down';
    }

    if (label) {
      el.title = label;
    }

    return el;
  }

  public render(state: GameState): void {
    this.container.innerHTML = '';

    const winningCardIds = new Set<string>();
    let winningTeamClass = '';

    if (state.pendingCombat && state.isTurnRiverRevealed && state.pendingCombat.winnerSeat !== null && state.pendingCombat.winnerSeat !== undefined) {
      const combat = state.pendingCombat;
      const winnerSeat = combat.winnerSeat ?? combat.attackerSeat;
      const winnerTeam = state.players[winnerSeat]?.team ?? 'A';
      winningTeamClass = winnerTeam === 'A' ? 'winning-team-a' : 'winning-team-b';

      const winningHand = winnerSeat === combat.attackerSeat ? combat.attackerHand : combat.defenderHand;
      if (winningHand && winningHand.winningCards) {
        winningHand.winningCards.forEach(c => winningCardIds.add(c.id));
      }
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'public-cards-container';

    // 3 Flop Cards
    state.publicFlop.forEach((card, idx) => {
      const isWinning = card !== null && winningCardIds.has(card.id);
      wrapper.appendChild(this.renderCard(card, `Flop #${idx + 1}`, isWinning, winningTeamClass));
    });

    // Divider line
    const divider = document.createElement('div');
    divider.className = 'public-cards-divider';
    wrapper.appendChild(divider);

    // Turn & River Cards
    state.publicTurnRiver.forEach((card, idx) => {
      const label = idx === 0 ? 'Turn' : 'River';
      const displayCard = state.isTurnRiverRevealed ? card : null;
      const isWinning = displayCard !== null && winningCardIds.has(displayCard.id);
      wrapper.appendChild(this.renderCard(displayCard, label, isWinning, winningTeamClass));
    });

    this.container.appendChild(wrapper);
  }
}
