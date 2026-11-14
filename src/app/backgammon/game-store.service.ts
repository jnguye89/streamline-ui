import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import {
  Board,
  DiceLedger,
  Destination,
  Die,
  MatchConfig,
  Origin,
  Play,
  ResultKind,
  Side,
  Snapshot,
  Step,
  allHome,
  opponent,
  own,
} from '@skriin/backgammon-core';
import {
  Geo,
  XY,
  barChecker,
  barKey,
  diceCenter,
  landingXY,
  offSlab,
  originXY,
  pointChecker,
  pointKey,
  topKey,
} from './board-geometry';
import {
  DEFAULT_SETTINGS,
  LEVELS,
  MATCH_LENGTHS,
  Seat,
  Settings,
  THEMES,
  TvAction,
} from './backgammon.types';
import { BACKGAMMON_ENGINE, BACKGAMMON_PREVIEW } from './engine/engine.tokens';
import { SCENARIOS } from './engine/preview-states';
import { SoundService } from './sound.service';

/** Something the cursor can land on. Only legal choices ever become candidates. */
export type Cand =
  | { readonly id: string; readonly kind: 'origin'; readonly origin: Origin; readonly xy: XY }
  | {
      readonly id: string;
      readonly kind: 'dest';
      readonly dest: Destination;
      readonly xy: XY;
      readonly label: string;
      readonly hits: readonly XY[];
    }
  | { readonly id: string; readonly kind: 'button'; readonly button: 'roll' | 'double' | 'done'; readonly xy: XY };

export interface DieView {
  readonly value: Die;
  readonly used: boolean;
}

export interface DiceGroup {
  readonly key: string;
  readonly side: Side;
  readonly at: XY;
  readonly dice: readonly DieView[];
  readonly rolling: boolean;
  readonly winner: boolean;
}

export interface Arrow {
  readonly from: XY;
  readonly to: XY;
}

type Overlay = 'none' | 'menu' | 'resign' | 'verify';

/** Animation and pacing (ms). */
const STEP_MS = 300;
const ROLL_MS = 600;
const OPENING_HOLD_MS = 1100;
const OPENING_AUTO_MS = 900;
const AUTO_ROLL_MS = 700;
const GRACE_MS = 1500;
const NO_MOVES_MS = 1500;
const CUBE_NOTE_MS = 1500;
const RESULT_DELAY_MS = 700;
const SETTINGS_KEY = 'skriin.backgammon.settings.v1';

@Injectable()
export class GameStore {
  private readonly engine = inject(BACKGAMMON_ENGINE);
  private readonly preview = inject(BACKGAMMON_PREVIEW, { optional: true });
  private readonly sound = inject(SoundService);

  // ── State ───────────────────────────────────────────────────────────────
  readonly settings = signal<Settings>(loadSettings());
  readonly screen = signal<'start' | 'playing'>('start');
  readonly overlay = signal<Overlay>('none');
  /** What the screen shows. Lags the engine while events animate. */
  readonly view = signal<Snapshot>(this.engine.snapshot());
  readonly animating = signal(false);
  readonly rolling = signal<Side | 'opening' | null>(null);
  readonly openingShow = signal<{ dice: readonly [Die, Die]; tie: boolean; settled: boolean } | null>(null);
  /** Checker key → where it flies in from (one move). */
  readonly arrivals = signal<ReadonlyMap<string, XY>>(new Map());
  readonly selection = signal<Origin | null>(null);
  readonly hint = signal<Play | null>(null);
  readonly hintPending = signal(false);
  readonly toast = signal<string | null>(null);
  /** "Computer takes." etc., shown in the cube spotlight for a moment. */
  readonly cubeNote = signal<string | null>(null);
  /** Turn ends by itself after this grace (ms) — drives the "X to undo" bar. */
  readonly grace = signal<number | null>(null);
  readonly resultReady = signal(false);
  readonly previewIndex = signal<number | null>(null);
  readonly elapsed = signal(0);
  readonly ledger = signal<DiceLedger | null>(null);
  private readonly rawFocus = signal<string | null>(null);

  private queue: Snapshot[] = [];
  private pumping = false;
  private readonly animTimers = new Set<ReturnType<typeof setTimeout>>();
  private readonly autoTimers = new Set<ReturnType<typeof setTimeout>>();
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private clock: ReturnType<typeof setInterval> | null = null;
  private lastFocusXY: XY | null = null;
  private autoSelected = false;

  // ── Derived ─────────────────────────────────────────────────────────────
  readonly geo = computed<Geo>(() => ({ view: this.view().localSides[0] ?? 0, mirror: this.settings().homeLeft }));
  readonly bottom = computed<Side>(() => this.geo().view);
  readonly seats = computed<readonly [Seat, Seat]>(() =>
    this.view().config.mode === 'couch'
      ? [
          { side: 0, name: 'Player 1', possessive: 'Player 1’s', isBot: false },
          { side: 1, name: 'Player 2', possessive: 'Player 2’s', isBot: false },
        ]
      : [
          { side: 0, name: 'You', possessive: 'Your', isBot: false },
          { side: 1, name: 'Computer', possessive: 'Computer’s', isBot: true },
        ],
  );
  readonly playing = computed(() => this.screen() === 'playing');
  readonly paused = computed(() => this.overlay() !== 'none');
  readonly localTurn = computed(() => {
    const v = this.view();
    return this.playing() && v.localSides.includes(v.turn);
  });
  readonly canAct = computed(() => this.localTurn() && !this.animating() && !this.paused());

  readonly movable = computed<readonly Origin[]>(() => {
    const v = this.view();
    if (!this.canAct() || v.phase !== 'moving') return [];
    return this.engine.movable();
  });
  readonly dests = computed<readonly Destination[]>(() => {
    const sel = this.selection();
    if (sel === null || !this.movable().includes(sel)) return [];
    return this.engine.destinations(sel);
  });
  readonly activeSelection = computed(() => {
    const sel = this.selection();
    return sel !== null && this.movable().includes(sel) ? sel : null;
  });

  readonly candidates = computed<readonly Cand[]>(() => {
    const v = this.view();
    const g = this.geo();
    if (!this.canAct()) return [];
    if (v.phase === 'pre-roll' && v.canDouble) {
      const c = diceCenter(g, v.turn);
      return [
        { id: 'b:roll', kind: 'button', button: 'roll', xy: { x: c.x - 110, y: c.y } },
        { id: 'b:double', kind: 'button', button: 'double', xy: { x: c.x + 110, y: c.y } },
      ];
    }
    if (v.phase === 'turn-done' && !v.noMoves && !this.settings().autoFinish) {
      return [{ id: 'b:done', kind: 'button', button: 'done', xy: diceCenter(g, v.turn) }];
    }
    if (v.phase !== 'moving') return [];
    const sel = this.activeSelection();
    if (sel !== null) return this.destCands(v, g, this.dests());
    return this.movable().map((o) => ({ id: `o:${o}`, kind: 'origin' as const, origin: o, xy: originXY(g, v.board, v.turn, o) }));
  });

  readonly focus = computed<Cand | null>(() => {
    const c = this.candidates();
    if (!c.length) return null;
    const f = this.rawFocus();
    return c.find((x) => x.id === f) ?? this.defaultFocus(c);
  });

  readonly dice = computed<readonly DiceGroup[]>(() => {
    const v = this.view();
    const g = this.geo();
    const op = this.openingShow();
    if (op) {
      const winner: Side | null = op.settled && !op.tie ? (op.dice[0] > op.dice[1] ? 0 : 1) : null;
      return ([0, 1] as const).map((side) => ({
        key: `open${side}`,
        side,
        at: diceCenter(g, side),
        dice: [{ value: op.dice[side], used: false }],
        rolling: this.rolling() === 'opening',
        winner: winner === side,
      }));
    }
    if (!v.dice) return [];
    const all: Die[] = v.dice[0] === v.dice[1] ? [v.dice[0], v.dice[0], v.dice[0], v.dice[0]] : [v.dice[0], v.dice[1]];
    const left = [...v.diceLeft];
    const usedCount = all.length - left.length;
    const list: DieView[] =
      v.dice[0] === v.dice[1]
        ? all.map((value, i) => ({ value, used: i < usedCount }))
        : all.map((value) => {
            const i = left.indexOf(value);
            if (i >= 0) {
              left.splice(i, 1);
              return { value, used: false };
            }
            return { value, used: true };
          });
    return [{ key: `turn${v.turn}`, side: v.turn, at: diceCenter(g, v.turn), dice: list, rolling: this.rolling() === v.turn, winner: false }];
  });

  /** Hint drawn as ghost arrows. */
  readonly hintArrows = computed<readonly Arrow[]>(() => {
    const h = this.hint();
    const v = this.view();
    if (!h) return [];
    const g = this.geo();
    let b = v.board;
    const out: Arrow[] = [];
    for (const st of h.steps) {
      out.push({ from: originXY(g, b, v.turn, st.from), to: landingXY(g, b, v.turn, st.to) });
      b = displayStep(b, v.turn, st);
    }
    return out;
  });

  readonly ghost = computed<{ xy: XY; side: Side; off: boolean } | null>(() => {
    const f = this.focus();
    if (f?.kind !== 'dest') return null;
    return { xy: f.xy, side: this.view().turn, off: f.dest.to === 'off' };
  });

  readonly bearingOff = computed(() => {
    const v = this.view();
    return allHome(v.board, v.turn);
  });

  constructor() {
    this.sound.enabled = this.settings().sound;
    const off = this.engine.subscribe((s) => this.enqueue(s));
    this.clock = setInterval(() => {
      const p = this.view().phase;
      if (this.playing() && !this.paused() && p !== 'game-over' && p !== 'match-over') this.elapsed.update((s) => s + 1);
    }, 1000);
    inject(DestroyRef).onDestroy(() => {
      off();
      this.clearAnim();
      this.clearAuto();
      if (this.clock) clearInterval(this.clock);
      if (this.toastTimer) clearTimeout(this.toastTimer);
    });
  }

  // ── Game flow ───────────────────────────────────────────────────────────
  start(): void {
    const s = this.settings();
    const config: MatchConfig = {
      length: s.matchLength,
      cube: s.cube,
      jacoby: s.jacoby,
      mode: s.mode,
      level: s.level,
    };
    this.resetUi();
    this.previewIndex.set(null);
    this.screen.set('playing');
    this.overlay.set('none');
    this.engine.newMatch(config);
  }

  nextGame(): void {
    this.resetUi();
    this.engine.nextGame();
  }

  toStartScreen(): void {
    this.resetUi();
    this.previewIndex.set(null);
    this.overlay.set('none');
    this.screen.set('start');
  }

  openMenu(): void {
    if (!this.playing()) return;
    this.clearAuto();
    this.grace.set(null);
    this.overlay.set('menu');
  }

  closeOverlay(): void {
    this.overlay.set('none');
    if (this.queue.length && !this.pumping) this.pump();
    else if (!this.pumping) this.settle();
  }

  openVerify(): void {
    this.ledger.set(this.engine.diceLedger());
    this.overlay.set('verify');
  }

  openResign(): void {
    const p = this.view().phase;
    if (p === 'pre-roll' || p === 'moving' || p === 'turn-done') this.overlay.set('resign');
    else {
      this.overlay.set('none');
      this.showToast('Resign on a turn in play');
    }
  }

  resign(kind: ResultKind): void {
    this.overlay.set('none');
    this.selection.set(null);
    this.hint.set(null);
    this.engine.offerResign(kind);
  }

  answerDouble(take: boolean): void {
    this.sound.play('select');
    this.engine.answerDouble(take);
  }

  answerResign(accept: boolean): void {
    this.sound.play('select');
    this.engine.answerResign(accept);
  }

  /** Board input while playing (overlays handle their own). */
  handle(a: TvAction): void {
    if (this.animating() && a === 'select') {
      this.skipAnimations();
      return;
    }
    switch (a) {
      case 'up':
      case 'down':
      case 'left':
      case 'right':
        this.moveFocus(a);
        break;
      case 'select':
        this.activate(this.focus());
        break;
      case 'back':
        if (this.activeSelection() !== null && !this.autoSelected) this.deselect();
        else this.openMenu();
        break;
      case 'menu':
        this.openMenu();
        break;
      case 'undo':
        this.undo();
        break;
      case 'hint':
        void this.showHint();
        break;
      default:
        break;
    }
  }

  /** Mouse: pick whatever candidate sits at this spot. */
  clickCand(id: string): void {
    const c = this.candidates().find((x) => x.id === id);
    if (!c) return;
    this.rawFocus.set(id);
    this.activate(c);
  }

  hoverCand(id: string): void {
    if (this.candidates().some((x) => x.id === id)) this.rawFocus.set(id);
  }

  undo(): void {
    const v = this.view();
    if (!this.localTurn() || this.paused()) return;
    if (this.animating()) this.skipAnimations();
    if (!this.view().canUndo || (v.phase !== 'moving' && v.phase !== 'turn-done')) {
      this.showToast('Nothing to undo');
      this.sound.play('error');
      return;
    }
    this.clearAuto();
    this.grace.set(null);
    this.selection.set(null);
    this.autoSelected = false;
    this.hint.set(null);
    this.engine.undo();
  }

  async showHint(): Promise<void> {
    const v = this.view();
    if (!this.canAct() || v.phase !== 'moving' || this.hintPending()) return;
    const seq = v.seq;
    this.hintPending.set(true);
    const play = await this.engine.hint();
    this.hintPending.set(false);
    if (!play || this.view().seq !== seq || !this.canAct()) return;
    this.hint.set(play);
    this.selection.set(null);
    this.autoSelected = false;
    this.rawFocus.set(`o:${play.steps[0].from}`);
    this.sound.play('select');
  }

  // ── Settings ────────────────────────────────────────────────────────────
  patchSettings(patch: Partial<Settings>): void {
    this.settings.update((s) => ({ ...s, ...patch }));
    this.sound.enabled = this.settings().sound;
    saveSettings(this.settings());
  }

  cycle<K extends 'level' | 'matchLength' | 'theme'>(key: K, step: 1 | -1): void {
    const s = this.settings();
    if (key === 'level') this.patchSettings({ level: cycleIn(LEVELS, s.level, step) });
    if (key === 'matchLength') this.patchSettings({ matchLength: cycleIn(MATCH_LENGTHS, s.matchLength, step) });
    if (key === 'theme') this.patchSettings({ theme: cycleIn(THEMES, s.theme, step) });
  }

  toggle(key: 'cube' | 'jacoby' | 'homeLeft' | 'autoFinish' | 'pips' | 'sound'): void {
    this.patchSettings({ [key]: !this.settings()[key] } as Partial<Settings>);
    if (key === 'sound') this.sound.play('select');
  }

  showToast(text: string): void {
    this.toast.set(text);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(null), 2400);
  }

  playUi(kind: 'select' | 'error'): void {
    this.sound.play(kind);
  }

  // ── Preview (review only) ───────────────────────────────────────────────
  previewStep(dir: 1 | -1): void {
    if (!this.preview) return;
    const n = SCENARIOS.length;
    const cur = this.previewIndex();
    const next = cur === null ? (dir === 1 ? 0 : n - 1) : (cur + dir + n) % n;
    this.resetUi();
    this.previewIndex.set(next);
    this.overlay.set('none');
    this.screen.set('playing');
    const sc = SCENARIOS[next];
    this.preview.loadScenario(sc);
    this.resultReady.set(true);
    if (sc.select !== undefined) {
      this.selection.set(sc.select);
      this.autoSelected = false;
    }
  }

  // ── Event queue: one engine event at a time, animated ───────────────────
  private enqueue(s: Snapshot): void {
    this.queue.push(s);
    if (!this.pumping) this.pump();
  }

  private pump(): void {
    if (this.paused()) {
      // Menu (or a screen opened from it) is up: the game waits underneath.
      this.pumping = false;
      return;
    }
    const s = this.queue.shift();
    if (!s) {
      this.pumping = false;
      this.animating.set(false);
      this.settle();
      return;
    }
    this.pumping = true;
    this.animating.set(true);
    this.clearAuto();
    const ms = this.present(s);
    if (ms <= 0) this.pump();
    else this.anim(ms, () => this.pump());
  }

  /** Shows one snapshot; returns how long its animation takes. */
  private present(s: Snapshot): number {
    const prev = this.view();
    const ev = s.event;
    const g = this.geo();
    this.arrivals.set(new Map());
    switch (ev?.type) {
      case 'step': {
        const arr = new Map<string, XY>();
        arr.set(topKey(s.board, ev.side, ev.step.to), originXY(g, prev.board, ev.side, ev.step.from));
        if (ev.step.hit && ev.step.to !== 'off') {
          const o = opponent(ev.side);
          arr.set(barKey(o, s.board.bar[o] - 1), pointChecker(g, ev.step.to, 0, 1));
        }
        this.arrivals.set(arr);
        this.view.set(s);
        this.hint.set(null);
        this.sound.play(ev.step.hit ? 'hit' : ev.step.to === 'off' ? 'bearoff' : 'move');
        return STEP_MS;
      }
      case 'undo': {
        if (ev.steps.length === 1) {
          const st = ev.steps[0];
          const arr = new Map<string, XY>();
          const fromXY = st.to === 'off' ? offSlab(g, ev.side, prev.board.off[ev.side] - 1) : originXY(g, prev.board, ev.side, st.to);
          arr.set(topKey(s.board, ev.side, st.from), fromXY);
          if (st.hit && st.to !== 'off') {
            const o = opponent(ev.side);
            arr.set(pointKey(st.to, o, 0), barChecker(g, o, prev.board.bar[o] - 1, prev.board.bar[o]));
          }
          this.arrivals.set(arr);
        }
        this.resetTurnUi();
        this.view.set(s);
        this.sound.play('select');
        return 220;
      }
      case 'roll':
        this.resetTurnUi();
        this.view.set(s);
        this.rolling.set(ev.side);
        this.sound.play('dice');
        this.anim(ROLL_MS, () => this.rolling.set(null));
        return ROLL_MS;
      case 'opening':
        this.resetTurnUi();
        this.view.set(s);
        this.openingShow.set({ dice: ev.dice, tie: ev.tie, settled: false });
        this.rolling.set('opening');
        this.sound.play('dice');
        this.anim(ROLL_MS, () => {
          this.rolling.set(null);
          this.openingShow.set({ dice: ev.dice, tie: ev.tie, settled: true });
        });
        if (ev.tie) return ROLL_MS;
        this.anim(ROLL_MS + OPENING_HOLD_MS, () => this.openingShow.set(null));
        return ROLL_MS + OPENING_HOLD_MS;
      case 'new-game':
      case 'load':
        this.resetTurnUi();
        this.openingShow.set(null);
        this.cubeNote.set(null);
        this.view.set(s);
        this.elapsed.set(0);
        if (ev.type === 'new-game') this.resultReady.set(false);
        return 0;
      case 'commit':
        this.resetTurnUi();
        this.view.set(s);
        return 120;
      case 'double':
        this.view.set(s);
        this.sound.play('double');
        return 500;
      case 'take':
      case 'drop': {
        const seat = this.seats()[ev.by];
        this.cubeNote.set(`${seat.name} ${seat.name === 'You' ? ev.type : `${ev.type}s`}.`);
        this.view.set(s);
        this.anim(CUBE_NOTE_MS, () => this.cubeNote.set(null));
        return CUBE_NOTE_MS;
      }
      case 'resign-declined': {
        const seat = this.seats()[ev.by];
        this.showToast(`${seat.name} ${seat.name === 'You' ? 'decline' : 'declines'}. Play on.`);
        this.view.set(s);
        return 0;
      }
      case 'game-over': {
        this.resetTurnUi();
        this.view.set(s);
        const youWon = s.localSides.length === 1 ? s.localSides.includes(ev.result.winner) : true;
        this.sound.play(youWon ? 'win' : 'lose');
        this.anim(RESULT_DELAY_MS, () => this.resultReady.set(true));
        return RESULT_DELAY_MS;
      }
      default:
        this.view.set(s);
        return 0;
    }
  }

  /** Press A while things move: jump to the end. */
  private skipAnimations(): void {
    this.clearAnim();
    this.rolling.set(null);
    const op = this.openingShow();
    let last = this.view();
    while (this.queue.length) last = this.queue.shift() ?? last;
    if (op) {
      const ev = last.event;
      this.openingShow.set(last.phase === 'opening' && ev?.type === 'opening' && ev.tie ? { dice: ev.dice, tie: true, settled: true } : null);
    }
    if (this.cubeNote() && last.phase !== 'double-offered') this.cubeNote.set(null);
    if (last.phase === 'game-over' || last.phase === 'match-over') this.resultReady.set(true);
    this.arrivals.set(new Map());
    this.view.set(last);
    this.pumping = false;
    this.animating.set(false);
    this.settle();
  }

  /** Nothing animating: start whatever happens by itself next. */
  private settle(): void {
    this.clearAuto();
    this.grace.set(null);
    const v = this.view();
    if (!this.playing() || this.paused()) return;
    const local = v.localSides.includes(v.turn);
    switch (v.phase) {
      case 'opening':
        if (v.localSides.length) this.auto(OPENING_AUTO_MS, () => this.engine.roll());
        break;
      case 'pre-roll':
        if (local && !v.canDouble) this.auto(AUTO_ROLL_MS, () => this.engine.roll());
        break;
      case 'moving':
        if (local) {
          const m = this.movable();
          if (m.length === 1 && this.activeSelection() === null) {
            this.selection.set(m[0]);
            this.autoSelected = true;
          }
        }
        break;
      case 'turn-done':
        if (!local) break;
        if (v.noMoves) {
          this.auto(NO_MOVES_MS, () => this.engine.commit());
        } else if (this.settings().autoFinish) {
          this.grace.set(GRACE_MS);
          this.auto(GRACE_MS, () => {
            this.grace.set(null);
            this.engine.commit();
          });
        }
        break;
      default:
        break;
    }
  }

  // ── Cursor ──────────────────────────────────────────────────────────────
  private activate(c: Cand | null): void {
    if (!c || !this.canAct()) return;
    this.lastFocusXY = c.xy;
    switch (c.kind) {
      case 'button':
        this.sound.play('select');
        if (c.button === 'roll') this.engine.roll();
        else if (c.button === 'double') this.engine.double();
        else this.engine.commit();
        break;
      case 'origin':
        this.selection.set(c.origin);
        this.autoSelected = false;
        this.rawFocus.set(null);
        this.sound.play('select');
        break;
      case 'dest': {
        const d = c.dest;
        this.selection.set(null);
        this.autoSelected = false;
        this.hint.set(null);
        this.rawFocus.set(d.to === 'off' ? null : `o:${d.to}`);
        this.engine.move(d);
        break;
      }
    }
  }

  private deselect(): void {
    const sel = this.selection();
    this.selection.set(null);
    this.autoSelected = false;
    if (sel !== null) this.rawFocus.set(`o:${sel}`);
  }

  private moveFocus(dir: 'up' | 'down' | 'left' | 'right'): void {
    const from = this.focus();
    if (!from) return;
    let best: Cand | null = null;
    let bestScore = Infinity;
    for (const c of this.candidates()) {
      if (c.id === from.id) continue;
      const dx = c.xy.x - from.xy.x;
      const dy = c.xy.y - from.xy.y;
      const along = dir === 'up' ? -dy : dir === 'down' ? dy : dir === 'left' ? -dx : dx;
      const across = dir === 'up' || dir === 'down' ? Math.abs(dx) : Math.abs(dy);
      if (along <= 4) continue;
      const score = along + across * 2.2;
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (best) {
      this.rawFocus.set(best.id);
      this.lastFocusXY = best.xy;
    }
  }

  private defaultFocus(c: readonly Cand[]): Cand {
    const first = c[0];
    if (first.kind === 'button') return first;
    if (first.kind === 'dest') {
      let best = first;
      for (const x of c) {
        if (x.kind !== 'dest' || best.kind !== 'dest') continue;
        const len = x.dest.steps.length;
        const bLen = best.dest.steps.length;
        if (len < bLen || (len === bLen && x.dest.steps[0].die > best.dest.steps[0].die)) best = x;
      }
      return best;
    }
    const h = this.hint();
    if (h) {
      const hc = c.find((x) => x.kind === 'origin' && x.origin === h.steps[0].from);
      if (hc) return hc;
    }
    if (this.lastFocusXY) {
      const ref = this.lastFocusXY;
      return c.reduce((a, b) => (dist(a.xy, ref) <= dist(b.xy, ref) ? a : b));
    }
    const side = this.view().turn;
    const rank = (x: Cand) => (x.kind === 'origin' ? (x.origin === 'bar' ? 25 : own(side, x.origin)) : 0);
    return c.reduce((a, b) => (rank(b) > rank(a) ? b : a));
  }

  private destCands(v: Snapshot, g: Geo, dests: readonly Destination[]): Cand[] {
    const offs = dests.filter((d) => d.to === 'off');
    return dests.map((d) => {
      let xy = landingXY(g, v.board, v.turn, d.to);
      if (d.to === 'off' && offs.length > 1) {
        const i = offs.indexOf(d);
        xy = { x: xy.x + (i - (offs.length - 1) / 2) * 42, y: xy.y };
      }
      const hits = d.steps.filter((st) => st.hit && st.to !== 'off').map((st) => pointChecker(g, st.to as number, 0, 1));
      return {
        id: `d:${String(d.to)}:${d.steps.map((st) => st.die).join('')}`,
        kind: 'dest' as const,
        dest: d,
        xy,
        label: d.steps.map((st) => st.die).join('·'),
        hits,
      };
    });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────
  private resetTurnUi(): void {
    this.selection.set(null);
    this.autoSelected = false;
    this.hint.set(null);
    this.grace.set(null);
    this.rawFocus.set(null);
  }

  private resetUi(): void {
    this.clearAnim();
    this.clearAuto();
    this.queue = [];
    this.pumping = false;
    this.animating.set(false);
    this.rolling.set(null);
    this.openingShow.set(null);
    this.arrivals.set(new Map());
    this.cubeNote.set(null);
    this.resultReady.set(false);
    this.lastFocusXY = null;
    this.resetTurnUi();
  }

  private anim(ms: number, fn: () => void): void {
    const t = setTimeout(() => {
      this.animTimers.delete(t);
      fn();
    }, ms);
    this.animTimers.add(t);
  }

  private auto(ms: number, fn: () => void): void {
    const t = setTimeout(() => {
      this.autoTimers.delete(t);
      fn();
    }, ms);
    this.autoTimers.add(t);
  }

  private clearAnim(): void {
    for (const t of this.animTimers) clearTimeout(t);
    this.animTimers.clear();
  }

  private clearAuto(): void {
    for (const t of this.autoTimers) clearTimeout(t);
    this.autoTimers.clear();
  }
}

/** Moves one checker on a copy of the board (display only: hint arrows). */
function displayStep(b: Board, side: Side, st: Step): Board {
  const pts = [...b.pts];
  const bar: [number, number] = [b.bar[0], b.bar[1]];
  const off: [number, number] = [b.off[0], b.off[1]];
  const s = side === 0 ? 1 : -1;
  if (st.from === 'bar') bar[side]--;
  else pts[st.from] -= s;
  if (st.to === 'off') off[side]++;
  else {
    if (st.hit) {
      pts[st.to] = 0;
      bar[opponent(side)]++;
    }
    pts[st.to] += s;
  }
  return { pts, bar, off };
}

function dist(a: XY, b: XY): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

function cycleIn<T>(list: readonly T[], cur: T, step: 1 | -1): T {
  const i = list.indexOf(cur);
  return list[(i + step + list.length) % list.length];
}

// ── Local storage (one viewer, one TV; all access guarded) ───────────────────
function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function loadSettings(): Settings {
  try {
    const raw = storage()?.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const s = JSON.parse(raw) as Partial<Settings>;
    const d = DEFAULT_SETTINGS;
    return {
      mode: s.mode === 'couch' ? 'couch' : 'bot',
      level: LEVELS.includes(s.level as Settings['level']) ? (s.level as Settings['level']) : d.level,
      matchLength: MATCH_LENGTHS.includes(s.matchLength as Settings['matchLength'])
        ? (s.matchLength as Settings['matchLength'])
        : d.matchLength,
      cube: s.cube !== false,
      jacoby: s.jacoby !== false,
      theme: THEMES.includes(s.theme as Settings['theme']) ? (s.theme as Settings['theme']) : d.theme,
      homeLeft: s.homeLeft === true,
      autoFinish: s.autoFinish !== false,
      pips: s.pips !== false,
      sound: s.sound !== false,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(s: Settings): void {
  try {
    storage()?.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* settings just won't persist */
  }
}
