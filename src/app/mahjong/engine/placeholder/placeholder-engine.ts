import {
  ActionOption,
  Clock,
  Discard,
  GameConfig,
  HONG_KONG_TILES,
  HandResult,
  MahjongEngine,
  Meld,
  Pace,
  Phase,
  PlayerAction,
  PlayerView,
  Rng,
  Seat,
  SeatPublic,
  Standing,
  TableEvent,
  TileId,
  TileKind,
  ViewListener,
  WINDS,
  WIND_NAME,
  buildTileSet,
  faanToPoints,
  isBonus,
  isSuited,
  kindCounts,
  kindOf,
  nextSeat,
  seededRng,
  settleWin,
  shuffle,
  sortTiles,
  systemClock,
  windKind,
} from '@skriin/mahjong-core';
import { chooseDiscard, wantsPung } from './bot-brain';
import { Shape, shapes } from './hand-shape';
import { Scored, scoreBest } from './rough-scoring';

/**
 * PHASE 1 PLACEHOLDER ENGINE — makes the TV preview playable. Not the real rules.
 *
 * Follows the approved flow (deal 14/13, bonus replacements from the back, claims with
 * Win > Pung/Kong > Chow and head bump, 5 s claim window, exhaustive draw, dealer rotation,
 * quick/full game end) and the approved points + payments. Simplified on purpose:
 * rough scoring (common lines only), no robbing the kong, simple bots on the main thread.
 * Phase 2 swaps this class for mahjong-core's engine + HongKongRules + worker bots behind the same interface.
 */

interface SeatState {
  readonly name: string;
  readonly kind: 'human' | 'bot';
  hand: TileId[];
  drawn: TileId | null;
  melds: Meld[];
  bonus: TileId[];
  discards: Discard[];
  score: number;
  wins: number;
  selfDrawn: number;
  lastDrawReplacement: boolean;
  /** Turn started by claiming a discard (no self-drawn win this turn). */
  justClaimed: boolean;
}

interface ClaimIntent {
  readonly options: ActionOption[];
  action: PlayerAction | null;
}

interface OpenClaim {
  readonly tile: TileId;
  readonly from: Seat;
  readonly endsAt: number;
  readonly windowMs: number;
  readonly intents: Map<Seat, ClaimIntent>;
  readonly humanWaiting: boolean;
}

const THINK: Record<Pace, [number, number]> = { normal: [600, 1500], fast: [250, 600] };
const GAP: Record<Pace, number> = { normal: 450, fast: 180 };

export class PlaceholderEngine implements MahjongEngine {
  readonly name = 'placeholder-phase-1';

  private config: GameConfig | null = null;
  private rng: Rng = Math.random;
  private pace: Pace = 'normal';
  private seats: SeatState[] = [];
  private wall: TileId[] = [];
  private front = 0;
  private back = 0;
  private dealer: Seat = 0;
  private prevailingIdx = 0;
  private dealerNo = 1;
  private repeat = 0;
  private handsPlayed = 0;
  private phase: Phase = 'turn';
  private turn: Seat = 0;
  private lastDiscard: { tile: TileId; from: Seat } | null = null;
  private claim: OpenClaim | null = null;
  private result: HandResult | null = null;
  private standings: Standing[] | null = null;
  private readonly timers = new Set<unknown>();
  private readonly listeners = new Map<Seat, Set<ViewListener>>();
  private pending: TableEvent[] = [];
  private generation = 0;

  constructor(private readonly clock: Clock = systemClock) {}

  // ── MahjongEngine ──────────────────────────────────────────────────────
  start(config: GameConfig): void {
    this.clearTimers();
    this.generation++;
    this.config = config;
    this.pace = config.pace;
    this.rng = seededRng(config.seed ?? Math.floor(Math.random() * 2 ** 31));
    this.seats = config.seats.map((s) => ({
      name: s.name,
      kind: s.kind,
      hand: [],
      drawn: null,
      melds: [],
      bonus: [],
      discards: [],
      score: 0,
      wins: 0,
      selfDrawn: 0,
      lastDrawReplacement: false,
      justClaimed: false,
    }));
    this.dealer = this.rollForDealer();
    this.prevailingIdx = 0;
    this.dealerNo = 1;
    this.repeat = 0;
    this.handsPlayed = 0;
    this.standings = null;
    this.startHand();
  }

  view(seat: Seat): PlayerView | null {
    const cfg = this.config;
    if (!cfg) return null;
    const me = this.seats[seat];
    const options = this.optionsFor(seat);
    const claim =
      this.phase === 'claim' && this.claim && options.length
        ? {
            tile: this.claim.tile,
            from: this.claim.from,
            robbing: false,
            endsAt: this.claim.endsAt,
            windowMs: this.claim.windowMs,
          }
        : null;
    const seats = this.seats.map((s, i): SeatPublic => ({
      seat: i as Seat,
      name: s.name,
      kind: s.kind,
      botLevel: s.kind === 'bot' ? cfg.botLevel : null,
      wind: this.seatWind(i as Seat),
      dealer: i === this.dealer,
      score: s.score,
      concealedCount: s.hand.length,
      hasDrawn: s.hand.length % 3 === 2,
      melds: s.melds.map((m) => ({ ...m, tiles: [...m.tiles] })),
      bonus: [...s.bonus],
      discards: s.discards.map((d) => ({ ...d })),
      connected: true,
    })) as unknown as PlayerView['seats'];
    return {
      you: seat,
      variant: 'hong-kong',
      phase: this.phase,
      round: {
        prevailing: WINDS[Math.min(this.prevailingIdx, 3)],
        dealerNo: this.dealerNo,
        repeat: this.repeat,
        handsPlayed: this.handsPlayed,
        length: cfg.length,
      },
      minFaan: cfg.minFaan,
      wallLeft: this.wallLeft(),
      turn: this.turn,
      seats,
      hand: me.drawn !== null ? me.hand.filter((t) => t !== me.drawn) : [...me.hand],
      drawn: me.drawn,
      lastDiscard: this.lastDiscard,
      options,
      claim,
      result: this.result,
      standings: this.standings,
    };
  }

  subscribe(seat: Seat, listener: ViewListener): () => void {
    // const + explicit init (not `let` + assign-in-if): TypeScript 5.3 doesn't keep the narrowing
    // inside the returned closure.
    const set = this.listeners.get(seat) ?? new Set<ViewListener>();
    this.listeners.set(seat, set);
    set.add(listener);
    return () => set.delete(listener);
  }

  act(seat: Seat, action: PlayerAction): void {
    const options = this.optionsFor(seat);
    const option = options.find((o) => sameAction(o.action, action));
    if (!option) return;
    if (this.phase === 'claim' && this.claim) {
      const intent = this.claim.intents.get(seat);
      if (!intent || intent.action) return;
      intent.action = action;
      if (this.everyHumanDecided()) this.resolveClaims();
      else this.notify();
      return;
    }
    switch (action.type) {
      case 'discard':
        this.doDiscard(seat, action.tile);
        break;
      case 'win':
        this.doWin(seat, null);
        break;
      case 'kong':
        this.doTurnKong(seat, option);
        break;
      case 'next':
        this.nextHand();
        break;
      default:
        break;
    }
  }

  setPace(pace: Pace): void {
    this.pace = pace;
  }

  dispose(): void {
    this.clearTimers();
    this.generation++;
    this.listeners.clear();
  }

  /** Test helper: every tile accounted for (must always be 144). */
  audit(): number {
    // A claimed discard lives in a meld (or the winner's hand), so only unclaimed discards count here.
    let n = this.wallLeft();
    for (const s of this.seats) {
      n += s.hand.length + s.bonus.length + s.discards.filter((d) => !d.claimed).length;
      for (const m of s.melds) n += m.tiles.length;
    }
    return n;
  }

  // ── Hand flow ──────────────────────────────────────────────────────────
  private startHand(): void {
    for (const s of this.seats) {
      s.hand = [];
      s.drawn = null;
      s.melds = [];
      s.bonus = [];
      s.discards = [];
      s.lastDrawReplacement = false;
      s.justClaimed = false;
    }
    this.wall = shuffle(buildTileSet(HONG_KONG_TILES), this.rng);
    this.front = 0;
    this.back = this.wall.length;
    this.result = null;
    this.claim = null;
    this.lastDiscard = null;

    // Deal from the break: 4 tiles at a time ×3, then 1 each; the dealer takes a 14th.
    for (let r = 0; r < 3; r++)
      for (let i = 0; i < 4; i++) this.seat(this.dealer, i).hand.push(...this.takeFront(4));
    for (let i = 0; i < 4; i++) this.seat(this.dealer, i).hand.push(...this.takeFront(1));
    this.seats[this.dealer].hand.push(...this.takeFront(1));

    // Bonus tiles: dealer first, then turn order, repeat until nobody holds one.
    let again = true;
    while (again) {
      again = false;
      for (let i = 0; i < 4; i++) {
        const seat = ((this.dealer + i) % 4) as Seat;
        const s = this.seats[seat];
        let idx = s.hand.findIndex((t) => isBonus(kindOf(t)));
        while (idx >= 0) {
          const [tile] = s.hand.splice(idx, 1);
          s.bonus.push(tile);
          this.pending.push({ type: 'bonus', seat, tile });
          s.hand.push(this.wall[--this.back]);
          again = true;
          idx = s.hand.findIndex((t) => isBonus(kindOf(t)));
        }
      }
    }

    const d = this.seats[this.dealer];
    d.drawn = d.hand[d.hand.length - 1];
    this.phase = 'turn';
    this.turn = this.dealer;
    this.pending.push({ type: 'hand-start', label: this.handLabel() });
    this.notify();
    this.scheduleTurn();
  }

  private scheduleTurn(): void {
    if (this.phase !== 'turn') return;
    const seat = this.turn;
    if (this.seats[seat].kind === 'bot') this.later(this.thinkMs(), () => this.botTurn(seat));
  }

  private botTurn(seat: Seat): void {
    if (this.phase !== 'turn' || this.turn !== seat) return;
    const opts = this.turnOptions(seat);
    if (opts.some((o) => o.action.type === 'win')) {
      this.doWin(seat, null);
      return;
    }
    const kong = opts.find((o) => o.action.type === 'kong');
    if (kong && this.rng() < 0.7) {
      this.doTurnKong(seat, kong);
      return;
    }
    const s = this.seats[seat];
    this.doDiscard(seat, chooseDiscard(s.hand, this.valuable(seat), this.rng));
  }

  private doDiscard(seat: Seat, tile: TileId): void {
    const s = this.seats[seat];
    const i = s.hand.indexOf(tile);
    if (i < 0) return;
    s.hand.splice(i, 1);
    s.drawn = null;
    s.justClaimed = false;
    s.lastDrawReplacement = false;
    s.discards.push({ tile, claimed: false });
    this.lastDiscard = { tile, from: seat };
    this.pending.push({ type: 'discard', seat, tile });
    this.openClaims(tile, seat);
  }

  private openClaims(tile: TileId, from: Seat): void {
    const cfg = this.config!;
    const intents = new Map<Seat, ClaimIntent>();
    const finalDiscard = this.wallLeft() === 0;
    for (let i = 1; i < 4; i++) {
      const seat = ((from + i) % 4) as Seat;
      const options = this.claimOptions(seat, tile, from, finalDiscard);
      if (!options.length) continue;
      options.push({ action: { type: 'pass' } });
      const intent: ClaimIntent = { options, action: null };
      if (this.seats[seat].kind === 'bot') intent.action = this.botClaim(seat, tile, options);
      intents.set(seat, intent);
    }
    if (!intents.size) {
      this.notify();
      this.later(GAP[this.pace], () => this.afterDiscard(from));
      return;
    }
    const humanWaiting = [...intents.keys()].some((s) => this.seats[s].kind === 'human');
    const windowMs = cfg.claimWindowMs;
    this.phase = 'claim';
    this.claim = {
      tile,
      from,
      endsAt: this.clock.now() + windowMs,
      windowMs,
      intents,
      humanWaiting,
    };
    this.notify();
    if (humanWaiting) this.later(windowMs, () => this.autoPass());
    else this.later(this.thinkMs() * 0.6, () => this.resolveClaims());
  }

  private autoPass(): void {
    if (!this.claim) return;
    for (const [seat, it] of this.claim.intents)
      if (this.seats[seat].kind === 'human' && !it.action) it.action = { type: 'pass' };
    this.resolveClaims();
  }

  private everyHumanDecided(): boolean {
    if (!this.claim) return true;
    return [...this.claim.intents].every(
      ([s, it]) => this.seats[s].kind !== 'human' || it.action !== null,
    );
  }

  private resolveClaims(): void {
    const c = this.claim;
    if (!c) return;
    this.claim = null;
    const order = [1, 2, 3].map((i) => ((c.from + i) % 4) as Seat);
    const chosen = (s: Seat) => c.intents.get(s)?.action ?? null;
    // Win first; several wins → the first in turn order after the discarder (head bump).
    const winner = order.find((s) => chosen(s)?.type === 'win');
    if (winner !== undefined) {
      this.doWin(winner, c.from);
      return;
    }
    const punger = order.find((s) => chosen(s)?.type === 'pung' || chosen(s)?.type === 'kong');
    if (punger !== undefined) {
      this.applyClaim(punger, chosen(punger)!, c.tile, c.from);
      return;
    }
    const next = nextSeat(c.from);
    if (chosen(next)?.type === 'chow') {
      this.applyClaim(next, chosen(next)!, c.tile, c.from);
      return;
    }
    this.phase = 'turn';
    this.afterDiscard(c.from);
  }

  private afterDiscard(from: Seat): void {
    if (this.phase !== 'turn' && this.phase !== 'claim') return;
    this.phase = 'turn';
    this.turn = nextSeat(from);
    if (!this.draw(this.turn, false)) return;
    this.notify();
    this.scheduleTurn();
  }

  /** Draws for a seat (front, or back for replacements), setting bonus tiles aside. false = wall empty. */
  private draw(seat: Seat, fromBack: boolean): boolean {
    const s = this.seats[seat];
    let replacement = fromBack;
    for (;;) {
      if (this.wallLeft() === 0) {
        this.exhaustiveDraw();
        return false;
      }
      const tile = replacement ? this.wall[--this.back] : this.wall[this.front++];
      if (isBonus(kindOf(tile))) {
        s.bonus.push(tile);
        this.pending.push({ type: 'bonus', seat, tile });
        replacement = true;
        continue;
      }
      s.hand.push(tile);
      s.drawn = tile;
      s.lastDrawReplacement = replacement;
      this.pending.push({ type: 'draw', seat });
      return true;
    }
  }

  private applyClaim(seat: Seat, action: PlayerAction, tile: TileId, from: Seat): void {
    if (action.type !== 'pung' && action.type !== 'chow' && action.type !== 'kong') return;
    const s = this.seats[seat];
    const pond = this.seats[from].discards;
    pond[pond.length - 1] = { tile, claimed: true };
    for (const t of action.tiles) s.hand.splice(s.hand.indexOf(t), 1);
    const tiles =
      action.type === 'chow' ? sortTiles([...action.tiles, tile]) : [...action.tiles, tile];
    s.melds.push({
      type: action.type,
      tiles,
      concealed: false,
      claimed: { tile, from },
      promoted: false,
    });
    this.pending.push({ type: 'claim', seat, meld: action.type, from });
    this.lastDiscard = null;
    this.turn = seat;
    this.phase = 'turn';
    s.justClaimed = true;
    if (action.type === 'kong') {
      if (!this.draw(seat, true)) return;
    } else {
      s.drawn = null;
    }
    this.notify();
    this.scheduleTurn();
  }

  private doTurnKong(seat: Seat, option: ActionOption): void {
    if (option.action.type !== 'kong') return;
    const s = this.seats[seat];
    const tiles = option.action.tiles;
    if (option.kongKind === 'concealed') {
      for (const t of tiles) s.hand.splice(s.hand.indexOf(t), 1);
      s.melds.push({
        type: 'kong',
        tiles: [...tiles],
        concealed: true,
        claimed: null,
        promoted: false,
      });
    } else {
      const t = tiles[0];
      const mi = s.melds.findIndex((m) => m.type === 'pung' && kindOf(m.tiles[0]) === kindOf(t));
      if (mi < 0) return;
      s.hand.splice(s.hand.indexOf(t), 1);
      const m = s.melds[mi];
      s.melds[mi] = { ...m, type: 'kong', tiles: [...m.tiles, t], promoted: true };
    }
    s.drawn = null;
    s.justClaimed = false;
    this.pending.push({ type: 'kong', seat, kind: option.kongKind ?? 'concealed' });
    if (!this.draw(seat, true)) return;
    this.notify();
    this.scheduleTurn();
  }

  private doWin(seat: Seat, from: Seat | null): void {
    const cfg = this.config!;
    const s = this.seats[seat];
    const selfDrawn = from === null;
    const tile = selfDrawn ? (s.drawn ?? s.hand[s.hand.length - 1]) : this.lastDiscard!.tile;
    const scored = this.evaluateWin(seat, selfDrawn ? null : tile, selfDrawn);
    if (!scored) return;
    if (!selfDrawn) {
      const pond = this.seats[from].discards;
      pond[pond.length - 1] = { tile, claimed: true };
      s.hand.push(tile);
    }
    const points = faanToPoints(scored.total, cfg.faanCap);
    const deltas = settleWin(points, seat, from);
    this.seats.forEach((x, i) => (x.score += deltas[i]));
    s.wins++;
    if (selfDrawn) s.selfDrawn++;
    const dealerStays = seat === this.dealer;
    this.claim = null;
    this.result = {
      kind: 'win',
      winner: seat,
      from,
      selfDrawn,
      hand: {
        melds: s.melds,
        groups: groupTiles(scored.shape, s.hand),
        bonus: [...s.bonus],
        winningTile: tile,
      },
      faan: scored.lines,
      totalFaan: scored.total,
      capped: scored.capped,
      points,
      deltas,
      scores: this.scores(),
      dealerStays,
      nextLabel: this.peekNextLabel(dealerStays),
      gameOver: this.peekNextLabel(dealerStays) === null,
    };
    this.phase = 'hand-over';
    this.pending.push({ type: 'win', seat, selfDrawn });
    this.notify();
    this.autoNextIfNoHumans();
  }

  private exhaustiveDraw(): void {
    this.claim = null;
    this.result = {
      kind: 'draw',
      winner: null,
      from: null,
      selfDrawn: false,
      hand: null,
      faan: [],
      totalFaan: 0,
      capped: false,
      points: 0,
      deltas: [0, 0, 0, 0],
      scores: this.scores(),
      dealerStays: true,
      nextLabel: this.peekNextLabel(true),
      gameOver: this.peekNextLabel(true) === null,
    };
    this.phase = 'hand-over';
    this.pending.push({ type: 'exhaustive-draw' });
    this.notify();
    this.autoNextIfNoHumans();
  }

  private nextHand(): void {
    if (this.phase !== 'hand-over' || !this.result) return;
    this.handsPlayed++;
    if (this.result.dealerStays) this.repeat++;
    else {
      this.dealer = nextSeat(this.dealer);
      this.dealerNo++;
      this.repeat = 0;
      if (this.dealerNo > 4) {
        this.dealerNo = 1;
        this.prevailingIdx++;
      }
    }
    if (this.prevailingIdx >= this.roundsInGame()) {
      this.finishGame();
      return;
    }
    this.startHand();
  }

  private finishGame(): void {
    const order = [0, 1, 2, 3].sort(
      (a, b) => this.seats[b].score - this.seats[a].score || a - b,
    ) as Seat[];
    this.standings = order.map((seat, i) => ({
      seat,
      place: (i + 1) as Standing['place'],
      score: this.seats[seat].score,
      wins: this.seats[seat].wins,
      selfDrawn: this.seats[seat].selfDrawn,
    }));
    this.phase = 'game-over';
    this.pending.push({ type: 'game-over' });
    this.notify();
  }

  private autoNextIfNoHumans(): void {
    if (this.seats.every((s) => s.kind === 'bot'))
      this.later(GAP[this.pace], () => this.nextHand());
  }

  // ── Options ────────────────────────────────────────────────────────────
  private optionsFor(seat: Seat): ActionOption[] {
    if (!this.config) return [];
    if (this.phase === 'hand-over')
      return this.seats[seat].kind === 'human' ? [{ action: { type: 'next' } }] : [];
    if (this.phase === 'claim') {
      const it = this.claim?.intents.get(seat);
      return it && !it.action ? it.options : [];
    }
    if (this.phase === 'turn') return this.turnOptions(seat);
    return [];
  }

  private turnOptions(seat: Seat): ActionOption[] {
    if (this.phase !== 'turn' || this.turn !== seat) return [];
    const s = this.seats[seat];
    if (s.hand.length % 3 !== 2) return [];
    const out: ActionOption[] = [];
    if (!s.justClaimed && this.evaluateWin(seat, null, true)) out.push({ action: { type: 'win' } });
    if (this.wallLeft() > 0) {
      const counts = kindCounts(s.hand);
      for (let k = 0; k < counts.length; k++) {
        if (counts[k] !== 4) continue;
        const tiles = s.hand.filter((t) => kindOf(t) === k);
        out.push({ action: { type: 'kong', tiles }, kongKind: 'concealed', meld: tiles });
      }
      for (const m of s.melds) {
        if (m.type !== 'pung') continue;
        const t = s.hand.find((x) => kindOf(x) === kindOf(m.tiles[0]));
        if (t !== undefined)
          out.push({
            action: { type: 'kong', tiles: [t] },
            kongKind: 'promoted',
            meld: [...m.tiles, t],
          });
      }
    }
    for (const t of s.hand) out.push({ action: { type: 'discard', tile: t } });
    return out;
  }

  private claimOptions(
    seat: Seat,
    tile: TileId,
    from: Seat,
    finalDiscard: boolean,
  ): ActionOption[] {
    const s = this.seats[seat];
    const k = kindOf(tile);
    const out: ActionOption[] = [];
    if (this.evaluateWin(seat, tile, false)) out.push({ action: { type: 'win' } });
    if (finalDiscard) return out; // only Win on the final discard
    const same = s.hand.filter((t) => kindOf(t) === k);
    if (same.length >= 3) {
      const tiles = same.slice(0, 3);
      out.push({ action: { type: 'kong', tiles }, kongKind: 'exposed', meld: [...tiles, tile] });
    }
    if (same.length >= 2)
      out.push({
        action: { type: 'pung', tiles: [same[0], same[1]] },
        meld: [same[0], same[1], tile],
      });
    if (seat === nextSeat(from) && isSuited(k)) {
      const base = Math.floor(k / 9) * 9;
      for (let start = k - 2; start <= k; start++) {
        if (start < base || start + 2 > base + 8) continue;
        const need = [start, start + 1, start + 2].filter((x) => x !== k);
        const a = s.hand.find((t) => kindOf(t) === need[0]);
        const b = s.hand.find((t) => kindOf(t) === need[1]);
        if (a === undefined || b === undefined) continue;
        out.push({ action: { type: 'chow', tiles: [a, b] }, meld: sortTiles([a, b, tile]) });
      }
    }
    return out;
  }

  private botClaim(seat: Seat, tile: TileId, options: readonly ActionOption[]): PlayerAction {
    const find = (t: PlayerAction['type']) => options.find((o) => o.action.type === t)?.action;
    const win = find('win');
    if (win) return win;
    const kong = find('kong');
    if (kong && this.rng() < 0.5) return kong;
    const pung = find('pung');
    if (pung && wantsPung(kindOf(tile), this.valuable(seat), this.rng)) return pung;
    const chow = find('chow');
    if (chow && this.rng() < 0.12) return chow;
    return { type: 'pass' };
  }

  private evaluateWin(seat: Seat, extra: TileId | null, selfDrawn: boolean): Scored | null {
    const cfg = this.config!;
    const s = this.seats[seat];
    const ids = extra === null ? s.hand : [...s.hand, extra];
    if (ids.length % 3 !== 2) return null;
    const all = shapes(kindCounts(ids), s.melds.length);
    if (!all.length) return null;
    const scored = scoreBest(all, {
      melds: s.melds,
      bonus: s.bonus.map(kindOf),
      seatWind: this.seatWind(seat),
      prevailing: WINDS[Math.min(this.prevailingIdx, 3)],
      selfDrawn,
      replacement: selfDrawn && s.lastDrawReplacement,
      lastTile: this.wallLeft() === 0,
      cap: cfg.faanCap,
    });
    return scored && scored.total >= cfg.minFaan ? scored : null;
  }

  // ── Helpers ────────────────────────────────────────────────────────────
  private wallLeft(): number {
    return this.back - this.front;
  }

  private takeFront(n: number): TileId[] {
    const out = this.wall.slice(this.front, this.front + n);
    this.front += n;
    return out;
  }

  private seat(from: Seat, offset: number): SeatState {
    return this.seats[(from + offset) % 4];
  }

  private seatWind(seat: Seat) {
    return WINDS[(seat - this.dealer + 4) % 4];
  }

  private valuable(seat: Seat): ReadonlySet<TileKind> {
    return new Set([
      windKind(this.seatWind(seat)),
      windKind(WINDS[Math.min(this.prevailingIdx, 3)]),
    ]);
  }

  private scores(): [number, number, number, number] {
    return this.seats.map((s) => s.score) as [number, number, number, number];
  }

  private roundsInGame(): number {
    return this.config?.length === 'full' ? 4 : 1;
  }

  private handLabel(): string {
    return `${WIND_NAME[WINDS[this.prevailingIdx]]} round, hand ${this.dealerNo}`;
  }

  private peekNextLabel(dealerStays: boolean): string | null {
    let no = this.dealerNo;
    let pi = this.prevailingIdx;
    if (!dealerStays && ++no > 4) {
      no = 1;
      pi++;
    }
    if (pi >= this.roundsInGame()) return null;
    return `${WIND_NAME[WINDS[pi]]} round, hand ${no}`;
  }

  /** T2: every seat rolls two dice, highest total deals first; ties roll again. */
  private rollForDealer(): Seat {
    let tied: Seat[] = [0, 1, 2, 3];
    for (;;) {
      const rolls = tied.map((s) => ({ s, v: die(this.rng) + die(this.rng) }));
      const top = Math.max(...rolls.map((r) => r.v));
      tied = rolls.filter((r) => r.v === top).map((r) => r.s);
      if (tied.length === 1) return tied[0];
    }
  }

  private thinkMs(): number {
    const [lo, hi] = THINK[this.pace];
    return lo + this.rng() * (hi - lo);
  }

  private later(ms: number, fn: () => void): void {
    const gen = this.generation;
    const h = this.clock.setTimeout(() => {
      this.timers.delete(h);
      if (gen === this.generation) fn();
    }, ms);
    this.timers.add(h);
  }

  private clearTimers(): void {
    for (const h of this.timers) this.clock.clearTimeout(h);
    this.timers.clear();
  }

  private notify(): void {
    const events = this.pending;
    this.pending = [];
    for (const [seat, set] of this.listeners) {
      const v = this.view(seat);
      if (v) for (const fn of [...set]) fn(v, events);
    }
  }
}

const die = (rng: Rng) => 1 + Math.floor(rng() * 6);

function sameAction(a: PlayerAction, b: PlayerAction): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Concealed tiles grouped by the scored shape (sets first, then the pair). */
function groupTiles(shape: Shape, hand: readonly TileId[]): TileId[][] {
  const pool = sortTiles(hand);
  const take = (k: TileKind): TileId => {
    const i = pool.findIndex((t) => kindOf(t) === k);
    return pool.splice(i, 1)[0];
  };
  if (shape.special) return [pool];
  const groups = shape.sets.map((set) =>
    set.type === 'pung'
      ? [take(set.kind), take(set.kind), take(set.kind)]
      : [take(set.kind), take(set.kind + 1), take(set.kind + 2)],
  );
  groups.push([take(shape.pair), take(shape.pair)]);
  return groups;
}
