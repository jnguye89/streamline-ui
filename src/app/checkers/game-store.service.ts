import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import {
  applyToPieces,
  jumpedSquare,
  notation,
  piecesFromPosition,
  screenRC,
  startsWith,
  unique,
} from './board-geometry';
import {
  DisplayPiece,
  LEVELS,
  Level,
  Move,
  MoveRecord,
  Outcome,
  Piece,
  PieceColor,
  Position,
  Screen,
  Settings,
  THEMES,
  ThemeName,
  TvAction,
  opposite,
} from './checkers.types';
import { CHECKERS_ENGINE } from './engine/checkers-engine';
import { SoundService } from './sound.service';

interface Selection {
  readonly from: number;
  readonly hops: readonly number[];
}

interface Snapshot {
  readonly turn: PieceColor;
  readonly pieces: Piece[];
  readonly records: MoveRecord[];
  readonly lastMove: Move | null;
}

/** A game in progress, kept in the browser so it survives the TV box sleeping or restarting. */
interface SavedGame {
  readonly v: 1;
  readonly playerColor: PieceColor;
  readonly level: Level;
  readonly moves: ReadonlyArray<{ from: number; path: number[] }>;
  readonly elapsed: number;
}

export interface SavedGameInfo {
  readonly moves: number;
  readonly level: Level;
  readonly playerColor: PieceColor;
}

/** Time for one hop to slide (matches the CSS transition). */
const HOP_MS = 270;
/** Pause before a forced follow-up jump plays by itself. */
const AUTO_HOP_MS = 420;
/** Shortest visible "thinking" time, so instant replies don't feel abrupt. */
const THINK_MS: Record<Level, number> = { easy: 550, medium: 700, hard: 800 };
/** The computer only considers a draw offer after this many plies, and only when it isn't ahead. */
const DRAW_MIN_PLIES = 20;
const DRAW_ACCEPT_MAX_ADVANTAGE = 25;
const SETTINGS_KEY = 'skriin.checkers.settings.v1';
const SAVE_KEY = 'skriin.checkers.game.v1';

const DEFAULT_SETTINGS: Settings = {
  level: 'medium',
  playerColor: 'dark',
  theme: 'indigo',
  sound: true,
  numbers: true,
};

@Injectable()
export class GameStore {
  private readonly engine = inject(CHECKERS_ENGINE);
  private readonly sound = inject(SoundService);
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private clock: ReturnType<typeof setInterval> | null = null;
  private cpuToken = 0;
  private snapshots: Snapshot[] = [];
  /** Moves played, in order (what gets saved for resume). */
  private moveLog: { from: number; path: number[] }[] = [];
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  // ── State ───────────────────────────────────────────────────────────────
  readonly settings = signal<Settings>(loadSettings());
  readonly screen = signal<Screen>('start');
  readonly paused = signal(false);
  readonly history = signal<Position[]>([this.engine.initial()]);
  readonly pieces = signal<Piece[]>(piecesFromPosition(this.history()[0]));
  readonly records = signal<MoveRecord[]>([]);
  readonly lastMove = signal<Move | null>(null);
  readonly hint = signal<Move | null>(null);
  readonly selection = signal<Selection | null>(null);
  readonly cpuStep = signal<{ move: Move; step: number } | null>(null);
  readonly thinking = signal(false);
  readonly hintPending = signal(false);
  readonly drawPending = signal(false);
  /** A move is animating; input waits. */
  readonly busy = signal(false);
  readonly outcome = signal<Outcome | null>(null);
  readonly elapsed = signal(0);
  readonly tally = signal({ you: 0, cpu: 0, draws: 0 });
  readonly toast = signal<string | null>(null);
  readonly saved = signal<SavedGameInfo | null>(savedInfo(readSave()));
  private readonly rawFocus = signal<number | null>(null);

  // ── Derived ─────────────────────────────────────────────────────────────
  readonly playerColor = computed(() => this.settings().playerColor);
  readonly cpuColor = computed(() => opposite(this.playerColor()));
  readonly position = computed(() => {
    const h = this.history();
    return h[h.length - 1];
  });
  readonly turn = computed(() => this.position().turn);
  readonly isYourTurn = computed(
    () => this.screen() === 'playing' && !this.outcome() && this.turn() === this.playerColor(),
  );
  readonly legal = computed(() => this.engine.legalMoves(this.position()));
  readonly yourMoves = computed(() => (this.isYourTurn() ? this.legal() : []));
  readonly mustJump = computed(() => {
    const m = this.yourMoves();
    return m.length > 0 && m.every((x) => x.captures.length > 0);
  });
  readonly movable = computed(() => unique(this.yourMoves().map((m) => m.from)));
  readonly midJump = computed(() => (this.selection()?.hops.length ?? 0) > 0);
  readonly selMoves = computed(() => {
    const s = this.selection();
    if (!s) return [];
    return this.yourMoves().filter((m) => m.from === s.from && startsWith(m.path, s.hops));
  });
  readonly nextHops = computed(() => {
    const s = this.selection();
    if (!s) return [];
    return unique(
      this.selMoves()
        .filter((m) => m.path.length > s.hops.length)
        .map((m) => m.path[s.hops.length]),
    );
  });
  /** Squares the D-pad can land on right now. */
  readonly candidates = computed(() => {
    if (!this.isYourTurn()) return [];
    const s = this.selection();
    if (!s) return this.movable();
    if (s.hops.length) return this.nextHops();
    return unique([...this.nextHops(), ...this.movable()]);
  });
  readonly focus = computed(() => {
    const f = this.rawFocus();
    const c = this.candidates();
    if (f !== null && c.includes(f)) return f;
    return this.pickDefault(c, f);
  });
  readonly selectedId = computed(() => {
    const s = this.selection();
    if (!s) return null;
    return this.pieces().find((p) => p.sq === s.from)?.id ?? null;
  });
  /** Pieces as drawn, including a move that is part-way through. */
  readonly displayPieces = computed<DisplayPiece[]>(() => {
    const base = this.pieces();
    const cp = this.cpuStep();
    const sel = this.selection();
    let from: number;
    let hops: readonly number[];
    if (cp) {
      from = cp.move.from;
      hops = cp.move.path.slice(0, cp.step);
    } else if (sel && sel.hops.length) {
      from = sel.from;
      hops = sel.hops;
    } else {
      return base.map((p) => ({ ...p, gone: false }));
    }
    const jumped = hops.map((h, i) => jumpedSquare(i === 0 ? from : hops[i - 1], h)).filter((s) => s >= 0);
    const to = hops[hops.length - 1];
    return base.map((p) =>
      p.sq === from ? { ...p, sq: to, gone: false } : { ...p, gone: jumped.includes(p.sq) },
    );
  });
  readonly movingId = computed(() => {
    const cp = this.cpuStep();
    const from = cp ? cp.move.from : this.selection()?.from;
    if (from === undefined) return null;
    return this.pieces().find((p) => p.sq === from)?.id ?? null;
  });
  /**
   * Pieces to ring in red: the one the focused jump takes; otherwise every piece
   * the selected piece (or, when a jump is forced, any piece) can take next.
   */
  readonly threats = computed(() => {
    const s = this.selection();
    if (s) {
      const prev = s.hops.length ? s.hops[s.hops.length - 1] : s.from;
      const f = this.focus();
      const hops = f !== null && this.nextHops().includes(f) ? [f] : this.nextHops();
      return new Set(hops.map((h) => jumpedSquare(prev, h)).filter((x) => x >= 0));
    }
    if (this.mustJump() && !this.busy()) return new Set(this.yourMoves().map((m) => m.captures[0]));
    return new Set<number>();
  });
  /** Ghost of the selected piece on the focused destination. */
  readonly ghost = computed(() => {
    const s = this.selection();
    const f = this.focus();
    if (!s || f === null || !this.nextHops().includes(f)) return null;
    const piece = this.pieces().find((p) => p.sq === s.from);
    if (!piece) return null;
    const hops = [...s.hops, f];
    const king =
      piece.king ||
      this.selMoves().some((m) => m.promotes && m.path.length === hops.length && startsWith(m.path, hops));
    return { color: piece.color, king, sq: f };
  });
  readonly counts = computed(() => {
    const out = { dark: 0, light: 0, darkKings: 0, lightKings: 0 };
    for (const p of this.displayPieces()) {
      if (p.gone) continue;
      out[p.color]++;
      if (p.king) out[p.color === 'dark' ? 'darkKings' : 'lightKings']++;
    }
    return out;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.cancelCpu();
      this.stopClock();
      if (this.toastTimer) clearTimeout(this.toastTimer);
    });
    this.sound.enabled = this.settings().sound;
  }

  // ── Game flow ───────────────────────────────────────────────────────────
  /** Start a new game with the current settings (replaces any saved game). */
  start(): void {
    this.reset();
    clearSave();
    this.saved.set(null);
    this.screen.set('playing');
    this.startClock();
    if (this.turn() === this.cpuColor()) this.runCpu();
  }

  /** Continue the saved game (after the app was closed or the TV box restarted). */
  continueSaved(): void {
    const save = readSave();
    if (!save) {
      this.start();
      return;
    }
    this.reset();
    this.patchSettings({ level: save.level, playerColor: save.playerColor });
    for (const sm of save.moves) {
      const move = this.legal().find((m) => m.from === sm.from && samePath(m.path, sm.path));
      if (!move) {
        // Saved data doesn't replay under the rules: drop it and start fresh.
        console.warn('[checkers] saved game is invalid, starting a new one');
        this.start();
        return;
      }
      this.record(move);
    }
    this.elapsed.set(save.elapsed);
    this.screen.set('playing');
    const out = this.engine.outcome(this.history());
    if (out) {
      this.finish(out);
      return;
    }
    this.startClock();
    if (this.turn() === this.cpuColor()) this.runCpu();
  }

  /** Back to the start screen (the game in progress stays saved and can be resumed). */
  toStartScreen(): void {
    this.reset();
    this.saved.set(savedInfo(readSave()));
    this.screen.set('start');
  }

  pause(): void {
    if (this.screen() === 'playing' && !this.outcome()) this.paused.set(true);
  }

  resume(): void {
    this.paused.set(false);
  }

  /** Board input while playing. */
  handle(a: TvAction): void {
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
        if (this.busy()) break;
        if (this.midJump()) this.cancelHops();
        else if (this.selection()) this.deselect();
        else this.pause();
        break;
      case 'menu':
        this.pause();
        break;
      case 'undo':
        this.undo();
        break;
      case 'hint':
        void this.showHint();
        break;
    }
  }

  clickSquare(sq: number): void {
    if (!this.isYourTurn() || this.busy()) return;
    if (sq >= 0 && this.candidates().includes(sq)) {
      this.rawFocus.set(sq);
      this.activate(sq);
    } else if (this.selection() && !this.midJump()) {
      this.deselect();
    }
  }

  hoverSquare(sq: number): void {
    if (sq >= 0 && this.candidates().includes(sq)) this.rawFocus.set(sq);
  }

  /** Takes back your last move (and the computer's reply). */
  undo(): void {
    if (this.screen() !== 'playing' || this.outcome()) return;
    if (this.busy() && !this.cpuStep()) return; // your own move is landing
    const player = this.playerColor();
    if (!this.snapshots.some((s) => s.turn === player)) {
      this.showToast('Nothing to undo');
      this.sound.play('error');
      return;
    }
    this.cancelCpu();
    while (this.snapshots.length) {
      const s = this.snapshots.pop()!;
      this.history.update((h) => h.slice(0, -1));
      this.moveLog.pop();
      this.pieces.set(s.pieces);
      this.records.set(s.records);
      this.lastMove.set(s.lastMove);
      if (s.turn === player) break;
    }
    this.selection.set(null);
    this.hint.set(null);
    this.save();
    this.sound.play('select');
  }

  async showHint(): Promise<void> {
    if (!this.isYourTurn() || this.busy() || this.midJump() || this.hintPending()) return;
    const token = this.cpuToken;
    const at = this.history().length;
    this.hintPending.set(true);
    const move = await this.engine.hint(this.history());
    this.hintPending.set(false);
    if (!move || token !== this.cpuToken || at !== this.history().length || !this.isYourTurn()) return;
    if (this.selection()) return; // the player moved on
    this.hint.set(move);
    this.rawFocus.set(move.from);
    this.sound.play('select');
  }

  /** Draw by agreement: the computer accepts when it isn't ahead (and the game is underway). */
  async offerDraw(): Promise<void> {
    if (!this.isYourTurn() || this.busy() || this.midJump() || this.drawPending()) {
      this.showToast('Offer a draw on your turn');
      return;
    }
    const token = this.cpuToken;
    const at = this.history().length;
    this.drawPending.set(true);
    const yourScore = await this.engine.evaluate(this.history());
    this.drawPending.set(false);
    if (yourScore === null || token !== this.cpuToken || at !== this.history().length || !this.isYourTurn()) return;
    if (this.records().length >= DRAW_MIN_PLIES && -yourScore <= DRAW_ACCEPT_MAX_ADVANTAGE) {
      this.finish({ winner: null, reason: 'agreement' });
    } else {
      this.showToast('The computer declines the draw');
      this.sound.play('error');
    }
  }

  resign(): void {
    if (this.screen() !== 'playing' || this.outcome()) return;
    this.cancelCpu();
    this.finish({ winner: this.cpuColor(), reason: 'resign' });
  }

  // ── Settings ────────────────────────────────────────────────────────────
  setLevel(level: Level): void {
    this.patchSettings({ level });
  }
  cycleLevel(step: 1 | -1): void {
    this.setLevel(cycle(LEVELS, this.settings().level, step));
  }
  setPlayerColor(playerColor: PieceColor): void {
    this.patchSettings({ playerColor });
  }
  cycleTheme(step: 1 | -1 = 1): void {
    this.patchSettings({ theme: cycle(THEMES, this.settings().theme, step) });
  }
  setTheme(theme: ThemeName): void {
    this.patchSettings({ theme });
  }
  toggleSound(): void {
    this.patchSettings({ sound: !this.settings().sound });
    this.sound.enabled = this.settings().sound;
    this.sound.play('select');
  }
  toggleNumbers(): void {
    this.patchSettings({ numbers: !this.settings().numbers });
  }

  showToast(text: string): void {
    this.toast.set(text);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(null), 2400);
  }

  playUi(kind: 'select' | 'error'): void {
    this.sound.play(kind);
  }

  // ── Internals ───────────────────────────────────────────────────────────
  private activate(sq: number | null): void {
    if (sq === null || !this.isYourTurn() || this.busy()) return;
    const sel = this.selection();
    if (sel && this.nextHops().includes(sq)) {
      this.hopTo(sq);
      return;
    }
    if (this.midJump() || !this.movable().includes(sq)) return;
    if (sel?.from === sq) {
      this.deselect();
      return;
    }
    this.hint.set(null);
    this.selection.set({ from: sq, hops: [] });
    this.rawFocus.set(this.bestDestination(this.nextHops(), sq));
    this.sound.play('select');
  }

  private hopTo(sq: number): void {
    const sel = this.selection();
    if (!sel) return;
    const prev = sel.hops.length ? sel.hops[sel.hops.length - 1] : sel.from;
    const hops = [...sel.hops, sq];
    const matches = this.yourMoves().filter((m) => m.from === sel.from && startsWith(m.path, hops));
    if (!matches.length) return;
    this.hint.set(null);
    this.selection.set({ from: sel.from, hops });
    this.sound.play(jumpedSquare(prev, sq) >= 0 ? 'capture' : 'move');

    // Complete when a legal move ends here (the rules never let a jump stop early).
    const done = matches.find((m) => m.path.length === hops.length);
    if (done) {
      this.busy.set(true);
      this.later(HOP_MS, () => {
        this.busy.set(false);
        this.commit(done);
      });
      return;
    }

    // More jumps to make with the same piece.
    const next = this.nextHops();
    this.rawFocus.set(this.bestDestination(next, sq));
    if (next.length === 1) {
      // Only one way to continue: play it for the player (fewer presses).
      this.busy.set(true);
      this.later(AUTO_HOP_MS, () => {
        this.busy.set(false);
        const s = this.selection();
        if (s && s.hops.length === hops.length) this.hopTo(next[0]);
      });
    }
  }

  private cancelHops(): void {
    const sel = this.selection();
    if (!sel) return;
    this.selection.set({ from: sel.from, hops: [] });
    this.rawFocus.set(this.bestDestination(this.nextHops(), sel.from));
  }

  private deselect(): void {
    const sel = this.selection();
    if (!sel) return;
    this.selection.set(null);
    this.rawFocus.set(sel.from);
  }

  /** Plays a move into the game state (no animation, no follow-up). */
  private record(move: Move): void {
    const pos = this.position();
    this.snapshots.push({
      turn: pos.turn,
      pieces: this.pieces(),
      records: this.records(),
      lastMove: this.lastMove(),
    });
    this.history.update((h) => [...h, this.engine.apply(pos, move)]);
    this.moveLog.push({ from: move.from, path: [...move.path] });
    this.pieces.update((ps) => applyToPieces(ps, move));
    this.records.update((r) => [...r, { color: pos.turn, text: notation(move) }]);
    this.lastMove.set(move);
  }

  private commit(move: Move): void {
    if (this.hintPending()) {
      this.engine.cancel(); // drop a hint that's no longer useful
      this.hintPending.set(false);
    }
    this.record(move);
    this.hint.set(null);
    this.selection.set(null);
    this.cpuStep.set(null);
    if (move.promotes) this.sound.play('king');

    const out = this.engine.outcome(this.history());
    if (out) {
      this.finish(out);
      return;
    }
    this.save();
    if (this.turn() === this.cpuColor()) this.runCpu();
  }

  private finish(out: Outcome): void {
    this.outcome.set(out);
    this.thinking.set(false);
    this.selection.set(null);
    this.stopClock();
    clearSave();
    this.saved.set(null);
    const you = this.playerColor();
    this.tally.update((t) =>
      out.winner === null
        ? { ...t, draws: t.draws + 1 }
        : out.winner === you
          ? { ...t, you: t.you + 1 }
          : { ...t, cpu: t.cpu + 1 },
    );
    this.later(650, () => {
      this.sound.play(out.winner === you ? 'win' : 'lose');
      this.screen.set('over');
    });
  }

  private runCpu(): void {
    const token = ++this.cpuToken;
    const level = this.settings().level;
    this.thinking.set(true);
    const started = performance.now();
    const minThink = THINK_MS[level] + Math.random() * 300;
    void this.engine.chooseMove(this.history(), level).then((move) => {
      if (token !== this.cpuToken || !move) return;
      const wait = Math.max(0, minThink - (performance.now() - started));
      this.later(wait, () => this.playCpu(move, token));
    });
  }

  private playCpu(move: Move, token: number): void {
    if (token !== this.cpuToken) return;
    this.thinking.set(false);
    this.busy.set(true);
    const step = (i: number) => {
      if (token !== this.cpuToken) return;
      if (i > move.path.length) {
        this.busy.set(false);
        this.commit(move);
        return;
      }
      this.cpuStep.set({ move, step: i });
      this.sound.play(move.captures.length ? 'capture' : 'move');
      this.later(i === move.path.length ? HOP_MS : HOP_MS + 140, () => step(i + 1));
    };
    step(1);
  }

  private cancelCpu(): void {
    this.cpuToken++;
    this.engine.cancel();
    this.clearTimers();
    this.thinking.set(false);
    this.hintPending.set(false);
    this.drawPending.set(false);
    this.busy.set(false);
    this.cpuStep.set(null);
  }

  private reset(): void {
    this.cancelCpu();
    this.stopClock();
    const start = this.engine.initial();
    this.history.set([start]);
    this.pieces.set(piecesFromPosition(start));
    this.snapshots = [];
    this.moveLog = [];
    this.records.set([]);
    this.lastMove.set(null);
    this.hint.set(null);
    this.selection.set(null);
    this.outcome.set(null);
    this.paused.set(false);
    this.elapsed.set(0);
    this.rawFocus.set(null);
  }

  private save(): void {
    if (this.screen() !== 'playing' || this.outcome()) return;
    writeSave({
      v: 1,
      playerColor: this.playerColor(),
      level: this.settings().level,
      moves: this.moveLog,
      elapsed: this.elapsed(),
    });
  }

  private moveFocus(dir: 'up' | 'down' | 'left' | 'right'): void {
    const from = this.focus();
    if (from === null || this.busy()) return;
    const pc = this.playerColor();
    const a = screenRC(from, pc);
    let best = -1;
    let bestScore = Infinity;
    for (const sq of this.candidates()) {
      if (sq === from) continue;
      const b = screenRC(sq, pc);
      const dr = b.r - a.r;
      const dc = b.c - a.c;
      const along = dir === 'up' ? -dr : dir === 'down' ? dr : dir === 'left' ? -dc : dc;
      const across = dir === 'up' || dir === 'down' ? Math.abs(dc) : Math.abs(dr);
      if (along <= 0) continue;
      // Prefer squares in line with the press; small bias to the left / top for ties.
      const score = along + across * 2.2 + (dir === 'up' || dir === 'down' ? b.c : b.r) * 0.001;
      if (score < bestScore) {
        bestScore = score;
        best = sq;
      }
    }
    if (best >= 0) this.rawFocus.set(best);
  }

  private pickDefault(c: readonly number[], prev: number | null): number | null {
    if (!c.length) return null;
    const s = this.selection();
    if (s) {
      const hops = this.nextHops();
      if (hops.length) return this.bestDestination(hops, s.hops.length ? s.hops[s.hops.length - 1] : s.from);
    }
    const pc = this.playerColor();
    const ref = prev !== null ? screenRC(prev, pc) : { r: 4.6, c: 3.4 };
    return nearest(c, ref, pc);
  }

  /** Destination the cursor jumps to after picking a piece: straight ahead, left first. */
  private bestDestination(dests: readonly number[], from: number): number | null {
    if (!dests.length) return null;
    const pc = this.playerColor();
    const a = screenRC(from, pc);
    return nearest(dests, { r: a.r - 1.5, c: a.c - 0.01 }, pc);
  }

  private patchSettings(patch: Partial<Settings>): void {
    this.settings.update((s) => ({ ...s, ...patch }));
    saveSettings(this.settings());
  }

  private later(ms: number, fn: () => void): void {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  private startClock(): void {
    this.stopClock();
    let tick = 0;
    this.clock = setInterval(() => {
      if (this.paused() || this.screen() !== 'playing' || this.outcome()) return;
      this.elapsed.update((s) => s + 1);
      if (++tick % 10 === 0) this.save(); // keep the saved clock roughly current
    }, 1000);
  }

  private stopClock(): void {
    if (this.clock) clearInterval(this.clock);
    this.clock = null;
  }
}

function nearest(squares: readonly number[], ref: { r: number; c: number }, pc: PieceColor): number {
  let best = squares[0];
  let bestD = Infinity;
  for (const sq of squares) {
    const p = screenRC(sq, pc);
    const d = (p.r - ref.r) ** 2 + (p.c - ref.c) ** 2;
    if (d < bestD) {
      bestD = d;
      best = sq;
    }
  }
  return best;
}

function cycle<T>(list: readonly T[], cur: T, step: 1 | -1): T {
  const i = list.indexOf(cur);
  return list[(i + step + list.length) % list.length];
}

function samePath(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
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
    return {
      level: LEVELS.includes(s.level as Level) ? (s.level as Level) : DEFAULT_SETTINGS.level,
      playerColor: s.playerColor === 'light' ? 'light' : 'dark',
      theme: THEMES.includes(s.theme as ThemeName) ? (s.theme as ThemeName) : DEFAULT_SETTINGS.theme,
      sound: s.sound !== false,
      numbers: s.numbers !== false,
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

function readSave(): SavedGame | null {
  try {
    const raw = storage()?.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SavedGame;
    const ok =
      s?.v === 1 &&
      (s.playerColor === 'dark' || s.playerColor === 'light') &&
      LEVELS.includes(s.level) &&
      Array.isArray(s.moves) &&
      s.moves.every((m) => Number.isInteger(m?.from) && Array.isArray(m?.path)) &&
      Number.isFinite(s.elapsed);
    return ok ? s : null;
  } catch {
    return null;
  }
}

function writeSave(s: SavedGame): void {
  try {
    storage()?.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    /* resume just won't be offered */
  }
}

function clearSave(): void {
  try {
    storage()?.removeItem(SAVE_KEY);
  } catch {
    /* nothing to clear */
  }
}

function savedInfo(s: SavedGame | null): SavedGameInfo | null {
  return s && s.moves.length ? { moves: s.moves.length, level: s.level, playerColor: s.playerColor } : null;
}
