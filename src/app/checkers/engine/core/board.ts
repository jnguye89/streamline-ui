/**
 * American checkers (English draughts) board, pure TypeScript, no Angular.
 *
 * Squares 0–31 = standard checkers numbers 1–32 (number = index + 1), in the standard
 * diagram orientation: row 0 at the top, row 7 at the bottom, playable squares have (row + col) odd.
 * Dark (called Black in the rules) moves first, starts on squares 1–12 and moves toward row 7.
 * Light (White) starts on 21–32 and moves toward row 0.
 *
 * A board is an Int8Array(32): 0 empty, 1 dark man, 2 dark king, −1 light man, −2 light king.
 */

export type Side = 1 | -1;
export const DARK: Side = 1;
export const LIGHT: Side = -1;

export const EMPTY = 0;
export const DARK_MAN = 1;
export const DARK_KING = 2;
export const LIGHT_MAN = -1;
export const LIGHT_KING = -2;

export type Board = Int8Array;

export function rowOf(sq: number): number {
  return sq >> 2;
}

export function colOf(sq: number): number {
  const r = sq >> 2;
  return ((sq & 3) << 1) + ((r & 1) === 0 ? 1 : 0);
}

/** −1 when off the board or a light (unplayable) square. */
export function squareAt(r: number, c: number): number {
  if (r < 0 || r > 7 || c < 0 || c > 7 || ((r + c) & 1) === 0) return -1;
  return (r << 2) + (c >> 1);
}

/** Direction d: 0 = down-left, 1 = down-right, 2 = up-left, 3 = up-right (screen of the standard diagram). */
const DR = [1, 1, -1, -1];
const DC = [-1, 1, -1, 1];

/** STEP[sq * 4 + d] = neighbouring square, JUMP[sq * 4 + d] = square two steps away; −1 if off board. */
export const STEP = new Int8Array(128);
export const JUMP = new Int8Array(128);
for (let sq = 0; sq < 32; sq++) {
  const r = rowOf(sq);
  const c = colOf(sq);
  for (let d = 0; d < 4; d++) {
    STEP[sq * 4 + d] = squareAt(r + DR[d], c + DC[d]);
    JUMP[sq * 4 + d] = squareAt(r + 2 * DR[d], c + 2 * DC[d]);
  }
}

export const DIRS_DARK_MAN: readonly number[] = [0, 1];
export const DIRS_LIGHT_MAN: readonly number[] = [2, 3];
export const DIRS_KING: readonly number[] = [0, 1, 2, 3];

export function isKing(piece: number): boolean {
  return piece === DARK_KING || piece === LIGHT_KING;
}

/** Directions a piece may move and capture in (men: forward only). */
export function dirsFor(piece: number): readonly number[] {
  if (isKing(piece)) return DIRS_KING;
  return piece > 0 ? DIRS_DARK_MAN : DIRS_LIGHT_MAN;
}

/** The far row where a man of `side` is crowned. */
export function isCrowningSquare(sq: number, side: Side): boolean {
  return side === DARK ? sq >= 28 : sq <= 3;
}

export function initialBoard(): Board {
  const b = new Int8Array(32);
  for (let s = 0; s < 12; s++) b[s] = DARK_MAN;
  for (let s = 20; s < 32; s++) b[s] = LIGHT_MAN;
  return b;
}

export function countPieces(b: Board, side: Side): number {
  let n = 0;
  for (let s = 0; s < 32; s++) if (b[s] * side > 0) n++;
  return n;
}

/** Board + side to move as a compact string (game-level repetition checks, tests). */
export function positionKey(b: Board, side: Side): string {
  let k = side === DARK ? 'D' : 'L';
  // −2 light king W, −1 light man w, 0 empty ., 1 dark man b, 2 dark king B
  for (let s = 0; s < 32; s++) k += 'Ww.bB'.charAt(b[s] + 2);
  return k;
}

/** Standard 180° rotation with colors swapped (used to test symmetry). */
export function flipBoard(b: Board): Board {
  const out = new Int8Array(32);
  for (let s = 0; s < 32; s++) out[31 - s] = -b[s];
  return out;
}
