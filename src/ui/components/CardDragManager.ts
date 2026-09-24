import { Card, PlayerSeat } from '../../core/types';
import { getTrenchSlotTopCard, normalizePlayerTrenchAndBase } from '../../core/cards';
import { GameStore } from '../../store/store';

export type CardRef =
  | { type: 'trench'; seat: PlayerSeat; cardIndex: number }
  | { type: 'base'; cardIndex: number };

interface ActiveCardDrag {
  pointerId: number;
  sourceEl: HTMLElement;
  from: CardRef;
  startX: number;
  startY: number;
  isDragging: boolean;
}

export class CardDragManager {
  private store: GameStore;
  private onCardDrop: (from: CardRef, to: CardRef) => boolean;

  private activeDrag: ActiveCardDrag | null = null;
  private dragAvatar: HTMLElement | null = null;
  private currentHoverCardEl: HTMLElement | null = null;
  private suppressNextClick = false;

  constructor(store: GameStore, onCardDrop: (from: CardRef, to: CardRef) => boolean) {
    this.store = store;
    this.onCardDrop = onCardDrop;
  }

  public isSuppressingClick(): boolean {
    if (this.suppressNextClick) {
      this.suppressNextClick = false;
      return true;
    }
    return false;
  }

  public isMyTurn(seat: PlayerSeat): boolean {
    if (this.store.botSeats[seat]) return false;
    if (this.store.isMultiplayer) {
      if (this.store.mySeats && this.store.mySeats.length > 0) {
        return this.store.mySeats.includes(seat);
      }
      if (this.store.mySeat !== null) {
        return this.store.mySeat === seat;
      }
      return false;
    }
    if (this.store.mySeats && this.store.mySeats.length > 0) {
      return this.store.mySeats.includes(seat);
    }
    return true;
  }

  public canDragCard(from: CardRef): boolean {
    const state = this.store.getState();
    if (state.isGameOver || this.store.isReplaying || this.store.isCombatDelaying) return false;

    // Refill stage: only base cards can be dragged onto the refill target slot
    if (state.pendingRefills.length > 0) {
      if (from.type !== 'base') return false;
      const refillSeat = state.pendingRefills[0].seat;
      if (!this.isMyTurn(refillSeat)) return false;
      const player = state.players[refillSeat];
      const card = player?.baseDeck[from.cardIndex];
      return Boolean(card && card.id !== 'hidden' && card.rank > 0);
    }

    // Setup stage: only base cards can be dragged into draft trench slots
    if (state.setupState?.inSetup) {
      if (from.type !== 'base') return false;
      const activeSeat =
        ([PlayerSeat.NORTH, PlayerSeat.EAST, PlayerSeat.SOUTH, PlayerSeat.WEST] as PlayerSeat[]).find(
          s => !state.setupState.setupCompletedSeats.includes(s)
        ) ?? state.activePlayer;
      if (!this.isMyTurn(activeSeat)) return false;
      const player = state.players[activeSeat];
      const card = player?.baseDeck[from.cardIndex];
      return Boolean(card && card.id !== 'hidden' && card.rank > 0);
    }

    // Normal game turn - Card Swap
    if (state.hasSwappedThisTurn) return false;
    const activeSeat = state.activePlayer;
    if (!this.isMyTurn(activeSeat)) return false;

    const player = state.players[activeSeat];
    if (player) {
      normalizePlayerTrenchAndBase(player);
    }

    if (from.type === 'trench') {
      if (from.seat !== activeSeat) return false;
      const card = getTrenchSlotTopCard(player, from.cardIndex);
      return Boolean(card && card.id !== 'hidden' && card.rank > 0);
    } else {
      const card = player?.backupCards[from.cardIndex];
      return Boolean(card && card.id !== 'hidden' && card.rank > 0);
    }
  }

  public isValidDropTarget(from: CardRef, to: CardRef): boolean {
    const state = this.store.getState();
    if (state.isGameOver || this.store.isReplaying || this.store.isCombatDelaying) return false;

    // Refill stage
    if (state.pendingRefills.length > 0) {
      if (from.type !== 'base') return false;
      if (to.type !== 'trench') return false;
      const refill = state.pendingRefills[0];
      return to.seat === refill.seat && to.cardIndex === refill.slot;
    }

    // Setup stage
    if (state.setupState?.inSetup) {
      if (from.type !== 'base') return false;
      if (to.type !== 'trench') return false;
      const activeSeat = state.pendingRefills[0]?.seat ?? state.activePlayer;
      const targetSlot = state.players[activeSeat]?.trenchCards.findIndex(c => c === null);
      return to.seat === activeSeat && to.cardIndex === targetSlot;
    }

    // Normal game turn: Card Swap
    if (state.hasSwappedThisTurn) return false;
    const activeSeat = state.activePlayer;
    if (!this.isMyTurn(activeSeat)) return false;

    // Target Trench card MUST belong to the active player
    if (to.type === 'trench' && to.seat !== activeSeat) return false;

    // Source Trench card MUST belong to the active player
    if (from.type === 'trench' && from.seat !== activeSeat) return false;

    // Identical slot cannot be dropped onto itself
    if (from.type === to.type && from.cardIndex === to.cardIndex) return false;

    const player = state.players[activeSeat];
    if (!player) return false;
    normalizePlayerTrenchAndBase(player);

    // Verify target card is not hidden/corrupt if non-empty
    const targetCard = to.type === 'trench'
      ? getTrenchSlotTopCard(player, to.cardIndex)
      : player.backupCards[to.cardIndex];
    if (targetCard && (targetCard.id === 'hidden' || targetCard.rank <= 0)) return false;

    return true;
  }

  public handlePointerDown(e: PointerEvent, sourceEl: HTMLElement, from: CardRef): void {
    if (e.button !== undefined && e.button !== 0) return;
    if (!this.canDragCard(from)) return;

    this.activeDrag = {
      pointerId: e.pointerId,
      sourceEl,
      from,
      startX: e.clientX,
      startY: e.clientY,
      isDragging: false
    };

    window.addEventListener('pointermove', this.onWindowPointerMove, { passive: false });
    window.addEventListener('pointerup', this.onWindowPointerUp);
    window.addEventListener('pointercancel', this.onWindowPointerCancel);
  }

  private onWindowPointerMove = (e: PointerEvent): void => {
    if (!this.activeDrag || e.pointerId !== this.activeDrag.pointerId) return;

    const dx = e.clientX - this.activeDrag.startX;
    const dy = e.clientY - this.activeDrag.startY;
    const dist = Math.hypot(dx, dy);

    if (!this.activeDrag.isDragging && dist >= 5) {
      this.activeDrag.isDragging = true;
      this.suppressNextClick = true;

      // Mark source card as dragging
      this.activeDrag.sourceEl.classList.add('drag-source');

      // Create floating drag avatar
      this.createDragAvatar(this.activeDrag.from);
    }

    if (this.activeDrag.isDragging) {
      e.preventDefault();
      if (this.dragAvatar) {
        this.dragAvatar.style.left = `${e.clientX}px`;
        this.dragAvatar.style.top = `${e.clientY}px`;
      }

      // Check drop target beneath pointer
      const targetCardEl = this.findCardElementAtPoint(e.clientX, e.clientY);
      let isValidHover = false;

      if (targetCardEl && targetCardEl !== this.activeDrag.sourceEl) {
        const targetRef = this.getCardRefFromElement(targetCardEl);
        if (targetRef && this.isValidDropTarget(this.activeDrag.from, targetRef)) {
          isValidHover = true;
          if (this.currentHoverCardEl !== targetCardEl) {
            this.clearHoverState();
            targetCardEl.classList.add('drop-target-hover');
            this.currentHoverCardEl = targetCardEl;
          }
        }
      }

      if (!isValidHover && this.currentHoverCardEl) {
        this.clearHoverState();
      }
    }
  };

  private onWindowPointerUp = (e: PointerEvent): void => {
    if (!this.activeDrag || e.pointerId !== this.activeDrag.pointerId) return;

    window.removeEventListener('pointermove', this.onWindowPointerMove);
    window.removeEventListener('pointerup', this.onWindowPointerUp);
    window.removeEventListener('pointercancel', this.onWindowPointerCancel);

    const from = this.activeDrag.from;
    const sourceEl = this.activeDrag.sourceEl;
    const wasDragging = this.activeDrag.isDragging;
    this.activeDrag = null;

    if (wasDragging) {
      const targetCardEl = this.findCardElementAtPoint(e.clientX, e.clientY);
      let targetRef: CardRef | null = null;
      let droppedSuccess = false;

      if (targetCardEl && targetCardEl !== sourceEl) {
        targetRef = this.getCardRefFromElement(targetCardEl);
        if (targetRef && this.isValidDropTarget(from, targetRef)) {
          droppedSuccess = this.onCardDrop(from, targetRef);
        }
      }

      this.clearHoverState();

      if (droppedSuccess && targetCardEl) {
        this.settleAvatar(targetCardEl, sourceEl);
      } else {
        this.settleAvatar(null, sourceEl);
      }

      setTimeout(() => {
        this.suppressNextClick = false;
      }, 400);
    } else {
      this.clearHoverState();
      this.removeAvatar();
    }
  };

  private onWindowPointerCancel = (e: PointerEvent): void => {
    if (!this.activeDrag || e.pointerId !== this.activeDrag.pointerId) return;

    window.removeEventListener('pointermove', this.onWindowPointerMove);
    window.removeEventListener('pointerup', this.onWindowPointerUp);
    window.removeEventListener('pointercancel', this.onWindowPointerCancel);

    const sourceEl = this.activeDrag.sourceEl;
    this.activeDrag = null;

    this.clearHoverState();
    this.settleAvatar(null, sourceEl);

    setTimeout(() => {
      this.suppressNextClick = false;
    }, 400);
  };

  private clearHoverState(): void {
    if (this.currentHoverCardEl) {
      this.currentHoverCardEl.classList.remove('drop-target-hover');
      this.currentHoverCardEl = null;
    }
  }

  private findCardElementAtPoint(x: number, y: number): HTMLElement | null {
    if (typeof document === 'undefined' || !document.elementFromPoint) return null;
    const elem = document.elementFromPoint(x, y);
    if (!elem) return null;
    return (elem.closest ? elem.closest('.trench-card') : null) as HTMLElement | null;
  }

  private getCardRefFromElement(cardEl: HTMLElement): CardRef | null {
    const cardType = cardEl.dataset?.cardType;
    if (cardType === 'trench') {
      const seat = cardEl.dataset.seat ? parseInt(cardEl.dataset.seat, 10) : undefined;
      const cardIndex = cardEl.dataset.cardIndex ? parseInt(cardEl.dataset.cardIndex, 10) : undefined;
      if (seat !== undefined && cardIndex !== undefined) {
        return { type: 'trench', seat: seat as PlayerSeat, cardIndex };
      }
    } else if (cardType === 'base') {
      const cardIndex = cardEl.dataset?.cardIndex ? parseInt(cardEl.dataset.cardIndex, 10) : undefined;
      if (cardIndex !== undefined) {
        return { type: 'base', cardIndex };
      }
    }
    return null;
  }

  private createDragAvatar(from: CardRef): void {
    if (typeof document === 'undefined') return;

    const state = this.store.getState();
    let card: Card | null | undefined = null;
    let team = 'A';

    if (from.type === 'trench') {
      const player = state.players[from.seat];
      card = getTrenchSlotTopCard(player, from.cardIndex);
      team = player?.team ?? 'A';
    } else {
      const activeSeat = state.pendingRefills[0]?.seat ?? state.activePlayer;
      const player = state.players[activeSeat];
      card = player?.backupCards[from.cardIndex];
      team = player?.team ?? 'A';
    }

    if (!card) return;

    const isRed = card.suit === 'H' || card.suit === 'D';
    const suitSymbol = ({ S: '♠', H: '♥', D: '♦', C: '♣' } as Record<string, string>)[card.suit] || card.suit;
    const rankSymbol =
      ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' } as Record<number, string>)[card.rank] || card.rank.toString();
    const colorClass = isRed ? 'card-red' : 'card-black';
    const teamClass = team === 'A' ? 'card-team-a' : 'card-team-b';
    const tenClass = card.rank === 10 ? ' rank-ten' : '';

    const avatar = document.createElement('div');
    avatar.className = `dragged-card-avatar trench-card ${teamClass} ${colorClass}`.trim();

    const valEl = document.createElement('div');
    valEl.className = `card-val-top${tenClass}`;
    valEl.textContent = rankSymbol;

    const suitEl = document.createElement('div');
    suitEl.className = 'card-suit-bottom';
    suitEl.textContent = suitSymbol;

    avatar.appendChild(valEl);
    avatar.appendChild(suitEl);

    if (document.body) {
      document.body.appendChild(avatar);
    }
    this.dragAvatar = avatar;
  }

  private settleAvatar(targetEl: HTMLElement | null, sourceEl: HTMLElement): void {
    const avatar = this.dragAvatar;
    this.dragAvatar = null;

    sourceEl.classList.remove('drag-source');

    if (!avatar) return;

    const settleTarget = targetEl || sourceEl;
    const rect = typeof settleTarget.getBoundingClientRect === 'function' ? settleTarget.getBoundingClientRect() : null;

    if (rect && rect.width > 0 && rect.height > 0) {
      avatar.style.transition =
        'left 110ms cubic-bezier(0.2, 0.0, 0.2, 1), top 110ms cubic-bezier(0.2, 0.0, 0.2, 1), transform 110ms ease, opacity 110ms ease';
      avatar.style.left = `${rect.left + rect.width / 2}px`;
      avatar.style.top = `${rect.top + rect.height / 2}px`;
      avatar.style.transform = targetEl ? 'translate(-50%, -50%) scale(1.0)' : 'translate(-50%, -50%) scale(0.95)';
      avatar.style.opacity = targetEl ? '0.9' : '0.6';

      setTimeout(() => {
        if (avatar.parentElement) {
          avatar.parentElement.removeChild(avatar);
        }
      }, 110);
    } else {
      if (avatar.parentElement) {
        avatar.parentElement.removeChild(avatar);
      }
    }
  }

  private removeAvatar(): void {
    if (this.dragAvatar) {
      if (this.dragAvatar.parentElement) {
        this.dragAvatar.parentElement.removeChild(this.dragAvatar);
      }
      this.dragAvatar = null;
    }
  }
}
