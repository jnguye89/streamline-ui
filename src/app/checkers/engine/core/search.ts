import { Board, Side } from './board';
import { evaluate } from './evaluate';
import { CMove, generateMoves, hasJump, isReversibleMove, makeMove, unmakeMove } from './movegen';
import { NO_PROGRESS_PLIES } from './rules';

/**
 * Computer player: negamax alpha-beta with principal-variation search, iterative deepening,
 * a transposition table, killer/history move ordering, forced-capture quiescence,
 * single-reply extensions, and repetition / 40-move awareness (so it avoids drawing a won game).
 */

export const MATE = 30000;
const MATE_BOUND = MATE - 1000;
const INF = 32000;
const MAX_PLY = 96;
const TT_BITS = 20;
const TT_SIZE = 1 << TT_BITS;
const TT_MASK = TT_SIZE - 1;
const EXACT = 1;
const LOWER = 2;
const UPPER = 3;

// Zobrist keys (two 32-bit halves), fixed seed so hashes are stable.
const Z_LO = new Int32Array(32 * 5);
const Z_HI = new Int32Array(32 * 5);
let Z_SIDE_LO = 0;
let Z_SIDE_HI = 0;
{
  const rnd = mulberry32(0x5c1d1e5);
  for (let i = 0; i < Z_LO.length; i++) {
    Z_LO[i] = (rnd() * 0x100000000) | 0;
    Z_HI[i] = (rnd() * 0x100000000) | 0;
  }
  Z_SIDE_LO = (rnd() * 0x100000000) | 0;
  Z_SIDE_HI = (rnd() * 0x100000000) | 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface HistoryEntry {
  readonly board: Board;
  readonly side: Side;
}

export interface ThinkRequest {
  /** Positions since the last capture or man move, oldest first; the last one is the position to search. */
  readonly history: readonly HistoryEntry[];
  /**
   * best  – strongest move within the time/depth limit
   * noisy – score every move at the depth limit, then add ±noise (weaker levels)
   */
  readonly mode: 'best' | 'noisy';
  readonly maxDepth: number;
  readonly timeMs: number;
  readonly noise?: number;
  /** Positive = dislike draws (the computer plays on when it's ahead). */
  readonly contempt?: number;
  readonly random?: () => number;
}

export interface ThinkResult {
  readonly move: CMove | null;
  /** Score for the side to move, in centi-men (±MATE range for forced wins/losses). */
  readonly score: number;
  readonly depth: number;
  readonly nodes: number;
  readonly ms: number;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class Searcher {
  private readonly ttLo = new Int32Array(TT_SIZE);
  private readonly ttHi = new Int32Array(TT_SIZE);
  private readonly ttScore = new Int16Array(TT_SIZE);
  private readonly ttDepth = new Int8Array(TT_SIZE);
  private readonly ttFlag = new Uint8Array(TT_SIZE);
  private readonly ttMove = new Int8Array(TT_SIZE);
  private readonly repLo = new Int32Array(NO_PROGRESS_PLIES + MAX_PLY + 8);
  private readonly repHi = new Int32Array(NO_PROGRESS_PLIES + MAX_PLY + 8);
  private readonly killer1 = new Int32Array(MAX_PLY + 2);
  private readonly killer2 = new Int32Array(MAX_PLY + 2);
  private readonly hist = new Int32Array(1024);
  /** Per-ply scratch for move ordering (no allocation in the search). */
  private readonly orderBuf = new Int32Array((MAX_PLY + 2) * 128);
  private readonly keyBuf = new Int32Array(128 * (MAX_PLY + 2));

  private b: Board = new Int8Array(32);
  private rootSide: Side = 1;
  private contempt = 0;
  private nodes = 0;
  private deadline = Infinity;
  private stopped = false;
  private hLo = 0;
  private hHi = 0;

  clear(): void {
    this.ttLo.fill(0);
    this.ttHi.fill(0);
    this.ttFlag.fill(0);
    this.hist.fill(0);
  }

  think(req: ThinkRequest): ThinkResult {
    const t0 = now();
    const cur = req.history[req.history.length - 1];
    const side = cur.side;
    const rnd = req.random ?? Math.random;
    this.b = Int8Array.from(cur.board);
    this.rootSide = side;
    this.contempt = req.contempt ?? 0;
    this.nodes = 0;
    this.stopped = false;
    this.deadline = t0 + req.timeMs;
    this.killer1.fill(0);
    this.killer2.fill(0);
    for (let i = 0; i < this.hist.length; i++) this.hist[i] >>= 2;

    // Seed the repetition stack with the game's reversible tail.
    const tail = req.history.slice(-NO_PROGRESS_PLIES - 1);
    for (let i = 0; i < tail.length; i++) {
      this.hashInto(tail[i].board, tail[i].side);
      this.repLo[i] = this.hLo;
      this.repHi[i] = this.hHi;
    }
    const rootSp = tail.length - 1;
    const done = (move: CMove | null, score: number, depth: number): ThinkResult => ({
      move,
      score,
      depth,
      nodes: this.nodes,
      ms: Math.round(now() - t0),
    });

    const moves = generateMoves(this.b, side, true);
    if (!moves.length) return done(null, -MATE, 0);

    // Random order first: equal moves get picked at random (variety, never weaker).
    for (let i = moves.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [moves[i], moves[j]] = [moves[j], moves[i]];
    }

    const childWin = (m: CMove) => (isReversibleMove(m) ? 0 : rootSp + 1);

    if (req.mode === 'noisy') {
      // Every move gets an exact score at each depth; keep the deepest completed set.
      let scores: number[] | null = null;
      let depthDone = 0;
      for (let d = 1; d <= req.maxDepth; d++) {
        const cur: number[] = [];
        for (const m of moves) {
          makeMove(this.b, m);
          const s = -this.negamax(d - 1, -INF, INF, 1, -side as Side, rootSp + 1, childWin(m), 0);
          unmakeMove(this.b, m);
          if (this.stopped) break;
          cur.push(s);
        }
        if (this.stopped) break;
        scores = cur;
        depthDone = d;
      }
      if (!scores) scores = moves.map(() => 0);
      const noise = req.noise ?? 0;
      // Never trade a non-losing move for a forced loss, whatever the noise.
      const hasSafe = scores.some((s) => s >= -MATE_BOUND);
      let best = -1;
      let bestNoisy = -Infinity;
      for (let i = 0; i < moves.length; i++) {
        const s = scores[i];
        if (hasSafe && s < -MATE_BOUND) continue;
        const noisy = s + (rnd() * 2 - 1) * noise;
        if (noisy > bestNoisy) {
          bestNoisy = noisy;
          best = i;
        }
      }
      if (best < 0) best = 0;
      return done(moves[best], scores[best], depthDone);
    }

    // mode 'best': iterative deepening.
    let bestMove = moves[0];
    let bestScore = 0;
    let depthDone = 0;
    if (moves.length === 1) return done(bestMove, 0, 0);
    for (let d = 1; d <= req.maxDepth; d++) {
      let alpha = -INF;
      let iterBest = -1;
      let iterScore = -INF;
      for (let i = 0; i < moves.length; i++) {
        const m = moves[i];
        makeMove(this.b, m);
        let s: number;
        if (i === 0) {
          s = -this.negamax(d - 1, -INF, -alpha, 1, -side as Side, rootSp + 1, childWin(m), 0);
        } else {
          s = -this.negamax(d - 1, -alpha - 1, -alpha, 1, -side as Side, rootSp + 1, childWin(m), 0);
          if (s > alpha && !this.stopped) {
            s = -this.negamax(d - 1, -INF, -alpha, 1, -side as Side, rootSp + 1, childWin(m), 0);
          }
        }
        unmakeMove(this.b, m);
        if (this.stopped) break;
        if (s > iterScore) {
          iterScore = s;
          iterBest = i;
        }
        if (s > alpha) alpha = s;
      }
      if (this.stopped || iterBest < 0) break;
      bestMove = moves[iterBest];
      bestScore = iterScore;
      depthDone = d;
      moves.splice(iterBest, 1);
      moves.unshift(bestMove);
      if (Math.abs(bestScore) > MATE_BOUND) break; // result is forced
      if (now() - t0 > req.timeMs * 0.45) break; // next depth would not finish in time
    }
    return done(bestMove, bestScore, depthDone);
  }

  private negamax(
    depth: number,
    alpha: number,
    beta: number,
    ply: number,
    side: Side,
    sp: number,
    win: number,
    qext: number,
  ): number {
    if ((++this.nodes & 1023) === 0 && now() > this.deadline) this.stopped = true;
    if (this.stopped) return 0;

    const b = this.b;
    this.hashInto(b, side);
    const lo = this.hLo;
    const hi = this.hHi;
    this.repLo[sp] = lo;
    this.repHi[sp] = hi;

    // Repeating a position (or 40 quiet moves each) is a draw.
    for (let i = sp - 2; i >= win; i -= 2) {
      if (this.repLo[i] === lo && this.repHi[i] === hi) return this.drawScore(side);
    }
    if (sp - win >= NO_PROGRESS_PLIES) return this.drawScore(side);

    const moves = generateMoves(b, side, true);
    const n = moves.length;
    if (n === 0) return -MATE + ply; // no move = loss
    if (ply >= MAX_PLY) return evaluate(b) * side;

    const capture = moves[0].caps.length > 0;
    if (depth <= 0 && !capture) {
      // Quiet leaf. If the opponent threatens a jump, look one move further (limited).
      if (qext < 2 && hasJump(b, -side as Side)) {
        depth = 1;
        qext++;
      } else {
        return evaluate(b) * side;
      }
    }

    const idx = lo & TT_MASK;
    let ttMove = -1;
    if (this.ttLo[idx] === lo && this.ttHi[idx] === hi && this.ttFlag[idx] !== 0) {
      ttMove = this.ttMove[idx];
      if (this.ttDepth[idx] >= depth) {
        let s = this.ttScore[idx];
        if (s > MATE_BOUND) s -= ply;
        else if (s < -MATE_BOUND) s += ply;
        const f = this.ttFlag[idx];
        if (f === EXACT) return s;
        if (f === LOWER && s >= beta) return s;
        if (f === UPPER && s <= alpha) return s;
      }
    }

    // Order: TT move, then (jumps) longest first / (quiet) crowning, killers, history.
    // Scratch space per ply; an (unheard-of) position with more than 128 moves gets its own arrays.
    const big = n > 128;
    const base = big ? 0 : ply * 128;
    const order = big ? new Int32Array(n) : this.orderBuf;
    const keys = big ? new Int32Array(n) : this.keyBuf;
    for (let i = 0; i < n; i++) {
      const m = moves[i];
      order[base + i] = i;
      if (i === ttMove) keys[base + i] = 1 << 30;
      else if (capture) keys[base + i] = m.caps.length * 1000 + (m.promote ? 500 : 0);
      else {
        const k = m.from | (m.to << 5);
        keys[base + i] =
          (m.promote ? 2_000_000 : 0) +
          (k === this.killer1[ply] ? 1_000_000 : k === this.killer2[ply] ? 900_000 : 0) +
          Math.min(this.hist[k], 800_000);
      }
    }

    const newDepth = depth - 1 + (n === 1 ? 1 : 0); // single reply: don't use up depth
    const alpha0 = alpha;
    let best = -INF;
    let bestIdx = 0;
    for (let k = 0; k < n; k++) {
      let pick = base + k;
      for (let j = base + k + 1; j < base + n; j++) if (keys[base + order[j]] > keys[base + order[pick]]) pick = j;
      const mi = order[pick];
      order[pick] = order[base + k];
      order[base + k] = mi;
      const m = moves[mi];

      makeMove(b, m);
      const childWin = isReversibleMove(m) ? win : sp + 1;
      let s: number;
      if (k === 0) {
        s = -this.negamax(newDepth, -beta, -alpha, ply + 1, -side as Side, sp + 1, childWin, qext);
      } else {
        s = -this.negamax(newDepth, -alpha - 1, -alpha, ply + 1, -side as Side, sp + 1, childWin, qext);
        if (s > alpha && s < beta && !this.stopped) {
          s = -this.negamax(newDepth, -beta, -alpha, ply + 1, -side as Side, sp + 1, childWin, qext);
        }
      }
      unmakeMove(b, m);
      if (this.stopped) return 0;

      if (s > best) {
        best = s;
        bestIdx = mi;
      }
      if (s > alpha) alpha = s;
      if (alpha >= beta) {
        if (!capture) {
          const key = m.from | (m.to << 5);
          if (key !== this.killer1[ply]) {
            this.killer2[ply] = this.killer1[ply];
            this.killer1[ply] = key;
          }
          this.hist[key] += depth * depth;
        }
        break;
      }
    }

    const flag = best <= alpha0 ? UPPER : best >= beta ? LOWER : EXACT;
    let stored = best;
    if (stored > MATE_BOUND) stored += ply;
    else if (stored < -MATE_BOUND) stored -= ply;
    this.ttLo[idx] = lo;
    this.ttHi[idx] = hi;
    this.ttScore[idx] = stored;
    this.ttDepth[idx] = Math.max(0, Math.min(127, depth));
    this.ttFlag[idx] = flag;
    this.ttMove[idx] = bestIdx < 128 ? bestIdx : -1;
    return best;
  }

  private drawScore(side: Side): number {
    return side === this.rootSide ? -this.contempt : this.contempt;
  }

  private hashInto(b: Board, side: Side): void {
    let lo = side === 1 ? Z_SIDE_LO : 0;
    let hi = side === 1 ? Z_SIDE_HI : 0;
    for (let s = 0; s < 32; s++) {
      const v = b[s];
      if (v !== 0) {
        const k = s * 5 + v + 2;
        lo ^= Z_LO[k];
        hi ^= Z_HI[k];
      }
    }
    this.hLo = lo;
    this.hHi = hi;
  }
}
