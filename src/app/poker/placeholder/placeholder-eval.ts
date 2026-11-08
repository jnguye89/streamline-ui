import { Card, HandCategory, HandEvaluator, HandRank } from '../core/api';
import { capitalize, fullDeck, rankPlural, rankValue, rankWord, suitOf } from '../core/cards';

/**
 * PLACEHOLDER hand evaluator for the Phase 1 preview (brute force: best of the 21 five-card
 * subsets). Phase 2 replaces it with the fast evaluator in poker-core that is checked against
 * the exact counts in the brief (2,598,960 and 133,784,560 hands).
 */

const CATEGORY_ORDER: readonly HandCategory[] = [
  'highCard',
  'onePair',
  'twoPair',
  'threeOfAKind',
  'straight',
  'flush',
  'fullHouse',
  'fourOfAKind',
  'straightFlush',
];

interface Scored {
  readonly value: number;
  readonly category: HandCategory;
  /** Ranks that decide ties, most important first. */
  readonly ranks: readonly number[];
  readonly cards: readonly Card[];
}

function encode(categoryIndex: number, ranks: readonly number[]): number {
  let v = categoryIndex;
  for (let i = 0; i < 5; i++) v = v * 16 + (ranks[i] ?? 0);
  return v;
}

/** Highest card of a straight in these distinct ranks, or 0. A-2-3-4-5 counts, five high. */
function straightHigh(distinctDesc: readonly number[]): number {
  if (distinctDesc.length !== 5) return 0;
  const [a, b, c, d, e] = distinctDesc as [number, number, number, number, number];
  if (a - e === 4) return a;
  if (a === 14 && b === 5 && c === 4 && d === 3 && e === 2) return 5;
  return 0;
}

function score5(cards: readonly Card[]): Scored {
  const values = cards.map(rankValue).sort((x, y) => y - x);
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  // Groups sorted by size, then rank: e.g. full house → [[13,3],[7,2]].
  const groups = [...counts.entries()].sort((x, y) => y[1] - x[1] || y[0] - x[0]);
  const flush = cards.every((c) => suitOf(c) === suitOf(cards[0]!));
  const distinct = [...counts.keys()].sort((x, y) => y - x);
  const high = straightHigh(distinct);

  let category: HandCategory;
  let ranks: number[];
  const g0 = groups[0]!;
  const g1 = groups[1];
  if (high && flush) {
    category = 'straightFlush';
    ranks = [high];
  } else if (g0[1] === 4) {
    category = 'fourOfAKind';
    ranks = [g0[0], g1![0]];
  } else if (g0[1] === 3 && g1 && g1[1] === 2) {
    category = 'fullHouse';
    ranks = [g0[0], g1[0]];
  } else if (flush) {
    category = 'flush';
    ranks = values;
  } else if (high) {
    category = 'straight';
    ranks = [high];
  } else if (g0[1] === 3) {
    category = 'threeOfAKind';
    ranks = groups.map((g) => g[0]);
  } else if (g0[1] === 2 && g1 && g1[1] === 2) {
    category = 'twoPair';
    ranks = groups.map((g) => g[0]);
  } else if (g0[1] === 2) {
    category = 'onePair';
    ranks = groups.map((g) => g[0]);
  } else {
    category = 'highCard';
    ranks = values;
  }
  return { value: encode(CATEGORY_ORDER.indexOf(category), ranks), category, ranks, cards };
}

function label(s: Scored): string {
  const r = s.ranks;
  switch (s.category) {
    case 'straightFlush':
      return r[0] === 14 ? 'Royal flush' : `Straight flush, ${rankWord(r[0]!)} high`;
    case 'fourOfAKind':
      return `Four ${rankPlural(r[0]!)}`;
    case 'fullHouse':
      return `Full house, ${rankPlural(r[0]!)} full of ${rankPlural(r[1]!)}`;
    case 'flush':
      return `Flush, ${rankWord(r[0]!)} high`;
    case 'straight':
      return `Straight, ${rankWord(r[0]!)} high`;
    case 'threeOfAKind':
      return `Three ${rankPlural(r[0]!)}`;
    case 'twoPair':
      return `Two pair, ${rankPlural(r[0]!)} and ${rankPlural(r[1]!)}`;
    case 'onePair':
      return `Pair of ${rankPlural(r[0]!)}`;
    case 'highCard':
      return `${capitalize(rankWord(r[0]!))} high`;
  }
}

/** Order the five cards for display: the cards that make the hand first, high to low. */
function displayOrder(s: Scored): [Card, Card, Card, Card, Card] {
  const order = s.ranks;
  const sorted = [...s.cards].sort((a, b) => {
    const ia = order.indexOf(rankValue(a));
    const ib = order.indexOf(rankValue(b));
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || rankValue(b) - rankValue(a);
  });
  return sorted as unknown as [Card, Card, Card, Card, Card];
}

function* fives(cards: readonly Card[]): Generator<Card[]> {
  const n = cards.length;
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++) yield [cards[a]!, cards[b]!, cards[c]!, cards[d]!, cards[e]!];
}

function bestOf(cards: readonly Card[]): Scored {
  let best: Scored | null = null;
  for (const five of fives(cards)) {
    const s = score5(five);
    if (!best || s.value > best.value) best = s;
  }
  if (!best) throw new Error('Need at least 5 cards');
  return best;
}

function toRank(s: Scored): HandRank {
  return { value: s.value, category: s.category, label: label(s), best5: displayOrder(s) };
}

const DECK = fullDeck();

export class PlaceholderEvaluator implements HandEvaluator {
  rank5(cards: readonly Card[]): HandRank {
    if (cards.length !== 5) throw new Error('rank5 needs exactly 5 cards');
    return toRank(score5(cards));
  }

  rankBest(cards: readonly Card[]): HandRank {
    return toRank(bestOf(cards));
  }

  value7(cardIds: ArrayLike<number>): number {
    const cards: Card[] = [];
    for (let i = 0; i < cardIds.length; i++) cards.push(DECK[cardIds[i]!]!);
    return bestOf(cards).value;
  }

  describe(cards: readonly Card[]): string {
    if (cards.length >= 5) return toRank(bestOf(cards)).label;
    const values = cards.map(rankValue).sort((x, y) => y - x);
    if (values.length >= 2 && values[0] === values[1]) return `Pair of ${rankPlural(values[0]!)}`;
    return values.length ? `${capitalize(rankWord(values[0]!))} high` : '';
  }
}
