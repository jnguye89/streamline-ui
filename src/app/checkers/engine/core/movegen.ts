import { Board, DARK_KING, JUMP, LIGHT_KING, STEP, Side, dirsFor, isCrowningSquare, isKing } from './board';

/**
 * One complete legal move.
 * A simple move has path = [to] and no captures. A jump lists every landing square in `path`
 * and every jumped square, in order, in `caps`.
 */
export interface CMove {
  readonly from: number;
  readonly to: number;
  readonly path: readonly number[];
  readonly caps: readonly number[];
  /** Values of the jumped pieces (to undo the move). */
  readonly capVals: readonly number[];
  /** Bit mask of jumped squares. */
  readonly capMask: number;
  /** Moving piece before the move. */
  readonly piece: number;
  /** A man reaches the far row and is crowned (the move ends there). */
  readonly promote: boolean;
}

/**
 * All legal moves for `side` (American checkers):
 *  - If any jump exists, only jumps are legal (captures are mandatory).
 *  - A jump must continue while the same piece can jump again; the player may choose
 *    any branch (no "take the most" rule), so every maximal path is listed.
 *  - Men move and jump forward only; kings one square in any diagonal direction.
 *  - A piece can't be jumped twice; jumped pieces stay on the board until the move ends
 *    (they block landing), and the moving piece's start square counts as empty.
 *  - A man that reaches the far row is crowned and the move ends, even mid-jump.
 *
 * `distinct = true` drops jump paths that have the same start, end and captured set as an
 * earlier one (identical result, e.g. a king going round a ring both ways). The search uses
 * that; the UI keeps every path so the player can pick hop by hop.
 */
export function generateMoves(b: Board, side: Side, distinct = false): CMove[] {
  const jumps = generateJumps(b, side, distinct);
  return jumps.length ? jumps : generateSteps(b, side);
}

export function generateJumps(b: Board, side: Side, distinct = false): CMove[] {
  const out: CMove[] = [];
  for (let sq = 0; sq < 32; sq++) {
    const piece = b[sq];
    if (piece * side <= 0) continue;
    b[sq] = 0; // the start square is free while the piece travels
    jumpFrom(b, side, sq, sq, piece, [], [], [], 0, out);
    b[sq] = piece;
  }
  return distinct ? dedupe(out) : out;
}

const NONE: readonly number[] = Object.freeze([]);
/** Shared one-square paths so quiet moves allocate nothing but the move object. */
const PATH1: ReadonlyArray<readonly number[]> = Array.from({ length: 32 }, (_, s) => Object.freeze([s]));

export function generateSteps(b: Board, side: Side): CMove[] {
  const out: CMove[] = [];
  for (let sq = 0; sq < 32; sq++) {
    const piece = b[sq];
    if (piece * side <= 0) continue;
    const king = isKing(piece);
    for (const d of dirsFor(piece)) {
      const to = STEP[sq * 4 + d];
      if (to < 0 || b[to] !== 0) continue;
      out.push({
        from: sq,
        to,
        path: PATH1[to],
        caps: NONE,
        capVals: NONE,
        capMask: 0,
        piece,
        promote: !king && isCrowningSquare(to, side),
      });
    }
  }
  return out;
}

/** True if `side` has at least one jump (cheap check, no allocation). */
export function hasJump(b: Board, side: Side): boolean {
  for (let sq = 0; sq < 32; sq++) {
    const piece = b[sq];
    if (piece * side <= 0) continue;
    for (const d of dirsFor(piece)) {
      const land = JUMP[sq * 4 + d];
      if (land < 0 || b[land] !== 0) continue;
      if (b[STEP[sq * 4 + d]] * side < 0) return true;
    }
  }
  return false;
}

function jumpFrom(
  b: Board,
  side: Side,
  start: number,
  at: number,
  piece: number,
  path: number[],
  caps: number[],
  capVals: number[],
  mask: number,
  out: CMove[],
): void {
  const king = isKing(piece);
  let extended = false;
  for (const d of dirsFor(piece)) {
    const land = JUMP[at * 4 + d];
    if (land < 0) continue;
    const mid = STEP[at * 4 + d];
    const victim = b[mid];
    if (victim * side >= 0) continue; // must jump an opponent piece
    if (mask & (1 << mid)) continue; // never the same piece twice
    if (b[land] !== 0) continue; // landing square must be empty (jumped pieces still block)
    extended = true;
    path.push(land);
    caps.push(mid);
    capVals.push(victim);
    const nextMask = mask | (1 << mid);
    if (!king && isCrowningSquare(land, side)) {
      // Crowned: the move ends here.
      out.push(freeze(start, land, path, caps, capVals, nextMask, piece, true));
    } else {
      jumpFrom(b, side, start, land, piece, path, caps, capVals, nextMask, out);
    }
    path.pop();
    caps.pop();
    capVals.pop();
  }
  if (!extended && path.length) out.push(freeze(start, at, path, caps, capVals, mask, piece, false));
}

function freeze(
  from: number,
  to: number,
  path: number[],
  caps: number[],
  capVals: number[],
  capMask: number,
  piece: number,
  promote: boolean,
): CMove {
  return { from, to, path: [...path], caps: [...caps], capVals: [...capVals], capMask, piece, promote };
}

function dedupe(moves: CMove[]): CMove[] {
  if (moves.length < 2) return moves;
  const seen = new Set<string>();
  const out: CMove[] = [];
  for (const m of moves) {
    const k = `${m.from}:${m.to}:${m.capMask}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(m);
  }
  return out;
}

export function makeMove(b: Board, m: CMove): void {
  b[m.from] = 0;
  for (let i = 0; i < m.caps.length; i++) b[m.caps[i]] = 0;
  b[m.to] = m.promote ? (m.piece > 0 ? DARK_KING : LIGHT_KING) : m.piece;
}

export function unmakeMove(b: Board, m: CMove): void {
  b[m.to] = 0; // first: `to` may equal `from` after a king's round trip
  for (let i = 0; i < m.caps.length; i++) b[m.caps[i]] = m.capVals[i];
  b[m.from] = m.piece;
}

/** No progress for the 40-move rule = a king moved without capturing. */
export function isReversibleMove(m: CMove): boolean {
  return m.caps.length === 0 && isKing(m.piece);
}
