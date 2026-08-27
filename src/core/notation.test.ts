import { describe, expect, it } from 'vitest';
import {
  formatCombatAnnouncementText,
  formatDirectTakeText,
  formatFailedCombatText,
  formatHandCards,
  formatHandName,
  formatPokerComparison,
  formatPromotionText,
  formatStandardMoveText,
  getHandDescription,
  getPieceCode,
  getSeatCode,
  indexToAlgebraic
} from './notation';
import { CombatResult, EvaluatedHand, HandRank, PlayerSeat } from './types';

describe('Log Book Notation Formatter', () => {
  it('should convert 1D board index to algebraic square names correctly', () => {
    expect(indexToAlgebraic(0)).toBe('a8');
    expect(indexToAlgebraic(7)).toBe('h8');
    expect(indexToAlgebraic(56)).toBe('a1');
    expect(indexToAlgebraic(63)).toBe('h1');
    expect(indexToAlgebraic(52)).toBe('e2');
    expect(indexToAlgebraic(36)).toBe('e4');
    expect(indexToAlgebraic(27)).toBe('d5');
    expect(indexToAlgebraic(28)).toBe('e5');
    expect(indexToAlgebraic(35)).toBe('d4');
  });

  it('should return correct seat code', () => {
    expect(getSeatCode(PlayerSeat.NORTH)).toBe('N');
    expect(getSeatCode(PlayerSeat.EAST)).toBe('E');
    expect(getSeatCode(PlayerSeat.SOUTH)).toBe('S');
    expect(getSeatCode(PlayerSeat.WEST)).toBe('W');
  });

  it('should return correct piece single uppercase character', () => {
    expect(getPieceCode('p' as any)).toBe('P');
    expect(getPieceCode('n' as any)).toBe('N');
    expect(getPieceCode('b' as any)).toBe('B');
    expect(getPieceCode('r' as any)).toBe('R');
    expect(getPieceCode('k' as any)).toBe('K');
  });

  it('should format standard non-combat move', () => {
    expect(formatStandardMoveText('P', 52, 36)).toBe('P : e2 -> e4');
    expect(formatStandardMoveText('n' as any, 1, 18)).toBe('N : b8 -> c6');
  });

  it('should format direct capture', () => {
    expect(formatDirectTakeText('n' as any, 'P', 21, 28)).toBe('N : Takes(P) : f6 -> e5');
    expect(formatDirectTakeText('R', 'K', 0, 7)).toBe('R : Takes(K) : a8 -> h8');
    expect(formatDirectTakeText('P', 'N', 52, 36, true)).toBe('P : Takes(N) : e2 -> e4(X)');
    expect(formatDirectTakeText('P', 'N', 44, 36, true)).toBe('P : Takes(N) : e3 -> e4(X)');
  });

  it('should format failed combat attack for sliding and in-place pieces', () => {
    // Rook slide attack: a5 (24) -> c5 (26), defender at e5 (28)
    expect(formatFailedCombatText('R', 28, 24, 26)).toBe('R : failed(e5) : a5 -> c5');
    // Pawn in-place attack: a5 (24) -> a5 (24), defender at e5 (28)
    expect(formatFailedCombatText('P', 28, 24, 24)).toBe('P : failed(e5) : a5 -> a5');
    // Attack against bunker destroyed: e3 (44) attacking defender at e4 (36)
    expect(formatFailedCombatText('P', 36, 44, 44, true)).toBe('P : failed(e4) : e3 -> e3(X)');
  });

  it('should format pawn promotion', () => {
    expect(formatPromotionText('R', 35)).toBe('R : Promotion -> d4');
    expect(formatPromotionText('N', 28)).toBe('N : Promotion -> e5');
  });

  it('should format poker hand cards and comparison line', () => {
    const fullHouse: EvaluatedHand = {
      rank: HandRank.FULL_HOUSE,
      score: 7000000,
      name: 'Full House',
      cards: [
        { id: '1', suit: 'S', rank: 14 },
        { id: '2', suit: 'H', rank: 13 },
        { id: '3', suit: 'D', rank: 12 },
        { id: '4', suit: 'C', rank: 11 },
        { id: '5', suit: 'S', rank: 10 }
      ]
    };

    const twoPair: EvaluatedHand = {
      rank: HandRank.TWO_PAIR,
      score: 3000000,
      name: 'Two Pair',
      cards: [
        { id: '6', suit: 'S', rank: 9 },
        { id: '7', suit: 'H', rank: 8 },
        { id: '8', suit: 'D', rank: 7 },
        { id: '9', suit: 'C', rank: 6 },
        { id: '10', suit: 'S', rank: 5 }
      ]
    };

    expect(formatHandCards(fullHouse)).toBe('AKQJT');
    expect(formatHandCards(twoPair)).toBe('98765');
    expect(formatHandName(twoPair)).toBe('Two Pair');

    const combatResult: CombatResult = {
      attackerSeat: PlayerSeat.NORTH,
      defenderSeat: PlayerSeat.EAST,
      attackerPosIndex: 36,
      defenderPosIndex: 27,
      attackerHand: fullHouse,
      defenderHand: twoPair,
      winnerSeat: PlayerSeat.NORTH,
      capturedPiece: 'R'
    };

    expect(formatPokerComparison(combatResult)).toBe('AKQJT (Full House) > 98765 (Two Pair)');
  });

  it('should format combat hand description and combat announcement text correctly', () => {
    const fullHouse: EvaluatedHand = {
      rank: HandRank.FULL_HOUSE,
      score: 7000000,
      name: 'Full House',
      cards: [{ id: '1', suit: 'S', rank: 14 }]
    };
    const pairAces: EvaluatedHand = {
      rank: HandRank.ONE_PAIR,
      score: 2000000,
      name: 'One Pair',
      cards: [{ id: '2', suit: 'H', rank: 14 }],
      winningCards: [{ id: '2', suit: 'H', rank: 14 }]
    };

    expect(getHandDescription(fullHouse)).toBe('a Full House');
    expect(getHandDescription(pairAces)).toBe('a Pair of Aces');

    const combatResultAttackerWin: CombatResult = {
      attackerSeat: PlayerSeat.NORTH,
      defenderSeat: PlayerSeat.EAST,
      attackerPosIndex: 36,
      defenderPosIndex: 27,
      attackerHand: fullHouse,
      defenderHand: pairAces,
      winnerSeat: PlayerSeat.NORTH,
      capturedPiece: 'P'
    };

    const combatResultDefenderWin: CombatResult = {
      attackerSeat: PlayerSeat.NORTH,
      defenderSeat: PlayerSeat.EAST,
      attackerPosIndex: 36,
      defenderPosIndex: 27,
      attackerHand: pairAces,
      defenderHand: fullHouse,
      winnerSeat: PlayerSeat.EAST,
      capturedPiece: null
    };

    const combatResultDraw: CombatResult = {
      attackerSeat: PlayerSeat.NORTH,
      defenderSeat: PlayerSeat.EAST,
      attackerPosIndex: 36,
      defenderPosIndex: 27,
      attackerHand: fullHouse,
      defenderHand: fullHouse,
      winnerSeat: PlayerSeat.NORTH,
      capturedPiece: 'P'
    };

    expect(formatCombatAnnouncementText(combatResultAttackerWin)).toBe('Attacker Win with a Full House!');
    expect(formatCombatAnnouncementText(combatResultDefenderWin)).toBe('Defender Win with a Full House!');
    expect(formatCombatAnnouncementText(combatResultDraw)).toBe('Draw - attacker wins');
  });
});
