import { executeTrenchSingleCardSelect, getValidPromotionOptions } from '../core/engine';
import { getTrenchSlotTopCard } from '../core/cards';
import { HILL_SQUARE_INDICES, MAX_BUNKERS_PER_PLAYER } from '../core/constants';
import { getLegalMoves1D, getPlayerBunkerCount, isPieceBunkerable, isPieceControllable } from '../core/moves';
import { getPieceType, PieceType, PlayerSeat, Card } from '../core/types';
import { socketClient } from '../net/socketClient';
import { GameStore } from '../store/store';
import { TurnManager } from './TurnManager';

export class InputHandler {
  private store: GameStore;
  private turnManager: TurnManager;

  constructor(store: GameStore, turnManager: TurnManager) {
    this.store = store;
    this.turnManager = turnManager;
  }

  private isMyTurn(seat: PlayerSeat = this.store.getState().activePlayer): boolean {
    if (this.store.botSeats[seat]) {
      return false;
    }
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

  public handleSquareClick(index: number): void {
    const state = this.store.getState();
    if (state.isGameOver || this.store.isReplaying || this.store.isCombatDelaying || state.setupState?.inSetup || state.pendingRefills.length > 0) {
      return;
    }

    if (!this.isMyTurn(state.activePlayer)) {
      if (this.store.selectedSquare !== null || this.store.legalMoves.length > 0) {
        this.store.selectSquare(null, []);
      }
      if (this.store.isSettingBunker) {
        this.store.setSettingBunker(false);
      }
      return;
    }

    const piece = state.board[index];

    // 1. Handle Set Bunker Mode (from Bunker Button)
    if (this.store.isSettingBunker) {
      this.store.setSettingBunker(false);
      this.store.selectSquare(null, []);
      const currentBunkers = getPlayerBunkerCount(state.board, state.activePlayer);
      if (currentBunkers < MAX_BUNKERS_PER_PLAYER && isPieceBunkerable(state.board, state.activePlayer, index)) {
        this.executeSetBunker(index);
      }
      return;
    }

    // 2. Handle Pawn Promotion if a lost piece was selected
    if (this.store.selectedPromotionPiece !== null) {
      const selType = getPieceType(this.store.selectedPromotionPiece);
      const promoOptions = getValidPromotionOptions(state, state.activePlayer);
      const isPromoValid = promoOptions.some(
        o => o.hillIndex === index && getPieceType(o.promotedPiece) === selType
      );

      if (isPromoValid) {
        this.turnManager.dispatchAction({ type: 'PROMOTION', input1: this.store.selectedPromotionPiece, input2: index });
        this.store.selectPromotionPiece(null);
        this.store.selectSquare(null, []);
        return;
      } else {
        this.store.selectPromotionPiece(null);
      }
    }

    const currentSelected = this.store.selectedSquare;

    // 4. If square is already selected, dispatch MOVE action
    if (currentSelected !== null) {
      const validMove = this.store.legalMoves.find((m: any) =>
        typeof m === 'number' ? ((m >>> 8) & 0x3F) === index : m.toIndex === index
      );
      if (validMove) {
        this.store.setSettingBunker(false);
        this.executeMove(currentSelected, index);
        this.store.selectSquare(null, []);
        return;
      }
    }

    // 5. Select square if friendly piece controllable by player
    if (piece && isPieceControllable(piece, state.activePlayer, index)) {
      const legalMoves = getLegalMoves1D(state.board, index, state.activePlayer, state.threatMap);
      this.store.setSettingBunker(false);
      this.store.selectSquare(index, legalMoves as any);
      return;
    }

    this.store.setSettingBunker(false);
    this.store.selectSquare(null, []);
  }

  public handlePieceDrop(fromIndex: number, toIndex: number): boolean {
    const state = this.store.getState();
    if (state.isGameOver || this.store.isReplaying || this.store.isCombatDelaying || state.setupState?.inSetup || state.pendingRefills.length > 0) {
      return false;
    }

    if (!this.isMyTurn(state.activePlayer)) {
      return false;
    }

    if (fromIndex === toIndex) {
      return false;
    }

    const piece = state.board[fromIndex];
    if (!piece || !isPieceControllable(piece, state.activePlayer, fromIndex)) {
      return false;
    }

    const legalMoves = getLegalMoves1D(state.board, fromIndex, state.activePlayer, state.threatMap);
    const validMove = legalMoves.find((m: any) =>
      typeof m === 'number' ? ((m >>> 8) & 0x3F) === toIndex : m.toIndex === toIndex
    );

    if (validMove) {
      this.store.setSettingBunker(false);
      this.executeMove(fromIndex, toIndex);
      this.store.selectSquare(null, []);
      return true;
    }

    return false;
  }

  public executeMove(fromIndex: number, toIndex: number): void {
    const state = this.store.getState();
    if (state.isGameOver || this.store.isReplaying || this.store.isCombatDelaying || state.setupState?.inSetup || state.pendingRefills.length > 0) return;
    if (!this.isMyTurn(state.activePlayer)) return;

    this.turnManager.dispatchAction(
      { type: 'MOVE', input1: fromIndex, input2: toIndex },
      { deferPostCombat: true }
    );
  }

  public handleBunkerButtonClick(): void {
    const state = this.store.getState();
    if (state.isGameOver || this.store.isReplaying || this.store.isCombatDelaying || state.isCombatDelaying || state.pendingCombat || state.setupState?.inSetup || state.pendingRefills.length > 0) return;
    if (!this.isMyTurn(state.activePlayer)) return;

    const currentBunkers = getPlayerBunkerCount(state.board, state.activePlayer);
    if (currentBunkers >= MAX_BUNKERS_PER_PLAYER) {
      if (this.store.isSettingBunker) {
        this.store.setSettingBunker(false);
      }
      return;
    }

    this.store.selectSquare(null, []);
    this.store.selectPromotionPiece(null);
    this.store.setSettingBunker(!this.store.isSettingBunker);
  }

  public executeSetBunker(targetIndex: number): void {
    const state = this.store.getState();
    if (state.setupState?.inSetup || state.pendingRefills.length > 0 || this.store.isCombatDelaying) return;
    if (!this.isMyTurn(state.activePlayer)) return;

    this.turnManager.dispatchAction({ type: 'SET_BUNKER', input1: targetIndex });
  }

  public handleBaseCardClick(index: number): void {
    const state = this.store.getState();
    if (state.isGameOver || this.store.isReplaying || this.store.isCombatDelaying) return;

    const activeSeat = state.pendingRefills[0]?.seat ?? state.activePlayer;

    const isMyTurn = this.isMyTurn(activeSeat);
    if (!isMyTurn) return;

    const activePlayerState = state.players[activeSeat];
    const card = activePlayerState?.backupCards[index];
    if (card && (card.id === 'hidden' || card.rank <= 0)) return;

    if (state.setupState?.inSetup) {
      executeTrenchSingleCardSelect(state, activeSeat, index, this.store.botSeats);
      this.store.triggerUIUpdate();
      this.turnManager.syncTurn(this.store.getState());
      return;
    }

    if (state.pendingRefills.length > 0) {
      const slot = state.pendingRefills[0].slot;
      this.turnManager.dispatchAction({
        type: 'REFILL_TRENCH',
        input1: slot,
        input2: index
      });
      return;
    }

    const baseSlot = 3 + index;
    const selectedLcr = this.store.selectedTrenchCardIndex;
    const selectedBase = this.store.selectedBaseCardIndex;

    if (selectedLcr !== null) {
      this.executeCardSwap(selectedLcr, baseSlot);
      this.store.selectTrenchCard(null);
      this.store.selectBaseCard(null);
      return;
    }

    if (selectedBase !== null) {
      if (selectedBase === index) {
        this.store.selectBaseCard(null);
      } else {
        this.executeCardSwap(3 + selectedBase, baseSlot);
        this.store.selectBaseCard(null);
      }
      return;
    }

    if (!state.hasSwappedThisTurn) {
      this.store.selectBaseCard(index);
    }
  }

  public handleTrenchCardClick(seat: PlayerSeat, cardIndex: number): void {
    const state = this.store.getState();
    if (state.isGameOver || this.store.isReplaying || this.store.isCombatDelaying || state.setupState?.inSetup || state.pendingRefills.length > 0) return;
    if (seat !== state.activePlayer) return;

    const isMyTurn = this.isMyTurn(seat);
    if (!isMyTurn) return;

    const playerState = state.players[seat];
    const card = getTrenchSlotTopCard(playerState, cardIndex);
    if (card && (card.id === 'hidden' || card.rank <= 0)) return;

    const selectedBase = this.store.selectedBaseCardIndex;
    const selectedLcr = this.store.selectedTrenchCardIndex;

    if (selectedBase !== null) {
      this.executeCardSwap(3 + selectedBase, cardIndex);
      this.store.selectBaseCard(null);
      this.store.selectTrenchCard(null);
      return;
    }

    if (selectedLcr !== null) {
      if (selectedLcr === cardIndex) {
        this.store.selectTrenchCard(null);
      } else {
        this.executeCardSwap(selectedLcr, cardIndex);
        this.store.selectTrenchCard(null);
      }
      return;
    }

    if (!state.hasSwappedThisTurn) {
      this.store.selectTrenchCard(cardIndex);
    }
  }

  public handlePromotePawn(piece: PieceType | number): void {
    const state = this.store.getState();
    if (state.isGameOver || this.store.isReplaying || this.store.isCombatDelaying || state.setupState?.inSetup || state.pendingRefills.length > 0) return;

    const isMyTurn = this.isMyTurn(state.activePlayer);
    if (!isMyTurn) return;

    if (this.store.selectedPromotionPiece === piece) {
      this.store.selectPromotionPiece(null);
      this.store.selectSquare(null, []);
    } else {
      this.store.selectPromotionPiece(piece);
      this.store.selectSquare(null, []);
    }
  }

  public handleCardDrop(
    from: { type: 'trench'; seat: PlayerSeat; cardIndex: number } | { type: 'base'; cardIndex: number },
    to: { type: 'trench'; seat: PlayerSeat; cardIndex: number } | { type: 'base'; cardIndex: number }
  ): boolean {
    const state = this.store.getState();
    if (state.isGameOver || this.store.isReplaying || this.store.isCombatDelaying) return false;

    // Refill stage
    if (state.pendingRefills.length > 0) {
      if (from.type === 'base' && to.type === 'trench') {
        const refill = state.pendingRefills[0];
        if (!this.isMyTurn(refill.seat)) return false;
        if (to.seat === refill.seat && to.cardIndex === refill.slot) {
          this.turnManager.dispatchAction({
            type: 'REFILL_TRENCH',
            input1: refill.slot,
            input2: from.cardIndex
          });
          return true;
        }
      }
      return false;
    }

    // Setup stage
    if (state.setupState?.inSetup) {
      if (from.type === 'base' && to.type === 'trench') {
        const activeSeat =
          ([PlayerSeat.NORTH, PlayerSeat.EAST, PlayerSeat.SOUTH, PlayerSeat.WEST] as PlayerSeat[]).find(
            s => !state.setupState.setupCompletedSeats.includes(s)
          ) ?? state.activePlayer;
        if (!this.isMyTurn(activeSeat)) return false;
        const targetSlot = state.players[activeSeat]?.trenchCards.findIndex(c => c === null);
        if (to.seat === activeSeat && to.cardIndex === targetSlot) {
          executeTrenchSingleCardSelect(state, activeSeat, from.cardIndex, this.store.botSeats);
          this.store.triggerUIUpdate();
          this.turnManager.syncTurn(this.store.getState());
          return true;
        }
      }
      return false;
    }

    // Normal game turn - Card Swap
    if (state.hasSwappedThisTurn) return false;
    const activeSeat = state.activePlayer;
    if (!this.isMyTurn(activeSeat)) return false;

    // Target card MUST belong to the active player
    if (to.type === 'trench' && to.seat !== activeSeat) return false;

    // Source Trench card MUST belong to active player
    if (from.type === 'trench' && from.seat !== activeSeat) return false;

    if (from.type === to.type && from.cardIndex === to.cardIndex) return false;

    const player = state.players[activeSeat];
    if (!player) return false;

    // Verify source card validity
    if (from.type === 'trench') {
      const c = getTrenchSlotTopCard(player, from.cardIndex);
      if (!c || c.id === 'hidden' || c.rank <= 0) return false;
    } else {
      const c = player.backupCards[from.cardIndex];
      if (!c || c.id === 'hidden' || c.rank <= 0) return false;
    }

    // Verify target card validity (if non-null)
    const tc = to.type === 'trench'
      ? getTrenchSlotTopCard(player, to.cardIndex)
      : player.backupCards[to.cardIndex];
    if (tc && (tc.id === 'hidden' || tc.rank <= 0)) return false;

    const slot1 = from.type === 'trench' ? from.cardIndex : 3 + from.cardIndex;
    const slot2 = to.type === 'trench' ? to.cardIndex : 3 + to.cardIndex;

    this.executeCardSwap(slot1, slot2);
    this.store.selectTrenchCard(null);
    this.store.selectBaseCard(null);
    return true;
  }

  public executeCardSwap(slot1: number, slot2: number): void {
    const state = this.store.getState();
    if (state.hasSwappedThisTurn) return;

    this.turnManager.dispatchAction({ type: 'CARD_SWAP', input1: slot1, input2: slot2 });
  }

  public handlePassCard(): void {
    const state = this.store.getState();
    if (state.isGameOver || this.store.isReplaying || this.store.isCombatDelaying || state.isCombatDelaying || state.pendingCombat || state.setupState?.inSetup || state.pendingRefills.length > 0) return;
    if (state.hasSwappedThisTurn) return;

    const activeSeat = state.activePlayer;
    if (!this.isMyTurn(activeSeat)) return;

    const activePlayerState = state.players[activeSeat];
    if (!activePlayerState) return;

    let selectedBase = this.store.selectedBaseCardIndex;
    if (selectedBase === null || !activePlayerState.backupCards[selectedBase]) {
      // If no card is selected, pick highest rank card from active player's backupCards
      let bestIdx = -1;
      let highestRank = -1;
      for (let i = 0; i < 3; i++) {
        const c = activePlayerState.backupCards[i];
        if (c && c.id !== 'hidden' && c.rank > highestRank) {
          highestRank = c.rank;
          bestIdx = i;
        }
      }
      if (bestIdx !== -1) {
        selectedBase = bestIdx;
      }
    }
    if (selectedBase === null) return;

    const card = activePlayerState.backupCards[selectedBase];
    if (!card || card.id === 'hidden' || card.rank <= 0) return;

    const teammateSeat = ((activeSeat + 2) % 4) as PlayerSeat;
    const teammateState = state.players[teammateSeat];
    if (!teammateState) return;

    const teammateCardCount = teammateState.trenchCards.filter(c => c !== null).length +
      teammateState.backupCards.filter(c => c !== null).length;
    if (teammateCardCount >= 6) return;

    this.store.selectBaseCard(null);
    this.turnManager.dispatchAction({
      type: 'CARD_PASS',
      input1: selectedBase,
      origin: selectedBase
    });
  }

  public handleResign(): void {
    const state = this.store.getState();
    if (state.isGameOver || this.store.isReplaying) {
      this.turnManager.showGameOverMenu();
      return;
    }

    if (this.store.isMultiplayer && !this.store.isOfflineSolo) {
      const resigningSeat = this.store.mySeat !== null ? this.store.mySeat : state.activePlayer;
      socketClient.sendGameAction({
        type: 'RESIGN',
        input1: resigningSeat,
        input2: 0
      });
    } else {
      const result = this.store.resignGame();
      if (result) {
        this.turnManager.handleGameOver(result.winnerTeam, result.logText);
      }
    }
  }
}
