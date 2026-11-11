import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import {
  ActionOption,
  PlayerAction,
  PlayerView,
  Seat,
  TableEvent,
  TileId,
  WIND_NAME,
  isFlower,
  kindOf,
  sortTiles,
  tileLongName,
  tileName,
} from '@skriin/mahjong-core';
import { MAHJONG_ENGINE } from './engine/engine-token';
import { computeHint, faanSoFar } from './engine/hint';
import {
  Callout,
  ClaimButtonId,
  DEFAULT_SETTINGS,
  Hint,
  SPOTS,
  Screen,
  Settings,
  Spot,
  TvAction,
  Zone,
} from './mahjong.types';
import { PREVIEW_SCENES, PreviewScene } from './preview/preview-scenes';
import { SoundService } from './sound.service';

export interface ClaimButton {
  readonly id: ClaimButtonId;
  readonly label: string;
  /** null for Chow when there are several chows (opens the second step). */
  readonly option: ActionOption | null;
  readonly chows: readonly ActionOption[];
  readonly meld: readonly TileId[] | null;
}

export interface Status {
  readonly hero: string;
  readonly lines: readonly string[];
  readonly tone: '' | 'hint' | 'good' | 'armed' | 'wait';
}

interface PreviewState {
  readonly index: number;
  readonly scene: PreviewScene;
  readonly startedAt: number;
}

const SETTINGS_KEY = 'skriin.mahjong.settings.v1';
const CALLOUT_MS = { normal: 1300, fast: 750 } as const;
const BOT_NAMES = ['Mochi', 'Boba', 'Taro'] as const;

/** UI state for the table (signals). Talks to the game only through MahjongEngine. */
@Injectable()
export class TableStore {
  private readonly engine = inject(MAHJONG_ENGINE);
  private readonly sound = inject(SoundService);
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private calloutSeq = 0;
  private decisionKey = '';
  private ticker: ReturnType<typeof setInterval> | null = null;

  // ── State ───────────────────────────────────────────────────────────────
  readonly settings = signal<Settings>(loadSettings());
  readonly screen = signal<Screen>('start');
  readonly paused = signal(false);
  readonly rulesOpen = signal(false);
  readonly live = signal<PlayerView | null>(null);
  readonly preview = signal<PreviewState | null>(null);
  readonly zone = signal<Zone>('hand');
  readonly actionIndex = signal(0);
  readonly claimIndex = signal(0);
  readonly chowIndex = signal(0);
  readonly sorted = signal(true);
  readonly armed = signal<TileId | null>(null);
  readonly hint = signal<Hint | null>(null);
  readonly callouts = signal<Callout[]>([]);
  readonly toast = signal<string | null>(null);
  readonly now = signal(Date.now());
  /** Your bonus tile just set aside, and the replacement that came in. */
  readonly bonusNote = signal<{ tile: TileId; replacement: TileId | null } | null>(null);
  private readonly rawFocus = signal<TileId | null>(null);

  // ── Derived ─────────────────────────────────────────────────────────────
  readonly view = computed(() => this.preview()?.scene.view ?? this.live());
  readonly you = computed<Seat>(() => this.view()?.you ?? 0);
  readonly options = computed(() => this.view()?.options ?? []);
  readonly discardable = computed(
    () =>
      new Set(this.options().flatMap((o) => (o.action.type === 'discard' ? [o.action.tile] : []))),
  );
  readonly myTurn = computed(() => {
    const v = this.view();
    return !!v && v.phase === 'turn' && v.turn === v.you && this.discardable().size > 0;
  });
  readonly turnActions = computed(() =>
    this.myTurn()
      ? this.options().filter((o) => o.action.type === 'win' || o.action.type === 'kong')
      : [],
  );
  readonly canSelfWin = computed(() => this.turnActions().some((o) => o.action.type === 'win'));
  readonly handOrder = computed(() => {
    const v = this.view();
    if (!v) return [];
    return this.sorted() ? sortTiles(v.hand) : [...v.hand];
  });
  /** Tiles the D-pad walks through: the hand, then the drawn tile. */
  readonly navTiles = computed(() => {
    const v = this.view();
    const order = this.handOrder();
    return v?.drawn !== null && v?.drawn !== undefined ? [...order, v.drawn] : order;
  });
  readonly focus = computed(() => {
    if (!this.myTurn() || this.zone() !== 'hand') return null;
    const nav = this.navTiles();
    const f = this.rawFocus();
    if (f !== null && nav.includes(f)) return f;
    return this.view()?.drawn ?? nav[nav.length - 1] ?? null;
  });
  readonly claimButtons = computed<ClaimButton[]>(() => {
    const v = this.view();
    if (!v || v.phase !== 'claim' || !v.claim) return [];
    const of = (t: PlayerAction['type']) => this.options().filter((o) => o.action.type === t);
    const out: ClaimButton[] = [];
    const win = of('win')[0];
    if (win) out.push({ id: 'win', label: 'Win', option: win, chows: [], meld: null });
    const kong = of('kong')[0];
    if (kong)
      out.push({ id: 'kong', label: 'Kong', option: kong, chows: [], meld: kong.meld ?? null });
    const pung = of('pung')[0];
    if (pung)
      out.push({ id: 'pung', label: 'Pung', option: pung, chows: [], meld: pung.meld ?? null });
    const chows = of('chow');
    if (chows.length)
      out.push({
        id: 'chow',
        label: chows.length > 1 ? `Chow · ${chows.length} ways` : 'Chow',
        option: chows.length === 1 ? chows[0] : null,
        chows,
        meld: chows.length === 1 ? (chows[0].meld ?? null) : null,
      });
    const pass = of('pass')[0];
    if (pass) out.push({ id: 'pass', label: 'Pass', option: pass, chows: [], meld: null });
    return out;
  });
  readonly chowChoices = computed(
    () => this.claimButtons().find((b) => b.id === 'chow')?.chows ?? [],
  );
  readonly claimMs = computed(() => {
    const c = this.view()?.claim;
    if (!c) return 0;
    const p = this.preview();
    if (p) return c.windowMs - ((this.now() - p.startedAt) % c.windowMs);
    return Math.max(0, Math.min(c.windowMs, c.endsAt - this.now()));
  });
  readonly spotOf = computed(() => {
    const you = this.you();
    return (seat: Seat): Spot => SPOTS[(seat - you + 4) % 4];
  });
  readonly seatAt = computed(() => {
    const v = this.view();
    const you = this.you();
    return (spot: Spot) => (v ? v.seats[(you + SPOTS.indexOf(spot)) % 4] : null);
  });
  readonly roundInfo = computed(() => {
    const v = this.view();
    if (!v) return null;
    const dealer = v.seats.find((s) => s.dealer);
    return {
      title: `${WIND_NAME[v.round.prevailing]} round, hand ${v.round.dealerNo}`,
      dealer: !dealer ? '' : dealer.seat === v.you ? 'Dealer: you' : `Dealer: ${dealer.name}`,
      repeat: v.round.repeat,
    };
  });
  readonly status = computed<Status | null>(() => {
    const v = this.view();
    if (!v || v.phase === 'hand-over' || v.phase === 'game-over') return null;
    if (v.phase === 'claim' && v.claim) return null;
    if (this.myTurn()) {
      const armed = this.armed();
      if (armed !== null)
        return {
          hero: 'Your move.',
          lines: [`Discard ${tileName(kindOf(armed))}?`, 'Press A again.'],
          tone: 'armed',
        };
      const h = this.hint();
      if (h) {
        const lines = h.discard !== null ? [`Hint: discard ${tileName(kindOf(h.discard))}.`] : [];
        lines.push(
          h.waits.length
            ? `1 tile away: waiting on ${h.waits.map(tileName).join(', ')}.`
            : 'Not 1 tile away yet.',
        );
        return { hero: 'Your move.', lines, tone: 'hint' };
      }
      if (this.canSelfWin())
        return {
          hero: 'You can win.',
          lines: [
            this.zone() === 'actions'
              ? 'Press A to win, or ▼ to keep playing.'
              : 'Press ▲ for Win, or discard a tile.',
          ],
          tone: 'good',
        };
      const note = this.bonusNote();
      const lines = note
        ? [
            `${tileLongName(kindOf(note.tile))} set aside.`,
            note.replacement !== null
              ? `Replacement: ${tileName(kindOf(note.replacement))}.`
              : 'Replacement drawn.',
          ]
        : ['Discard a tile.'];
      if (this.settings().faanSoFar && !this.preview()) {
        const f = faanSoFar(v);
        lines.push(`Faan so far: ${f.total}${f.lines.length ? ` · ${f.lines.join(', ')}` : ''}`);
      }
      return { hero: note ? 'Bonus tile!' : 'Your move.', lines, tone: note ? 'good' : '' };
    }
    const t = v.seats[v.turn];
    if (v.phase === 'claim' && v.lastDiscard)
      return {
        hero: `${t.name}’s move.`,
        lines: [`Discarded ${tileName(kindOf(v.lastDiscard.tile))}.`],
        tone: 'wait',
      };
    return {
      hero: `${t.name}’s move.`,
      lines: [t.kind === 'bot' ? 'Thinking…' : 'Their turn.'],
      tone: 'wait',
    };
  });

  constructor() {
    const off = this.engine.subscribe(0, (v, ev) => this.onLive(v, ev));
    this.sound.enabled = this.settings().sound;
    // The claim ring needs a clock only while a claim is on screen.
    effect(() => {
      const ticking = this.claimButtons().length > 0;
      if (ticking && !this.ticker) this.ticker = setInterval(() => this.now.set(Date.now()), 100);
      if (!ticking && this.ticker) {
        clearInterval(this.ticker);
        this.ticker = null;
      }
    });
    inject(DestroyRef).onDestroy(() => {
      off();
      for (const t of this.timers) clearTimeout(t);
      if (this.ticker) clearInterval(this.ticker);
    });
  }

  // ── Game flow ───────────────────────────────────────────────────────────
  startGame(): void {
    const s = this.settings();
    this.preview.set(null);
    this.paused.set(false);
    this.rulesOpen.set(false);
    this.decisionKey = '';
    this.engine.start({
      variant: 'hong-kong',
      length: s.length,
      botLevel: s.botLevel,
      minFaan: 3,
      faanCap: 10,
      claimWindowMs: 5000,
      discardTimerMs: null,
      pace: s.pace,
      seats: [
        { name: 'You', kind: 'human' },
        { name: BOT_NAMES[0], kind: 'bot' },
        { name: BOT_NAMES[1], kind: 'bot' },
        { name: BOT_NAMES[2], kind: 'bot' },
      ],
    });
    this.screen.set('table');
  }

  toStartScreen(): void {
    this.preview.set(null);
    this.paused.set(false);
    this.rulesOpen.set(false);
    this.live.set(null);
    this.screen.set('start');
  }

  pause(): void {
    if (this.screen() === 'table') this.paused.set(true);
  }

  resume(): void {
    this.paused.set(false);
  }

  act(action: PlayerAction): void {
    if (this.preview()) {
      this.showToast('Preview only. Press P for the next state.');
      return;
    }
    this.engine.act(this.you(), action);
  }

  // ── Table input ─────────────────────────────────────────────────────────
  handle(a: TvAction): void {
    if (!this.view()) return;
    if (a === 'menu') return this.pause();
    if (a === 'sort') return this.toggleSort();
    if (a === 'hint') return this.showHint();
    switch (this.zone()) {
      case 'claim':
        return this.handleClaim(a);
      case 'chow':
        return this.handleChow(a);
      case 'actions':
        return this.handleActions(a);
      default:
        return this.handleHand(a);
    }
  }

  private handleHand(a: TvAction): void {
    switch (a) {
      case 'left':
      case 'right': {
        if (!this.myTurn()) return;
        const nav = this.navTiles();
        const i = nav.indexOf(this.focus() ?? -1);
        const j = Math.max(0, Math.min(nav.length - 1, i + (a === 'right' ? 1 : -1)));
        if (j !== i) {
          this.rawFocus.set(nav[j]);
          this.armed.set(null);
          this.sound.play('move');
        }
        return;
      }
      case 'up':
        if (this.turnActions().length) {
          this.zone.set('actions');
          this.armed.set(null);
        }
        return;
      case 'select': {
        const f = this.focus();
        if (f !== null) this.discard(f);
        return;
      }
      case 'back':
        if (this.armed() !== null) this.armed.set(null);
        else this.pause();
        return;
      default:
        return;
    }
  }

  private handleActions(a: TvAction): void {
    const n = this.turnActions().length;
    if (!n) {
      this.zone.set('hand');
      return;
    }
    switch (a) {
      case 'left':
      case 'right':
        this.actionIndex.update((i) => Math.max(0, Math.min(n - 1, i + (a === 'right' ? 1 : -1))));
        return;
      case 'down':
      case 'back':
        this.zone.set('hand');
        return;
      case 'select':
        this.act(this.turnActions()[Math.min(this.actionIndex(), n - 1)].action);
        return;
      default:
        return;
    }
  }

  private handleClaim(a: TvAction): void {
    const btns = this.claimButtons();
    if (!btns.length) {
      this.zone.set('hand');
      return;
    }
    switch (a) {
      case 'left':
      case 'right':
        this.claimIndex.update((i) =>
          Math.max(0, Math.min(btns.length - 1, i + (a === 'right' ? 1 : -1))),
        );
        this.sound.play('move');
        return;
      case 'select':
        this.pressClaim(Math.min(this.claimIndex(), btns.length - 1));
        return;
      case 'back': {
        const pass = btns.find((b) => b.id === 'pass');
        if (pass?.option) this.act(pass.option.action);
        return;
      }
      default:
        return;
    }
  }

  private handleChow(a: TvAction): void {
    const chows = this.chowChoices();
    switch (a) {
      case 'left':
      case 'right':
        this.chowIndex.update((i) =>
          Math.max(0, Math.min(chows.length - 1, i + (a === 'right' ? 1 : -1))),
        );
        this.sound.play('move');
        return;
      case 'select':
        if (chows.length) this.act(chows[Math.min(this.chowIndex(), chows.length - 1)].action);
        return;
      case 'back':
        this.zone.set('claim');
        return;
      default:
        return;
    }
  }

  // ── Mouse / pointer ─────────────────────────────────────────────────────
  clickTile(tile: TileId): void {
    if (!this.myTurn()) return;
    this.zone.set('hand');
    if (this.focus() === tile) this.discard(tile);
    else {
      this.rawFocus.set(tile);
      this.armed.set(null);
    }
  }

  pressClaim(i: number): void {
    const b = this.claimButtons()[i];
    if (!b) return;
    this.claimIndex.set(i);
    if (b.id === 'chow' && b.chows.length > 1) {
      this.zone.set('chow');
      this.chowIndex.set(0);
      return;
    }
    if (b.option) this.act(b.option.action);
  }

  pressChow(i: number): void {
    this.chowIndex.set(i);
    const c = this.chowChoices()[i];
    if (c) this.act(c.action);
  }

  pressTurnAction(i: number): void {
    const o = this.turnActions()[i];
    if (!o) return;
    this.actionIndex.set(i);
    this.act(o.action);
  }

  // ── Settings ────────────────────────────────────────────────────────────
  patchSettings(p: Partial<Settings>): void {
    this.settings.update((s) => ({ ...s, ...p }));
    const s = this.settings();
    this.sound.enabled = s.sound;
    if (p.pace) this.engine.setPace(p.pace);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch {
      /* storage can be missing on some viewers */
    }
  }

  toggleSort(): void {
    this.sorted.update((v) => !v);
    this.showToast(this.sorted() ? 'Hand sorted.' : 'Hand as drawn.');
  }

  showHint(): void {
    const v = this.view();
    if (!v || !this.myTurn()) {
      this.showToast('Hints work on your turn.');
      return;
    }
    if (this.preview()) return;
    const h = computeHint(v);
    this.hint.set(h);
    this.armed.set(null);
    this.zone.set('hand');
    if (h.discard !== null) this.rawFocus.set(h.discard);
  }

  playUi(kind: 'move' | 'turn'): void {
    this.sound.play(kind);
  }

  // ── Preview states (P key, review only) ─────────────────────────────────
  cyclePreview(): void {
    const p = this.preview();
    const next = p ? p.index + 1 : 0;
    this.paused.set(false);
    this.rulesOpen.set(false);
    this.callouts.set([]);
    if (next >= PREVIEW_SCENES.length) {
      this.preview.set(null);
      this.toast.set(null);
      this.bonusNote.set(null);
      const live = this.live();
      if (live) {
        this.decisionKey = '';
        this.onDecisionPoint(live);
      } else this.screen.set('start');
      return;
    }
    const scene = PREVIEW_SCENES[next];
    this.preview.set({ index: next, scene, startedAt: Date.now() });
    this.screen.set('table');
    const ui = scene.ui;
    this.zone.set(ui.zone);
    this.rawFocus.set(ui.focus);
    this.actionIndex.set(0);
    this.claimIndex.set(ui.claimIndex);
    this.chowIndex.set(ui.chowIndex);
    this.sorted.set(true);
    this.armed.set(null);
    this.hint.set(ui.hint);
    this.bonusNote.set(ui.bonusNote);
    this.toast.set(null);
    for (const c of ui.callouts) this.pushCallout(c.seat, c.text, true);
  }

  // ── Engine updates ──────────────────────────────────────────────────────
  private onLive(v: PlayerView, events: readonly TableEvent[]): void {
    this.live.set(v);
    if (this.preview()) return;
    for (const e of events) this.onEvent(v, e);
    this.onDecisionPoint(v);
  }

  private onEvent(v: PlayerView, e: TableEvent): void {
    switch (e.type) {
      case 'claim':
        this.pushCallout(
          e.seat,
          e.meld === 'pung' ? 'Pung!' : e.meld === 'chow' ? 'Chow!' : 'Kong!',
        );
        this.sound.play('claim');
        break;
      case 'kong':
        this.pushCallout(e.seat, 'Kong!');
        this.sound.play('claim');
        break;
      case 'bonus':
        if (e.seat === v.you && v.phase === 'turn') {
          this.bonusNote.set({ tile: e.tile, replacement: v.drawn });
          this.pushCallout(e.seat, isFlower(kindOf(e.tile)) ? 'Flower!' : 'Season!');
          this.sound.play('bonus');
        }
        break;
      case 'discard':
        this.sound.play('discard');
        break;
      case 'win':
        this.sound.play('win');
        break;
      case 'exhaustive-draw':
        this.sound.play('draw');
        break;
      case 'hand-start':
        this.bonusNote.set(null);
        this.hint.set(null);
        break;
      default:
        break;
    }
  }

  /** Puts the cursor on the right thing each time the game asks you something new. */
  private onDecisionPoint(v: PlayerView): void {
    const key = `${v.phase}|${v.turn}|${v.drawn}|${v.hand.length}|${v.claim?.endsAt ?? ''}|${v.round.handsPlayed}`;
    if (key === this.decisionKey) return;
    this.decisionKey = key;
    this.armed.set(null);
    if (v.phase === 'claim' && v.claim) {
      const btns = this.claimButtons();
      const win = btns.findIndex((b) => b.id === 'win');
      this.claimIndex.set(win >= 0 ? win : btns.findIndex((b) => b.id === 'pass'));
      this.chowIndex.set(0);
      this.zone.set('claim');
      this.sound.play('turn');
      return;
    }
    if (v.phase === 'turn' && v.turn === v.you && this.myTurn()) {
      this.hint.set(null);
      this.actionIndex.set(0);
      this.zone.set(this.canSelfWin() ? 'actions' : 'hand');
      this.rawFocus.set(v.drawn ?? this.handOrder()[this.handOrder().length - 1] ?? null);
      return;
    }
    this.zone.set('hand');
    this.hint.set(null);
    if (v.phase !== 'turn' || v.turn !== v.you) this.bonusNote.set(null);
  }

  private discard(tile: TileId): void {
    if (!this.discardable().has(tile)) return;
    if (this.settings().confirmDiscard && this.armed() !== tile) {
      this.armed.set(tile);
      return;
    }
    this.armed.set(null);
    this.hint.set(null);
    this.bonusNote.set(null);
    this.act({ type: 'discard', tile });
  }

  private pushCallout(seat: Seat, text: string, sticky = false): void {
    const v = this.view();
    if (!v) return;
    const s = v.seats[seat];
    const c: Callout = {
      id: ++this.calloutSeq,
      spot: this.spotOf()(seat),
      text,
      name: s.name,
      bot: s.kind === 'bot',
    };
    this.callouts.update((list) => [...list.filter((x) => x.spot !== c.spot), c]);
    if (sticky) return;
    const t = setTimeout(() => {
      this.timers.delete(t);
      this.callouts.update((list) => list.filter((x) => x.id !== c.id));
    }, CALLOUT_MS[this.settings().pace]);
    this.timers.add(t);
  }

  showToast(text: string): void {
    this.toast.set(text);
    const t = setTimeout(() => {
      this.timers.delete(t);
      if (this.toast() === text) this.toast.set(null);
    }, 1800);
    this.timers.add(t);
  }
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
