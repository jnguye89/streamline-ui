import {
  Rng,
  TileId,
  TileKind,
  isDragon,
  isHonor,
  isSuited,
  kindCounts,
  kindOf,
} from '@skriin/mahjong-core';

/**
 * PHASE 1 PLACEHOLDER bot: keeps pairs and neighbours, throws lone honors and isolated tiles.
 * Phase 2 replaces it with the shanten-based Easy / Medium / Hard bots running in a Web Worker.
 */

export function usefulness(
  kind: TileKind,
  counts: readonly number[],
  valuable: ReadonlySet<TileKind>,
): number {
  const n = counts[kind];
  if (isHonor(kind)) return n >= 2 ? 6 + n : valuable.has(kind) ? 1.2 : 0;
  let v = n * 3;
  const r = kind % 9;
  if (r > 0) v += counts[kind - 1] * 2;
  if (r < 8) v += counts[kind + 1] * 2;
  if (r > 1) v += counts[kind - 2];
  if (r < 7) v += counts[kind + 2];
  if (r === 0 || r === 8) v -= 0.5;
  return v;
}

/** Least useful tile in the hand (random tie-break). */
export function chooseDiscard(
  hand: readonly TileId[],
  valuable: ReadonlySet<TileKind>,
  rng: Rng,
): TileId {
  const counts = kindCounts(hand);
  let best: TileId[] = [];
  let bestV = Infinity;
  for (const id of hand) {
    const v = usefulness(kindOf(id), counts, valuable) + rng() * 0.3;
    if (v < bestV - 1e-9) {
      bestV = v;
      best = [id];
    } else if (Math.abs(v - bestV) < 1e-9) best.push(id);
  }
  return best[Math.floor(rng() * best.length)] ?? hand[hand.length - 1];
}

export function wantsPung(kind: TileKind, valuable: ReadonlySet<TileKind>, rng: Rng): boolean {
  if (isDragon(kind) || valuable.has(kind)) return true;
  return isSuited(kind) ? rng() < 0.35 : rng() < 0.15;
}
