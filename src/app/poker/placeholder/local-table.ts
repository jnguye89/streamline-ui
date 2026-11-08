import {
  BlindSchedule,
  BotLevel,
  Clock,
  GameType,
  PlayerInfo,
  PokerEngine,
  PokerEvent,
  RandomSource,
  SeatHandle,
  SeatIndex,
  TableConfig,
} from '../core/api';
import { PlaceholderEvaluator } from './placeholder-eval';
import { BOT_NAMES, PlaceholderBot, PlaceholderEquity, emptyStats } from './placeholder-bots';
import { PlaceholderPokerEngine } from './placeholder-engine';

/**
 * Offline table host (you vs bots, on the box). Owns the engine, gives the UI a SeatHandle,
 * runs bot turns with human-like think time and starts the next hand.
 * Angular-free: timers come in through Scheduler so tests can run it instantly.
 */

export interface Scheduler {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const browserScheduler: Scheduler = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
};

/** Math.random based source for the offline preview. Server tables use node:crypto. */
export const mathRandom: RandomSource = { nextUint32: () => Math.floor(Math.random() * 4294967296) };

export const systemClock: Clock = { now: () => Date.now() };

/** Approved Sit & Go schedule: blinds up every 8 hands. */
export const SIT_AND_GO_SCHEDULE: BlindSchedule = {
  handsPerLevel: 8,
  levels: [
    [5, 10],
    [10, 20],
    [15, 30],
    [25, 50],
    [50, 100],
    [75, 150],
    [100, 200],
    [150, 300],
    [200, 400],
    [300, 600],
    [500, 1000],
    [1000, 2000],
  ].map(([small, big]) => ({ small: small!, big: big!, bigBlindAnte: 0 })),
};

export function tableConfig(gameType: GameType, clock: boolean): TableConfig {
  return {
    gameType,
    maxSeats: 6,
    startingStack: 1000,
    blinds: { small: 5, big: 10, bigBlindAnte: 0 },
    blindSchedule: gameType === 'sitAndGo' ? SIT_AND_GO_SCHEDULE : null,
    anteMode: 'off',
    actionTimeMs: clock ? 30_000 : 0,
    timeBankMs: 60_000,
    timeoutsBeforeSitOut: 2,
    autoShowAtShowdown: true,
  };
}

export interface LocalTableOptions {
  readonly gameType: GameType;
  /** Players including you, 2–6. */
  readonly players: number;
  readonly botLevel: BotLevel;
  readonly you: PlayerInfo;
  readonly autoShow: boolean;
  readonly scheduler?: Scheduler;
  readonly rng?: RandomSource;
  readonly clock?: Clock;
  /** Bot think time range (approved: 0.8–2.5 s, never tied to hand strength). */
  readonly thinkMs?: readonly [number, number];
  /** Pause after a hand before the next one deals. */
  readonly nextHandMs?: number;
  readonly runoutDelayMs?: number;
}

export const YOU_SEAT: SeatIndex = 0;

export class LocalTable {
  readonly engine: PokerEngine;
  readonly handle: SeatHandle;
  private readonly scheduler: Scheduler;
  private readonly rng: RandomSource;
  private readonly bots = new Map<SeatIndex, PlaceholderBot>();
  private botTimer: unknown = null;
  private botTurnKey = '';
  private wakeTimer: unknown = null;
  private nextHandTimer: unknown = null;
  private disposed = false;
  private paused = false;
  private readonly cancel = { cancelled: false };
  private readonly off: () => void;

  constructor(private readonly opts: LocalTableOptions) {
    this.scheduler = opts.scheduler ?? browserScheduler;
    this.rng = opts.rng ?? mathRandom;
    const clock = opts.clock ?? systemClock;
    const config = { ...tableConfig(opts.gameType, false), autoShowAtShowdown: opts.autoShow };
    this.engine = new PlaceholderPokerEngine(
      'local',
      config,
      { rng: this.rng, clock, sha256: () => '', evaluator: new PlaceholderEvaluator() },
      { runoutDelayMs: opts.runoutDelayMs ?? 1100 },
    );

    this.engine.sit(YOU_SEAT, opts.you);
    const names = [...BOT_NAMES].sort(() => this.unit() - 0.5);
    for (let i = 1; i < Math.min(6, Math.max(2, opts.players)); i++) {
      const seat = this.botSeat(i, opts.players);
      this.engine.sit(seat, { id: `bot-${seat}`, name: names[i - 1]!, kind: 'bot', botLevel: opts.botLevel });
      this.bots.set(seat, new PlaceholderBot(opts.botLevel));
    }
    this.handle = this.engine.handle({ kind: 'seat', seat: YOU_SEAT });
    this.off = this.engine.onEvents((events) => this.pump(events));
  }

  start(): void {
    this.engine.startHand();
    this.pump([]);
  }

  /** A between hands: deal now instead of waiting. */
  dealNow(): void {
    if (this.nextHandTimer === null) return;
    this.scheduler.clearTimeout(this.nextHandTimer);
    this.nextHandTimer = null;
    this.nextHand();
  }

  /** Stops dealing new hands (e.g. while the menu is open, or after you bust). */
  setPaused(paused: boolean): void {
    this.paused = paused;
    if (!paused) this.pump([]);
  }

  setBotLevel(level: BotLevel): void {
    for (const seat of this.bots.keys()) this.bots.set(seat, new PlaceholderBot(level));
  }

  dispose(): void {
    this.disposed = true;
    this.cancel.cancelled = true;
    this.off();
    for (const t of [this.botTimer, this.wakeTimer, this.nextHandTimer]) if (t !== null) this.scheduler.clearTimeout(t);
  }

  /** Spread bots around the table so heads-up sits opposite and 3–5 players look balanced. */
  private botSeat(i: number, players: number): SeatIndex {
    const layouts: Record<number, SeatIndex[]> = { 2: [3], 3: [2, 4], 4: [2, 3, 4], 5: [1, 2, 4, 5], 6: [1, 2, 3, 4, 5] };
    return (layouts[Math.min(6, Math.max(2, players))] ?? [1, 2, 3, 4, 5])[i - 1]!;
  }

  private unit(): number {
    return this.rng.nextUint32() / 4294967296;
  }

  private pump(_events: readonly PokerEvent[]): void {
    if (this.disposed) return;
    const view = this.engine.viewFor({ kind: 'public' });

    // Engine wake-ups (all-in run-out pacing, action clock).
    const wake = this.engine.nextWakeAt();
    if (this.wakeTimer !== null) {
      this.scheduler.clearTimeout(this.wakeTimer);
      this.wakeTimer = null;
    }
    if (wake !== null) {
      const delay = Math.max(0, wake - (this.opts.clock ?? systemClock).now());
      this.wakeTimer = this.scheduler.setTimeout(() => {
        this.wakeTimer = null;
        this.engine.advance();
      }, delay);
    }

    // Bot turn.
    const turn = view.turn;
    const key = turn ? `${view.handNumber}:${view.phase}:${turn.seat}:${turn.startedAt}:${view.currentBet}` : '';
    if (turn && this.bots.has(turn.seat) && key !== this.botTurnKey) {
      this.botTurnKey = key;
      if (this.botTimer !== null) this.scheduler.clearTimeout(this.botTimer);
      const [lo, hi] = this.opts.thinkMs ?? [800, 2500];
      // Uniform and independent of the cards: no timing tells.
      const think = lo + this.unit() * (hi - lo);
      const seat = turn.seat;
      this.botTimer = this.scheduler.setTimeout(() => {
        this.botTimer = null;
        void this.playBot(seat, key);
      }, think);
    }

    // Next hand.
    const over = view.phase === 'showdown' || view.phase === 'handComplete';
    if (over && view.status === 'open' && this.nextHandTimer === null) {
      const delay = this.opts.nextHandMs ?? (view.phase === 'showdown' ? 4200 : 2600);
      this.nextHandTimer = this.scheduler.setTimeout(() => {
        this.nextHandTimer = null;
        this.nextHand();
      }, delay);
    }
  }

  private async playBot(seat: SeatIndex, key: string): Promise<void> {
    if (this.disposed) return;
    const bot = this.bots.get(seat);
    if (!bot) return;
    const view = this.engine.viewFor({ kind: 'seat', seat });
    const action = await bot.decide(view, {
      rng: this.rng,
      equity: new PlaceholderEquity(this.rng),
      opponents: () => emptyStats(),
      cancel: this.cancel,
    });
    if (this.disposed || this.botTurnKey !== key) return;
    const res = this.engine.act(seat, action);
    if (!res.ok) this.engine.act(seat, view.me?.legal?.check ? { type: 'check' } : { type: 'fold' });
  }

  private nextHand(): void {
    if (this.disposed) return;
    if (this.paused) {
      this.nextHandTimer = this.scheduler.setTimeout(() => {
        this.nextHandTimer = null;
        this.nextHand();
      }, 500);
      return;
    }
    const view = this.engine.viewFor({ kind: 'seat', seat: YOU_SEAT });
    if (view.status !== 'open') return;
    // Bots top up for free in a home game so the table stays full. You get asked instead.
    if (this.opts.gameType === 'home') {
      for (const s of view.seats) if (s && s.player.kind === 'bot' && s.stack === 0) this.engine.topUp(s.seat);
      const mine = view.seats[YOU_SEAT];
      if (mine && mine.stack === 0 && mine.status === 'busted') return; // waiting for "Top up to 1,000?"
    }
    this.engine.startHand();
  }

  /** Called after you top up or come back. */
  resume(): void {
    const phase = this.engine.viewFor({ kind: 'public' }).phase;
    const between = phase === 'betweenHands' || phase === 'showdown' || phase === 'handComplete';
    if (between && this.nextHandTimer === null) this.nextHand();
  }
}
