import { Cell, Move, Piece, PieceColor, Position } from './checkers.types';

/**
 * Board geometry. "Standard" orientation = the printed checkers diagram:
 * dark (moves first) at the top on squares 1–12, light at the bottom on 21–32,
 * square 1 top-left area, square 32 bottom-right area.
 * Row r = 0..7 from the top, column c = 0..7 from the left. Playable squares have (r + c) odd.
 */

export interface RC {
  readonly r: number;
  readonly c: number;
}

export const SQUARE_PX = 108;
export const BOARD_PX = SQUARE_PX * 8;

export function toRC(sq: number): RC {
  const r = sq >> 2;
  const c = (sq & 3) * 2 + (r % 2 === 0 ? 1 : 0);
  return { r, c };
}

/** Returns −1 when (r, c) is off the board or not a playable square. */
export function fromRC(r: number, c: number): number {
  if (r < 0 || r > 7 || c < 0 || c > 7 || (r + c) % 2 === 0) return -1;
  return r * 4 + (c >> 1);
}

/** The player always sits at the bottom of the screen. */
export function screenRC(sq: number, player: PieceColor): RC {
  const p = toRC(sq);
  return player === 'light' ? p : { r: 7 - p.r, c: 7 - p.c };
}

export function screenToSq(r: number, c: number, player: PieceColor): number {
  return player === 'light' ? fromRC(r, c) : fromRC(7 - r, 7 - c);
}

/** Square jumped over between two landing squares, or −1 for a simple step. */
export function jumpedSquare(a: number, b: number): number {
  const A = toRC(a);
  const B = toRC(b);
  if (Math.abs(A.r - B.r) !== 2) return -1;
  return fromRC((A.r + B.r) / 2, (A.c + B.c) / 2);
}

/** Standard notation: 11-15 for a move, 22x15 / 22x15x8 for jumps. */
export function notation(m: Move): string {
  return [m.from, ...m.path].map((s) => s + 1).join(m.captures.length ? 'x' : '-');
}

export function startsWith(path: readonly number[], prefix: readonly number[]): boolean {
  if (prefix.length > path.length) return false;
  for (let i = 0; i < prefix.length; i++) if (path[i] !== prefix[i]) return false;
  return true;
}

export function unique<T>(xs: readonly T[]): T[] {
  return [...new Set(xs)];
}

export function piecesFromPosition(pos: Position, firstId = 1): Piece[] {
  const out: Piece[] = [];
  let id = firstId;
  pos.cells.forEach((cell, sq) => {
    if (cell) out.push({ id: id++, color: cell.color, king: cell.king, sq });
  });
  return out;
}

export function positionFromPieces(pieces: readonly Piece[], turn: PieceColor): Position {
  const cells: (Cell | null)[] = new Array(32).fill(null);
  for (const p of pieces) cells[p.sq] = { color: p.color, king: p.king };
  return { cells, turn };
}

/** Applies a completed move to the UI piece list (ids are kept). */
export function applyToPieces(pieces: readonly Piece[], move: Move): Piece[] {
  const to = move.path[move.path.length - 1];
  return pieces
    .filter((p) => !move.captures.includes(p.sq))
    .map((p) => (p.sq === move.from ? { ...p, sq: to, king: p.king || move.promotes } : p));
}
