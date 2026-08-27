import { CombatResult, EvaluatedHand, HandRank, PieceType, PlayerSeat } from './types';

/**
 * Converts 0-63 1D board index to 8x8 algebraic notation square (e.g. 52 -> 'e2', 36 -> 'e4').
 */
export function indexToAlgebraic(index: number): string {
  const col = index % 8;
  const row = Math.floor(index / 8);
  const file = String.fromCharCode(97 + col); // 'a' + col
  const rank = 8 - row;
  return `${file}${rank}`;
}

/**
 * Returns single letter seat code: 'N', 'E', 'S', or 'W'.
 */
export function getSeatCode(seat: PlayerSeat): 'N' | 'E' | 'S' | 'W' {
  switch (seat) {
    case PlayerSeat.NORTH:
      return 'N';
    case PlayerSeat.EAST:
      return 'E';
    case PlayerSeat.SOUTH:
      return 'S';
    case PlayerSeat.WEST:
      return 'W';
    default:
      return 'N';
  }
}

const UPPER_CHARS = ['', 'P', 'N', 'B', 'R', 'K'];

/**
 * Returns single letter uppercase piece representation ('P', 'N', 'B', 'R', 'K').
 */
export function getPieceCode(piece: PieceType | number): string {
  if (typeof piece === 'number') {
    return UPPER_CHARS[piece & 7] || '';
  }
  return piece ? piece.toUpperCase() : '';
}

/**
 * Converts evaluated 5-card hand to sorted rank characters (e.g. 'AKQJT', '98765', '88822').
 */
export function formatHandCards(hand: EvaluatedHand): string {
  const rankChars: Record<number, string> = {
    14: 'A',
    13: 'K',
    12: 'Q',
    11: 'J',
    10: 'T',
    9: '9',
    8: '8',
    7: '7',
    6: '6',
    5: '5',
    4: '4',
    3: '3',
    2: '2'
  };
  return hand.cards.map(c => rankChars[c.rank] || c.rank.toString()).join('');
}

/**
 * Returns display hand rank name for log notation.
 */
export function formatHandName(hand: EvaluatedHand): string {
  switch (hand.rank) {
    case HandRank.STRAIGHT_FLUSH:
      return 'Straight Flush';
    case HandRank.FOUR_OF_A_KIND:
      return 'Four of a Kind';
    case HandRank.FULL_HOUSE:
      return 'Full House';
    case HandRank.FLUSH:
      return 'Flush';
    case HandRank.STRAIGHT:
      return 'Straight';
    case HandRank.THREE_OF_A_KIND:
      return 'Three of a Kind';
    case HandRank.TWO_PAIR:
      return 'Two Pair';
    case HandRank.ONE_PAIR:
      return 'Pair';
    case HandRank.HIGH_CARD:
      return 'High Card';
    default:
      return hand.name;
  }
}

const CARD_NAMES_PLURAL: Record<number, string> = {
  14: 'Aces',
  13: 'Kings',
  12: 'Queens',
  11: 'Jacks',
  10: '10s',
  9: '9s',
  8: '8s',
  7: '7s',
  6: '6s',
  5: '5s',
  4: '4s',
  3: '3s',
  2: '2s'
};

/**
 * Returns descriptive string for hand category (e.g., 'a Full House', 'a Pair of Aces', 'Three Jacks').
 */
export function getHandDescription(hand: EvaluatedHand): string {
  if (!hand) return '';
  switch (hand.rank) {
    case HandRank.STRAIGHT_FLUSH:
      return 'a Straight Flush';
    case HandRank.FOUR_OF_A_KIND:
      return 'Four of a Kind';
    case HandRank.FULL_HOUSE:
      return 'a Full House';
    case HandRank.FLUSH:
      return 'a Flush';
    case HandRank.STRAIGHT:
      return 'a Straight';
    case HandRank.THREE_OF_A_KIND: {
      const tripsCard = hand.winningCards?.[0] || hand.cards[0];
      const rankName = tripsCard ? (CARD_NAMES_PLURAL[tripsCard.rank] || '') : '';
      return `Three ${rankName}`.trim();
    }
    case HandRank.TWO_PAIR:
      return 'Two Pair';
    case HandRank.ONE_PAIR: {
      const pairCard = hand.winningCards?.[0] || hand.cards[0];
      const rankName = pairCard ? (CARD_NAMES_PLURAL[pairCard.rank] || '') : '';
      return `a Pair of ${rankName}`.trim();
    }
    case HandRank.HIGH_CARD:
      return 'High Card';
    default:
      return hand.name;
  }
}

/**
 * Formats live Combat Announcement Banner text:
 * Format: "Attacker Win with [handDesc]!" / "Defender Win with [handDesc]!" / "Draw - attacker wins"
 */
export function formatCombatAnnouncementText(combat: CombatResult): string {
  if (combat.attackerHand.score === combat.defenderHand.score) {
    return 'Draw - attacker wins';
  }

  const isAttackerWinner = combat.winnerSeat === combat.attackerSeat;
  const winnerHand = isAttackerWinner ? combat.attackerHand : combat.defenderHand;
  const loserHand = isAttackerWinner ? combat.defenderHand : combat.attackerHand;
  const winnerRole = isAttackerWinner ? 'Attacker' : 'Defender';

  if (
    winnerHand.rank === HandRank.ONE_PAIR &&
    loserHand.rank === HandRank.ONE_PAIR &&
    winnerHand.winningCards?.[0]?.rank === loserHand.winningCards?.[0]?.rank
  ) {
    let kickerRank = 0;
    for (let i = 0; i < 5; i++) {
      if (winnerHand.cards[i]?.rank !== loserHand.cards[i]?.rank) {
        kickerRank = winnerHand.cards[i]?.rank;
        break;
      }
    }
    
    if (kickerRank > 0) {
      const kickerNames: Record<number, string> = {
        14: 'ace', 13: 'king', 12: 'queen', 11: 'jack',
        10: '10', 9: '9', 8: '8', 7: '7', 6: '6',
        5: '5', 4: '4', 3: '3', 2: '2'
      };
      const kickerName = kickerNames[kickerRank] || kickerRank.toString();
      return `${winnerRole.toLowerCase()} won with a ${kickerName} kicker`;
    }
  }

  const handDesc = getHandDescription(winnerHand);
  return `${winnerRole} Win with ${handDesc}!`;
}

/**
 * Formats Poker Combat Showdown comparison line:
 * Format: [WinningHandCards] ([HandRank]) > [LosingHandCards] ([HandRank])
 */
export function formatPokerComparison(combat: CombatResult): string {
  const attCards = formatHandCards(combat.attackerHand);
  const attName = formatHandName(combat.attackerHand);
  const attStr = `${attCards} (${attName})`;

  const defCards = formatHandCards(combat.defenderHand);
  const defName = formatHandName(combat.defenderHand);
  const defStr = `${defCards} (${defName})`;

  if (combat.winnerSeat === combat.attackerSeat) {
    if (combat.attackerHand.score === combat.defenderHand.score) {
      return `${attStr} > ${defStr} (Draw - Attacker Wins)`;
    }
    return `${attStr} > ${defStr}`;
  } else {
    return `${defStr} > ${attStr}`;
  }
}

/**
 * Format: [Piece] : [OriginSquare] -> [TargetSquare]
 * Example: P : e2 -> e4
 */
export function formatStandardMoveText(piece: PieceType, fromIndex: number, toIndex: number): string {
  const p = getPieceCode(piece);
  const from = indexToAlgebraic(fromIndex);
  const to = indexToAlgebraic(toIndex);
  return `${p} : ${from} -> ${to}`;
}

/**
 * Format: [Piece] : Takes([CapturedPieceType]) : [OriginSquare] -> [TargetSquare]
 * Example: N : Takes(P) : f3 -> e5
 * Example with Bunker: N : Takes(P) : f3 -> e5(X)
 */
export function formatDirectTakeText(
  piece: PieceType,
  capturedPiece: PieceType,
  fromIndex: number,
  toIndex: number,
  isBunkered?: boolean
): string {
  const p = getPieceCode(piece);
  const cap = getPieceCode(capturedPiece);
  const from = indexToAlgebraic(fromIndex);
  const to = indexToAlgebraic(toIndex);
  const bunkerTag = isBunkered ? '(X)' : '';
  return `${p} : Takes(${cap}) : ${from} -> ${to}${bunkerTag}`;
}

/**
 * Format: [Piece] : failed([DefendSquare]) : [OriginSquare] -> [SlideDestinationSquare/OriginSquare]
 * Example Slide: R : failed(e5) : a5 -> c5
 * Example In-Place: P : failed(e5) : a5 -> a5
 * Example with Bunker: P : failed(e5) : a5 -> a5(X)
 */
export function formatFailedCombatText(
  piece: PieceType,
  defendIndex: number,
  fromIndex: number,
  destIndex: number,
  isBunkered?: boolean
): string {
  const p = getPieceCode(piece);
  const def = indexToAlgebraic(defendIndex);
  const from = indexToAlgebraic(fromIndex);
  const dest = indexToAlgebraic(destIndex);
  const bunkerTag = isBunkered ? '(X)' : '';
  return `${p} : failed(${def}) : ${from} -> ${dest}${bunkerTag}`;
}

/**
 * Format: [PromotedPieceType] : Promotion -> [HillSquare]
 * Example: R : Promotion -> d4
 */
export function formatPromotionText(promotedPiece: PieceType, hillIndex: number): string {
  const p = getPieceCode(promotedPiece);
  const hill = indexToAlgebraic(hillIndex);
  return `${p} : Promotion -> ${hill}`;
}

/**
 * Format: bunker . [fromSquare|0]->[toSquare|0]
 * Example: bunker . e4->c3
 * Example Release: bunker . e4->0
 */
export function formatSetBunkerText(originIndex: number, endIndex?: number | null): string {
  const fromStr = (originIndex !== undefined && originIndex !== null && originIndex !== -1)
    ? indexToAlgebraic(originIndex)
    : '0';
  const toStr = (endIndex !== undefined && endIndex !== null && endIndex !== -1 && endIndex !== 0)
    ? indexToAlgebraic(endIndex)
    : '0';
  return `bunker . ${fromStr}->${toStr}`;
}
