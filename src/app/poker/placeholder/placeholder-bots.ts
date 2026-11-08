import {
  BotContext,
  BotLevel,
  Card,
  EquityEstimator,
  HoleCards,
  LegalActions,
  OpponentStats,
  PlayerAction,
  PlayerView,
  PokerBot,
  RandomSource,
} from '../core/api';
import { fullDeck, rankValue, suitOf } from '../core/cards';
import { PlaceholderEvaluator } from './placeholder-eval';

/**
 * PLACEHOLDER bots for the Phase 1 preview: simple rules of thumb so a hand plays through.
 * They only see their own PlayerView (never the deck, never other hole cards).
 * Phase 2 replaces them with the Easy / Medium / Hard bots from the brief.
 */

interface Style {
  /** Plays hands at or above this strength (0–1). Lower = looser. */
  readonly play: number;
  /** Raises at or above this strength. */
  readonly raise: number;
  /** Chance of a small bluff when checked to. */
  readonly bluff: number;
  /** Chance of a random mistake (calls when it should fold). */
  readonly mistake: number;
}

const STYLE: Record<BotLevel, Style> = {
  easy: { play: 0.22, raise: 0.86, bluff: 0.02, mistake: 0.18 },
  medium: { play: 0.36, raise: 0.72, bluff: 0.08, mistake: 0.05 },
  hard: { play: 0.44, raise: 0.62, bluff: 0.14, mistake: 0.02 },
};

const evaluator = new PlaceholderEvaluator();

function unit(rng: RandomSource): number {
  return rng.nextUint32() / 4294967296;
}

/** 0–1 rough strength of two cards before the flop. */
export function preflopStrength(hole: HoleCards): number {
  const a = rankValue(hole[0]);
  const b = rankValue(hole[1]);
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  let s = (hi + lo - 4) / 24; // 0 … 1
  if (a === b) s = 0.55 + (a - 2) / 26;
  if (suitOf(hole[0]) === suitOf(hole[1])) s += 0.06;
  if (hi - lo === 1) s += 0.04;
  if (hi - lo > 4 && a !== b) s -= 0.06;
  return Math.max(0, Math.min(1, s));
}

/** Small Monte Carlo (main thread, few runs). Phase 2: ~2,000 runs in a Web Worker. */
export class PlaceholderEquity implements EquityEstimator {
  constructor(private readonly rng: RandomSource) {}

  estimate(hole: HoleCards, board: readonly Card[], opponents: number, iterations: number): Promise<number> {
    const used = new Set<Card>([...hole, ...board]);
    const rest = fullDeck().filter((c) => !used.has(c));
    let score = 0;
    for (let it = 0; it < iterations; it++) {
      const deck = [...rest];
      const draw = (): Card => deck.splice(Math.floor(unit(this.rng) * deck.length), 1)[0]!;
      const fullBoard = [...board];
      while (fullBoard.length < 5) fullBoard.push(draw());
      const mine = evaluator.rankBest([...hole, ...fullBoard]).value;
      let best = true;
      let ties = 0;
      for (let o = 0; o < opponents; o++) {
        const theirs = evaluator.rankBest([draw(), draw(), ...fullBoard]).value;
        if (theirs > mine) {
          best = false;
          break;
        }
        if (theirs === mine) ties++;
      }
      if (best) score += ties ? 1 / (ties + 1) : 1;
    }
    return Promise.resolve(score / Math.max(1, iterations));
  }
}

export class PlaceholderBot implements PokerBot {
  constructor(readonly level: BotLevel) {}

  async decide(view: PlayerView, context: BotContext): Promise<PlayerAction> {
    const me = view.me;
    const legal = me?.legal;
    if (!me || !legal || !me.holeCards) return { type: 'fold' };
    const style = STYLE[this.level];
    const opponents = view.seats.filter((s) => s && s.seat !== me.seat && (s.status === 'inHand' || s.status === 'allIn')).length;

    let strength: number;
    if (view.board.length === 0) {
      strength = preflopStrength(me.holeCards) - Math.max(0, opponents - 2) * 0.03;
    } else {
      const eq = await context.equity.estimate(me.holeCards, view.board, Math.max(1, opponents), 120);
      strength = eq;
    }
    if (context.cancel.cancelled) return { type: 'fold' };

    const pot = view.pots.reduce((t, p) => t + p.amount, 0) + view.seats.reduce((t, s) => t + (s?.committed ?? 0), 0);
    const toCall = legal.call?.amount ?? 0;
    const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;
    const r = unit(context.rng);

    // Raise with strong hands (or a rare bluff when nobody bet).
    if (strength >= style.raise || (toCall === 0 && r < style.bluff)) {
      const sized = this.size(legal, strength, r);
      if (sized) return sized;
    }
    if (toCall === 0) return { type: 'check' };

    const needed = view.board.length === 0 ? style.play : potOdds * 1.15;
    if (strength >= needed || r < style.mistake) return { type: 'call' };
    return { type: 'fold' };
  }

  private size(legal: LegalActions, strength: number, r: number): PlayerAction | null {
    const presets = legal.presets;
    if (!presets.length) return legal.call ? { type: 'call' } : null;
    const pick =
      strength > 0.9 && r < 0.3
        ? presets[presets.length - 1]!
        : (presets.find((p) => p.id === (strength > 0.8 ? 'threeQuarterPot' : 'halfPot')) ?? presets[0]!);
    if (pick.id === 'allIn' || (legal.allIn && pick.to >= legal.allIn.to)) return { type: 'allIn' };
    return legal.bet ? { type: 'bet', to: pick.to } : { type: 'raise', to: pick.to };
  }
}

/** Placeholder opponent model: nothing tracked yet (Phase 2: this table, this session only). */
export function emptyStats(): OpponentStats {
  return { handsSeen: 0, playRate: 0, raiseRate: 0, aggression: 0 };
}

/** Generic bot names. Never real people. */
export const BOT_NAMES: readonly string[] = ['Nova', 'Juniper', 'Pixel', 'Orbit', 'Maple', 'Echo', 'Comet', 'Indie'];
