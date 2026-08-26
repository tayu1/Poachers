import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GameStore } from '../../store/store';
import { TurnManager } from '../../services/TurnManager';
import { InputHandler } from '../../services/InputHandler';
import { BoardUI } from './BoardUI';
import { PlayerSeat } from '../../core/types';

describe('Drag-and-Drop & Click Piece Movement', () => {
  let store: GameStore;
  let mockOverlays: any;
  let turnManager: TurnManager;
  let inputHandler: InputHandler;

  beforeEach(() => {
    store = new GameStore();
    mockOverlays = {
      showGameOver: vi.fn(),
      hideAll: vi.fn()
    };
    turnManager = new TurnManager(store, mockOverlays);
    inputHandler = new InputHandler(store, turnManager);
  });

  it('should successfully execute a legal move via handlePieceDrop', () => {
    const state = store.getState();
    state.setupState.inSetup = false;
    state.activePlayer = PlayerSeat.NORTH;

    // North Pawn at index 11 can legally move forward to 19
    const dispatchSpy = vi.spyOn(turnManager, 'dispatchAction');
    const result = inputHandler.handlePieceDrop(11, 19);

    expect(result).toBe(true);
    expect(dispatchSpy).toHaveBeenCalledWith(
      { type: 'MOVE', input1: 11, input2: 19 },
      { deferPostCombat: true }
    );
  });

  it('should reject an illegal move via handlePieceDrop', () => {
    const state = store.getState();
    state.setupState.inSetup = false;
    state.activePlayer = PlayerSeat.NORTH;

    const dispatchSpy = vi.spyOn(turnManager, 'dispatchAction');
    // North Pawn at 11 cannot jump sideways to 48
    const result = inputHandler.handlePieceDrop(11, 48);

    expect(result).toBe(false);
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('should reject drop onto the same square (fromIndex === toIndex)', () => {
    const state = store.getState();
    state.setupState.inSetup = false;
    state.activePlayer = PlayerSeat.NORTH;

    const dispatchSpy = vi.spyOn(turnManager, 'dispatchAction');
    const result = inputHandler.handlePieceDrop(11, 11);

    expect(result).toBe(false);
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('should reject drop if piece belongs to another player or is empty', () => {
    const state = store.getState();
    state.setupState.inSetup = false;
    state.activePlayer = PlayerSeat.NORTH; // North is active (Team A)

    const dispatchSpy = vi.spyOn(turnManager, 'dispatchAction');
    // Square 0 is empty square
    const result = inputHandler.handlePieceDrop(0, 8);

    expect(result).toBe(false);
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('should reject drop when game is over or during combat delay', () => {
    const state = store.getState();
    state.setupState.inSetup = false;
    state.activePlayer = PlayerSeat.NORTH;
    state.isGameOver = true;

    const dispatchSpy = vi.spyOn(turnManager, 'dispatchAction');
    const result = inputHandler.handlePieceDrop(11, 19);

    expect(result).toBe(false);
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('should continue to support traditional click-to-select and click-to-target', () => {
    const state = store.getState();
    state.setupState.inSetup = false;
    state.activePlayer = PlayerSeat.NORTH;

    // Step 1: Click piece at 11
    inputHandler.handleSquareClick(11);
    expect(store.selectedSquare).toBe(11);
    expect(store.legalMoves.length).toBeGreaterThan(0);

    // Step 2: Click legal destination 19
    const dispatchSpy = vi.spyOn(turnManager, 'dispatchAction');
    inputHandler.handleSquareClick(19);

    expect(dispatchSpy).toHaveBeenCalledWith(
      { type: 'MOVE', input1: 11, input2: 19 },
      { deferPostCombat: true }
    );
    expect(store.selectedSquare).toBeNull();
  });

  it('should initialize BoardUI with handlePieceDrop and handle drop callback', () => {
    const onDrop = vi.fn((from, to) => inputHandler.handlePieceDrop(from, to));
    const onClick = vi.fn((idx) => inputHandler.handleSquareClick(idx));

    const mockContainer: any = { innerHTML: '', appendChild: vi.fn(), contains: vi.fn(() => true) };
    const boardUI = new BoardUI(mockContainer, onClick, onDrop);

    // Trigger onPieceDrop callback directly
    (boardUI as any).onPieceDrop(11, 19);
    expect(onDrop).toHaveBeenCalledWith(11, 19);
  });
});
