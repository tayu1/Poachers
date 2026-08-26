import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SoundManager } from './sound';
import { PlayerSeat } from '../../core/types';

describe('SoundManager', () => {
  let soundManager: SoundManager;
  let playSpy: any;

  beforeEach(() => {
    soundManager = new SoundManager();
    playSpy = vi.spyOn(soundManager, 'play').mockImplementation(() => {});
  });

  it('should play move-self sound on normal move', () => {
    const mockStore = { historyLength: 1, isReplaying: false };
    const mockState = {
      lastMove: { fromIndex: 8, toIndex: 16, type: 'move', moveId: 'm1' },
      isGameOver: false
    };

    soundManager.handleStateUpdate(mockState, mockStore);
    expect(playSpy).toHaveBeenCalledWith('move-self');
  });

  it('should play capture sound on direct piece capture (e.g. King capture)', () => {
    const mockStore = { historyLength: 1, isReplaying: false };
    const mockState = {
      lastMove: { fromIndex: 8, toIndex: 16, type: 'capture', moveId: 'm1' },
      isGameOver: false
    };

    soundManager.handleStateUpdate(mockState, mockStore);
    expect(playSpy).toHaveBeenCalledWith('capture');
  });

  it('should NOT play sound at combat start during turn river delay', () => {
    const mockStore = { historyLength: 1, isReplaying: false };
    const mockState = {
      lastMove: { fromIndex: 8, toIndex: 16, type: 'move', moveId: 'm1' },
      pendingCombat: {
        attackerSeat: PlayerSeat.NORTH,
        defenderSeat: PlayerSeat.EAST,
        attackerPosIndex: 8,
        defenderPosIndex: 16,
        winnerSeat: null
      },
      isTurnRiverRevealed: false,
      isGameOver: false
    };

    soundManager.handleStateUpdate(mockState, mockStore);
    // Sound should be suppressed at combat start!
    expect(playSpy).not.toHaveBeenCalled();
  });

  it('should play sound when combat is resolved after turn river reveal', () => {
    const mockStore = { historyLength: 1, isReplaying: false };
    
    // 1. Combat starts
    const combatStartState = {
      lastMove: { fromIndex: 8, toIndex: 16, type: 'move', moveId: 'm1' },
      pendingCombat: {
        attackerSeat: PlayerSeat.NORTH,
        defenderSeat: PlayerSeat.EAST,
        attackerPosIndex: 8,
        defenderPosIndex: 16,
        winnerSeat: null
      },
      isTurnRiverRevealed: false,
      isGameOver: false
    };

    soundManager.handleStateUpdate(combatStartState, mockStore);
    expect(playSpy).not.toHaveBeenCalled();

    // 2. Combat resolves (e.g. attacker wins -> capture)
    const combatResolvedState = {
      lastMove: { fromIndex: 8, toIndex: 16, type: 'capture', moveId: 'm2' },
      pendingCombat: {
        attackerSeat: PlayerSeat.NORTH,
        defenderSeat: PlayerSeat.EAST,
        attackerPosIndex: 8,
        defenderPosIndex: 16,
        winnerSeat: PlayerSeat.NORTH
      },
      isTurnRiverRevealed: true,
      isGameOver: false
    };

    soundManager.handleStateUpdate(combatResolvedState, mockStore);
    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(playSpy).toHaveBeenCalledWith('capture');

    // 3. Post combat completes (pendingCombat cleared, same moveId)
    const postCombatDoneState = {
      lastMove: { fromIndex: 8, toIndex: 16, type: 'capture', moveId: 'm2' },
      pendingCombat: null,
      isTurnRiverRevealed: false,
      isGameOver: false
    };

    soundManager.handleStateUpdate(postCombatDoneState, mockStore);
    // Should NOT play sound again
    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it('should play move-self when defender wins combat (failed attack)', () => {
    const mockStore = { historyLength: 1, isReplaying: false };

    // Combat resolves with failed_attack
    const combatResolvedState = {
      lastMove: { fromIndex: 8, toIndex: 16, type: 'failed_attack', moveId: 'm2' },
      pendingCombat: {
        attackerSeat: PlayerSeat.NORTH,
        defenderSeat: PlayerSeat.EAST,
        attackerPosIndex: 8,
        defenderPosIndex: 16,
        winnerSeat: PlayerSeat.EAST
      },
      isTurnRiverRevealed: true,
      isGameOver: false
    };

    soundManager.handleStateUpdate(combatResolvedState, mockStore);
    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(playSpy).toHaveBeenCalledWith('move-self');
  });

  it('should suppress move/capture sounds when not in active match (e.g. lobby or waiting room)', () => {
    const mockStore = { historyLength: 1, isReplaying: false, isInMatch: () => false };
    const mockState = {
      lastMove: { fromIndex: 8, toIndex: 16, type: 'capture', moveId: 'm1' },
      isGameOver: false
    };

    soundManager.handleStateUpdate(mockState, mockStore);
    expect(playSpy).not.toHaveBeenCalled();
  });

  it('should suppress timer warning sound when not in active match (e.g. lobby or waiting room)', () => {
    const mockStore = {
      isReplaying: false,
      isInMatch: () => false,
      timerRemainingSeconds: 5,
      timerActiveSeat: PlayerSeat.NORTH,
      turnTimeLimit: 30,
      turnEndsAt: Date.now() + 5000,
      getState: () => ({ turnCount: 1 })
    };

    soundManager.handleTimerUpdate(mockStore);
    expect(playSpy).not.toHaveBeenCalled();
  });

  it('should play timer warning sound when in active match and remaining <= 10', () => {
    const mockStore = {
      isReplaying: false,
      isInMatch: () => true,
      timerRemainingSeconds: 5,
      timerActiveSeat: PlayerSeat.NORTH,
      turnTimeLimit: 30,
      turnEndsAt: Date.now() + 5000,
      getState: () => ({ turnCount: 1 })
    };

    soundManager.handleTimerUpdate(mockStore);
    expect(playSpy).toHaveBeenCalledWith('tenseconds');
  });
});
