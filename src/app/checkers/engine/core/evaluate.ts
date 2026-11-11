import { Board, colOf, rowOf } from './board';

/**
 * Static evaluation in centi-men from dark's point of view (+ = dark better).
 * Built to be colour-symmetric: evaluate(flip(b)) === −evaluate(b) (tested).
 */

export const MAN_VALUE = 100;
export const KING_VALUE = 135;

/** Bonus for a man by rows advanced from its own back row (0–6). */
const ADVANCE = [0, 0, 1, 3, 6, 9, 13, 0];
/** Squares 14, 15, 18, 19 (0-based 13, 14, 17, 18). */
const CENTER = new Set([13, 14, 17, 18]);
const NEAR_CENTER = new Set([9, 10, 21, 22]);

/** Kings: prefer the middle, avoid edges. */
const KING_SQ = new Int8Array(32);
for (let s = 0; s < 32; s++) {
  const dr = Math.abs(rowOf(s) - 3.5);
  const dc = Math.abs(colOf(s) - 3.5);
  KING_SQ[s] = Math.round(10 - 2.2 * Math.max(dr, dc) - 0.8 * Math.min(dr, dc));
}

function dist(a: number, b: number): number {
  return Math.max(Math.abs(rowOf(a) - rowOf(b)), Math.abs(colOf(a) - colOf(b)));
}

export function evaluate(b: Board): number {
  let dm = 0;
  let dk = 0;
  let lm = 0;
  let lk = 0;
  let pos = 0;
  for (let s = 0; s < 32; s++) {
    const v = b[s];
    if (v === 0) continue;
    if (v === 1) {
      dm++;
      pos += ADVANCE[rowOf(s)];
      if (CENTER.has(s)) pos += 5;
      else if (NEAR_CENTER.has(s)) pos += 2;
    } else if (v === -1) {
      lm++;
      pos -= ADVANCE[7 - rowOf(s)];
      if (CENTER.has(s)) pos -= 5;
      else if (NEAR_CENTER.has(s)) pos -= 2;
    } else if (v === 2) {
      dk++;
      pos += KING_SQ[s];
    } else {
      lk++;
      pos -= KING_SQ[s];
    }
  }

  const total = dm + dk + lm + lk;
  const material = (dm - lm) * MAN_VALUE + (dk - lk) * KING_VALUE;

  // Positional terms matter more as the board empties.
  let score = material + Math.trunc((pos * (32 + (24 - total))) / 32);

  // Back-rank guard: men on squares 1 & 3 (dark) / 30 & 32 (light) stop enemy men from crowning.
  if (lm > 0) {
    if (b[0] === 1) score += 7;
    if (b[2] === 1) score += 7;
  }
  if (dm > 0) {
    if (b[31] === -1) score -= 7;
    if (b[29] === -1) score -= 7;
  }

  // When ahead, trading pieces helps; the fewer pieces left, the more it is worth.
  if (material !== 0) score += Math.trunc((material * (24 - total)) / 40);

  // Winning side's kings close in on the enemy (helps finish king endgames).
  if (material > 0 && dk > 0) score -= chase(b, 2, -1) * 3;
  else if (material < 0 && lk > 0) score += chase(b, -2, 1) * 3;

  return score;
}

/** Sum over the hunter's kings of the distance to the nearest enemy piece. */
function chase(b: Board, hunterKing: number, enemySign: number): number {
  let sum = 0;
  for (let s = 0; s < 32; s++) {
    if (b[s] !== hunterKing) continue;
    let best = 8;
    for (let t = 0; t < 32; t++) if (b[t] * enemySign > 0) best = Math.min(best, dist(s, t));
    sum += best;
  }
  return sum;
}
