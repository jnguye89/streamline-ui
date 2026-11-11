/**
 * Tiles for skriin ai TV mahjong. Pure TypeScript (no Angular, React or DOM).
 *
 * Every physical tile has its own id (TileId), so the 4 copies of "5 Dots" are 4 different ids.
 * That keeps the 144-tile invariant checkable and leaves room for Riichi red fives (a flag on one id).
 *
 * Kinds (TileKind), in the order the hand is sorted:
 *   0–8   Dots 1–9
 *   9–17  Bamboo 1–9
 *   18–26 Characters 1–9
 *   27–30 Winds: East, South, West, North
 *   31–33 Dragons: Red, Green, White
 *   34–37 Flowers 1–4 (Plum, Orchid, Chrysanthemum, Bamboo) — bonus tiles, one of each
 *   38–41 Seasons 1–4 (Spring, Summer, Autumn, Winter) — bonus tiles, one of each
 *
 * Ids: kinds 0–33 have 4 copies each → ids 0–135 (id = kind × 4 + copy).
 * Bonus kinds 34–41 have 1 copy each → ids 136–143.
 */

export type TileId = number;
export type TileKind = number;
export type Suit = 'dots' | 'bamboo' | 'characters';
export type Wind = 'E' | 'S' | 'W' | 'N';
export type Dragon = 'red' | 'green' | 'white';

export const PLAYABLE_KINDS = 34;
export const KIND_COUNT = 42;
export const WIND_START = 27;
export const DRAGON_START = 31;
export const BONUS_START = 34;
export const FLOWER_START = 34;
export const SEASON_START = 38;
export const PLAYABLE_TILE_COUNT = 136;

export const WINDS: readonly Wind[] = ['E', 'S', 'W', 'N'];
export const WIND_NAME: Record<Wind, string> = { E: 'East', S: 'South', W: 'West', N: 'North' };
export const SUITS: readonly Suit[] = ['dots', 'bamboo', 'characters'];
export const SUIT_NAME: Record<Suit, string> = {
  dots: 'Dots',
  bamboo: 'Bamboo',
  characters: 'Characters',
};
export const DRAGONS: readonly Dragon[] = ['red', 'green', 'white'];
export const DRAGON_NAME: Record<Dragon, string> = {
  red: 'Red dragon',
  green: 'Green dragon',
  white: 'White dragon',
};
export const FLOWER_NAMES = ['Plum', 'Orchid', 'Chrysanthemum', 'Bamboo'] as const;
export const SEASON_NAMES = ['Spring', 'Summer', 'Autumn', 'Winter'] as const;

/** Which tiles a variant plays with. Hong Kong: 144 with bonus tiles. Riichi (v2): 136, optional red fives. */
export interface TileSetSpec {
  readonly bonusTiles: boolean;
  /** Red fives per suit (Riichi optional rule). 0 for Hong Kong. */
  readonly redFivesPerSuit: 0 | 1 | 2;
}

export const HONG_KONG_TILES: TileSetSpec = { bonusTiles: true, redFivesPerSuit: 0 };

export function kindOf(id: TileId): TileKind {
  if (!Number.isInteger(id) || id < 0 || id > 143) throw new RangeError(`Bad tile id ${id}`);
  return id < PLAYABLE_TILE_COUNT ? Math.floor(id / 4) : BONUS_START + (id - PLAYABLE_TILE_COUNT);
}

/** All physical ids of one kind (4 for playable kinds, 1 for bonus kinds). */
export function idsOfKind(kind: TileKind): TileId[] {
  if (kind < 0 || kind >= KIND_COUNT) throw new RangeError(`Bad tile kind ${kind}`);
  if (kind >= BONUS_START) return [PLAYABLE_TILE_COUNT + (kind - BONUS_START)];
  return [kind * 4, kind * 4 + 1, kind * 4 + 2, kind * 4 + 3];
}

/** Every tile id the variant plays with, in id order (shuffle separately with an injected RNG). */
export function buildTileSet(spec: TileSetSpec): TileId[] {
  const n = spec.bonusTiles ? 144 : PLAYABLE_TILE_COUNT;
  return Array.from({ length: n }, (_, i) => i);
}

export function isRedFive(id: TileId, spec: TileSetSpec): boolean {
  const kind = kindOf(id);
  if (!isSuited(kind) || rankOf(kind) !== 5) return false;
  return id % 4 < spec.redFivesPerSuit;
}

export const isSuited = (k: TileKind): boolean => k >= 0 && k < WIND_START;
export const isWind = (k: TileKind): boolean => k >= WIND_START && k < DRAGON_START;
export const isDragon = (k: TileKind): boolean => k >= DRAGON_START && k < BONUS_START;
export const isHonor = (k: TileKind): boolean => k >= WIND_START && k < BONUS_START;
export const isBonus = (k: TileKind): boolean => k >= BONUS_START && k < KIND_COUNT;
export const isFlower = (k: TileKind): boolean => k >= FLOWER_START && k < SEASON_START;
export const isSeason = (k: TileKind): boolean => k >= SEASON_START && k < KIND_COUNT;
export const isTerminal = (k: TileKind): boolean => isSuited(k) && (k % 9 === 0 || k % 9 === 8);

export function suitOf(k: TileKind): Suit | null {
  return isSuited(k) ? SUITS[Math.floor(k / 9)] : null;
}

/** 1–9 for suited tiles; 1–4 for winds (E S W N), dragons (R G Wh) and bonus tiles. */
export function rankOf(k: TileKind): number {
  if (isSuited(k)) return (k % 9) + 1;
  if (isWind(k)) return k - WIND_START + 1;
  if (isDragon(k)) return k - DRAGON_START + 1;
  if (isFlower(k)) return k - FLOWER_START + 1;
  if (isSeason(k)) return k - SEASON_START + 1;
  throw new RangeError(`Bad tile kind ${k}`);
}

export function windOf(k: TileKind): Wind | null {
  return isWind(k) ? WINDS[k - WIND_START] : null;
}

export function dragonOf(k: TileKind): Dragon | null {
  return isDragon(k) ? DRAGONS[k - DRAGON_START] : null;
}

export const windKind = (w: Wind): TileKind => WIND_START + WINDS.indexOf(w);
export const suitKind = (s: Suit, rank: number): TileKind => SUITS.indexOf(s) * 9 + (rank - 1);
export const dragonKind = (d: Dragon): TileKind => DRAGON_START + DRAGONS.indexOf(d);

/** Flowers and seasons belong to a seat: 1 = East, 2 = South, 3 = West, 4 = North. */
export function bonusWind(k: TileKind): Wind | null {
  return isBonus(k) ? WINDS[rankOf(k) - 1] : null;
}

/** Plain-English name used in UI text, e.g. "5 Dots", "East wind", "Red dragon", "Flower 1". */
export function tileName(k: TileKind): string {
  const suit = suitOf(k);
  if (suit) return `${rankOf(k)} ${SUIT_NAME[suit]}`;
  const wind = windOf(k);
  if (wind) return `${WIND_NAME[wind]} wind`;
  const dragon = dragonOf(k);
  if (dragon) return DRAGON_NAME[dragon];
  if (isFlower(k)) return `Flower ${rankOf(k)}`;
  return `Season ${rankOf(k)}`;
}

/** Long name for bonus tiles, e.g. "Flower 1 · Plum". */
export function tileLongName(k: TileKind): string {
  if (isFlower(k)) return `Flower ${rankOf(k)} · ${FLOWER_NAMES[rankOf(k) - 1]}`;
  if (isSeason(k)) return `Season ${rankOf(k)} · ${SEASON_NAMES[rankOf(k) - 1]}`;
  return tileName(k);
}

/** Western corner mark: "5" (suits), "E/S/W/N" (winds), "R/G/Wh" (dragons), "1–4" (bonus tiles). */
export function tileMark(k: TileKind): string {
  if (isSuited(k) || isBonus(k)) return String(rankOf(k));
  const wind = windOf(k);
  if (wind) return wind;
  return ['R', 'G', 'Wh'][k - DRAGON_START];
}

/** Sort order for the hand: Dots, Bamboo, Characters, Winds, Dragons (then bonus tiles). */
export function compareTiles(a: TileId, b: TileId): number {
  return kindOf(a) - kindOf(b) || a - b;
}

export function sortTiles(ids: readonly TileId[]): TileId[] {
  return [...ids].sort(compareTiles);
}

/** Count of each playable kind (length 34). Bonus tiles are ignored. */
export function kindCounts(ids: readonly TileId[]): number[] {
  const counts = new Array<number>(PLAYABLE_KINDS).fill(0);
  for (const id of ids) {
    const k = kindOf(id);
    if (k < PLAYABLE_KINDS) counts[k]++;
  }
  return counts;
}
