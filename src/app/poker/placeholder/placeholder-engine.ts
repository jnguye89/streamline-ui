import {
  BlindLevel,
  Card,
  CreatePokerEngine,
  EngineSnapshot,
  HandLogLine,
  HandRank,
  HandResult,
  HandSummary,
  HoleCards,
  LastAction,
  LegalActions,
  MeView,
  PlayerAction,
  PlayerInfo,
  PlayerView,
  PokerEngine,
  PokerEngineDeps,
  PokerErrorCode,
  PokerEvent,
  PotResult,
  PotView,
  PreAction,
  Result,
  SeatHandle,
  SeatIndex,
  SeatStatus,
  SeatView,
  ShownHand,
  SizePreset,
  SizePresetId,
  Standing,
  Street,
  TableConfig,
  TableStatus,
  TurnView,
  Viewer,
  HandPhase,
} from '../core/api';
import { chips, fullDeck } from '../core/cards';

/**
 * PLACEHOLDER rules engine for the Phase 1 preview. It implements the PokerEngine contract so
 * the TV UI is built against the real interface, and plays a correct-looking hand of no-limit
 * hold'em. It is not the tested engine: Phase 2 replaces it with packages/poker-core.
 *
 * Simplified on purpose (Phase 2 does these exactly, with tests):
 *  - the button moves to the next player with chips (no dead-button handling yet);
 *  - with auto-show off, losing hands are mucked automatically;
 *  - no shuffle proof (PlayerView.shuffle is null).
 */

interface SeatState {
  info: PlayerInfo;
  stack: number;
  committed: number;
  totalIn: number;
  hole: [Card, Card] | null;
  status: SeatStatus;
  acted: boolean;
  /** Highest bet when this seat last acted this round (decides whether betting reopened for it). */
  actedAtBet: number;
  lastAction: LastAction | null;
  shown: boolean;
  preAction: PreAction | null;
  timeBankLeftMs: number;
  timeoutsInARow: number;
  sitOutNext: boolean;
  leaveAfterHand: boolean;
  handStartStack: number;
}

interface HandRecord {
  handNumber: number;
  buttonSeat: SeatIndex;
  blinds: BlindLevel;
  board: Card[];
  lines: HandLogLine[];
  holes: Map<SeatIndex, HoleCards>;
  result: HandResult | null;
}

const HISTORY_LIMIT = 20;

export interface PlaceholderOptions {
  /** Pause between streets when all hands are face up (all-in run-out). */
  readonly runoutDelayMs: number;
}

function ok(): Result {
  return { ok: true };
}

function fail(code: PokerErrorCode, message: string): Result {
  return { ok: false, code, message };
}

export class PlaceholderPokerEngine implements PokerEngine {
  private seats: (SeatState | null)[];
  private status: TableStatus = 'open';
  private phase: HandPhase = 'betweenHands';
  private handNumber = 0;
  private levelIndex = 0;
  private buttonSeat: SeatIndex | null = null;
  private sbSeat: SeatIndex | null = null;
  private bbSeat: SeatIndex | null = null;
  private deck: Card[] = [];
  private board: Card[] = [];
  private pots: PotView[] = [];
  private currentBet = 0;
  private lastFullRaise = 0;
  private lastAggressor: SeatIndex | null = null;
  private street: Street = 'preflop';
  private toAct: SeatIndex | null = null;
  private turn: TurnView | null = null;
  private runout = false;
  private runoutNextAt: number | null = null;
  private result: HandResult | null = null;
  private standings: Standing[] = [];
  private endRequested = false;
  private ledger = 0;
  private record: HandRecord | null = null;
  private readonly hands: HandRecord[] = [];
  private readonly listeners = new Set<(events: readonly PokerEvent[]) => void>();
  private pending: PokerEvent[] = [];

  constructor(
    private readonly tableId: string,
    readonly config: TableConfig,
    private readonly deps: PokerEngineDeps,
    private readonly options: PlaceholderOptions = { runoutDelayMs: 1100 },
  ) {
    this.seats = Array.from({ length: config.maxSeats }, () => null);
  }

  // ───────────────────────── Seating ─────────────────────────

  sit(seat: SeatIndex, player: PlayerInfo): Result {
    if (seat < 0 || seat >= this.seats.length) return fail('NOT_ALLOWED', 'No such seat.');
    if (this.seats[seat]) return fail('SEAT_TAKEN', 'Seat taken.');
    if (this.status === 'finished') return fail('TABLE_FINISHED', 'Table is over.');
    if (this.config.gameType === 'sitAndGo' && this.handNumber > 0) {
      return fail('NOT_ALLOWED', 'Sit & Go already started.');
    }
    this.seats[seat] = {
      info: player,
      stack: this.config.startingStack,
      committed: 0,
      totalIn: 0,
      hole: null,
      status: 'waitingForBigBlind',
      acted: false,
      actedAtBet: -1,
      lastAction: null,
      shown: false,
      preAction: null,
      timeBankLeftMs: this.config.timeBankMs,
      timeoutsInARow: 0,
      sitOutNext: false,
      leaveAfterHand: false,
      handStartStack: this.config.startingStack,
    };
    this.ledger += this.config.startingStack;
    this.pending.push({ type: 'seatChanged', seat, change: 'joined' });
    return this.flush(ok());
  }

  stand(seat: SeatIndex): Result {
    const s = this.seats[seat];
    if (!s) return fail('SEAT_EMPTY', 'Nobody there.');
    if (this.inHand(s) && this.isStreet()) {
      s.leaveAfterHand = true;
      if (s.status === 'inHand') {
        if (this.toAct === seat) return this.act(seat, { type: 'fold' });
        this.foldOutOfTurn(seat);
      }
      return this.flush(ok());
    }
    this.removeSeat(seat);
    return this.flush(ok());
  }

  setSittingOut(seat: SeatIndex, sittingOut: boolean): Result {
    const s = this.seats[seat];
    if (!s) return fail('SEAT_EMPTY', 'Nobody there.');
    if (sittingOut) {
      if (this.inHand(s) && this.isStreet()) s.sitOutNext = true;
      else s.status = 'sittingOut';
      this.pending.push({ type: 'seatChanged', seat, change: 'satOut' });
    } else {
      s.sitOutNext = false;
      s.timeoutsInARow = 0;
      if (s.status === 'sittingOut') s.status = 'waitingForBigBlind';
      this.pending.push({ type: 'seatChanged', seat, change: 'returned' });
    }
    return this.flush(ok());
  }

  topUp(seat: SeatIndex): Result {
    const s = this.seats[seat];
    if (!s) return fail('SEAT_EMPTY', 'Nobody there.');
    if (this.config.gameType !== 'home') return fail('NOT_ALLOWED', 'Top-ups are for home games.');
    if (this.isStreet() && this.inHand(s)) return fail('HAND_IN_PROGRESS', 'Between hands only.');
    if (s.stack >= this.config.startingStack) return fail('NOT_ALLOWED', 'Already at the starting stack.');
    const add = this.config.startingStack - s.stack;
    s.stack += add;
    this.ledger += add;
    if (s.status === 'busted') s.status = 'waitingForBigBlind';
    this.pending.push({ type: 'seatChanged', seat, change: 'toppedUp' });
    return this.flush(ok());
  }

  endTable(): Result {
    if (this.isStreet()) this.endRequested = true;
    else this.finishTable();
    return this.flush(ok());
  }

  // ───────────────────────── Play ─────────────────────────

  startHand(): Result {
    if (this.status === 'finished') return fail('TABLE_FINISHED', 'Table is over.');
    if (this.isStreet()) return fail('HAND_IN_PROGRESS', 'A hand is running.');
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      if (!s) continue;
      if (s.leaveAfterHand) {
        this.removeSeat(i);
        continue;
      }
      if (s.sitOutNext) {
        s.sitOutNext = false;
        s.status = 'sittingOut';
      }
    }
    const eligible = this.seatIndexes((s) => s.stack > 0 && s.status !== 'sittingOut' && s.status !== 'busted');
    if (eligible.length < 2) return fail('NOT_ENOUGH_PLAYERS', 'Need two players with chips.');

    this.handNumber++;
    const schedule = this.config.blindSchedule;
    if (schedule) {
      const idx = Math.min(Math.floor((this.handNumber - 1) / schedule.handsPerLevel), schedule.levels.length - 1);
      if (idx !== this.levelIndex) {
        this.levelIndex = idx;
        this.pending.push({ type: 'levelUp', index: idx, blinds: this.blinds() });
      }
    }

    // Button: next eligible seat clockwise (placeholder; Phase 2 = dead button).
    this.buttonSeat =
      this.buttonSeat === null
        ? eligible[Math.floor(this.random() * eligible.length)]!
        : this.nextOf(this.buttonSeat, eligible);
    const headsUp = eligible.length === 2;
    this.sbSeat = headsUp ? this.buttonSeat : this.nextOf(this.buttonSeat, eligible);
    this.bbSeat = this.nextOf(this.sbSeat, eligible);

    for (const i of this.seatIndexes(() => true)) {
      const s = this.seats[i]!;
      const playing = eligible.includes(i);
      s.committed = 0;
      s.totalIn = 0;
      s.hole = null;
      s.acted = false;
      s.actedAtBet = -1;
      s.lastAction = null;
      s.shown = false;
      s.preAction = null;
      s.handStartStack = s.stack;
      if (playing) s.status = 'inHand';
    }
    this.board = [];
    this.pots = [];
    this.result = null;
    this.runout = false;
    this.runoutNextAt = null;
    this.lastAggressor = null;
    this.street = 'preflop';
    this.phase = 'preflop';
    this.record = {
      handNumber: this.handNumber,
      buttonSeat: this.buttonSeat,
      blinds: this.blinds(),
      board: [],
      lines: [],
      holes: new Map(),
      result: null,
    };
    this.pending.push({ type: 'handStarted', handNumber: this.handNumber, buttonSeat: this.buttonSeat, commitment: '' });

    // Shuffle (Fisher–Yates on the injected random source) and deal one card at a time from the left of the button.
    this.deck = fullDeck();
    for (let i = this.deck.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [this.deck[i], this.deck[j]] = [this.deck[j]!, this.deck[i]!];
    }
    const order = this.orderFrom(this.nextOf(this.buttonSeat, eligible), eligible);
    const dealt = new Map<SeatIndex, Card[]>();
    for (let round = 0; round < 2; round++) {
      for (const i of order) dealt.set(i, [...(dealt.get(i) ?? []), this.deck.pop()!]);
    }
    for (const [i, cards] of dealt) {
      const hole = cards as [Card, Card];
      this.seats[i]!.hole = hole;
      this.record.holes.set(i, hole);
    }
    this.pending.push({ type: 'cardsDealt', seats: order });

    const level = this.blinds();
    this.post(this.sbSeat, level.small, 'small');
    this.post(this.bbSeat, level.big, 'big');
    this.currentBet = Math.max(...eligible.map((i) => this.seats[i]!.committed));
    this.lastFullRaise = level.big;

    const first = this.nextActor(this.bbSeat);
    if (first === null) this.endRound();
    else this.setTurn(first);
    return this.flush(ok());
  }

  act(seat: SeatIndex, action: PlayerAction): Result {
    if (!this.isStreet() || this.runout) return fail('NOT_YOUR_TURN', 'No betting right now.');
    if (this.toAct !== seat) return fail('NOT_YOUR_TURN', 'Not your turn.');
    const s = this.seats[seat]!;
    const legal = this.legalFor(seat);
    const before = s.committed;
    let to = s.committed;

    switch (action.type) {
      case 'fold':
        s.status = 'folded';
        break;
      case 'check':
        if (!legal.check) return fail('ILLEGAL_ACTION', 'There is a bet to call.');
        break;
      case 'call':
        if (!legal.call) return fail('ILLEGAL_ACTION', 'Nothing to call.');
        to = s.committed + legal.call.amount;
        break;
      case 'bet':
        if (!legal.bet) return fail('ILLEGAL_ACTION', 'Betting is closed.');
        if (action.to < legal.bet.minTo || action.to > legal.bet.maxTo) return fail('BAD_AMOUNT', 'Bet size out of range.');
        to = action.to;
        break;
      case 'raise':
        if (!legal.raise) return fail('ILLEGAL_ACTION', 'Raising is closed.');
        if (action.to < legal.raise.minTo || action.to > legal.raise.maxTo) return fail('BAD_AMOUNT', 'Raise size out of range.');
        to = action.to;
        break;
      case 'allIn':
        if (!legal.allIn) return fail('ILLEGAL_ACTION', 'All-in is not open.');
        to = legal.allIn.to;
        break;
    }

    if (to > before) this.moveChips(seat, to - before);
    if (to > this.currentBet) {
      const raiseBy = to - this.currentBet;
      if (raiseBy >= this.lastFullRaise) this.lastFullRaise = raiseBy;
      this.currentBet = to;
      this.lastAggressor = seat;
      for (const i of this.seatIndexes((o) => o.preAction === 'check')) this.seats[i]!.preAction = null;
    }
    if (s.stack === 0 && s.status === 'inHand') s.status = 'allIn';
    s.acted = true;
    s.actedAtBet = this.currentBet;
    s.preAction = null;
    this.useTurnClock(seat);

    const shownType: LastAction['type'] =
      action.type === 'fold' ? 'fold' : s.status === 'allIn' ? 'allIn' : action.type === 'allIn' ? 'raise' : action.type;
    const auto = this.autoFlag;
    s.lastAction = { type: shownType, to: shownType === 'fold' || shownType === 'check' ? null : to, auto };
    this.pending.push({ type: 'action', seat, action, to, auto });
    this.log(seat, this.describeAction(shownType, to, before));
    this.autoFlag = null;

    this.afterAction(seat);
    return this.flush(ok());
  }

  setPreAction(seat: SeatIndex, preAction: PreAction | null): Result {
    const s = this.seats[seat];
    if (!s || s.status !== 'inHand' || !this.isStreet()) return fail('NOT_ALLOWED', 'Not in the hand.');
    if (this.toAct === seat) return fail('NOT_ALLOWED', 'It is your turn.');
    if (preAction === 'check' && s.committed < this.currentBet) return fail('ILLEGAL_ACTION', 'There is a bet to call.');
    s.preAction = preAction;
    return this.flush(ok());
  }

  show(seat: SeatIndex): Result {
    const s = this.seats[seat];
    if (!s || !s.hole || s.shown) return fail('NOT_ALLOWED', 'Nothing to show.');
    if (this.phase !== 'handComplete') return fail('NOT_ALLOWED', 'Show after the hand.');
    s.shown = true;
    const hand: ShownHand = { seat, cards: s.hole, hand: this.board.length >= 3 ? this.deps.evaluator.rankBest([...s.hole, ...this.board]) : null };
    this.pending.push({ type: 'cardsShown', hand });
    if (this.result) this.result = { ...this.result, shown: [...this.result.shown, hand] };
    return this.flush(ok());
  }

  muck(seat: SeatIndex): Result {
    const s = this.seats[seat];
    if (!s || s.shown) return fail('NOT_ALLOWED', 'Nothing to muck.');
    return ok();
  }

  // ───────────────────────── Time ─────────────────────────

  advance(): void {
    const now = this.deps.clock.now();
    if (this.runout && this.runoutNextAt !== null && now >= this.runoutNextAt) {
      this.dealStreet();
      if (this.street === 'river' && this.board.length === 5) {
        this.runoutNextAt = null;
        this.showdown();
      } else {
        this.runoutNextAt = now + this.options.runoutDelayMs;
      }
    }
    const t = this.turn;
    if (t && this.toAct !== null && this.config.actionTimeMs > 0) {
      const s = this.seats[this.toAct]!;
      if (!t.usingTimeBank && now >= t.turnEndsAt && s.timeBankLeftMs > 0) {
        this.turn = { ...t, usingTimeBank: true };
      } else if (now >= (t.usingTimeBank || s.timeBankLeftMs <= 0 ? t.timeBankEndsAt : t.turnEndsAt)) {
        const seat = this.toAct;
        s.timeoutsInARow++;
        const satOut = s.timeoutsInARow >= this.config.timeoutsBeforeSitOut;
        if (satOut) s.sitOutNext = true;
        this.pending.push({ type: 'timedOut', seat, satOut });
        this.autoFlag = 'timeout';
        const legal = this.legalFor(seat);
        this.act(seat, legal.check ? { type: 'check' } : { type: 'fold' });
        return;
      }
    }
    this.flush(ok());
  }

  nextWakeAt(): number | null {
    if (this.runout && this.runoutNextAt !== null) return this.runoutNextAt;
    if (this.turn && this.config.actionTimeMs > 0) {
      return this.turn.usingTimeBank ? this.turn.timeBankEndsAt : this.turn.turnEndsAt;
    }
    return null;
  }

  // ───────────────────────── Output ─────────────────────────

  viewFor(viewer: Viewer): PlayerView {
    const level = this.blinds();
    const schedule = this.config.blindSchedule;
    return {
      schema: 1,
      tableId: this.tableId,
      viewer,
      engineNow: this.deps.clock.now(),
      config: this.config,
      status: this.status,
      handNumber: this.handNumber,
      phase: this.phase,
      level: {
        index: this.levelIndex,
        blinds: level,
        handsUntilNext:
          schedule && this.levelIndex < schedule.levels.length - 1
            ? schedule.handsPerLevel - ((Math.max(this.handNumber, 1) - 1) % schedule.handsPerLevel)
            : null,
      },
      buttonSeat: this.buttonSeat,
      smallBlindSeat: this.sbSeat,
      bigBlindSeat: this.bbSeat,
      seats: this.seats.map((s, i) => (s ? this.seatView(i, s) : null)),
      board: [...this.board],
      pots: this.pots.map((p) => ({ ...p, eligibleSeats: [...p.eligibleSeats] })),
      currentBet: this.currentBet,
      turn: this.turn,
      allInRunout: this.runout,
      result: this.result,
      shuffle: null,
      standings: [...this.standings],
      me: viewer.kind === 'seat' ? this.meView(viewer.seat) : null,
    };
  }

  history(viewer: Viewer, limit: number): readonly HandSummary[] {
    return this.hands
      .slice(-limit)
      .reverse()
      .filter((r): r is HandRecord & { result: HandResult } => r.result !== null)
      .map((r) => ({
        handNumber: r.handNumber,
        buttonSeat: r.buttonSeat,
        blinds: r.blinds,
        myHoleCards: viewer.kind === 'seat' ? (r.holes.get(viewer.seat) ?? null) : null,
        board: [...r.board],
        lines: [...r.lines],
        result: r.result,
        shuffle: null,
      }));
  }

  onEvents(listener: (events: readonly PokerEvent[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  handle(viewer: Viewer): SeatHandle {
    const seat = viewer.kind === 'seat' ? viewer.seat : null;
    const denied = (): Promise<Result> => Promise.resolve(fail('NOT_ALLOWED', 'Watching only.'));
    const run = (fn: (s: SeatIndex) => Result): Promise<Result> => (seat === null ? denied() : Promise.resolve(fn(seat)));
    return {
      viewer,
      view: () => this.viewFor(viewer),
      subscribe: (listener) => this.onEvents((events) => listener(this.viewFor(viewer), events)),
      act: (action) => run((s) => this.act(s, action)),
      setPreAction: (p) => run((s) => this.setPreAction(s, p)),
      show: () => run((s) => this.show(s)),
      muck: () => run((s) => this.muck(s)),
      topUp: () => run((s) => this.topUp(s)),
      setSittingOut: (on) => run((s) => this.setSittingOut(s, on)),
      leave: () => run((s) => this.stand(s)),
      history: (limit) => Promise.resolve(this.history(viewer, limit)),
    };
  }

  snapshot(): EngineSnapshot {
    return {
      format: 'poker-core/1',
      data: JSON.stringify({
        seats: this.seats,
        handNumber: this.handNumber,
        buttonSeat: this.buttonSeat,
        levelIndex: this.levelIndex,
        ledger: this.ledger,
        standings: this.standings,
        status: this.status,
      }),
    };
  }

  /** Placeholder restore: only between hands (seats, stacks, button, level). */
  restore(snapshot: EngineSnapshot): void {
    const data = JSON.parse(snapshot.data) as {
      seats: (SeatState | null)[];
      handNumber: number;
      buttonSeat: SeatIndex | null;
      levelIndex: number;
      ledger: number;
      standings: Standing[];
      status: TableStatus;
    };
    this.seats = data.seats.map((s) => (s ? { ...s, hole: null, committed: 0, totalIn: 0 } : null));
    this.handNumber = data.handNumber;
    this.buttonSeat = data.buttonSeat;
    this.levelIndex = data.levelIndex;
    this.ledger = data.ledger;
    this.standings = data.standings;
    this.status = data.status;
    this.checkLedger();
  }

  // ───────────────────────── Internals ─────────────────────────

  private autoFlag: LastAction['auto'] = null;

  private random(): number {
    return this.deps.rng.nextUint32() / 4294967296;
  }

  private blinds(): BlindLevel {
    const schedule = this.config.blindSchedule;
    return schedule ? schedule.levels[this.levelIndex]! : this.config.blinds;
  }

  private isStreet(): boolean {
    return this.phase === 'preflop' || this.phase === 'flop' || this.phase === 'turn' || this.phase === 'river';
  }

  private inHand(s: SeatState): boolean {
    return s.status === 'inHand' || s.status === 'allIn';
  }

  private seatIndexes(pred: (s: SeatState) => boolean): SeatIndex[] {
    const out: SeatIndex[] = [];
    this.seats.forEach((s, i) => {
      if (s && pred(s)) out.push(i);
    });
    return out;
  }

  /** Next seat clockwise after `from` among `among` (wraps). */
  private nextOf(from: SeatIndex, among: readonly SeatIndex[]): SeatIndex {
    const n = this.seats.length;
    for (let k = 1; k <= n; k++) {
      const i = (from + k) % n;
      if (among.includes(i)) return i;
    }
    return from;
  }

  private orderFrom(start: SeatIndex, among: readonly SeatIndex[]): SeatIndex[] {
    const n = this.seats.length;
    const out: SeatIndex[] = [];
    for (let k = 0; k < n; k++) {
      const i = (start + k) % n;
      if (among.includes(i)) out.push(i);
    }
    return out;
  }

  private removeSeat(seat: SeatIndex): void {
    const s = this.seats[seat];
    if (!s) return;
    this.ledger -= s.stack;
    this.seats[seat] = null;
    this.pending.push({ type: 'seatChanged', seat, change: 'left' });
  }

  private moveChips(seat: SeatIndex, amount: number): void {
    const s = this.seats[seat]!;
    const pay = Math.min(amount, s.stack);
    s.stack -= pay;
    s.committed += pay;
    s.totalIn += pay;
  }

  private post(seat: SeatIndex, amount: number, kind: 'small' | 'big'): void {
    const s = this.seats[seat]!;
    const before = s.committed;
    this.moveChips(seat, amount);
    if (s.stack === 0) s.status = 'allIn';
    const paid = s.committed - before;
    s.lastAction = { type: kind === 'small' ? 'smallBlind' : 'bigBlind', to: s.committed, auto: null };
    this.pending.push({ type: 'blindPosted', seat, kind, amount: paid });
    this.log(seat, `posts ${kind} blind ${chips(paid)}`);
  }

  private log(seat: SeatIndex, text: string): void {
    const s = this.seats[seat];
    if (!this.record || !s) return;
    this.record.lines.push({ street: this.phase === 'showdown' ? 'showdown' : this.street, seat, name: s.info.name, text });
  }

  private describeAction(type: LastAction['type'], to: number, before: number): string {
    switch (type) {
      case 'fold':
        return 'folds';
      case 'check':
        return 'checks';
      case 'call':
        return `calls ${chips(to - before)}`;
      case 'bet':
        return `bets ${chips(to)}`;
      case 'raise':
        return `raises to ${chips(to)}`;
      case 'allIn':
        return `is all-in for ${chips(to)}`;
      default:
        return '';
    }
  }

  private canAct(s: SeatState): boolean {
    return s.status === 'inHand' && s.stack > 0;
  }

  /** First seat after `from` that still has to act this round. */
  private nextActor(from: SeatIndex): SeatIndex | null {
    const n = this.seats.length;
    const actors = this.seatIndexes((s) => this.canAct(s)).length;
    for (let k = 1; k <= n; k++) {
      const i = (from + k) % n;
      const s = this.seats[i];
      if (!s || !this.canAct(s)) continue;
      // Alone with chips: only act when facing a bet (nobody is left to answer a bet).
      if (actors <= 1 && s.committed >= this.currentBet) continue;
      if (!s.acted || s.committed < this.currentBet) return i;
    }
    return null;
  }

  private setTurn(seat: SeatIndex): void {
    this.toAct = seat;
    const now = this.deps.clock.now();
    const s = this.seats[seat]!;
    const clock = this.config.actionTimeMs;
    this.turn = {
      seat,
      startedAt: now,
      turnEndsAt: clock > 0 ? now + clock : 0,
      timeBankEndsAt: clock > 0 ? now + clock + s.timeBankLeftMs : 0,
      usingTimeBank: false,
    };
    const pre = s.preAction;
    if (pre) {
      const legal = this.legalFor(seat);
      let action: PlayerAction | null = null;
      if (pre === 'checkFold') action = legal.check ? { type: 'check' } : { type: 'fold' };
      else if (pre === 'check') action = legal.check ? { type: 'check' } : null;
      else if (pre === 'callAny') action = legal.call ? { type: 'call' } : legal.check ? { type: 'check' } : null;
      s.preAction = null;
      if (action) {
        this.autoFlag = 'preAction';
        this.act(seat, action);
      }
    }
  }

  private useTurnClock(seat: SeatIndex): void {
    const t = this.turn;
    const s = this.seats[seat]!;
    if (t && t.usingTimeBank && this.config.actionTimeMs > 0) {
      const used = Math.max(0, this.deps.clock.now() - t.turnEndsAt);
      s.timeBankLeftMs = Math.max(0, s.timeBankLeftMs - used);
    }
    if (this.autoFlag !== 'timeout') s.timeoutsInARow = 0;
    this.turn = null;
    this.toAct = null;
  }

  private foldOutOfTurn(seat: SeatIndex): void {
    const s = this.seats[seat]!;
    s.status = 'folded';
    s.lastAction = { type: 'fold', to: null, auto: null };
    this.pending.push({ type: 'action', seat, action: { type: 'fold' }, to: s.committed, auto: null });
    this.log(seat, 'folds');
    const live = this.seatIndexes((o) => this.inHand(o));
    if (live.length === 1) this.winUncontested(live[0]!);
  }

  private afterAction(seat: SeatIndex): void {
    const live = this.seatIndexes((o) => this.inHand(o));
    if (live.length === 1) {
      this.winUncontested(live[0]!);
      return;
    }
    const next = this.nextActor(seat);
    if (next !== null) this.setTurn(next);
    else this.endRound();
  }

  private returnUncalled(): void {
    const all = this.seatIndexes((s) => s.committed > 0);
    if (!all.length) return;
    let top = all[0]!;
    for (const i of all) if (this.seats[i]!.committed > this.seats[top]!.committed) top = i;
    const second = Math.max(0, ...all.filter((i) => i !== top).map((i) => this.seats[i]!.committed));
    const s = this.seats[top]!;
    const extra = s.committed - second;
    if (extra > 0) {
      s.committed -= extra;
      s.totalIn -= extra;
      s.stack += extra;
      if (s.status === 'allIn' && s.stack > 0) s.status = 'inHand';
      this.pending.push({ type: 'uncalledReturned', seat: top, amount: extra });
      if (this.record) this.log(top, `gets ${chips(extra)} back (not called)`);
      if (this.result === null) this.uncalled = { seat: top, amount: extra };
    }
  }

  private uncalled: { seat: SeatIndex; amount: number } | null = null;

  private buildPots(): PotView[] {
    const live = this.seatIndexes((s) => this.inHand(s));
    const levels = [...new Set(live.map((i) => this.seats[i]!.totalIn))].filter((v) => v > 0).sort((a, b) => a - b);
    const contributors = this.seatIndexes((s) => s.totalIn > 0);
    const pots: { amount: number; eligible: SeatIndex[] }[] = [];
    let prev = 0;
    for (const lvl of levels) {
      let amount = 0;
      for (const i of contributors) amount += Math.max(0, Math.min(this.seats[i]!.totalIn, lvl) - prev);
      pots.push({ amount, eligible: live.filter((i) => this.seats[i]!.totalIn >= lvl) });
      prev = lvl;
    }
    const total = contributors.reduce((t, i) => t + this.seats[i]!.totalIn, 0);
    const counted = pots.reduce((t, p) => t + p.amount, 0);
    if (pots.length && total > counted) pots[pots.length - 1]!.amount += total - counted;
    const single = pots.length === 1;
    return pots.map((p, i) => ({
      index: i,
      label: single ? 'Pot' : i === 0 ? 'Main pot' : `Side pot ${i}`,
      amount: p.amount,
      eligibleSeats: p.eligible,
    }));
  }

  private endRound(): void {
    this.returnUncalled();
    this.pots = this.buildPots();
    this.pending.push({ type: 'potsCollected', pots: this.pots });
    for (const i of this.seatIndexes(() => true)) {
      const s = this.seats[i]!;
      s.committed = 0;
      s.acted = false;
      s.actedAtBet = -1;
      if (s.status === 'inHand' || s.status === 'allIn') s.lastAction = null;
    }
    this.currentBet = 0;
    this.lastFullRaise = this.blinds().big;
    this.toAct = null;
    this.turn = null;
    if (this.street !== 'river') this.lastAggressor = null;

    const live = this.seatIndexes((s) => this.inHand(s));
    const actors = this.seatIndexes((s) => this.canAct(s));
    if (this.street === 'river') {
      this.showdown();
      return;
    }
    if (actors.length <= 1 && live.length >= 2) {
      this.runout = true;
      const shown: ShownHand[] = live.map((i) => {
        const s = this.seats[i]!;
        s.shown = true;
        return { seat: i, cards: s.hole!, hand: null };
      });
      this.pending.push({ type: 'allInRunout', shown });
      if (this.options.runoutDelayMs <= 0) {
        while (this.board.length < 5) this.dealStreet();
        this.showdown();
      } else {
        this.runoutNextAt = this.deps.clock.now() + this.options.runoutDelayMs;
      }
      return;
    }
    this.dealStreet();
    const first = this.nextActor(this.buttonSeat!);
    if (first === null) this.endRound();
    else this.setTurn(first);
  }

  private dealStreet(): void {
    this.deck.pop(); // burn
    let street: Exclude<Street, 'preflop'>;
    let cards: Card[];
    if (this.board.length === 0) {
      street = 'flop';
      cards = [this.deck.pop()!, this.deck.pop()!, this.deck.pop()!];
    } else if (this.board.length === 3) {
      street = 'turn';
      cards = [this.deck.pop()!];
    } else {
      street = 'river';
      cards = [this.deck.pop()!];
    }
    this.board.push(...cards);
    this.street = street;
    this.phase = street;
    if (this.record) this.record.board = [...this.board];
    this.pending.push({ type: 'streetDealt', street, cards });
  }

  private winUncontested(seat: SeatIndex): void {
    this.toAct = null;
    this.turn = null;
    this.returnUncalled();
    this.pots = this.buildPots();
    const total = this.pots.reduce((t, p) => t + p.amount, 0);
    const s = this.seats[seat]!;
    s.stack += total;
    const results: PotResult[] = this.pots.map((p) => ({ potIndex: p.index, amount: p.amount, winners: [{ seat, amount: p.amount }], winningHand: null }));
    for (const r of results) this.pending.push({ type: 'potAwarded', result: r });
    this.log(seat, `wins ${chips(total)}`);
    this.finishHand('handComplete', results, []);
  }

  private showdown(): void {
    this.phase = 'showdown';
    this.runout = false;
    this.toAct = null;
    this.turn = null;
    const live = this.seatIndexes((s) => this.inHand(s));
    const start = this.lastAggressor !== null && live.includes(this.lastAggressor) ? this.lastAggressor : this.nextOf(this.buttonSeat!, live);
    const order = this.orderFrom(start, live);
    const ranks = new Map<SeatIndex, HandRank>();
    for (const i of order) ranks.set(i, this.deps.evaluator.rankBest([...this.seats[i]!.hole!, ...this.board]));

    const shown: ShownHand[] = [];
    const mucked: SeatIndex[] = [];
    let bestShown = -1;
    for (const i of order) {
      const s = this.seats[i]!;
      const r = ranks.get(i)!;
      const mustShow = this.config.autoShowAtShowdown || s.shown || r.value >= bestShown;
      if (mustShow) {
        s.shown = true;
        bestShown = Math.max(bestShown, r.value);
        const h: ShownHand = { seat: i, cards: s.hole!, hand: r };
        shown.push(h);
        this.pending.push({ type: 'cardsShown', hand: h });
        this.log(i, `shows ${r.label.toLowerCase()}`);
      } else {
        mucked.push(i);
        this.pending.push({ type: 'mucked', seat: i });
        this.log(i, 'mucks');
      }
    }

    const results: PotResult[] = [];
    for (const pot of this.pots) {
      const contenders = pot.eligibleSeats.filter((i) => shown.some((h) => h.seat === i));
      const best = Math.max(...contenders.map((i) => ranks.get(i)!.value));
      const winners = this.orderFrom(this.nextOf(this.buttonSeat!, contenders), contenders).filter((i) => ranks.get(i)!.value === best);
      const share = Math.floor(pot.amount / winners.length);
      let odd = pot.amount - share * winners.length;
      const paid = winners.map((i) => {
        const extra = odd > 0 ? 1 : 0;
        odd -= extra;
        return { seat: i, amount: share + extra };
      });
      for (const p of paid) this.seats[p.seat]!.stack += p.amount;
      const r: PotResult = { potIndex: pot.index, amount: pot.amount, winners: paid, winningHand: ranks.get(winners[0]!)! };
      results.push(r);
      this.pending.push({ type: 'potAwarded', result: r });
      for (const p of paid) this.log(p.seat, `wins ${chips(p.amount)} from the ${pot.label.toLowerCase()}`);
    }
    this.finishHand('showdown', results, mucked, shown);
  }

  private finishHand(phase: 'showdown' | 'handComplete', pots: PotResult[], mucked: SeatIndex[], shown: ShownHand[] = []): void {
    for (const i of this.seatIndexes(() => true)) this.seats[i]!.totalIn = 0;
    this.result = {
      handNumber: this.handNumber,
      uncalledReturned: this.uncalled,
      pots,
      shown,
      mucked,
      splitPot: pots.some((p) => p.winners.length > 1),
    };
    this.uncalled = null;
    this.phase = phase;
    if (this.record) {
      this.record.result = this.result;
      this.hands.push(this.record);
      if (this.hands.length > HISTORY_LIMIT) this.hands.shift();
    }
    this.pending.push({ type: 'handEnded', handNumber: this.handNumber });

    // Busts.
    const busted = this.seatIndexes((s) => s.stack === 0 && s.status !== 'sittingOut' && s.status !== 'busted' && s.handStartStack > 0);
    for (const i of busted) {
      this.seats[i]!.status = 'busted';
      this.pending.push({ type: 'seatChanged', seat: i, change: 'busted' });
    }
    if (this.config.gameType === 'sitAndGo' && busted.length) this.placeSitAndGoBusts(busted);
    if (this.endRequested) this.finishTable();
  }

  private placeSitAndGoBusts(busted: SeatIndex[]): void {
    const alive = this.seatIndexes((s) => s.stack > 0).length;
    // Bigger stack at the start of the hand places higher; equal stacks share the place.
    const sorted = [...busted].sort((a, b) => this.seats[b]!.handStartStack - this.seats[a]!.handStartStack);
    let place = alive + 1;
    let k = 0;
    while (k < sorted.length) {
      const stack = this.seats[sorted[k]!]!.handStartStack;
      const group = sorted.filter((i) => this.seats[i]!.handStartStack === stack);
      for (const i of group) {
        const s = this.seats[i]!;
        this.standings.push({ playerId: s.info.id, name: s.info.name, place });
      }
      place += group.length;
      k += group.length;
    }
    if (alive === 1) {
      const w = this.seatIndexes((s) => s.stack > 0)[0]!;
      const s = this.seats[w]!;
      this.standings.push({ playerId: s.info.id, name: s.info.name, place: 1 });
      this.finishTable();
    }
  }

  private finishTable(): void {
    this.status = 'finished';
    this.endRequested = false;
    const standings = [...this.standings].sort((a, b) => a.place - b.place);
    this.standings = standings;
    this.pending.push({ type: 'tableFinished', standings });
  }

  /** Chip check after every step: stacks + chips in the hand = chips that entered the table. */
  private checkLedger(): void {
    let total = 0;
    for (const s of this.seats) if (s) total += s.stack + s.totalIn;
    if (total !== this.ledger) {
      throw new Error(`Chip check failed: table holds ${total}, expected ${this.ledger}`);
    }
  }

  private legalFor(seat: SeatIndex): LegalActions {
    const s = this.seats[seat]!;
    const big = this.blinds().big;
    const small = this.blinds().small;
    const toCall = Math.max(0, this.currentBet - s.committed);
    const maxTo = s.committed + s.stack;
    const reopened = !s.acted || this.currentBet - s.actedAtBet >= this.lastFullRaise;
    const canPutMore = s.stack > toCall && reopened;

    const call = toCall > 0 ? { amount: Math.min(toCall, s.stack), allIn: s.stack <= toCall } : null;
    let bet: LegalActions['bet'] = null;
    let raise: LegalActions['raise'] = null;
    if (canPutMore && this.currentBet === 0) {
      bet = { minTo: Math.min(big, maxTo), maxTo };
    } else if (canPutMore) {
      const minTo = this.currentBet + this.lastFullRaise;
      if (maxTo >= minTo) raise = { minTo, maxTo };
    }
    const allIn = canPutMore ? { to: maxTo } : null;

    const presets: SizePreset[] = [];
    const range = bet ?? raise;
    if (range) {
      const inMiddle = this.pots.reduce((t, p) => t + p.amount, 0) + this.seatIndexes(() => true).reduce((t, i) => t + this.seats[i]!.committed, 0);
      const potRaise = inMiddle + toCall;
      const round = (v: number) => Math.round(v / small) * small;
      const clamp = (v: number) => Math.min(range.maxTo, Math.max(range.minTo, v));
      const base = bet ? 0 : this.currentBet;
      const candidates: [SizePresetId, number][] = [
        ['min', range.minTo],
        ['halfPot', clamp(round(base + potRaise / 2))],
        ['threeQuarterPot', clamp(round(base + (potRaise * 3) / 4))],
        ['pot', clamp(round(base + potRaise))],
        ['allIn', range.maxTo],
      ];
      for (const [id, to] of candidates) {
        const dup = presets.findIndex((p) => p.to === to);
        if (dup === -1) presets.push({ id, to });
        else if (id === 'allIn') presets[dup] = { id, to };
      }
    }

    return {
      fold: true,
      check: toCall === 0,
      call,
      bet,
      raise,
      allIn,
      step: big,
      presets,
      defaultFocus: toCall === 0 ? 'check' : 'call',
    };
  }

  private seatView(i: SeatIndex, s: SeatState): SeatView {
    return {
      seat: i,
      player: s.info,
      stack: s.stack,
      committed: s.committed,
      status: s.status,
      dealtIn: s.hole !== null && s.status !== 'folded' && s.status !== 'sittingOut',
      shownCards: s.shown && s.hole ? s.hole : null,
      lastAction: s.lastAction,
      timeBankLeftMs: s.timeBankLeftMs,
      connected: true,
    };
  }

  private meView(seat: SeatIndex): MeView | null {
    const s = this.seats[seat];
    if (!s) return null;
    const myTurn = this.toAct === seat && this.isStreet() && !this.runout;
    const waiting = this.isStreet() && !this.runout && s.status === 'inHand' && s.stack > 0 && !myTurn;
    const facing = s.committed < this.currentBet;
    const between = !this.isStreet();
    const live = this.result?.pots.flatMap((p) => p.winners.map((w) => w.seat)) ?? [];
    return {
      seat,
      holeCards: s.hole,
      handLabel: s.hole ? this.deps.evaluator.describe([...s.hole, ...this.board]) : null,
      legal: myTurn ? this.legalFor(seat) : null,
      preAction: s.preAction,
      preActionsAvailable: waiting ? (facing ? ['checkFold', 'callAny'] : ['checkFold', 'check', 'callAny']) : [],
      canShow: this.phase === 'handComplete' && !s.shown && s.hole !== null && live.includes(seat),
      canMuck: false,
      topUp:
        this.config.gameType === 'home' && between && s.stack < this.config.startingStack
          ? { to: this.config.startingStack }
          : null,
      timeoutsInARow: s.timeoutsInARow,
      myShuffleOpenings: null,
    };
  }

  private flush(result: Result): Result {
    this.checkLedger();
    if (this.pending.length) {
      const events = this.pending;
      this.pending = [];
      for (const l of [...this.listeners]) l(events);
    }
    return result;
  }
}

export const createPlaceholderEngine: CreatePokerEngine = (tableId, config, deps, restore) => {
  const engine = new PlaceholderPokerEngine(tableId, config, deps);
  if (restore) engine.restore(restore);
  return engine;
};
