import { Card, RankChar, SuitChar } from './api';

/** Card helpers shared by the placeholder engine and the UI. Pure TypeScript. */

export const RANKS: readonly RankChar[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
export const SUITS: readonly SuitChar[] = ['c', 'd', 'h', 's'];

/** 2 … 14 (ace = 14). */
export function rankValue(card: Card): number {
  return RANKS.indexOf(card[0] as RankChar) + 2;
}

export function suitOf(card: Card): SuitChar {
  return card[1] as SuitChar;
}

/** Rank as printed on the card face: "10" for T. */
export function rankFace(card: Card): string {
  const r = card[0] as RankChar;
  return r === 'T' ? '10' : r;
}

export function isRed(card: Card): boolean {
  const s = suitOf(card);
  return s === 'h' || s === 'd';
}

export function fullDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) for (const r of RANKS) deck.push(`${r}${s}`);
  return deck;
}

const RANK_WORD: Record<number, string> = {
  2: 'two',
  3: 'three',
  4: 'four',
  5: 'five',
  6: 'six',
  7: 'seven',
  8: 'eight',
  9: 'nine',
  10: 'ten',
  11: 'jack',
  12: 'queen',
  13: 'king',
  14: 'ace',
};

const RANK_PLURAL: Record<number, string> = {
  2: 'twos',
  3: 'threes',
  4: 'fours',
  5: 'fives',
  6: 'sixes',
  7: 'sevens',
  8: 'eights',
  9: 'nines',
  10: 'tens',
  11: 'jacks',
  12: 'queens',
  13: 'kings',
  14: 'aces',
};

export function rankWord(v: number): string {
  return RANK_WORD[v] ?? '';
}

export function rankPlural(v: number): string {
  return RANK_PLURAL[v] ?? '';
}

export function capitalize(s: string): string {
  return s.length ? s[0]!.toUpperCase() + s.slice(1) : s;
}

const SUIT_NAME: Record<SuitChar, string> = { c: 'clubs', d: 'diamonds', h: 'hearts', s: 'spades' };

/** "King of spades" — for screen readers and the hand log. */
export function cardName(card: Card): string {
  return `${capitalize(rankWord(rankValue(card)))} of ${SUIT_NAME[suitOf(card)]}`;
}

/** Whole chips with thousands separators: 1240 → "1,240". */
export function chips(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}
