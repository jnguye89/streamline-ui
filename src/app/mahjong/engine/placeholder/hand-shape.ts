import { PLAYABLE_KINDS, TileKind, isSuited } from '@skriin/mahjong-core';

/**
 * PHASE 1 PLACEHOLDER. Hand-shape helpers for the preview engine only.
 * Phase 2 replaces this with mahjong-core's tested splitter (every split, waits, shanten).
 */

export interface ShapeSet {
  readonly type: 'chow' | 'pung';
  /** For a chow: the lowest tile. */
  readonly kind: TileKind;
}

export type Shape =
  | { readonly special: null; readonly sets: readonly ShapeSet[]; readonly pair: TileKind }
  | { readonly special: 'thirteen-orphans' };

const ORPHANS: readonly TileKind[] = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];

/** Every way to split the counts into `setsNeeded` sets + 1 pair. */
export function decompose(counts: readonly number[], setsNeeded: number): Shape[] {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total !== setsNeeded * 3 + 2) return [];
  const out: Shape[] = [];
  const c = counts.slice();
  for (let p = 0; p < PLAYABLE_KINDS; p++) {
    if (c[p] < 2) continue;
    c[p] -= 2;
    walk(c, 0, setsNeeded, [], (sets) => out.push({ special: null, sets: [...sets], pair: p }));
    c[p] += 2;
  }
  return out;
}

function walk(
  c: number[],
  from: number,
  need: number,
  acc: ShapeSet[],
  emit: (s: ShapeSet[]) => void,
): void {
  let k = from;
  while (k < PLAYABLE_KINDS && c[k] === 0) k++;
  if (k === PLAYABLE_KINDS) {
    if (need === 0) emit(acc);
    return;
  }
  if (need === 0) return;
  if (c[k] >= 3) {
    c[k] -= 3;
    acc.push({ type: 'pung', kind: k });
    walk(c, k, need - 1, acc, emit);
    acc.pop();
    c[k] += 3;
  }
  if (isSuited(k) && k % 9 <= 6 && c[k + 1] > 0 && c[k + 2] > 0) {
    c[k]--;
    c[k + 1]--;
    c[k + 2]--;
    acc.push({ type: 'chow', kind: k });
    walk(c, k, need - 1, acc, emit);
    acc.pop();
    c[k]++;
    c[k + 1]++;
    c[k + 2]++;
  }
}

export function isThirteenOrphans(counts: readonly number[]): boolean {
  let pairs = 0;
  for (let k = 0; k < PLAYABLE_KINDS; k++) {
    const n = counts[k];
    if (ORPHANS.includes(k)) {
      if (n === 0 || n > 2) return false;
      if (n === 2) pairs++;
    } else if (n > 0) return false;
  }
  return pairs === 1;
}

/** All complete shapes for a 14-tile (minus melds) hand. */
export function shapes(counts: readonly number[], meldCount: number): Shape[] {
  const out = decompose(counts, 4 - meldCount);
  if (meldCount === 0 && isThirteenOrphans(counts)) out.push({ special: 'thirteen-orphans' });
  return out;
}

/** Kinds that would complete a 13-tile (minus melds) hand. */
export function waits(counts: readonly number[], meldCount: number): TileKind[] {
  const out: TileKind[] = [];
  const c = counts.slice();
  for (let k = 0; k < PLAYABLE_KINDS; k++) {
    if (c[k] >= 4) continue;
    c[k]++;
    if (shapes(c, meldCount).length) out.push(k);
    c[k]--;
  }
  return out;
}
