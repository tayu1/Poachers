import { getValidPromotionOptions } from '../../core/engine';
import { formatCombatAnnouncementText } from '../../core/notation';
import { Card, GameState, PieceType, PlayerSeat, getPieceType } from '../../core/types';
import { GameStore } from '../../store/store';
import { buildPieceRow } from './CapturesUI';

interface BaseCardElementHolder {
  cardEl: HTMLElement;
  valEl: HTMLElement;
  suitEl: HTMLElement;
}

export class BaseDeckUI {
  private container: HTMLElement;
  private onBaseCardClick: (index: number) => void;
  private onPromoteClick: (piece: PieceType) => void;

  // Cached DOM elements
  private mainWrapper: HTMLElement | null = null;
  private combatWrapper: HTMLElement | null = null;
  private combatText: HTMLElement | null = null;
  private cardsRow: HTMLElement | null = null;
  private promoWrapper: HTMLElement | null = null;
  private cardHolders: BaseCardElementHolder[] = [];
  private cardTargetIndices: number[] = [];

  constructor(
    container: HTMLElement,
    onBaseCardClick: (index: number) => void,
    onPromoteClick: (piece: PieceType) => void
  ) {
    this.container = container;
    this.onBaseCardClick = onBaseCardClick;
    this.onPromoteClick = onPromoteClick;
  }

  private initDOMStructure(): void {
    this.container.innerHTML = '';
    this.cardHolders = [];

    this.mainWrapper = document.createElement('div');
    this.mainWrapper.style.display = 'flex';
    this.mainWrapper.style.flexDirection = 'column';
    this.mainWrapper.style.alignItems = 'center';
    this.mainWrapper.style.justifyContent = 'center';
    this.mainWrapper.style.gap = '4px';
    this.mainWrapper.style.width = '100%';
    this.mainWrapper.style.height = '100%';

    this.combatWrapper = document.createElement('div');
    this.combatWrapper.className = 'combat-announcement-wrapper';
    this.combatWrapper.style.display = 'none';

    this.combatText = document.createElement('div');
    this.combatText.className = 'combat-announcement-text';
    this.combatWrapper.appendChild(this.combatText);

    this.cardsRow = document.createElement('div');
    this.cardsRow.style.display = 'flex';
    this.cardsRow.style.justifyContent = 'center';
    this.cardsRow.style.alignItems = 'center';
    this.cardsRow.style.gap = '6px';
    this.cardsRow.style.flexWrap = 'nowrap';

    this.promoWrapper = document.createElement('div');
    this.promoWrapper.style.display = 'none';
    this.promoWrapper.style.alignItems = 'center';
    this.promoWrapper.style.gap = '6px';
    this.promoWrapper.style.marginLeft = '8px';
    this.promoWrapper.style.paddingLeft = '8px';
    this.promoWrapper.style.borderLeft = '1px solid var(--panel-border)';

    this.mainWrapper.appendChild(this.combatWrapper);
    this.mainWrapper.appendChild(this.cardsRow);
    this.cardsRow.appendChild(this.promoWrapper);

    this.container.appendChild(this.mainWrapper);
  }

  private getOrCreateCardHolder(idx: number): BaseCardElementHolder {
    if (this.cardHolders[idx]) {
      return this.cardHolders[idx];
    }

    const cardEl = document.createElement('div');
    cardEl.className = 'lcr-card';

    const valEl = document.createElement('div');
    valEl.className = 'card-val-top';

    const suitEl = document.createElement('div');
    suitEl.className = 'card-suit-bottom';

    cardEl.appendChild(valEl);
    cardEl.appendChild(suitEl);

    cardEl.addEventListener('click', () => {
      const targetIdx = this.cardTargetIndices[idx];
      if (targetIdx !== undefined) {
        this.onBaseCardClick(targetIdx);
      }
    });

    const holder: BaseCardElementHolder = { cardEl, valEl, suitEl };
    this.cardHolders[idx] = holder;
    return holder;
  }

  public render(state: GameState, store: GameStore): void {
    if (!this.mainWrapper || !this.container.contains(this.mainWrapper)) {
      this.initDOMStructure();
    }

    if (state.pendingCombat || store.isCombatDelaying) {
      if (state.pendingCombat) {
        const text = formatCombatAnnouncementText(state.pendingCombat);
        const winnerSeat = state.pendingCombat.winnerSeat ?? state.pendingCombat.attackerSeat;
        const winnerTeam = state.players[winnerSeat]?.team;
        const msgClass = winnerTeam === 'A' ? 'winning-team-a' : winnerTeam === 'B' ? 'winning-team-b' : '';

        if (this.combatText && this.combatWrapper && this.cardsRow) {
          this.combatText.className = `combat-announcement-text ${msgClass}`.trim();
          this.combatText.innerText = text;
          this.combatWrapper.style.display = 'flex';
          this.cardsRow.style.display = 'none';
        }
        return;
      }
    }

    if (this.combatWrapper) this.combatWrapper.style.display = 'none';
    if (this.cardsRow) this.cardsRow.style.display = 'flex';

    const activePlayerSeat = state.pendingRefills.length > 0
      ? state.pendingRefills[0].seat
      : (state.setupState?.inSetup
          ? ([PlayerSeat.NORTH, PlayerSeat.EAST, PlayerSeat.SOUTH, PlayerSeat.WEST] as PlayerSeat[]).find(s => !state.setupState.setupCompletedSeats.includes(s)) ?? state.activePlayer
          : state.activePlayer);
    const activePlayerState = state.players[activePlayerSeat];
    const isBotTurn = store.botSeats[activePlayerSeat];
    const teamClass = activePlayerState.team === 'A' ? 'card-team-a' : 'card-team-b';

    const isMySeatOrLocal = !store.isMultiplayer || (store.mySeat !== null && store.mySeat === activePlayerSeat) || (store.mySeats && store.mySeats.includes(activePlayerSeat));
    const isRefillStage = state.pendingRefills.length > 0 && !isBotTurn && isMySeatOrLocal;
    const isSwapAvailable = !state.setupState?.inSetup && !state.hasSwappedThisTurn && !isBotTurn && isMySeatOrLocal;

    // Pair each card with its original slot index, then sort high → low by rank for display
    const sortedCards = activePlayerState.baseDeck
      .map((c, idx) => ({ card: c, originalIdx: idx }))
      .filter((entry): entry is { card: Card; originalIdx: number } => Boolean(entry.card))
      .sort((a, b) => b.card.rank - a.card.rank);

    this.cardTargetIndices = [];

    sortedCards.forEach(({ card, originalIdx }, idx) => {
      this.cardTargetIndices[idx] = originalIdx;
      const holder = this.getOrCreateCardHolder(idx);

      if (!holder.cardEl.parentNode && this.cardsRow && this.promoWrapper) {
        this.cardsRow.insertBefore(holder.cardEl, this.promoWrapper);
      }
      holder.cardEl.style.display = 'block';

      const isHiddenCard = !card || card.id === 'hidden' || card.rank <= 0;
      const isFaceDown = isBotTurn || !isMySeatOrLocal || isHiddenCard;
      const isSelected = !isFaceDown && store.selectedBaseCardIndex === originalIdx;

      if (isFaceDown) {
        holder.cardEl.className = `lcr-card card-back face-down ${teamClass}`;
        holder.cardEl.style.cursor = 'default';
        holder.valEl.style.display = 'none';
        holder.suitEl.style.display = 'none';
      } else {
        const isRed = card.suit === 'H' || card.suit === 'D';
        const suitSymbol = { S: '♠', H: '♥', D: '♦', C: '♣' }[card.suit] || '♠';
        const rankSymbol = ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' } as Record<number, string>)[card.rank] || card.rank.toString();
        const colorClass = isRed ? 'card-red' : 'card-black';
        const tenClass = card.rank === 10 ? ' rank-ten' : '';
        const selectedClass = isSelected ? ' selected' : '';

        const isDrafting = Boolean(state.setupState?.inSetup) && isMySeatOrLocal && !isBotTurn;
        let highlightClass = '';
        if (isRefillStage || isDrafting) {
          highlightClass = ' highlight-strong-green';
        } else if (isSwapAvailable && !isSelected) {
          highlightClass = ' highlight-mild-swap';
        }

        holder.cardEl.className = `lcr-card ${teamClass} ${colorClass}${selectedClass}${highlightClass}`;
        holder.cardEl.style.cursor = 'pointer';

        holder.valEl.className = `card-val-top${tenClass}`;
        holder.valEl.textContent = rankSymbol;
        holder.valEl.style.display = 'block';

        holder.suitEl.className = 'card-suit-bottom';
        holder.suitEl.textContent = suitSymbol;
        holder.suitEl.style.display = 'block';
      }
    });

    // Hide any unused cached card elements
    for (let i = sortedCards.length; i < this.cardHolders.length; i++) {
      if (this.cardHolders[i]) {
        this.cardHolders[i].cardEl.style.display = 'none';
      }
    }

    const validPromoOptions = getValidPromotionOptions(state, activePlayerSeat);
    const uniquePromoPieces: number[] = [];
    const seenPieces = new Set<number>();
    for (const opt of validPromoOptions) {
      const pType = getPieceType(opt.promotedPiece);
      if (pType !== 0 && !seenPieces.has(pType)) {
        seenPieces.add(pType);
        uniquePromoPieces.push(pType);
      }
    }

    if (uniquePromoPieces.length > 0 && !isBotTurn && this.promoWrapper) {
      this.promoWrapper.innerHTML = '';
      this.promoWrapper.style.display = 'flex';

      const canPromoteSet = new Set(uniquePromoPieces);
      const teamColor = activePlayerState.team === 'A' ? 'var(--accent-gold)' : 'var(--accent-cyan)';

      const pieceRow = buildPieceRow(
        uniquePromoPieces,
        40,
        (piece: any) => this.onPromoteClick(piece),
        store.selectedPromotionPiece,
        teamColor,
        canPromoteSet
      );
      this.promoWrapper.appendChild(pieceRow);
    } else if (this.promoWrapper) {
      this.promoWrapper.style.display = 'none';
    }
  }
}
