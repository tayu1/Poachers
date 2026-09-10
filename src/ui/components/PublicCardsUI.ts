import { Card, GameState } from '../../core/types';
import { GameStore } from '../../store/store';
import { CARD_ANIMATION_TIME_MS } from '../../config';

interface PublicSlotHolder {
  cardEl: HTMLElement;
  slotBayEl: HTMLElement;
  innerEl: HTMLElement;
  valEl: HTMLElement;
  suitEl: HTMLElement;
}

export class PublicCardsUI {
  private container: HTMLElement;
  private slotHolders: PublicSlotHolder[] = [];
  private lastCardKeys: (string | null)[] = [null, null, null, null, null];
  private animTimeouts: Map<number, number> = new Map();
  private hasRenderedOnce = false;
  private isInitialized = false;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  private clearSlotAnimation(slotIdx: number, holder: PublicSlotHolder): void {
    const timer = this.animTimeouts.get(slotIdx);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.animTimeouts.delete(slotIdx);
    }
    holder.innerEl.classList.remove('slide-out-right', 'slide-in-right');
  }

  private applySlotContent(
    holder: PublicSlotHolder,
    card: Card | null,
    isFaceDown: boolean,
    label?: string,
    isWinningCard: boolean = false,
    winningTeamClass: string = ''
  ): void {
    if (label) {
      holder.cardEl.title = label;
    }

    const winClass = isWinningCard ? `winning-card-highlight ${winningTeamClass}` : '';

    if (isFaceDown || (!card && isFaceDown)) {
      holder.cardEl.className = `public-card card-back face-down ${winClass}`.trim();
      holder.innerEl.className = 'card-inner-face card-back face-down';
      holder.innerEl.style.display = 'block';
      holder.valEl.style.display = 'none';
      holder.suitEl.style.display = 'none';
    } else if (card) {
      const isRed = card.suit === 'H' || card.suit === 'D';
      const suitSymbol = { S: '♠', H: '♥', D: '♦', C: '♣' }[card.suit];
      const rankSymbol =
        ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' } as Record<number, string>)[card.rank] ||
        card.rank.toString();
      const colorClass = isRed ? 'card-red' : 'card-black';
      const tenClass = card.rank === 10 ? ' rank-ten' : '';

      holder.cardEl.className = `public-card ${colorClass} ${winClass}`.trim();
      holder.innerEl.className = `card-inner-face ${colorClass}`;
      holder.innerEl.style.display = 'block';

      holder.valEl.className = `card-val-top${tenClass}`;
      holder.valEl.textContent = rankSymbol;
      holder.valEl.style.display = 'block';

      holder.suitEl.className = 'card-suit-bottom';
      holder.suitEl.textContent = suitSymbol;
      holder.suitEl.style.display = 'block';
    } else {
      holder.cardEl.className = `public-card card-empty ${winClass}`.trim();
      holder.innerEl.style.display = 'none';
      holder.valEl.style.display = 'none';
      holder.suitEl.style.display = 'none';
    }
  }

  private initDOMStructure(): void {
    this.container.innerHTML = '';
    this.slotHolders = [];

    const wrapper = document.createElement('div');
    wrapper.className = 'public-cards-container';

    for (let i = 0; i < 5; i++) {
      if (i === 3) {
        const divider = document.createElement('div');
        divider.className = 'public-cards-divider';
        wrapper.appendChild(divider);
      }

      const cardEl = document.createElement('div');
      cardEl.className = 'public-card';

      const slotBayEl = document.createElement('div');
      slotBayEl.className = 'card-slot-bay';

      const innerEl = document.createElement('div');
      innerEl.className = 'card-inner-face';

      const valEl = document.createElement('div');
      valEl.className = 'card-val-top';

      const suitEl = document.createElement('div');
      suitEl.className = 'card-suit-bottom';

      innerEl.appendChild(valEl);
      innerEl.appendChild(suitEl);

      cardEl.appendChild(slotBayEl);
      cardEl.appendChild(innerEl);
      wrapper.appendChild(cardEl);

      this.slotHolders.push({ cardEl, slotBayEl, innerEl, valEl, suitEl });
    }

    this.container.appendChild(wrapper);
    this.isInitialized = true;
  }

  public render(state: GameState, store?: GameStore): void {
    if (!this.isInitialized || !this.container.hasChildNodes()) {
      this.initDOMStructure();
    }

    const winningCardIds = new Set<string>();
    let winningTeamClass = '';

    if (
      state.pendingCombat &&
      state.isTurnRiverRevealed &&
      state.pendingCombat.winnerSeat !== null &&
      state.pendingCombat.winnerSeat !== undefined
    ) {
      const combat = state.pendingCombat;
      const winnerSeat = combat.winnerSeat ?? combat.attackerSeat;
      const winnerTeam = state.players[winnerSeat]?.team ?? 'A';
      winningTeamClass = winnerTeam === 'A' ? 'winning-team-a' : 'winning-team-b';

      const winningHand =
        winnerSeat === combat.attackerSeat ? combat.attackerHand : combat.defenderHand;
      if (winningHand && winningHand.winningCards) {
        winningHand.winningCards.forEach(c => winningCardIds.add(c.id));
      }
    }

    const inCombat = Boolean(state.pendingCombat || store?.isCombatDelaying);
    // STRICT COMBAT PROTECTION: Never animate during combat showdown
    const canAnimate = this.hasRenderedOnce && (!store || !store.isReplaying) && !inCombat;

    // Slot definitions
    const slotConfigs: { card: Card | null; isFaceDown: boolean; label: string }[] = [
      { card: state.publicFlop[0] ?? null, isFaceDown: false, label: 'Flop #1' },
      { card: state.publicFlop[1] ?? null, isFaceDown: false, label: 'Flop #2' },
      { card: state.publicFlop[2] ?? null, isFaceDown: false, label: 'Flop #3' },
      {
        card: state.isTurnRiverRevealed ? (state.publicTurnRiver[0] ?? null) : null,
        isFaceDown: !state.isTurnRiverRevealed,
        label: 'Turn'
      },
      {
        card: state.isTurnRiverRevealed ? (state.publicTurnRiver[1] ?? null) : null,
        isFaceDown: !state.isTurnRiverRevealed,
        label: 'River'
      }
    ];

    slotConfigs.forEach((config, idx) => {
      const holder = this.slotHolders[idx];
      if (!holder) return;

      const card = config.card;
      const isFaceDown = config.isFaceDown;
      const label = config.label;
      const isWinning = card !== null && winningCardIds.has(card.id);

      const cardKey = isFaceDown ? 'facedown' : (card ? card.id : 'empty');
      const prevKey = this.lastCardKeys[idx];
      const isCardChanged = prevKey !== null && prevKey !== cardKey;

      // Only animate actual face-up card replacements outside combat (e.g. 3 new flop cards dealt post-combat)
      const isFlopSwap = idx < 3 && !isFaceDown && prevKey !== 'empty' && cardKey !== 'empty' && isCardChanged;

      if (canAnimate && isFlopSwap) {
        this.clearSlotAnimation(idx, holder);
        // Phase 1: Old card slides out to the right
        holder.innerEl.classList.add('slide-out-right');

        // Delay until slide-out finishes before updating to the new card
        const timer = setTimeout(() => {
          holder.innerEl.classList.remove('slide-out-right');
          this.applySlotContent(holder, card, isFaceDown, label, isWinning, winningTeamClass);
          // Phase 2: New card slides in from the same direction (from the right)
          holder.innerEl.classList.add('slide-in-right');

          const inTimer = setTimeout(() => {
            holder.innerEl.classList.remove('slide-in-right');
            this.animTimeouts.delete(idx);
          }, CARD_ANIMATION_TIME_MS);
          this.animTimeouts.set(idx, inTimer as any);
        }, CARD_ANIMATION_TIME_MS);
        this.animTimeouts.set(idx, timer as any);
      } else {
        if (!this.animTimeouts.has(idx) || inCombat) {
          if (inCombat) {
            this.clearSlotAnimation(idx, holder);
          }
          this.applySlotContent(holder, card, isFaceDown, label, isWinning, winningTeamClass);
        }
      }

      this.lastCardKeys[idx] = cardKey;
    });

    this.hasRenderedOnce = true;
  }
}
