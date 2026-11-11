import { Board, Side, countPieces, isKing, positionKey } from './board';
import { generateMoves } from './movegen';

export interface GameState {
  readonly board: Board;
  /** Side to move. */
  readonly side: Side;
}

export type EndReason = 'no-pieces' | 'no-moves' | 'repetition' | 'no-progress';

export interface GameEnd {
  /** Winning side, or 0 for a draw. */
  readonly winner: Side | 0;
  readonly reason: EndReason;
}

/** 40 moves by each player = 80 plies with no capture and no man move (ACF 40-move rule). */
export const NO_PROGRESS_PLIES = 80;
/** Same position with the same side to move for the third time. */
export const REPETITION_COUNT = 3;

/**
 * Was the step from `a` to `b` reversible? Only a king move without a capture is:
 * any capture changes the piece count, any man move (incl. crowning) changes the men.
 */
export function isReversibleStep(a: Board, b: Board): boolean {
  for (let s = 0; s < 32; s++) {
    const x = a[s];
    const y = b[s];
    if (x === y) continue;
    // A difference is only allowed when both sides of it are kings or empty.
    if ((x !== 0 && !isKing(x)) || (y !== 0 && !isKing(y))) return false;
  }
  let na = 0;
  let nb = 0;
  for (let s = 0; s < 32; s++) {
    if (a[s] !== 0) na++;
    if (b[s] !== 0) nb++;
  }
  return na === nb;
}

/** Plies since the last capture or man move, counted at the end of the history. */
export function pliesWithoutProgress(history: readonly GameState[]): number {
  let n = 0;
  for (let i = history.length - 1; i > 0; i--) {
    if (!isReversibleStep(history[i - 1].board, history[i].board)) break;
    n++;
  }
  return n;
}

/**
 * Game result for a history of positions (history[0] = start, last = current), or null.
 * A side that cannot move loses (that includes having no pieces). Draws: threefold repetition
 * of the same position with the same side to move, and the 40-move rule.
 */
export function gameEnd(history: readonly GameState[]): GameEnd | null {
  const cur = history[history.length - 1];
  if (generateMoves(cur.board, cur.side).length === 0) {
    return {
      winner: -cur.side as Side,
      reason: countPieces(cur.board, cur.side) === 0 ? 'no-pieces' : 'no-moves',
    };
  }
  const quiet = pliesWithoutProgress(history);
  // Repeats can only happen inside the reversible tail.
  const key = positionKey(cur.board, cur.side);
  let seen = 0;
  for (let i = history.length - 1; i >= history.length - 1 - quiet; i--) {
    if (positionKey(history[i].board, history[i].side) === key) seen++;
  }
  if (seen >= REPETITION_COUNT) return { winner: 0, reason: 'repetition' };
  if (quiet >= NO_PROGRESS_PLIES) return { winner: 0, reason: 'no-progress' };
  return null;
}
