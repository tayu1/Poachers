import { getCol, getRow, HILL_SQUARE_INDICES, HILL_SQUARES_BY_SEAT, MAX_BASE_DECK_SIZE, PLAYER_TEAMS, TEAM_SEATS } from './constants';
import { getPieceTeam, isPieceControllable } from './moves';
import {
  Board1D,
  Card,
  CardRank,
  CombatResult,
  EvaluatedHand,
  GameState,
  HandRank,
  PlayerSeat,
  PlayerState,
  RegionOdds,
  Suit,
  Team
} from './types';

export function createDeck(): Card[] {
  const suits: Suit[] = ['S', 'H', 'D', 'C'];
  const ranks: CardRank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
  const deck: Card[] = [];
  let id = 1;
  for (const s of suits) {
    for (const r of ranks) {
      deck.push({ id: `card-${id++}`, suit: s, rank: r });
    }
  }
  // Fisher-Yates Shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export type TrenchStrategy = 'ALWAYS_HIGHEST' | 'MEDIUM_RESERVE_ATTACK' | 'CENTER_HEAVY' | 'FLOP_PAIR_MATCH' | 'POKER_SYNERGY' | 'BOT_DEFAULT_DRAFT';

export function popHighestRankCard(baseDeck: Card[]): Card | null {
  if (baseDeck.length === 0) return null;
  let maxIndex = 0;
  for (let i = 1; i < baseDeck.length; i++) {
    if (baseDeck[i].rank > baseDeck[maxIndex].rank) {
      maxIndex = i;
    }
  }
  return baseDeck.splice(maxIndex, 1)[0];
}

export function popMedianRankCard(baseDeck: Card[]): Card | null {
  if (baseDeck.length === 0) return null;
  if (baseDeck.length <= 2) {
    let minIndex = 0;
    for (let i = 1; i < baseDeck.length; i++) {
      if (baseDeck[i].rank < baseDeck[minIndex].rank) {
        minIndex = i;
      }
    }
    return baseDeck.splice(minIndex, 1)[0];
  }
  baseDeck.sort((a, b) => b.rank - a.rank);
  return baseDeck.splice(1, 1)[0];
}

export function popBestPokerRefillCard(
  baseDeck: Card[],
  communityCards: Card[],
  teammateCard: Card | null = null
): Card | null {
  if (baseDeck.length === 0) return null;
  if (communityCards.length === 0) return popHighestRankCard(baseDeck);

  let bestIdx = 0;
  let bestScore = -1;

  for (let i = 0; i < baseDeck.length; i++) {
    const card = baseDeck[i];
    const pool = [...communityCards, card];
    if (teammateCard) pool.push(teammateCard);

    const hand = pool.length >= 5 ? getBestHandFrom7CardPool(pool) : null;
    const score = hand ? (hand.rank * 100000 + hand.score) : (card.rank * 100);

    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  return baseDeck.splice(bestIdx, 1)[0];
}

export function dealInitialPlayerCards(deck: Card[]): { baseDeck: Card[]; trenchCards: [Card | null, Card | null, Card | null] } {
  const baseDeck = deck.splice(0, 6);
  const trenchCards: [Card | null, Card | null, Card | null] = [null, null, null];
  return { baseDeck, trenchCards };
}

export function autoPickBotTrenches(player: PlayerState, strategy: TrenchStrategy = 'ALWAYS_HIGHEST', publicFlop?: [Card | null, Card | null, Card | null]): void {
  if (player.baseDeck.length < 3) return;
  // Sort baseDeck descending by rank
  player.baseDeck.sort((a: Card, b: Card) => b.rank - a.rank);

  const communityCards: Card[] = publicFlop ? publicFlop.filter((c): c is Card => c !== null) : [];

  if (strategy === 'MEDIUM_RESERVE_ATTACK' && player.baseDeck.length >= 5) {
    const trench = [player.baseDeck[1], player.baseDeck[2], player.baseDeck[3]];
    player.baseDeck.splice(1, 3);
    player.trenchCards = [trench[0], trench[1], trench[2]];
  } else if (strategy === 'CENTER_HEAVY') {
    const top3 = player.baseDeck.splice(0, 3);
    player.trenchCards = [top3[1], top3[0], top3[2]];
  } else if ((strategy === 'POKER_SYNERGY' || strategy === 'FLOP_PAIR_MATCH') && communityCards.length > 0) {
    const c1 = popBestPokerRefillCard(player.baseDeck, communityCards);
    const c2 = popBestPokerRefillCard(player.baseDeck, communityCards);
    const c3 = popBestPokerRefillCard(player.baseDeck, communityCards);
    player.trenchCards = [c2, c1, c3];
  } else if (strategy === 'BOT_DEFAULT_DRAFT') {
    const top3 = player.baseDeck.splice(0, 3);
    const isLeft2nd = Math.random() < 0.5;
    player.trenchCards = [
      isLeft2nd ? top3[1] : top3[2],
      top3[0],
      isLeft2nd ? top3[2] : top3[1]
    ];
  } else {
    const top3 = player.baseDeck.splice(0, 3);
    player.trenchCards = [top3[0], top3[1], top3[2]];
  }
}

export function getTrenchCardIndexForSquare(targetIndex: number, team: Team): number {
  const row = getRow(targetIndex);
  const col = getCol(targetIndex);

  if (team === 'A') { // N-S team uses 3 columns
    if (col <= 2) return 0; // Left
    if (col <= 4) return 1; // Center
    return 2;              // Right
  } else { // E-W team uses 3 rows
    if (row <= 2) return 0; // Upper
    if (row <= 4) return 1; // Center
    return 2;              // Bottom
  }
}

export function refillTrenchCardsForPlayer(state: GameState, seat: PlayerSeat, strategy: TrenchStrategy = 'ALWAYS_HIGHEST'): void {
  const player = state.players[seat];
  const teammateSeat = seat === PlayerSeat.NORTH ? PlayerSeat.SOUTH
    : seat === PlayerSeat.SOUTH ? PlayerSeat.NORTH
    : seat === PlayerSeat.EAST ? PlayerSeat.WEST
    : PlayerSeat.EAST;

  const communityCards: Card[] = [
    ...state.publicFlop.filter((c): c is Card => c !== null),
    ...(state.isTurnRiverRevealed ? state.publicTurnRiver.filter((c): c is Card => c !== null) : [])
  ];

  for (let i = 0; i < player.trenchCards.length; i++) {
    if (player.trenchCards[i] === null) {
      const teammateCard = state.players[teammateSeat]?.trenchCards[i] || null;
      let card: Card | null = null;

      if (strategy === 'MEDIUM_RESERVE_ATTACK') {
        card = popMedianRankCard(player.baseDeck);
      } else if (strategy === 'POKER_SYNERGY' || strategy === 'FLOP_PAIR_MATCH') {
        card = popBestPokerRefillCard(player.baseDeck, communityCards, teammateCard);
      } else {
        card = popHighestRankCard(player.baseDeck);
      }

      if (card) {
        player.trenchCards[i] = card;
      }
    }
  }
}

export function refillAllTrenchCards(state: GameState): void {
  for (const seat of [PlayerSeat.NORTH, PlayerSeat.EAST, PlayerSeat.SOUTH, PlayerSeat.WEST]) {
    refillTrenchCardsForPlayer(state, seat);
  }
}

export function processPostCombat(state: GameState, combat: CombatResult): void {
  const { attackerSeat, defenderSeat, defenderPosIndex, winnerSeat } = combat;
  const attackerTeam = state.players[attackerSeat].team;
  const defenderTeam = state.players[defenderSeat].team;

  const attCardIdx = getTrenchCardIndexForSquare(defenderPosIndex, attackerTeam);
  const defCardIdx = getTrenchCardIndexForSquare(defenderPosIndex, defenderTeam);

  const attackerSeats = TEAM_SEATS[attackerTeam];
  const defenderSeats = TEAM_SEATS[defenderTeam];

  // 1. Clear used public cards back to main deck
  const usedPublicCards: Card[] = [
    ...state.publicFlop.filter((c): c is Card => c !== null),
    ...state.publicTurnRiver.filter((c): c is Card => c !== null)
  ];
  state.deck.unshift(...usedPublicCards);

  // Return attacker team's used trench cards to main deck
  for (const seat of attackerSeats) {
    const card = state.players[seat].trenchCards[attCardIdx];
    if (card) {
      state.deck.unshift(card);
      state.players[seat].trenchCards[attCardIdx] = null;
    }
  }

  // Handle defender team's trench cards
  for (const seat of defenderSeats) {
    const card = state.players[seat].trenchCards[defCardIdx];
    if (card) {
      if (winnerSeat === attackerSeat && seat === defenderSeat) {
        if (state.players[attackerSeat].baseDeck.length < MAX_BASE_DECK_SIZE) {
          state.players[attackerSeat].baseDeck.push(card);
        } else {
          state.deck.unshift(card);
        }
      } else {
        state.deck.unshift(card);
      }
      state.players[seat].trenchCards[defCardIdx] = null;
    }
  }

  state.pendingRefills = [
    ...attackerSeats.map(seat => ({ seat, slot: attCardIdx })),
    ...defenderSeats.map(seat => ({ seat, slot: defCardIdx }))
  ];

  // 2. Open 3 new public flop cards + 2 turn/river cards from deck
  state.publicFlop = [
    state.deck.pop() || null,
    state.deck.pop() || null,
    state.deck.pop() || null
  ];
  state.publicTurnRiver = [
    state.deck.pop() || null,
    state.deck.pop() || null
  ];
  state.isTurnRiverRevealed = false;
}

export function isSeatOccupyingHill(board: Board1D, seat: PlayerSeat): boolean {
  const hillSquares = HILL_SQUARES_BY_SEAT[seat];
  for (const sq of hillSquares) {
    const piece = board[sq];
    if (piece !== 0 && piece !== null && isPieceControllable(piece, seat, sq)) {
      return true;
    }
  }
  return false;
}

export function grantHillCardReward(state: GameState, seat: PlayerSeat): boolean {
  if (
    isSeatOccupyingHill(state.board, seat) &&
    state.deck &&
    state.deck.length > 0 &&
    state.players &&
    state.players[seat] &&
    state.players[seat].baseDeck.length < MAX_BASE_DECK_SIZE
  ) {
    const topCard = state.deck[state.deck.length - 1];
    if (topCard) {
      state.players[seat].baseDeck.push(state.deck.pop()!);
      return true;
    }
  }
  return false;
}

export function grantTurnEndCardRewards(
  state: GameState,
  seat: PlayerSeat
): { standardGranted: boolean; hillGranted: boolean } {
  const standardGranted = false;
  const hillGranted = grantHillCardReward(state, seat);
  return { standardGranted, hillGranted };
}

/**
 * Swaps two cards in a player's 3+N card array index layout:
 * - Index 0, 1, 2: Trench Cards
 * - Index 3..N: Base Deck Cards (Base Card 0 = index 3, Base Card 1 = index 4, etc.)
 */
export function swapPlayerCards(
  state: GameState,
  seat: PlayerSeat,
  slot1: number,
  slot2: number
): boolean {
  const player = state.players[seat];

  const isValidCard = (c: Card | null | undefined): boolean => Boolean(c && c.id !== 'hidden' && c.rank > 0);

  const getSlotInfo = (slot: number): { isTrench: boolean; index: number } => {
    if (slot < 3) {
      return { isTrench: true, index: slot };
    } else {
      return { isTrench: false, index: slot - 3 };
    }
  };

  const item1 = getSlotInfo(slot1);
  const item2 = getSlotInfo(slot2);

  // Base-to-Base swap is disallowed
  if (!item1.isTrench && !item2.isTrench) {
    return false;
  }

  // Case 1: Swapping two Trench cards (0..2 <-> 0..2)
  if (item1.isTrench && item2.isTrench) {
    const card1 = player.trenchCards[item1.index];
    const card2 = player.trenchCards[item2.index];

    const isHiddenOrCorrupt = (c: Card | null): boolean => Boolean(c && (c.id === 'hidden' || c.rank <= 0));
    if (isHiddenOrCorrupt(card1) || isHiddenOrCorrupt(card2)) {
      return false;
    }
    if (card1 === null && card2 === null) {
      return false;
    }

    player.trenchCards[item1.index] = card2;
    player.trenchCards[item2.index] = card1;
    return true;
  }

  // Case 2: Swapping Trench card (0..2) and Base deck card (>=3)
  const posSlot = item1.isTrench ? item1 : item2;
  const baseSlot = item1.isTrench ? item2 : item1;

  const baseCards = [...player.baseDeck];
  const posCards = [...player.trenchCards];
  const baseCard = baseCards[baseSlot.index];
  const posCard = posCards[posSlot.index];

  if (!isValidCard(baseCard)) {
    return false;
  }

  if (posCard === null) {
    posCards[posSlot.index] = baseCard;
    baseCards.splice(baseSlot.index, 1);
  } else {
    if (!isValidCard(posCard)) {
      return false;
    }
    posCards[posSlot.index] = baseCard;
    baseCards[baseSlot.index] = posCard;
  }

  player.baseDeck = baseCards.filter((c): c is Card => Boolean(c));
  player.trenchCards = posCards as [Card | null, Card | null, Card | null];
  return true;
}

const RANK_COUNTS = new Uint8Array(15);

const COMBOS_7C5 = [
  [0, 1, 2, 3, 4], [0, 1, 2, 3, 5], [0, 1, 2, 3, 6], [0, 1, 2, 4, 5],
  [0, 1, 2, 4, 6], [0, 1, 2, 5, 6], [0, 1, 3, 4, 5], [0, 1, 3, 4, 6],
  [0, 1, 3, 5, 6], [0, 1, 4, 5, 6], [0, 2, 3, 4, 5], [0, 2, 3, 4, 6],
  [0, 2, 3, 5, 6], [0, 2, 4, 5, 6], [0, 3, 4, 5, 6], [1, 2, 3, 4, 5],
  [1, 2, 3, 4, 6], [1, 2, 3, 5, 6], [1, 2, 4, 5, 6], [1, 3, 4, 5, 6],
  [2, 3, 4, 5, 6]
];

const COMBOS_6C5 = [
  [0, 1, 2, 3, 4],
  [0, 1, 2, 3, 5],
  [0, 1, 2, 4, 5],
  [0, 1, 3, 4, 5],
  [0, 2, 3, 4, 5],
  [1, 2, 3, 4, 5]
];

function evaluate5CardScore(c0: Card, c1: Card, c2: Card, c3: Card, c4: Card): number {
  RANK_COUNTS.fill(0);
  RANK_COUNTS[c0.rank]++; RANK_COUNTS[c1.rank]++; RANK_COUNTS[c2.rank]++; RANK_COUNTS[c3.rank]++; RANK_COUNTS[c4.rank]++;

  const isFlush = c0.suit === c1.suit && c0.suit === c2.suit && c0.suit === c3.suit && c0.suit === c4.suit;

  let pairs = 0;
  let c4Rank = 0;
  let c3Rank = 0;
  let pair1Rank = 0, pair2Rank = 0;
  let bitmask = 0;
  
  for (let i = 14; i >= 2; i--) {
    const count = RANK_COUNTS[i];
    if (count > 0) {
      bitmask |= (1 << i);
      if (count === 4) c4Rank = i;
      else if (count === 3) c3Rank = i;
      else if (count === 2) {
        if (pairs === 0) pair1Rank = i;
        else pair2Rank = i;
        pairs++;
      }
    }
  }

  let isStraight = false;
  let straightHigh = 0;
  
  if (pairs === 0 && c3Rank === 0 && c4Rank === 0) {
     const lowest = bitmask & -bitmask;
     const normalized = bitmask / lowest;
     if (normalized === 0b11111) {
       isStraight = true;
       straightHigh = 31 - Math.clz32(bitmask);
     } else if (bitmask === 0b1000000000011110) { // A, 5, 4, 3, 2
       isStraight = true;
       straightHigh = 5;
     }
  }

  if (isStraight && isFlush) return 9000000 + straightHigh;
  if (c4Rank > 0) {
     let kicker = 0;
     for (let i = 14; i >= 2; i--) if (RANK_COUNTS[i] === 1) kicker = i;
     return 8000000 + c4Rank * 100 + kicker;
  }
  if (c3Rank > 0 && pairs > 0) {
     return 7000000 + c3Rank * 100 + pair1Rank;
  }
  if (isFlush) {
     let score = 6000000;
     let mult = 10000;
     for (let i = 14; i >= 2; i--) {
       if (RANK_COUNTS[i] === 1) {
         score += i * mult;
         mult /= 10;
       }
     }
     return score;
  }
  if (isStraight) return 5000000 + straightHigh;
  
  if (c3Rank > 0) {
     let score = 4000000 + c3Rank * 10000;
     let mult = 100;
     for (let i = 14; i >= 2; i--) {
       if (RANK_COUNTS[i] === 1) {
         score += i * mult;
         mult /= 100;
       }
     }
     return score;
  }
  
  if (pairs === 2) {
     let kicker = 0;
     for (let i = 14; i >= 2; i--) if (RANK_COUNTS[i] === 1) kicker = i;
     return 3000000 + pair1Rank * 1000 + pair2Rank * 100 + kicker;
  }
  
  if (pairs === 1) {
     let score = 2000000 + pair1Rank * 1000;
     let mult = 100;
     for (let i = 14; i >= 2; i--) {
       if (RANK_COUNTS[i] === 1) {
         score += i * mult;
         mult /= 10;
       }
     }
     return score;
  }
  
  let score = 1000000;
  let mult = 10000;
  for (let i = 14; i >= 2; i--) {
    if (RANK_COUNTS[i] === 1) {
      score += i * mult;
      mult /= 10;
    }
  }
  return score;
}

/**
 * Evaluates any 5-card Poker hand and determines its rank, category name, and a unique numeric score for tie-breaking.
 */
export function evaluate5CardHand(cards: Card[]): EvaluatedHand {
  if (cards.length !== 5) {
    throw new Error(`Poker evaluation requires exactly 5 cards, got ${cards.length}`);
  }

  const score = evaluate5CardScore(cards[0], cards[1], cards[2], cards[3], cards[4]);
  const sortedCards = [...cards].sort((a, b) => b.rank - a.rank);

  const counts: Record<number, number> = {};
  for (const c of sortedCards) {
    counts[c.rank] = (counts[c.rank] || 0) + 1;
  }

  let rank = HandRank.HIGH_CARD;
  let name = 'High Card';
  let winningCards: Card[] = [];
  
  if (score >= 9000000) { rank = HandRank.STRAIGHT_FLUSH; name = 'Straight Flush'; winningCards = sortedCards; }
  else if (score >= 8000000) { rank = HandRank.FOUR_OF_A_KIND; name = 'Four of a Kind'; winningCards = sortedCards.filter(c => counts[c.rank] === 4); }
  else if (score >= 7000000) { rank = HandRank.FULL_HOUSE; name = 'Full House'; winningCards = sortedCards; }
  else if (score >= 6000000) { rank = HandRank.FLUSH; name = 'Flush'; winningCards = sortedCards; }
  else if (score >= 5000000) { rank = HandRank.STRAIGHT; name = 'Straight'; winningCards = sortedCards; }
  else if (score >= 4000000) { rank = HandRank.THREE_OF_A_KIND; name = 'Three of a Kind'; winningCards = sortedCards.filter(c => counts[c.rank] === 3); }
  else if (score >= 3000000) { rank = HandRank.TWO_PAIR; name = 'Two Pair'; winningCards = sortedCards.filter(c => counts[c.rank] === 2); }
  else if (score >= 2000000) { rank = HandRank.ONE_PAIR; name = 'One Pair'; winningCards = sortedCards.filter(c => counts[c.rank] === 2); }
  else { winningCards = [sortedCards[0]]; }

  return { rank, score, name, cards: sortedCards, winningCards };
}

/**
 * Given a 7-card pool (5 community + 2 trench), evaluates all combinations of 5 cards
 * and returns the highest scoring hand.
 */
export function getBestHandFrom7CardPool(pool: Card[]): EvaluatedHand {
  if (pool.length < 5) {
    throw new Error(`Cannot evaluate poker hand: pool has only ${pool.length} cards.`);
  }

  if (pool.length === 5) {
    return evaluate5CardHand(pool);
  }

  const combos = pool.length === 6 ? COMBOS_6C5 : COMBOS_7C5;

  let bestComboIdx = 0;
  let bestScore = -1;

  for (let i = 0; i < combos.length; i++) {
    const indices = combos[i];
    const score = evaluate5CardScore(
      pool[indices[0]], pool[indices[1]], pool[indices[2]],
      pool[indices[3]], pool[indices[4]]
    );
    if (score > bestScore) {
      bestScore = score;
      bestComboIdx = i;
    }
  }

  const bestIndices = combos[bestComboIdx];
  const bestCards = [
    pool[bestIndices[0]], pool[bestIndices[1]], pool[bestIndices[2]],
    pool[bestIndices[3]], pool[bestIndices[4]]
  ];

  return evaluate5CardHand(bestCards);
}

/**
 * Computes win/tie probabilities for Team A vs Team B across all 9 board regions.
 */
export function computeRegionProbabilities(state: GameState): RegionOdds[] {
  const defaultOdds: RegionOdds = { teamAWinRate: 0.5, teamBWinRate: 0.5 };
  const regionOddsList: RegionOdds[] = new Array(9).fill(null).map(() => ({ ...defaultOdds }));

  const validFlop = state.publicFlop.filter((c): c is Card => c !== null);
  if (validFlop.length < 3 || state.deck.length < 2) {
    return regionOddsList;
  }

  const deckPool = state.deck;
  const pairs: [Card, Card][] = [];
  for (let i = 0; i < deckPool.length; i++) {
    for (let j = i + 1; j < deckPool.length; j++) {
      pairs.push([deckPool[i], deckPool[j]]);
    }
  }

  if (pairs.length === 0) return regionOddsList;

  let sampledPairs = pairs;
  const MAX_SAMPLED_PAIRS = 5;
  if (pairs.length > MAX_SAMPLED_PAIRS) {
    sampledPairs = [];
    const step = pairs.length / MAX_SAMPLED_PAIRS;
    for (let i = 0; i < MAX_SAMPLED_PAIRS; i++) {
      const idx = Math.floor(i * step);
      sampledPairs.push(pairs[idx]);
    }
  }

  const north = state.players[PlayerSeat.NORTH];
  const south = state.players[PlayerSeat.SOUTH];
  const east = state.players[PlayerSeat.EAST];
  const west = state.players[PlayerSeat.WEST];

  const teamACardsBySlot: Card[][] = [0, 1, 2].map(aIdx =>
    [north.trenchCards[aIdx], south.trenchCards[aIdx]].filter((c): c is Card => c !== null)
  );
  const teamBCardsBySlot: Card[][] = [0, 1, 2].map(bIdx =>
    [east.trenchCards[bIdx], west.trenchCards[bIdx]].filter((c): c is Card => c !== null)
  );

  const winsA = new Array(9).fill(0);

  for (const [turn, river] of sampledPairs) {
    const communityCards = [...validFlop, turn, river];

    const handsA = teamACardsBySlot.map(cards =>
      getBestHandFrom7CardPool([...communityCards, ...cards])
    );

    const handsB = teamBCardsBySlot.map(cards =>
      getBestHandFrom7CardPool([...communityCards, ...cards])
    );

    for (let a = 0; a < 3; a++) {
      for (let b = 0; b < 3; b++) {
        if (handsA[a].score >= handsB[b].score) {
          winsA[a * 3 + b]++;
        }
      }
    }
  }

  const totalPairs = sampledPairs.length;
  for (let a = 0; a < 3; a++) {
    for (let b = 0; b < 3; b++) {
      const idx = a * 3 + b;
      const rateA = totalPairs > 0 ? winsA[idx] / totalPairs : 0.5;
      regionOddsList[idx] = {
        teamAWinRate: rateA,
        teamBWinRate: 1 - rateA
      };
    }
  }

  return regionOddsList;
}

export function getSquareCombatOdds(state: GameState, targetSquareIndex: number): RegionOdds {
  if (!state.regionOdds || state.regionOdds.length !== 9) {
    return { teamAWinRate: 0.5, teamBWinRate: 0.5 };
  }
  const teamAIdx = getTrenchCardIndexForSquare(targetSquareIndex, 'A');
  const teamBIdx = getTrenchCardIndexForSquare(targetSquareIndex, 'B');
  const regionIdx = teamAIdx * 3 + teamBIdx;
  const item = state.regionOdds[regionIdx];
  if (typeof item === 'number') {
    return { teamAWinRate: item, teamBWinRate: 1 - item };
  }
  return (item as RegionOdds) || { teamAWinRate: 0.5, teamBWinRate: 0.5 };
}
