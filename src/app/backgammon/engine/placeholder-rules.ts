import {
  Board,
  Destination,
  Die,
  Side,
  Step,
  allHome,
  boardKey,
  countAt,
  opponent,
  own,
  pipCount,
} from '@skriin/backgammon-core';

/**
 * PHASE 1 PLACEHOLDER rules, only so the TV preview is playable.
 * Phase 2 replaces this file with the unit-tested move generator in @skriin/backgammon-core.
 *
 * Approach: at every decision the legal next steps are the ones that still allow the
 * maximum number of dice for the turn (so "use max dice" and "play the larger die" hold),
 * and plays are merged when they end in the same position.
 */

export interface MutBoard {
  pts: number[];
  bar: [number, number];
  off: [number, number];
}

export function mutable(b: Board): MutBoard {
  return { pts: [...b.pts], bar: [b.bar[0], b.bar[1]], off: [b.off[0], b.off[1]] };
}

const dir = (side: Side) => (side === 0 ? 1 : -1);

function hasHigher(b: Board, side: Side, p: number): boolean {
  for (let q = p + 1; q <= 6; q++) if (countAt(b, side, own(side, q)) > 0) return true;
  return false;
}

/** Every legal single step of one die for `side` (ignores the rest of the turn). */
export function singleSteps(b: Board, side: Side, die: Die): Step[] {
  const s = dir(side);
  const out: Step[] = [];
  if (b.bar[side] > 0) {
    const t = side === 0 ? 25 - die : die;
    const occ = b.pts[t] * s;
    if (occ >= -1) out.push({ from: 'bar', to: t, die, hit: occ === -1 });
    return out;
  }
  const home = allHome(b, side);
  for (let a = 1; a <= 24; a++) {
    if (b.pts[a] * s <= 0) continue;
    const t = side === 0 ? a - die : a + die;
    if (t >= 1 && t <= 24) {
      const occ = b.pts[t] * s;
      if (occ >= -1) out.push({ from: a, to: t, die, hit: occ === -1 });
    } else if (home) {
      const p = own(side, a);
      if (p === die || (p < die && !hasHigher(b, side, p))) out.push({ from: a, to: 'off', die, hit: false });
    }
  }
  return out;
}

export function applyStep(b: MutBoard, side: Side, st: Step): void {
  const s = dir(side);
  if (st.from === 'bar') b.bar[side]--;
  else b.pts[st.from] -= s;
  if (st.to === 'off') {
    b.off[side]++;
  } else {
    if (st.hit) {
      b.pts[st.to] = 0;
      b.bar[opponent(side)]++;
    }
    b.pts[st.to] += s;
  }
}

export function applySteps(b: Board, side: Side, steps: readonly Step[]): Board {
  const m = mutable(b);
  for (const st of steps) applyStep(m, side, st);
  return m;
}

export function diceList(dice: readonly [Die, Die]): Die[] {
  return dice[0] === dice[1] ? [dice[0], dice[0], dice[0], dice[0]] : [dice[0], dice[1]];
}

export function without(list: readonly Die[], d: Die): Die[] {
  const i = list.indexOf(d);
  return i < 0 ? [...list] : [...list.slice(0, i), ...list.slice(i + 1)];
}

/** Rules state for one turn. */
export class TurnRules {
  private readonly memo = new Map<string, number>();
  readonly maxLen: number;
  private readonly hi: Die;
  private readonly doubles: boolean;

  constructor(
    readonly start: Board,
    readonly side: Side,
    readonly dice: readonly [Die, Die],
  ) {
    this.doubles = dice[0] === dice[1];
    this.hi = (dice[0] > dice[1] ? dice[0] : dice[1]) as Die;
    this.maxLen = this.depth(start, diceList(dice));
  }

  /** Most dice that can still be played from here. */
  depth(b: Board, left: readonly Die[]): number {
    if (!left.length) return 0;
    const key = `${boardKey(b)}#${[...left].sort().join('')}`;
    const hit = this.memo.get(key);
    if (hit !== undefined) return hit;
    let best = 0;
    for (const d of new Set(left)) {
      for (const st of singleSteps(b, this.side, d)) {
        best = Math.max(best, 1 + this.depth(applySteps(b, this.side, [st]), without(left, d)));
        if (best === left.length) break;
      }
      if (best === left.length) break;
    }
    this.memo.set(key, best);
    return best;
  }

  /** Legal next steps after `made` steps were played (board `b`, dice `left`). */
  next(b: Board, left: readonly Die[], made: number): Step[] {
    const need = this.maxLen - made;
    if (need <= 0) return [];
    const out: Step[] = [];
    for (const d of new Set(left)) {
      for (const st of singleSteps(b, this.side, d)) {
        if (1 + this.depth(applySteps(b, this.side, [st]), without(left, d)) === need) out.push(st);
      }
    }
    // Only one die can be played (not both): it must be the larger one when the larger one can be played.
    if (made === 0 && this.maxLen === 1 && !this.doubles && out.some((st) => st.die === this.hi)) {
      return out.filter((st) => st.die === this.hi);
    }
    return out;
  }

  /** Every distinct final position from here → one way to reach it. */
  finals(b: Board, left: readonly Die[], made: number, limit = Infinity): Map<string, Step[]> {
    const out = new Map<string, Step[]>();
    const seen = new Set<string>();
    const walk = (cur: Board, rest: readonly Die[], depth: number, path: Step[]) => {
      if (out.size >= limit) return;
      const nxt = this.next(cur, rest, depth);
      if (!nxt.length) {
        const k = boardKey(cur);
        if (!out.has(k)) out.set(k, path);
        return;
      }
      for (const st of nxt) {
        const nb = applySteps(cur, this.side, [st]);
        const rem = without(rest, st.die);
        const sk = `${boardKey(nb)}#${rem.join('')}`;
        if (seen.has(sk)) continue;
        seen.add(sk);
        walk(nb, rem, depth + 1, [...path, st]);
        if (out.size >= limit) return;
      }
    };
    walk(b, left, made, []);
    return out;
  }

  /** Spots for the checker at `from`: single dice, plus combined spots when every path ends the same way. */
  destinations(b: Board, left: readonly Die[], made: number, from: number | 'bar'): Destination[] {
    interface Cand {
      readonly steps: Step[];
      readonly key: string;
    }
    const byTo = new Map<string, Cand[]>();
    const add = (steps: Step[], end: Board) => {
      const to = steps[steps.length - 1].to;
      const k = String(to);
      const list = byTo.get(k) ?? [];
      list.push({ steps, key: boardKey(end) });
      byTo.set(k, list);
    };
    const extend = (cur: Board, rest: readonly Die[], depth: number, path: Step[]) => {
      const at = path.length ? path[path.length - 1].to : from;
      if (at === 'off') return;
      for (const st of this.next(cur, rest, depth)) {
        if (st.from !== at) continue;
        const nb = applySteps(cur, this.side, [st]);
        const steps = [...path, st];
        add(steps, nb);
        extend(nb, without(rest, st.die), depth + 1, steps);
      }
    };
    extend(b, left, made, []);

    const out: Destination[] = [];
    for (const cands of byTo.values()) {
      const singles = cands.filter((c) => c.steps.length === 1);
      const seenDie = new Set<number>();
      for (const c of singles) {
        if (seenDie.has(c.steps[0].die)) continue;
        seenDie.add(c.steps[0].die);
        out.push({ to: c.steps[0].to, steps: c.steps });
      }
      const combos = cands.filter((c) => c.steps.length > 1 && !singles.some((s) => s.key === c.key));
      if (!combos.length) continue;
      // Show the combined spot only when every way there ends the same (otherwise play die by die).
      const byLen = new Map<number, Cand[]>();
      for (const c of combos) byLen.set(c.steps.length, [...(byLen.get(c.steps.length) ?? []), c]);
      for (const group of byLen.values()) {
        if (group.every((c) => c.key === group[0].key)) out.push({ to: group[0].steps[group[0].steps.length - 1].to, steps: group[0].steps });
      }
    }
    return out;
  }
}

/**
 * Placeholder judgement for the preview computer and hints: race, hits, made points, blots.
 * Phase 2 replaces it with the real Easy/Medium heuristics (and Phase 3 the server engine).
 */
export function placeholderScore(b: Board, side: Side): number {
  const opp = opponent(side);
  let score = (pipCount(b, opp) - pipCount(b, side)) * 0.6;
  score += b.off[side] * 6 - b.off[opp] * 6;
  score += b.bar[opp] * 18 - b.bar[side] * 18;
  for (let a = 1; a <= 24; a++) {
    const n = countAt(b, side, a);
    if (!n) continue;
    const p = own(side, a);
    if (n >= 2) score += p <= 6 ? 7 : p <= 9 ? 4 : 1.5;
    if (n === 1 && exposed(b, side, a)) score -= p <= 6 ? 9 : 6;
  }
  return score;
}

/** A lone checker that an opponent checker could reach with one or two dice. */
function exposed(b: Board, side: Side, a: number): boolean {
  const opp = opponent(side);
  const p = own(side, a);
  if (b.bar[opp] > 0 && p <= 12) return true;
  for (let q = 1; q < p; q++) {
    if (p - q > 12) continue;
    if (countAt(b, opp, own(side, q)) > 0) return true;
  }
  return false;
}
