import { getValidPromotionOptions } from '../../core/engine';
import { MAX_BUNKERS_PER_PLAYER } from '../../core/constants';
import { getPlayerBunkerCount } from '../../core/moves';
import { formatCombatAnnouncementText, getSeatCode } from '../../core/notation';
import { Card, GameState, PieceType, PlayerSeat, getPieceType } from '../../core/types';
import { normalizePlayerTrenchAndBase } from '../../core/cards';
import { GameStore } from '../../store/store';
import { buildPieceRow } from './CapturesUI';
import { CardDragManager } from './CardDragManager';

interface BaseCardElementHolder {
  cardEl: HTMLElement;
  valEl: HTMLElement;
  suitEl: HTMLElement;
}

export class BaseDeckUI {
  private container: HTMLElement;
  private onBaseCardClick: (index: number) => void;
  private onPromoteClick: (piece: PieceType | number) => void;
  private onPassCardClick?: () => void;
  private onBunkerClick?: () => void;
  private cardDragManager?: CardDragManager;

  // Cached DOM elements
  private mainWrapper: HTMLElement | null = null;
  private combatWrapper: HTMLElement | null = null;
  private combatText: HTMLElement | null = null;
  private cardsRow: HTMLElement | null = null;
  private bunkerBtn: HTMLButtonElement | null = null;
  private passBtn: HTMLButtonElement | null = null;
  private promoWrapper: HTMLElement | null = null;
  private cardHolders: BaseCardElementHolder[] = [];
  private cardTargetIndices: number[] = [];

  constructor(
    container: HTMLElement,
    onBaseCardClick: (index: number) => void,
    onPromoteClick: (piece: PieceType | number) => void,
    onPassCardClick?: () => void,
    cardDragManager?: CardDragManager,
    onBunkerClick?: () => void
  ) {
    this.container = container;
    this.onBaseCardClick = onBaseCardClick;
    this.onPromoteClick = onPromoteClick;
    this.onPassCardClick = onPassCardClick;
    this.cardDragManager = cardDragManager;
    this.onBunkerClick = onBunkerClick;
  }

  private initDOMStructure(): void {
    this.container.innerHTML = '';
    this.cardHolders = [];

    this.mainWrapper = document.createElement('div');
    this.mainWrapper.className = 'base-deck-wrapper';
    this.mainWrapper.style.display = 'flex';
    this.mainWrapper.style.flexDirection = 'column';
    this.mainWrapper.style.alignItems = 'center';
    this.mainWrapper.style.justifyContent = 'center';
    this.mainWrapper.style.gap = '4px';
    this.mainWrapper.style.width = '100%';
    this.mainWrapper.style.height = '100%';
    this.mainWrapper.style.position = 'relative';

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
    this.promoWrapper.style.borderLeft = '1px solid var(--Game_Menu_Glass_border_color)';

    this.passBtn = document.createElement('button');
    this.passBtn.className = 'pass-card-btn';
    this.passBtn.textContent = '➦';
    this.passBtn.title = 'Pass card to teammate';
    this.passBtn.style.display = 'none';
    this.passBtn.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      if (this.onPassCardClick) {
        this.onPassCardClick();
      }
    });

    this.bunkerBtn = document.createElement('button');
    this.bunkerBtn.className = 'bunker-action-btn';
    this.bunkerBtn.innerHTML = '<span class="bunker-btn-icon">⛊</span>';
    this.bunkerBtn.title = 'Bunker a piece on your half of the board';
    this.bunkerBtn.style.display = 'none';
    this.bunkerBtn.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      if (this.onBunkerClick) {
        this.onBunkerClick();
      }
    });

    this.mainWrapper.appendChild(this.combatWrapper);
    this.mainWrapper.appendChild(this.cardsRow);
    this.mainWrapper.appendChild(this.bunkerBtn);
    this.mainWrapper.appendChild(this.passBtn);
    this.cardsRow.appendChild(this.promoWrapper);

    this.container.appendChild(this.mainWrapper);
  }

  private getOrCreateCardHolder(idx: number): BaseCardElementHolder {
    if (this.cardHolders[idx]) {
      return this.cardHolders[idx];
    }

    const cardEl = document.createElement('div');
    cardEl.className = 'trench-card';
    cardEl.style.touchAction = 'none';

    const valEl = document.createElement('div');
    valEl.className = 'card-val-top';

    const suitEl = document.createElement('div');
    suitEl.className = 'card-suit-bottom';

    cardEl.appendChild(valEl);
    cardEl.appendChild(suitEl);

    cardEl.addEventListener('click', () => {
      if (this.cardDragManager?.isSuppressingClick()) return;
      const targetIdx = this.cardTargetIndices[idx];
      if (targetIdx !== undefined) {
        this.onBaseCardClick(targetIdx);
      }
    });

    cardEl.addEventListener('pointerdown', (e: PointerEvent) => {
      const targetIdx = this.cardTargetIndices[idx];
      if (targetIdx === undefined) return;
      this.cardDragManager?.handlePointerDown(e, cardEl, {
        type: 'base',
        cardIndex: targetIdx
      });
    });

    const holder: BaseCardElementHolder = { cardEl, valEl, suitEl };
    this.cardHolders[idx] = holder;
    return holder;
  }

  public render(state: GameState, store: GameStore): void {
    if (!this.mainWrapper || !this.container.contains(this.mainWrapper)) {
      this.initDOMStructure();
    }

    const inCombat = Boolean(state.pendingCombat || store.isCombatDelaying || state.isCombatDelaying);

    if (inCombat) {
      if (this.mainWrapper) {
        this.mainWrapper.className = 'base-deck-wrapper in-combat-announcement';
      }
      if (this.bunkerBtn) this.bunkerBtn.style.display = 'none';
      if (this.passBtn) this.passBtn.style.display = 'none';

      if (state.pendingCombat) {
        if (!state.isTurnRiverRevealed || state.pendingCombat.winnerSeat === null || state.pendingCombat.winnerSeat === undefined) {
          if (this.combatText && this.combatWrapper && this.cardsRow) {
            this.combatText.className = 'combat-announcement-text';
            this.combatText.innerText = '';
            this.combatWrapper.style.display = 'flex';
            this.cardsRow.style.display = 'none';
          }
          if (this.bunkerBtn) this.bunkerBtn.style.display = 'none';
          if (this.passBtn) this.passBtn.style.display = 'none';
          return;
        }

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
        if (this.bunkerBtn) this.bunkerBtn.style.display = 'none';
        if (this.passBtn) this.passBtn.style.display = 'none';
        return;
      }
    }

    if (this.mainWrapper) {
      this.mainWrapper.className = 'base-deck-wrapper';
    }
    if (this.combatWrapper) this.combatWrapper.style.display = 'none';
    if (this.cardsRow) this.cardsRow.style.display = 'flex';
    if (this.passBtn && inCombat) this.passBtn.style.display = 'none';
    if (this.bunkerBtn && inCombat) this.bunkerBtn.style.display = 'none';

    const activePlayerSeat = state.pendingRefills[0]?.seat ?? state.activePlayer;
    const activePlayerState = state.players[activePlayerSeat];
    if (activePlayerState) {
      normalizePlayerTrenchAndBase(activePlayerState);
    }
    const isBotTurn = store.botSeats[activePlayerSeat];
    const teamClass = activePlayerState.team === 'A' ? 'card-team-a' : 'card-team-b';

    const isMySeatOrLocal = !store.isMultiplayer || (store.mySeat !== null && store.mySeat === activePlayerSeat) || (store.mySeats && store.mySeats.includes(activePlayerSeat));
    const isRefillStage = state.pendingRefills.length > 0 && !isBotTurn && isMySeatOrLocal;
    const isSwapAvailable = !store.isReplaying && !state.setupState?.inSetup && !state.hasSwappedThisTurn && !isBotTurn && isMySeatOrLocal;

    // Display exactly 3 fixed positional slots: Left (0), Center (1), Right (2) - not sorted by rank
    const backupList: (Card | null)[] = activePlayerState.backupCards;

    const reverseOrder = activePlayerSeat === PlayerSeat.NORTH || activePlayerSeat === PlayerSeat.EAST;
    this.cardTargetIndices = reverseOrder ? [2, 1, 0] : [0, 1, 2];

    for (let i = 0; i < 3; i++) {
      const slotIdx = this.cardTargetIndices[i];
      const card = backupList[slotIdx] ?? null;
      const holder = this.getOrCreateCardHolder(i);

      holder.cardEl.dataset.cardType = 'base';
      holder.cardEl.dataset.cardIndex = String(slotIdx);

      if (!holder.cardEl.parentNode && this.cardsRow) {
        if (this.promoWrapper) {
          this.cardsRow.insertBefore(holder.cardEl, this.promoWrapper);
        } else {
          this.cardsRow.appendChild(holder.cardEl);
        }
      }
      holder.cardEl.style.display = 'block';

      if (!card) {
        // Empty slot
        holder.cardEl.className = `trench-card card-empty ${teamClass}`;
        holder.cardEl.style.cursor = isSwapAvailable ? 'pointer' : 'default';
        holder.valEl.style.display = 'none';
        holder.suitEl.style.display = 'none';
        continue;
      }

      const isHiddenCard = card.id === 'hidden' || card.rank <= 0;
      const isFaceDown = isBotTurn || !isMySeatOrLocal || isHiddenCard;
      const isSelected = !isFaceDown && store.selectedBaseCardIndex === slotIdx;

      if (isFaceDown) {
        holder.cardEl.className = `trench-card card-back face-down ${teamClass}`;
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

        holder.cardEl.className = `trench-card ${teamClass} ${colorClass}${selectedClass}${highlightClass}`;
        holder.cardEl.style.cursor = 'pointer';

        holder.valEl.className = `card-val-top${tenClass}`;
        holder.valEl.textContent = rankSymbol;
        holder.valEl.style.display = 'block';

        holder.suitEl.className = 'card-suit-bottom';
        holder.suitEl.textContent = suitSymbol;
        holder.suitEl.style.display = 'block';
      }
    }

    // Hide any unused cached card elements (index >= 3)
    for (let i = 3; i < this.cardHolders.length; i++) {
      if (this.cardHolders[i]) {
        this.cardHolders[i].cardEl.style.display = 'none';
      }
    }

    const isPlayerTurnNow = !state.isGameOver && !store.isReplaying && !inCombat &&
      !state.setupState?.inSetup && state.pendingRefills.length === 0 &&
      !isBotTurn && isMySeatOrLocal && (state.activePlayer === activePlayerSeat);

    const teammateSeat = ((activePlayerSeat + 2) % 4) as PlayerSeat;
    const teammateState = state.players[teammateSeat];
    const teammateCardCount = teammateState
      ? (teammateState.trenchCards.filter(c => c !== null).length + teammateState.backupCards.filter(c => c !== null).length)
      : 6;
    const teammateHasSpace = teammateCardCount < 6;

    const hasCardsToPass = activePlayerState.backupCards.some(c => c !== null && c.id !== 'hidden' && c.rank > 0);
    const canPass = isPlayerTurnNow && !state.hasSwappedThisTurn && hasCardsToPass && teammateHasSpace;

    if (this.passBtn) {
      if (canPass && !inCombat) {
        this.passBtn.style.display = 'inline-flex';
        const teamCls = activePlayerState.team === 'A' ? 'team-a' : 'team-b';
        this.passBtn.className = `pass-card-btn ${teamCls}`;
        const teammateCode = getSeatCode(teammateSeat);
        this.passBtn.title = `Pass card to teammate (${teammateCode})`;
      } else {
        this.passBtn.style.display = 'none';
      }
    }

    if (this.bunkerBtn) {
      if (isPlayerTurnNow && !inCombat) {
        this.bunkerBtn.style.display = 'inline-flex';
        const teamCls = activePlayerState.team === 'A' ? 'team-a' : 'team-b';
        const currentBunkers = getPlayerBunkerCount(state.board, activePlayerSeat);
        const isAtMax = currentBunkers >= MAX_BUNKERS_PER_PLAYER;
        this.bunkerBtn.className = `bunker-action-btn ${teamCls}${store.isSettingBunker ? ' active' : ''}${isAtMax ? ' disabled' : ''}`;
        this.bunkerBtn.title = isAtMax
          ? `Maximum bunkers reached (${currentBunkers}/${MAX_BUNKERS_PER_PLAYER})`
          : `Bunker a piece on your half (${currentBunkers}/${MAX_BUNKERS_PER_PLAYER})`;
      } else {
        this.bunkerBtn.style.display = 'none';
      }
    }

    if (this.combatWrapper && this.combatWrapper.style.display === 'flex') {
      if (this.passBtn) this.passBtn.style.display = 'none';
      if (this.bunkerBtn) this.bunkerBtn.style.display = 'none';
    }

    const validPromoOptions = getValidPromotionOptions(state, activePlayerSeat);
    const uniquePromoPieces: (PieceType | number)[] = [];
    const seenPieces = new Set<number>();
    for (const opt of validPromoOptions) {
      const pType = getPieceType(opt.promotedPiece);
      if (pType !== 0 && !seenPieces.has(pType)) {
        seenPieces.add(pType);
        uniquePromoPieces.push(opt.promotedPiece);
      }
    }

    if (uniquePromoPieces.length > 0 && !isBotTurn && this.promoWrapper) {
      this.promoWrapper.innerHTML = '';
      this.promoWrapper.style.display = 'flex';

      const canPromoteSet = new Set(uniquePromoPieces.map(p => getPieceType(p)));
      const teamColor = activePlayerState.team === 'A' ? 'var(--Team_A_color)' : 'var(--Team_B_color)';

      const pieceRow = buildPieceRow(
        uniquePromoPieces,
        40,
        (piece: any) => this.onPromoteClick(piece),
        store.selectedPromotionPiece,
        teamColor,
        canPromoteSet,
        activePlayerState.team
      );
      this.promoWrapper.appendChild(pieceRow);
    } else if (this.promoWrapper) {
      this.promoWrapper.style.display = 'none';
    }
  }
}
