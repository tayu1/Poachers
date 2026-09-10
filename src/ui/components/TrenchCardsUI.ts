import { Card, GameState, PlayerSeat } from '../../core/types';
import { GameStore } from '../../store/store';
import { getTrenchCardIndexForSquare } from '../../core/cards';
import { CARD_ANIMATION_TIME_MS } from '../../config';

export interface TRENCHContainers {
  north: HTMLElement;
  east: HTMLElement;
  south: HTMLElement;
  west: HTMLElement;
}

interface PerimeterSlotRef {
  seat: PlayerSeat;
  cardIndex: number;
}

// 12 Trench card slots ordered in continuous clockwise perimeter sequence starting from Top-Left (Slot 0)
const CLOCKWISE_PERIMETER_SLOTS: PerimeterSlotRef[] = [
  { seat: PlayerSeat.NORTH, cardIndex: 0 }, // Slot 0:  Top-Left (cols 0-2)
  { seat: PlayerSeat.NORTH, cardIndex: 1 }, // Slot 1:  Top-Center (cols 3-4)
  { seat: PlayerSeat.NORTH, cardIndex: 2 }, // Slot 2:  Top-Right (cols 5-7)
  { seat: PlayerSeat.EAST,  cardIndex: 0 }, // Slot 3:  Right-Top (rows 0-2)
  { seat: PlayerSeat.EAST,  cardIndex: 1 }, // Slot 4:  Right-Center (rows 3-4)
  { seat: PlayerSeat.EAST,  cardIndex: 2 }, // Slot 5:  Right-Bottom (rows 5-7)
  { seat: PlayerSeat.SOUTH, cardIndex: 2 }, // Slot 6:  Bottom-Right (cols 5-7)
  { seat: PlayerSeat.SOUTH, cardIndex: 1 }, // Slot 7:  Bottom-Center (cols 3-4)
  { seat: PlayerSeat.SOUTH, cardIndex: 0 }, // Slot 8:  Bottom-Left (cols 0-2)
  { seat: PlayerSeat.WEST,  cardIndex: 2 }, // Slot 9:  Left-Bottom (rows 5-7)
  { seat: PlayerSeat.WEST,  cardIndex: 1 }, // Slot 10: Left-Center (rows 3-4)
  { seat: PlayerSeat.WEST,  cardIndex: 0 }  // Slot 11: Left-Top (rows 0-2)
];

interface SlotElementHolder {
  cardEl: HTMLElement;
  slotBayEl: HTMLElement;
  innerEl: HTMLElement;
  valEl: HTMLElement;
  suitEl: HTMLElement;
}

export class TrenchCardsUI {
  private containers: TRENCHContainers;
  private onCardClick: (seat: PlayerSeat, cardIndex: number) => void;
  private slotHolders: Map<number, SlotElementHolder> = new Map();
  private slotClickTargets: Map<number, { seat: PlayerSeat; cardIndex: number }> = new Map();
  private lastCardKeys: Map<number, string> = new Map();
  private animTimeouts: Map<number, number> = new Map();
  private lastRotationStep?: number;
  private hasRenderedOnce = false;
  private isInitialized = false;

  constructor(containers: TRENCHContainers, onCardClick: (seat: PlayerSeat, cardIndex: number) => void) {
    this.containers = containers;
    this.onCardClick = onCardClick;
  }

  private clearSlotAnimation(slotIdx: number, holder: SlotElementHolder): void {
    const timer = this.animTimeouts.get(slotIdx);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.animTimeouts.delete(slotIdx);
    }
    holder.innerEl.classList.remove('slide-out-right', 'slide-in-right');
  }

  private applySlotContent(
    holder: SlotElementHolder,
    actualCard: Card | null,
    isFaceDown: boolean,
    isEmptySlot: boolean
  ): void {
    if (isEmptySlot || !actualCard) {
      holder.innerEl.style.display = 'none';
      holder.innerEl.className = 'card-inner-face';
      holder.valEl.style.display = 'none';
      holder.suitEl.style.display = 'none';
    } else if (isFaceDown) {
      holder.innerEl.className = 'card-inner-face card-back face-down';
      holder.valEl.style.display = 'none';
      holder.suitEl.style.display = 'none';
      holder.innerEl.style.display = 'block';
    } else {
      const isRed = actualCard.suit === 'H' || actualCard.suit === 'D';
      const suitSymbol = { S: '♠', H: '♥', D: '♦', C: '♣' }[actualCard.suit];
      const rankSymbol =
        ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' } as Record<number, string>)[actualCard.rank] ||
        actualCard.rank.toString();
      const colorClass = isRed ? 'card-red' : 'card-black';
      const tenClass = actualCard.rank === 10 ? ' rank-ten' : '';

      holder.innerEl.className = `card-inner-face ${colorClass}`;
      holder.valEl.className = `card-val-top${tenClass}`;
      holder.valEl.textContent = rankSymbol;
      holder.valEl.style.display = 'block';

      holder.suitEl.className = 'card-suit-bottom';
      holder.suitEl.textContent = suitSymbol;
      holder.suitEl.style.display = 'block';
      holder.innerEl.style.display = 'block';
    }
  }

  private initDOMStructure(): void {
    this.slotHolders.clear();

    const createSlotHolder = (slotIdx: number): SlotElementHolder => {
      const cardEl = document.createElement('div');
      cardEl.className = 'trench-card card-empty';

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

      cardEl.addEventListener('click', () => {
        const target = this.slotClickTargets.get(slotIdx);
        if (target) {
          this.onCardClick(target.seat, target.cardIndex);
        }
      });

      const holder: SlotElementHolder = { cardEl, slotBayEl, innerEl, valEl, suitEl };
      this.slotHolders.set(slotIdx, holder);
      return holder;
    };

    const createDividerV = (leftPos: string): HTMLElement => {
      const div = document.createElement('div');
      div.className = 'trench-divider trench-divider-v';
      div.style.left = leftPos;
      return div;
    };

    const createDividerH = (topPos: string): HTMLElement => {
      const div = document.createElement('div');
      div.className = 'trench-divider trench-divider-h';
      div.style.top = topPos;
      return div;
    };

    const horizontalCenters = ['81px', '216px', '351px'];
    const verticalCenters = ['81px', '216px', '351px'];

    // 1. Top Edge (North)
    const northContainer = this.containers.north;
    northContainer.innerHTML = '';
    northContainer.style.position = 'relative';
    northContainer.style.width = '432px';
    northContainer.style.height = '58px';
    northContainer.appendChild(createDividerV('162px'));
    northContainer.appendChild(createDividerV('270px'));
    [0, 1, 2].forEach((slotIdx, idx) => {
      const h = createSlotHolder(slotIdx);
      h.cardEl.style.position = 'absolute';
      h.cardEl.style.left = horizontalCenters[idx];
      h.cardEl.style.top = '50%';
      h.cardEl.style.transform = 'translate(-50%, -50%)';
      northContainer.appendChild(h.cardEl);
    });

    // 2. Right Edge (East)
    const eastContainer = this.containers.east;
    eastContainer.innerHTML = '';
    eastContainer.style.position = 'relative';
    eastContainer.style.width = '50px';
    eastContainer.style.height = '432px';
    eastContainer.appendChild(createDividerH('162px'));
    eastContainer.appendChild(createDividerH('270px'));
    [3, 4, 5].forEach((slotIdx, idx) => {
      const h = createSlotHolder(slotIdx);
      h.cardEl.style.position = 'absolute';
      h.cardEl.style.top = verticalCenters[idx];
      h.cardEl.style.left = '50%';
      h.cardEl.style.transform = 'translate(-50%, -50%)';
      eastContainer.appendChild(h.cardEl);
    });

    // 3. Bottom Edge (South)
    const southContainer = this.containers.south;
    southContainer.innerHTML = '';
    southContainer.style.position = 'relative';
    southContainer.style.width = '432px';
    southContainer.style.height = '58px';
    southContainer.appendChild(createDividerV('162px'));
    southContainer.appendChild(createDividerV('270px'));
    [8, 7, 6].forEach((slotIdx, idx) => {
      const h = createSlotHolder(slotIdx);
      h.cardEl.style.position = 'absolute';
      h.cardEl.style.left = horizontalCenters[idx];
      h.cardEl.style.top = '50%';
      h.cardEl.style.transform = 'translate(-50%, -50%)';
      southContainer.appendChild(h.cardEl);
    });

    // 4. Left Edge (West)
    const westContainer = this.containers.west;
    westContainer.innerHTML = '';
    westContainer.style.position = 'relative';
    westContainer.style.width = '50px';
    westContainer.style.height = '432px';
    westContainer.appendChild(createDividerH('162px'));
    westContainer.appendChild(createDividerH('270px'));
    [11, 10, 9].forEach((slotIdx, idx) => {
      const h = createSlotHolder(slotIdx);
      h.cardEl.style.position = 'absolute';
      h.cardEl.style.top = verticalCenters[idx];
      h.cardEl.style.left = '50%';
      h.cardEl.style.transform = 'translate(-50%, -50%)';
      westContainer.appendChild(h.cardEl);
    });

    this.isInitialized = true;
  }

  public render(state: GameState, store: GameStore): void {
    if (!this.isInitialized || !this.containers.north.hasChildNodes()) {
      this.initDOMStructure();
    }

    const rotationStep = Math.floor((store.boardRotationAngle % 360) / 90);
    const isDrafting = Boolean(state.setupState?.inSetup);
    const isRefillStage = state.pendingRefills.length > 0;
    const activeSeat = isRefillStage
      ? state.pendingRefills[0].seat
      : (isDrafting
          ? ([PlayerSeat.NORTH, PlayerSeat.EAST, PlayerSeat.SOUTH, PlayerSeat.WEST] as PlayerSeat[]).find(s => !state.setupState.setupCompletedSeats.includes(s)) ?? state.activePlayer
          : state.activePlayer);
    const activePlayerState = state.players[activeSeat];
    const draftTargetSlotIdx = activePlayerState ? activePlayerState.trenchCards.findIndex(c => c === null) : -1;
    const isBotTurn = Boolean(store.botSeats[activeSeat]);
    const isSwapAvailable = !store.isReplaying && !isDrafting && !state.hasSwappedThisTurn && !isBotTurn;

    const winningCardIds = new Set<string>();
    let winningTeamClass = '';
    let teamACombatSlot = -1;
    let teamBCombatSlot = -1;

    if (state.pendingCombat) {
      const combat = state.pendingCombat;
      teamACombatSlot = getTrenchCardIndexForSquare(combat.defenderPosIndex, 'A');
      teamBCombatSlot = getTrenchCardIndexForSquare(combat.defenderPosIndex, 'B');

      if (state.isTurnRiverRevealed && combat.winnerSeat !== null && combat.winnerSeat !== undefined) {
        const winnerSeat = combat.winnerSeat ?? combat.attackerSeat;
        const winnerTeam = state.players[winnerSeat]?.team ?? 'A';
        winningTeamClass = winnerTeam === 'A' ? 'winning-team-a' : 'winning-team-b';

        const winningHand = winnerSeat === combat.attackerSeat ? combat.attackerHand : combat.defenderHand;
        if (winningHand && winningHand.winningCards) {
          winningHand.winningCards.forEach(c => winningCardIds.add(c.id));
        }
      }
    }

    const inCombat = Boolean(state.pendingCombat || store.isCombatDelaying);
    const isBoardRotated = this.lastRotationStep !== undefined && this.lastRotationStep !== rotationStep;
    this.lastRotationStep = rotationStep;
    const canAnimate = this.hasRenderedOnce && !store.isReplaying && !isBoardRotated && !inCombat && !isRefillStage && !isDrafting;

    for (let slotIdx = 0; slotIdx < 12; slotIdx++) {
      const holder = this.slotHolders.get(slotIdx);
      if (!holder) continue;

      const refIdx = (slotIdx - 3 * rotationStep + 12) % 12;
      const ref = CLOCKWISE_PERIMETER_SLOTS[refIdx];
      this.slotClickTargets.set(slotIdx, { seat: ref.seat, cardIndex: ref.cardIndex });

      const player = state.players[ref.seat];
      const actualCard = player.trenchCards[ref.cardIndex];

      const isRefillTargetSlot = isRefillStage && Boolean(
        state.pendingRefills?.some(pr => pr.seat === ref.seat && pr.slot === ref.cardIndex)
      );

      const isEmptySlot = actualCard === null;
      const isFaceDown = !isEmptySlot && isDrafting;
      const isSelected = state.activePlayer === ref.seat && store.selectedTrenchCardIndex === ref.cardIndex;
      const teamClass = player.team === 'A' ? 'card-team-a' : 'card-team-b';

      const isWinning = actualCard !== null && winningCardIds.has(actualCard.id);
      const isStrongGreen = (isDrafting && ref.seat === activeSeat && ref.cardIndex === draftTargetSlotIdx) ||
                            (isRefillStage && ref.seat === activeSeat && (ref.cardIndex === state.pendingRefills[0].slot || (isEmptySlot && isRefillTargetSlot)));
      const isMildSwap = isSwapAvailable && ref.seat === state.activePlayer;

      const isCombatParticipant = Boolean(state.pendingCombat)
        ? (player.team === 'A' ? ref.cardIndex === teamACombatSlot : ref.cardIndex === teamBCombatSlot)
        : true;
      const isDimmed = Boolean(state.pendingCombat) && !isCombatParticipant;

      let highlightClass = '';
      if (isWinning) {
        highlightClass = `winning-card-highlight ${winningTeamClass}`;
      } else if (isStrongGreen) {
        highlightClass = 'highlight-strong-green';
      } else if (isMildSwap && !isSelected) {
        highlightClass = 'highlight-mild-swap';
      }

      if (isDimmed) {
        highlightClass = `${highlightClass} card-dimmed`.trim();
      }

      const cardKey = isEmptySlot ? 'empty' : (isFaceDown ? `facedown-${actualCard.id}` : actualCard.id);
      const prevKey = this.lastCardKeys.get(slotIdx);
      const isCardChanged = prevKey !== undefined && prevKey !== cardKey;

      const isRed = actualCard && (actualCard.suit === 'H' || actualCard.suit === 'D');
      const colorClass = actualCard && !isFaceDown ? (isRed ? 'card-red' : 'card-black') : '';
      const selectedClass = isSelected ? ' selected' : '';
      const emptyClass = isEmptySlot ? ' card-empty' : '';
      const faceDownClass = isFaceDown ? ' card-back face-down' : '';

      holder.cardEl.className = `trench-card ${teamClass}${emptyClass}${faceDownClass} ${colorClass}${selectedClass} ${highlightClass}`.trim();

      // Confined 2-phase swap animation: slide out old card to the right, delay, then slide in new card from the right
      if (canAnimate && isCardChanged && !isEmptySlot && prevKey !== 'empty') {
        this.clearSlotAnimation(slotIdx, holder);
        // Phase 1: Old card slides out to the right
        holder.innerEl.classList.add('slide-out-right');

        // Delay until slide-out finishes before updating to the new card
        const timer = setTimeout(() => {
          holder.innerEl.classList.remove('slide-out-right');
          this.applySlotContent(holder, actualCard, isFaceDown, isEmptySlot);
          // Phase 2: New card slides in from the same direction (from the right)
          holder.innerEl.classList.add('slide-in-right');

          const inTimer = setTimeout(() => {
            holder.innerEl.classList.remove('slide-in-right');
            this.animTimeouts.delete(slotIdx);
          }, CARD_ANIMATION_TIME_MS);
          this.animTimeouts.set(slotIdx, inTimer as any);
        }, CARD_ANIMATION_TIME_MS);
        this.animTimeouts.set(slotIdx, timer as any);
      } else {
        if (!this.animTimeouts.has(slotIdx) || inCombat) {
          if (inCombat) {
            this.clearSlotAnimation(slotIdx, holder);
          }
          this.applySlotContent(holder, actualCard, isFaceDown, isEmptySlot);
        }
      }

      this.lastCardKeys.set(slotIdx, cardKey);
    }

    this.hasRenderedOnce = true;
  }
}
