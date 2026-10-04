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

export function dealInitialPlayerCards(deck: Card[]): {
  baseDeck: Card[];
  trenchCards: [Card | null, Card | null, Card | null];
  backupCards: [Card | null, Card | null, Card | null];
} {
  // Start with 3 trench cards and 3 backup cards (6 cards total per player)
  const top = deck.splice(0, 3);
  const trenchCards: [Card | null, Card | null, Card | null] = [
    top[0] ?? null,
    top[1] ?? null,
    top[2] ?? null
  ];
  const backup = deck.splice(0, 3);
  const backupCards: [Card | null, Card | null, Card | null] = [
    backup[0] ?? null,
    backup[1] ?? null,
    backup[2] ?? null
  ];
  const baseDeck = backupCards.filter((c): c is Card => c !== null);
  return { baseDeck, trenchCards, backupCards };
}

/**
 * Deals community cards with burn cards:
 * 1. Deal Flop (3 cards from top of deck)
 * 2. Burn 1 card before Turn (top of deck to bottom of deck)
 * 3. Deal Turn (1 card from top of deck)
 * 4. Burn 1 card before River (top of deck to bottom of deck)
 * 5. Deal River (1 card from top of deck)
 */
export function dealCommunityCards(deck: Card[]): {
  publicFlop: [Card | null, Card | null, Card | null];
  publicTurnRiver: [Card | null, Card | null];
} {
  const publicFlop: [Card | null, Card | null, Card | null] = [
    deck.pop() || null,
    deck.pop() || null,
    deck.pop() || null
  ];

  // Burn card before Turn (top of deck -> bottom of deck)
  const burnTurn = deck.pop();
  if (burnTurn) {
    deck.unshift(burnTurn);
  }

  // Deal Turn card
  const turn = deck.pop() || null;

  // Burn card before River (top of deck -> bottom of deck)
  const burnRiver = deck.pop();
  if (burnRiver) {
    deck.unshift(burnRiver);
  }

  // Deal River card
  const river = deck.pop() || null;

  return {
    publicFlop,
    publicTurnRiver: [turn, river]
  };
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

export function refillTrenchCardsForPlayer(state: GameState, seat: PlayerSeat, _strategy: TrenchStrategy = 'ALWAYS_HIGHEST'): void {
  const player = state.players[seat];
  if (!player) return;
  normalizePlayerTrenchAndBase(player);
}

export function refillAllTrenchCards(state: GameState): void {
  for (const seat of [PlayerSeat.NORTH, PlayerSeat.EAST, PlayerSeat.SOUTH, PlayerSeat.WEST]) {
    refillTrenchCardsForPlayer(state, seat);
  }
}

export function getEmptyBackupSlotIndex(backup: (Card | null)[]): number | null {
  // Priority: Center (1) -> Right (2) -> Left (0)
  if (backup[1] === null || backup[1] === undefined) return 1;
  if (backup[2] === null || backup[2] === undefined) return 2;
  if (backup[0] === null || backup[0] === undefined) return 0;
  return null;
}

/**
 * Priority order for filling slots: Center (1) -> Right (2) -> Left (0)
 * Follows the standard slot refill logic:
 * 1. Check for first empty Trench slot (starting from center: 1 -> 2 -> 0)
 * 2. If Trench is full, check for first empty Backup/Base slot (starting from center: 1 -> 2 -> 0)
 */
export function getPlayerEmptySlot(
  player: PlayerState
): { slotType: 'trench' | 'backup'; slotIndex: number } | null {
  if (!player) return null;
  if (!player.backupCards) {
    player.backupCards = [null, null, null];
  }
  if (!player.trenchCards) {
    player.trenchCards = [null, null, null];
  }
  const priority = [1, 2, 0];

  // 1. Check for empty trench slot
  for (const idx of priority) {
    if (player.trenchCards[idx] === null) {
      return { slotType: 'trench', slotIndex: idx };
    }
  }

  // 2. Check for empty backup slot
  for (const idx of priority) {
    if (player.backupCards[idx] === null) {
      return { slotType: 'backup', slotIndex: idx };
    }
  }

  return null;
}

export const getTeammateEmptySlot = getPlayerEmptySlot;

/**
 * Adds a new card (from card steal, hill bonus, card pass, etc.) to a player's slots
 * following the standard slot refill logic (first empty slots, starting from center):
 * 1. Empty trench slot starting from center (1 -> 2 -> 0)
 * 2. Empty backup slot starting from center (1 -> 2 -> 0)
 *
 * Returns true if the card was successfully placed, false if all 6 slots are already full.
 */
export function addCardToPlayerSlots(player: PlayerState, card: Card): boolean {
  if (!player || !card) return false;
  if (!player.backupCards) {
    player.backupCards = [null, null, null];
  }
  if (!player.trenchCards) {
    player.trenchCards = [null, null, null];
  }

  const emptySlot = getPlayerEmptySlot(player);
  if (!emptySlot) return false;

  if (emptySlot.slotType === 'trench') {
    player.trenchCards[emptySlot.slotIndex] = card;
  } else {
    player.backupCards[emptySlot.slotIndex] = card;
  }
  normalizePlayerTrenchAndBase(player);
  return true;
}

export function syncPlayerReserve(player: PlayerState): void {
  if (!player.backupCards) {
    player.backupCards = [null, null, null];
  }
  player.baseDeck = player.backupCards.filter((c): c is Card => Boolean(c && c.id !== 'hidden'));
}

/**
 * Ensures that a card can be in Base position i only if Trench position i is full.
 * Otherwise, the card jumps from Base i to Trench i.
 */
export function normalizePlayerTrenchAndBase(player: PlayerState): void {
  if (!player) return;
  if (!player.backupCards) {
    player.backupCards = [null, null, null];
  }
  if (!player.trenchCards) {
    player.trenchCards = [null, null, null];
  }
  for (let i = 0; i < 3; i++) {
    if (player.trenchCards[i] === null && player.backupCards[i] !== null) {
      player.trenchCards[i] = player.backupCards[i];
      player.backupCards[i] = null;
    }
  }
  syncPlayerReserve(player);
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
    const player = state.players[seat];
    if (player.trenchCards[attCardIdx]) {
      // Top card was used in combat
      state.deck.unshift(player.trenchCards[attCardIdx]!);
      player.trenchCards[attCardIdx] = null;
    } else if (player.backupCards && player.backupCards[attCardIdx]) {
      // Backup card had to be used in combat
      state.deck.unshift(player.backupCards[attCardIdx]!);
      player.backupCards[attCardIdx] = null;
    }

    normalizePlayerTrenchAndBase(player);
  }

  // Handle defender team's trench cards
  for (const seat of defenderSeats) {
    const player = state.players[seat];
    let defCard: Card | null = null;
    if (player.trenchCards[defCardIdx]) {
      defCard = player.trenchCards[defCardIdx]!;
      player.trenchCards[defCardIdx] = null;
    } else if (player.backupCards && player.backupCards[defCardIdx]) {
      defCard = player.backupCards[defCardIdx]!;
      player.backupCards[defCardIdx] = null;
    }

    if (defCard) {
      if (winnerSeat === attackerSeat && seat === defenderSeat) {
        const attackerPlayer = state.players[attackerSeat];
        const added = addCardToPlayerSlots(attackerPlayer, defCard);
        if (!added) {
          state.deck.unshift(defCard);
        }
      } else {
        state.deck.unshift(defCard);
      }
    }

    normalizePlayerTrenchAndBase(player);
  }

  // Used trench slots that lacked a backup remain null until player refills/swaps
  state.pendingRefills = [];

  // 2. Open 3 new public flop cards + 2 turn/river cards from deck with card burns
  const communityCards = dealCommunityCards(state.deck);
  state.publicFlop = communityCards.publicFlop;
  state.publicTurnRiver = communityCards.publicTurnRiver;
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
    state.players[seat]
  ) {
    const player = state.players[seat];
    const emptySlot = getPlayerEmptySlot(player);
    if (emptySlot !== null) {
      const topCard = state.deck.pop();
      if (topCard) {
        const added = addCardToPlayerSlots(player, topCard);
        if (added) {
          return true;
        } else {
          state.deck.push(topCard);
        }
      }
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
export function getTrenchSlotCardCount(player: PlayerState, idx: number): 0 | 1 | 2 {
  const top = player.trenchCards[idx];
  const backup = player.backupCards[idx];
  if (top !== null && backup !== null) return 2;
  if (top !== null || backup !== null) return 1;
  return 0;
}

export function getTrenchSlotTopCard(player: PlayerState | undefined | null, idx: number): Card | null {
  if (!player) return null;
  return player.trenchCards[idx];
}

export function getSlotCard(player: PlayerState, slot: number): Card | null {
  if (slot < 0 || slot > 5) return null;
  return slot < 3 ? player.trenchCards[slot] : player.backupCards[slot - 3];
}

export function setSlotCard(player: PlayerState, slot: number, card: Card | null): void {
  if (slot < 0 || slot > 5) return;
  if (!player.backupCards) {
    player.backupCards = [null, null, null];
  }
  if (slot < 3) {
    player.trenchCards[slot] = card;
  } else {
    player.backupCards[slot - 3] = card;
    syncPlayerReserve(player);
  }
}

/**
 * Universal swap across all 6 player card slots:
 * - Slots 0, 1, 2: Trench Left, Center, Right
 * - Slots 3, 4, 5: Backup Left, Center, Right (fused base deck)
 *
 * Supports:
 * - Trench <-> Trench
 * - Trench <-> Backup
 * - Backup <-> Backup
 * - Swapping between two cards (exchange positions)
 * - Moving a card into an empty slot (other slot becomes empty)
 */
/**
 * Checks whether a card swap between slot1 and slot2 is legal for a player:
 * - Slots must be within range 0..5 and distinct
 * - At least one slot must contain a valid (non-hidden, rank > 0) card
 * - Neither slot can contain a hidden/corrupt card
 * - Rule: Cannot move a card from a Trench slot (0, 1, 2) without a backup behind it
 *   to an empty Backup slot (3, 4, 5).
 */
export function isValidCardSwap(
  player: PlayerState | null | undefined,
  slot1: number,
  slot2: number
): boolean {
  if (!player) return false;
  if (slot1 < 0 || slot1 > 5 || slot2 < 0 || slot2 > 5 || slot1 === slot2) {
    return false;
  }
  if (!player.backupCards) {
    player.backupCards = [null, null, null];
  }
  if (!player.trenchCards) {
    player.trenchCards = [null, null, null];
  }

  const c1 = getSlotCard(player, slot1);
  const c2 = getSlotCard(player, slot2);

  const isValidCard = (c: Card | null): boolean => Boolean(c && c.id !== 'hidden' && c.rank > 0);
  if (!isValidCard(c1) && !isValidCard(c2)) {
    return false;
  }
  if (c1 && !isValidCard(c1)) return false;
  if (c2 && !isValidCard(c2)) return false;

  // Rule: Cannot move a card from a Trench slot without backup to an empty Backup slot
  // Check slot1 -> slot2:
  if (slot1 < 3 && slot2 >= 3) {
    const hasBackup = Boolean(player.backupCards && player.backupCards[slot1]);
    const isTargetEmpty = c2 === null;
    if (c1 !== null && !hasBackup && isTargetEmpty) {
      return false;
    }
  }
  // Check slot2 -> slot1:
  if (slot2 < 3 && slot1 >= 3) {
    const hasBackup = Boolean(player.backupCards && player.backupCards[slot2]);
    const isTargetEmpty = c1 === null;
    if (c2 !== null && !hasBackup && isTargetEmpty) {
      return false;
    }
  }

  return true;
}

export function swapPlayerCards(
  state: GameState,
  seat: PlayerSeat,
  slot1: number,
  slot2: number
): boolean {
  const player = state.players[seat];
  if (!player) return false;
  if (!isValidCardSwap(player, slot1, slot2)) {
    return false;
  }

  const c1 = getSlotCard(player, slot1);
  const c2 = getSlotCard(player, slot2);

  setSlotCard(player, slot1, c2);
  setSlotCard(player, slot2, c1);
  normalizePlayerTrenchAndBase(player);
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

  const getSlotActiveCard = (p: typeof north, idx: number): Card | null => {
    return p.trenchCards[idx] ?? (p.backupCards ? p.backupCards[idx] : null);
  };

  const teamACardsBySlot: Card[][] = [0, 1, 2].map(aIdx =>
    [getSlotActiveCard(north, aIdx), getSlotActiveCard(south, aIdx)].filter((c): c is Card => c !== null)
  );
  const teamBCardsBySlot: Card[][] = [0, 1, 2].map(bIdx =>
    [getSlotActiveCard(east, bIdx), getSlotActiveCard(west, bIdx)].filter((c): c is Card => c !== null)
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

/**
 * Automatically refills empty trench slots (0 cards) for the specified player
 * using the highest rank cards from their base deck.
 *
 * This occurs at pre-pre-turn by the engine and does NOT count as a pre-turn swap
 * (state.hasSwappedThisTurn is NOT set to true).
 */
export function autoFillEmptySlots(
  _state: GameState,
  _seat: PlayerSeat = _state?.activePlayer,
  _skipOddsRecompute: boolean = false
): { slot: number; card: Card }[] {
  // Base and backup are unified (3 trench + 3 base per player).
  // Trench slots are backed up 1-to-1 by their corresponding base cards and instantly promoted during combat.
  // Empty slots remain empty until swapped by the player or refilled via Hill bonus/teammate pass.
  return [];
}

