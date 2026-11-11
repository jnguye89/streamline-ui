import { Seat } from './types';

/**
 * Hong Kong "half spicy" faan → points table (approved rule sheet, section Points).
 * Source: Wikipedia "Hong Kong mahjong scoring rules"; Mahjong Wiki HKOS gives the same rows 0–10.
 */
export const HALF_SPICY: readonly number[] = [1, 2, 4, 8, 16, 24, 32, 48, 64, 96, 128];

/** Base points (P) for a faan total, after the cap (default 10 = "Limit"). */
export function faanToPoints(faan: number, cap = 10): number {
  const f = Math.max(0, Math.min(Math.floor(faan), cap, HALF_SPICY.length - 1));
  return HALF_SPICY[f];
}

/**
 * Clear Chapter payments (approved rule sheet, section Payments; Mahjong Wiki HKOS):
 *  - win on a discard: discarder 2P, each other player 1P → winner +4P
 *  - self-drawn: each of the 3 others 2P → winner +6P
 *  - robbing the kong: same as a discard win, the kong player counts as the discarder
 * Returns the change for each seat (sums to zero).
 */
export function settleWin(
  points: number,
  winner: Seat,
  from: Seat | null,
): [number, number, number, number] {
  const d: [number, number, number, number] = [0, 0, 0, 0];
  for (let s = 0; s < 4; s++) {
    if (s === winner) continue;
    const owe = from === null ? 2 * points : s === from ? 2 * points : points;
    d[s] -= owe;
    d[winner] += owe;
  }
  return d;
}
