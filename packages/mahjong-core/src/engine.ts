import { GameConfig, Pace, PlayerAction, PlayerView, Seat, TableEvent } from './types';

export type ViewListener = (view: PlayerView, events: readonly TableEvent[]) => void;

/**
 * The only way UI and bots talk to a game. Same contract offline (engine in the app, bots in a worker)
 * and online (Colyseus room on the server; the client gets one PlayerView per seat).
 *
 * Rules for implementers:
 *  - view(seat) never includes other players' concealed tiles or the wall order.
 *  - act() accepts only an action listed in that seat's current view().options; anything else is ignored.
 *  - Time comes from an injected clock; randomness from an injected RNG (deterministic in tests).
 */
export interface MahjongEngine {
  readonly name: string;
  start(config: GameConfig): void;
  view(seat: Seat): PlayerView | null;
  /** Called after every change with that seat's new view. Returns an unsubscribe function. */
  subscribe(seat: Seat, listener: ViewListener): () => void;
  act(seat: Seat, action: PlayerAction): void;
  /** Bot think time / animation pacing. */
  setPace(pace: Pace): void;
  /** Stops timers and bots. */
  dispose(): void;
}

/** Injected time source (ms). Server and tests can supply their own. */
export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

/** Injected randomness: returns a float in [0, 1). The server uses a CSPRNG-backed one. */
export type Rng = () => number;

/** Small seeded generator for tests, replays and the offline preview (not for online play). */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates with the injected RNG. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
};
