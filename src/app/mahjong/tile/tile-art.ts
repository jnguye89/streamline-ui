import {
  TileKind,
  dragonOf,
  isFlower,
  isSeason,
  rankOf,
  suitOf,
  windOf,
} from '@skriin/mahjong-core';

/**
 * Original skriin tile art (no commercial app art copied). Drawn in a 100 × 134 viewBox:
 * face 96 × 122 at (2, 2), a light-indigo edge 8 units below it.
 * Colors: indigo, green, red on an off-white face — high contrast from 10 ft.
 */

export const INK = {
  indigo: '#4F46E5',
  green: '#047857',
  red: '#DC2626',
  navy: '#1E1B4B',
} as const;

export interface Dot {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly c: string;
}
export interface Stick {
  readonly x: number;
  readonly y: number;
  readonly h: number;
  readonly c: string;
}
export interface Glyph {
  readonly ch: string;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly c: string;
}

export type Art =
  | { readonly type: 'dots'; readonly dots: readonly Dot[] }
  | { readonly type: 'sticks'; readonly sticks: readonly Stick[] }
  | { readonly type: 'one-bamboo' }
  | { readonly type: 'glyphs'; readonly glyphs: readonly Glyph[] }
  | { readonly type: 'white' };

const { indigo: I, green: G, red: R, navy: N } = INK;

const d = (x: number, y: number, c: string, r = 11): Dot => ({ x, y, r, c });
const DOTS: Record<number, Dot[]> = {
  1: [d(50, 64, I, 30)],
  2: [d(50, 36, G, 13), d(50, 92, I, 13)],
  3: [d(26, 28, I), d(50, 64, R), d(74, 100, G)],
  4: [d(30, 38, I, 12.5), d(70, 38, G, 12.5), d(30, 90, G, 12.5), d(70, 90, I, 12.5)],
  5: [d(28, 32, I), d(72, 32, G), d(50, 64, R), d(28, 96, G), d(72, 96, I)],
  6: [d(32, 28, G), d(68, 28, G), d(32, 64, R), d(68, 64, R), d(32, 100, R), d(68, 100, R)],
  7: [
    d(24, 22, G, 10),
    d(50, 36, G, 10),
    d(76, 50, G, 10),
    d(32, 78, R, 10),
    d(68, 78, R, 10),
    d(32, 106, R, 10),
    d(68, 106, R, 10),
  ],
  8: [
    d(32, 22, I, 10),
    d(68, 22, I, 10),
    d(32, 50, I, 10),
    d(68, 50, I, 10),
    d(32, 78, I, 10),
    d(68, 78, I, 10),
    d(32, 106, I, 10),
    d(68, 106, I, 10),
  ],
  9: [
    d(24, 28, I, 10.5),
    d(50, 28, I, 10.5),
    d(76, 28, I, 10.5),
    d(24, 64, R, 10.5),
    d(50, 64, R, 10.5),
    d(76, 64, R, 10.5),
    d(24, 100, G, 10.5),
    d(50, 100, G, 10.5),
    d(76, 100, G, 10.5),
  ],
};

const s = (x: number, y: number, c: string, h = 34): Stick => ({ x, y, h, c });
const STICKS: Record<number, Stick[]> = {
  2: [s(50, 38, G), s(50, 90, I)],
  3: [s(50, 36, G), s(32, 92, G), s(68, 92, G)],
  4: [s(32, 38, G), s(68, 38, I), s(32, 90, I), s(68, 90, G)],
  5: [s(26, 36, G), s(74, 36, I), s(50, 64, R), s(26, 92, I), s(74, 92, G)],
  6: [s(24, 38, G), s(50, 38, G), s(76, 38, G), s(24, 90, I), s(50, 90, I), s(76, 90, I)],
  7: [
    s(50, 24, R, 28),
    s(24, 64, G, 28),
    s(50, 64, G, 28),
    s(76, 64, G, 28),
    s(24, 102, G, 28),
    s(50, 102, G, 28),
    s(76, 102, G, 28),
  ],
  8: [
    s(22, 38, G),
    s(41, 38, I),
    s(59, 38, I),
    s(78, 38, G),
    s(22, 90, I),
    s(41, 90, G),
    s(59, 90, G),
    s(78, 90, I),
  ],
  9: [
    s(24, 24, G, 28),
    s(50, 24, R, 28),
    s(76, 24, I, 28),
    s(24, 64, G, 28),
    s(50, 64, R, 28),
    s(76, 64, I, 28),
    s(24, 104, G, 28),
    s(50, 104, R, 28),
    s(76, 104, I, 28),
  ],
};

const NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const WIND_CHARS = { E: '東', S: '南', W: '西', N: '北' } as const;
const FLOWER_CHARS = ['梅', '蘭', '菊', '竹'];
const SEASON_CHARS = ['春', '夏', '秋', '冬'];

export function artFor(kind: TileKind): Art {
  const suit = suitOf(kind);
  if (suit === 'dots') return { type: 'dots', dots: DOTS[rankOf(kind)] };
  if (suit === 'bamboo')
    return rankOf(kind) === 1
      ? { type: 'one-bamboo' }
      : { type: 'sticks', sticks: STICKS[rankOf(kind)] };
  if (suit === 'characters')
    return {
      type: 'glyphs',
      glyphs: [
        { ch: NUMERALS[rankOf(kind) - 1], x: 50, y: 58, size: 46, c: N },
        { ch: '萬', x: 50, y: 114, size: 50, c: R },
      ],
    };
  const wind = windOf(kind);
  if (wind)
    return { type: 'glyphs', glyphs: [{ ch: WIND_CHARS[wind], x: 50, y: 92, size: 74, c: N }] };
  const dragon = dragonOf(kind);
  if (dragon === 'red')
    return { type: 'glyphs', glyphs: [{ ch: '中', x: 50, y: 93, size: 78, c: R }] };
  if (dragon === 'green')
    return { type: 'glyphs', glyphs: [{ ch: '發', x: 50, y: 92, size: 74, c: G }] };
  if (dragon === 'white') return { type: 'white' };
  if (isFlower(kind))
    return {
      type: 'glyphs',
      glyphs: [{ ch: FLOWER_CHARS[rankOf(kind) - 1], x: 54, y: 96, size: 64, c: R }],
    };
  if (isSeason(kind))
    return {
      type: 'glyphs',
      glyphs: [{ ch: SEASON_CHARS[rankOf(kind) - 1], x: 54, y: 96, size: 64, c: G }],
    };
  return { type: 'white' };
}

/** Where the corner mark sits and how much the art shrinks to make room, per tile size. */
export interface MarkLayout {
  readonly size: number;
  readonly x: number;
  readonly y: number;
  readonly art: string;
}

export type TileSize = 'hand' | 'claim' | 'result' | 'meld' | 'pond' | 'mini';

export const MARK_LAYOUT: Record<TileSize, MarkLayout> = {
  hand: { size: 23, x: 9, y: 29, art: 'translate(9 10) scale(0.88)' },
  claim: { size: 23, x: 9, y: 29, art: 'translate(9 10) scale(0.88)' },
  result: { size: 26, x: 9, y: 31, art: 'translate(12 13) scale(0.86)' },
  meld: { size: 32, x: 8, y: 34, art: 'translate(21 24) scale(0.76)' },
  pond: { size: 32, x: 8, y: 34, art: 'translate(21 24) scale(0.76)' },
  mini: { size: 40, x: 7, y: 42, art: 'translate(31 36) scale(0.66)' },
};
