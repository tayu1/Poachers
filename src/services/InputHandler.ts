import { executeTrenchSingleCardSelect, getValidPromotionOptions } from '../core/engine';
import { HILL_SQUARE_INDICES } from '../core/constants';
import { getLegalMoves1D, isPieceControllable } from '../core/moves';
import { getPieceType, PieceType, PlayerSeat } from '../core/types';
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

  public handleSquareClick(index: number): void {
    const state = this.store.getState();
    if (state.isGameOver || this.store.isReplaying || this.store.isCombatDelaying || state.setupState?.inSetup || state.pendingRefills.length > 0) {
      return;
    }

    const activeBunkerIndices: number[] = [];
    for (let i = 0; i < 64; i++) {
      const p = state.board[i];
      if (p !== 0 && (p & 16) !== 0 && isPieceControllable(p, state.activePlayer, i)) {
        activeBunkerIndices.push(i);
      }
    }
    const piece = state.board[index];

    // 1. Handle Set Bunker Mode
    if (this.store.isSettingBunker) {
      const sourceBunker = this.store.sourceBunkerIndex;
      if (index === sourceBunker) {
        // 3rd click on current bunkered piece -> Remove bunker
        this.store.setSettingBunker(false);
        this.store.selectSquare(null, []);
        this.executeSetBunker(sourceBunker!, 0);
        return;
      } else if (piece && isPieceControllable(piece, state.activePlayer, index) && !HILL_SQUARE_INDICES.includes(index)) {
        // Clicked a target piece controlled by player -> assign bunker
        this.store.setSettingBunker(false);
        this.store.selectSquare(null, []);
        this.executeSetBunker(sourceBunker!, index);
        return;
      } else {
        // Cancel bunker mode
        this.store.setSettingBunker(false);
        this.store.selectSquare(null, []);
        return;
      }
    }

    // 2. Handle Clicking Bunkered Piece
    if (activeBunkerIndices.includes(index)) {
      if (this.store.selectedSquare === index) {
        this.store.setSettingBunker(true, index);
        return;
      } else {
        this.store.selectPromotionPiece(null);
        this.store.setSettingBunker(false);
        this.store.selectSquare(index, []);
        return;
      }
    }

    // 3. Handle Pawn Promotion if a lost piece was selected
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

    // 5. Select square if friendly piece
    if (piece) {
      const legalMoves = getLegalMoves1D(state.board, index, state.activePlayer, state.threatMap);
      if (legalMoves.length > 0 || isPieceControllable(piece, state.activePlayer, index)) {
        this.store.setSettingBunker(false);
        this.store.selectSquare(index, legalMoves as any);
        return;
      }
    }

    this.store.setSettingBunker(false);
    this.store.selectSquare(null, []);
  }

  public handlePieceDrop(fromIndex: number, toIndex: number): boolean {
    const state = this.store.getState();
    if (state.isGameOver || this.store.isReplaying || this.store.isCombatDelaying || state.setupState?.inSetup || state.pendingRefills.length > 0) {
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

    this.turnManager.dispatchAction(
      { type: 'MOVE', input1: fromIndex, input2: toIndex },
      { deferPostCombat: true }
    );
  }

  public executeSetBunker(originIndex: number, endIndex: number | null = 0): void {
    const state = this.store.getState();
    if (state.setupState?.inSetup || state.pendingRefills.length > 0 || this.store.isCombatDelaying) return;

    this.turnManager.dispatchAction({ type: 'SET_BUNKER', input1: originIndex, input2: endIndex ?? 0 });
  }

  public handleBaseCardClick(index: number): void {
    const state = this.store.getState();
    if (state.isGameOver || this.store.isReplaying || this.store.isCombatDelaying) return;

    const activeSeat = state.pendingRefills.length > 0
      ? state.pendingRefills[0].seat
      : (state.setupState?.inSetup
          ? (
              ([PlayerSeat.NORTH, PlayerSeat.EAST, PlayerSeat.SOUTH, PlayerSeat.WEST] as PlayerSeat[]).find(s => !state.setupState.setupCompletedSeats.includes(s) && (this.store.mySeats?.includes(s) || this.store.mySeat === s)) ??
              ([PlayerSeat.NORTH, PlayerSeat.EAST, PlayerSeat.SOUTH, PlayerSeat.WEST] as PlayerSeat[]).find(s => !state.setupState.setupCompletedSeats.includes(s)) ??
              state.activePlayer
            )
          : state.activePlayer);

    const isMyTurn = !this.store.isMultiplayer || (this.store.mySeat !== null && this.store.mySeat === activeSeat) || (this.store.mySeats && this.store.mySeats.includes(activeSeat));
    if (!isMyTurn) return;

    const activePlayerState = state.players[activeSeat];
    const card = activePlayerState?.baseDeck[index];
    if (!card || card.id === 'hidden' || card.rank <= 0) return;

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

    if (selectedLcr !== null) {
      this.executeCardSwap(selectedLcr, baseSlot);
      this.store.selectTrenchCard(null);
      this.store.selectBaseCard(null);
      return;
    }

    if (!state.hasSwappedThisTurn) {
      this.store.selectBaseCard(this.store.selectedBaseCardIndex === index ? null : index);
    }
  }

  public handleTrenchCardClick(seat: PlayerSeat, cardIndex: number): void {
    const state = this.store.getState();
    if (state.isGameOver || this.store.isReplaying || this.store.isCombatDelaying || state.setupState?.inSetup || state.pendingRefills.length > 0) return;
    if (seat !== state.activePlayer) return;

    const isMyTurn = !this.store.isMultiplayer || (this.store.mySeat !== null && this.store.mySeat === seat) || (this.store.mySeats && this.store.mySeats.includes(seat));
    if (!isMyTurn) return;

    const playerState = state.players[seat];
    const card = playerState?.trenchCards[cardIndex];
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

    const isMyTurn = !this.store.isMultiplayer || (this.store.mySeat !== null && this.store.mySeat === state.activePlayer) || (this.store.mySeats && this.store.mySeats.includes(state.activePlayer));
    if (!isMyTurn) return;

    if (this.store.selectedPromotionPiece === piece) {
      this.store.selectPromotionPiece(null);
      this.store.selectSquare(null, []);
    } else {
      this.store.selectPromotionPiece(piece);
      this.store.selectSquare(null, []);
    }
  }

  public executeCardSwap(slot1: number, slot2: number): void {
    const state = this.store.getState();
    if (state.hasSwappedThisTurn) return;

    this.turnManager.dispatchAction({ type: 'CARD_SWAP', input1: slot1, input2: slot2 });
  }

  public handleResign(): void {
    const state = this.store.getState();
    if (state.isGameOver || this.store.isReplaying) {
      this.turnManager.showGameOverMenu();
      return;
    }

    if (this.store.isMultiplayer) {
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
