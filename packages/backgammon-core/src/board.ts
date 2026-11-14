import { Board, Side } from './types';

/** Checkers per side. */
export const CHECKERS = 15;

export const opponent = (s: Side): Side => (s === 0 ? 1 : 0);

/**
 * Converts between absolute points and a side's own numbering (1–24, home = 1–6).
 * The formula is its own inverse: own(side, own(side, a)) === a.
 */
export function own(side: Side, a: number): number {
  return side === 0 ? a : 25 - a;
}

/** Checkers of `side` on absolute point a. */
export function countAt(board: Board, side: Side, a: number): number {
  const v = board.pts[a] ?? 0;
  return side === 0 ? Math.max(v, 0) : Math.max(-v, 0);
}

/** Side owning absolute point a, or null when empty. */
export function sideAt(board: Board, a: number): Side | null {
  const v = board.pts[a] ?? 0;
  return v > 0 ? 0 : v < 0 ? 1 : null;
}

/** Checkers of one side, written in that side's own numbering. */
export interface OwnLayout {
  /** own point (1–24) → number of checkers */
  readonly points: Readonly<Record<number, number>>;
  readonly bar?: number;
  readonly off?: number;
}

/** Builds a board from each side's own numbering. Throws when the layout is impossible. */
export function boardFromOwn(side0: OwnLayout, side1: OwnLayout): Board {
  const pts = new Array<number>(25).fill(0);
  const layouts: readonly [OwnLayout, OwnLayout] = [side0, side1];
  layouts.forEach((layout, s) => {
    const side = s as Side;
    let total = (layout.bar ?? 0) + (layout.off ?? 0);
    for (const [key, n] of Object.entries(layout.points)) {
      const p = Number(key);
      if (!Number.isInteger(p) || p < 1 || p > 24) throw new Error(`Point ${key} is not 1–24`);
      if (!Number.isInteger(n) || n < 0) throw new Error(`Bad count ${n} on point ${p}`);
      if (n === 0) continue;
      const a = own(side, p);
      if (pts[a] !== 0) throw new Error(`Point ${a} is used by both sides`);
      pts[a] = side === 0 ? n : -n;
      total += n;
    }
    if (total !== CHECKERS) throw new Error(`Side ${side} has ${total} checkers, not ${CHECKERS}`);
  });
  return {
    pts,
    bar: [side0.bar ?? 0, side1.bar ?? 0],
    off: [side0.off ?? 0, side1.off ?? 0],
  };
}

const START: OwnLayout = { points: { 24: 2, 13: 5, 8: 3, 6: 5 } };

/** Standard start: each side has 2 on its 24, 5 on 13, 3 on 8, 5 on 6. */
export function startBoard(): Board {
  return boardFromOwn(START, START);
}

/** Pips `side` still has to travel (bar = 25 each). */
export function pipCount(board: Board, side: Side): number {
  let total = board.bar[side] * 25;
  for (let a = 1; a <= 24; a++) total += countAt(board, side, a) * own(side, a);
  return total;
}

export function pipCounts(board: Board): readonly [number, number] {
  return [pipCount(board, 0), pipCount(board, 1)];
}

/** True when every checker of `side` is in its home board or borne off (bearing off allowed). */
export function allHome(board: Board, side: Side): boolean {
  if (board.bar[side] > 0) return false;
  for (let a = 1; a <= 24; a++) {
    if (countAt(board, side, a) > 0 && own(side, a) > 6) return false;
  }
  return true;
}

/** True when `loser` has a checker on the bar or inside `winner`'s home board (backgammon test). */
export function inWinnersHome(board: Board, loser: Side, winner: Side): boolean {
  if (board.bar[loser] > 0) return true;
  for (let a = 1; a <= 24; a++) {
    if (countAt(board, loser, a) > 0 && own(winner, a) <= 6) return true;
  }
  return false;
}

/** Identifies a position (used to merge plays that end the same way). */
export function boardKey(board: Board): string {
  return `${board.pts.slice(1).join(',')}|${board.bar[0]},${board.bar[1]}|${board.off[0]},${board.off[1]}`;
}

/** null when the board is valid, otherwise what is wrong. */
export function validateBoard(board: Board): string | null {
  if (board.pts.length !== 25) return 'pts must have 25 entries';
  for (const side of [0, 1] as const) {
    let total = board.bar[side] + board.off[side];
    for (let a = 1; a <= 24; a++) total += countAt(board, side, a);
    if (total !== CHECKERS) return `side ${side} has ${total} checkers`;
  }
  return null;
}
