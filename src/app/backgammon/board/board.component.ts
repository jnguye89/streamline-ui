import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Origin, Side } from '@skriin/backgammon-core';
import {
  BAR_W,
  BAR_X,
  BH,
  BW,
  CK,
  FIELD_BOTTOM,
  FIELD_TOP,
  LEFT_X,
  MID_Y,
  PAD_Y,
  PT_W,
  RIGHT_X,
  SLAB_H,
  TRAY_W,
  TRAY_X,
  TRI_H,
  XY,
  barChecker,
  barKey,
  diceCenter,
  offKey,
  offSlab,
  pointChecker,
  pointColumn,
  pointKey,
  trayCount,
} from '../board-geometry';
import { GameStore } from '../game-store.service';
import { ArriveDirective } from './arrive.directive';
import { CheckerComponent, Tone } from './checker.component';
import { DieComponent } from './die.component';

interface CheckerView {
  readonly key: string;
  readonly tone: Tone;
  readonly xy: XY;
  readonly arrive: XY | undefined;
  readonly cls: string;
  readonly label: number | null;
  /** Cursor id when this is the top checker of a stack the player may pick. */
  readonly cand: string | null;
}

interface SlabView {
  readonly key: string;
  readonly tone: Tone;
  readonly xy: XY;
  readonly arrive: XY | undefined;
}

interface RectView {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly cls: string;
}

const tone = (side: Side): Tone => (side === 0 ? 'light' : 'dark');

@Component({
  selector: 'bg-board',
  standalone: true,
  imports: [CheckerComponent, DieComponent, ArriveDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './board.component.html',
  styleUrl: './board.component.css',
})
export class BoardComponent {
  protected readonly store = inject(GameStore);
  protected readonly BW = BW;
  protected readonly BH = BH;
  protected readonly CK = CK;
  protected readonly SLAB_W = TRAY_W - 20;
  protected readonly SLAB_H = SLAB_H;

  /** Bed, bar and trays (mirrored with the board). */
  protected readonly rects = computed<RectView[]>(() => {
    const mirror = this.store.geo().mirror;
    const r = (key: string, x: number, y: number, w: number, h: number, cls: string): RectView => ({
      key,
      x: mirror ? BW - x - w : x,
      y,
      w,
      h,
      cls,
    });
    const fieldH = FIELD_BOTTOM - FIELD_TOP;
    return [
      r('bed-l', LEFT_X, FIELD_TOP, 6 * PT_W, fieldH, 'bed'),
      r('bed-r', RIGHT_X, FIELD_TOP, 6 * PT_W, fieldH, 'bed'),
      r('tray-t', TRAY_X, FIELD_TOP, TRAY_W, TRI_H, 'tray'),
      r('tray-b', TRAY_X, FIELD_BOTTOM - TRI_H, TRAY_W, TRI_H, 'tray'),
    ];
  });

  protected readonly bar = computed(() => {
    const x = this.store.geo().mirror ? BW - BAR_X - BAR_W : BAR_X;
    return { x, w: BAR_W };
  });

  protected readonly triangles = computed(() => {
    const g = this.store.geo();
    const out: { a: number; points: string; cls: string }[] = [];
    for (let a = 1; a <= 24; a++) {
      const col = pointColumn(g, a);
      const l = col.x + 3;
      const r = col.x + PT_W - 3;
      const m = col.x + PT_W / 2;
      const points = col.top
        ? `${l},${FIELD_TOP} ${r},${FIELD_TOP} ${m},${FIELD_TOP + TRI_H}`
        : `${l},${FIELD_BOTTOM} ${r},${FIELD_BOTTOM} ${m},${FIELD_BOTTOM - TRI_H}`;
      out.push({ a, points, cls: col.p % 2 ? 'pt-a' : 'pt-b' });
    }
    return out;
  });

  /** Point numbers in the view side's own numbering. */
  protected readonly numbers = computed(() => {
    const g = this.store.geo();
    const out: { p: number; x: number; y: number }[] = [];
    for (let a = 1; a <= 24; a++) {
      const col = pointColumn(g, a);
      out.push({ p: col.p, x: col.x + PT_W / 2, y: col.top ? PAD_Y / 2 : BH - PAD_Y / 2 });
    }
    return out;
  });

  protected readonly checkers = computed<CheckerView[]>(() => {
    const s = this.store;
    const v = s.view();
    const g = s.geo();
    const arr = s.arrivals();
    const sel = s.activeSelection();
    const f = s.focus();
    const focusOrigin = f?.kind === 'origin' ? f.origin : null;
    const movable = new Set<Origin>(sel === null ? s.movable() : []);
    const flag = (side: Side, o: Origin): string => {
      if (side !== v.turn) return '';
      if (sel === o) return 'sel';
      if (focusOrigin === o) return 'focused';
      return movable.has(o) ? 'movable' : '';
    };
    const out: CheckerView[] = [];
    for (let a = 1; a <= 24; a++) {
      const val = v.board.pts[a];
      if (!val) continue;
      const side: Side = val > 0 ? 0 : 1;
      const n = Math.abs(val);
      for (let i = 0; i < n; i++) {
        const key = pointKey(a, side, i);
        const top = i === n - 1;
        out.push({
          key,
          tone: tone(side),
          xy: pointChecker(g, a, i, n),
          arrive: arr.get(key),
          cls: top ? flag(side, a) : '',
          label: top && n > 5 ? n : null,
          cand: top && side === v.turn ? `o:${a}` : null,
        });
      }
    }
    for (const side of [0, 1] as const) {
      const n = v.board.bar[side];
      for (let i = 0; i < n; i++) {
        const key = barKey(side, i);
        const top = i === n - 1;
        out.push({
          key,
          tone: tone(side),
          xy: barChecker(g, side, i, n),
          arrive: arr.get(key),
          cls: top ? flag(side, 'bar') : '',
          label: top && n > 1 ? n : null,
          cand: top && side === v.turn ? 'o:bar' : null,
        });
      }
    }
    return out;
  });

  protected readonly slabs = computed<SlabView[]>(() => {
    const v = this.store.view();
    const g = this.store.geo();
    const arr = this.store.arrivals();
    const out: SlabView[] = [];
    for (const side of [0, 1] as const) {
      for (let i = 0; i < v.board.off[side]; i++) {
        const key = offKey(side, i);
        out.push({ key, tone: tone(side), xy: offSlab(g, side, i), arrive: arr.get(key) });
      }
    }
    return out;
  });

  protected readonly trayCounts = computed(() => {
    const v = this.store.view();
    const g = this.store.geo();
    return ([0, 1] as const).map((side) => ({ side, n: v.board.off[side], xy: trayCount(g, side) }));
  });

  /** Column behind the focused or picked checker. */
  protected readonly column = computed(() => {
    const s = this.store;
    const f = s.focus();
    const o = s.activeSelection() ?? (f?.kind === 'origin' ? f.origin : null);
    if (o === null) return null;
    const g = s.geo();
    if (o === 'bar') {
      const x = g.mirror ? BW - BAR_X - BAR_W : BAR_X;
      return { x: x + 6, y: MID_Y + 40, w: BAR_W - 12, h: FIELD_BOTTOM - MID_Y - 40 };
    }
    const col = pointColumn(g, o);
    return { x: col.x + 2, y: col.top ? FIELD_TOP : FIELD_BOTTOM - TRI_H, w: PT_W - 4, h: TRI_H };
  });

  protected readonly dots = computed(() => {
    const s = this.store;
    const fid = s.focus()?.id ?? null;
    return s
      .candidates()
      .flatMap((c) =>
        c.kind === 'dest'
          ? [{ id: c.id, xy: c.xy, label: c.label, focused: c.id === fid, hit: c.hits.length > 0, off: c.dest.to === 'off' }]
          : [],
      );
  });

  protected readonly threats = computed(() => {
    const s = this.store;
    const fid = s.focus()?.id ?? null;
    return s
      .candidates()
      .flatMap((c) => (c.kind === 'dest' ? c.hits.map((xy) => ({ key: `${c.id}@${xy.x},${xy.y}`, xy, strong: c.id === fid })) : []));
  });

  protected readonly buttons = computed(() => {
    const s = this.store;
    const fid = s.focus()?.id ?? null;
    const c = s.candidates().filter((x) => x.kind === 'button');
    if (!c.length) return null;
    const v = s.view();
    const at = diceCenter(s.geo(), v.turn);
    return {
      at,
      list: c.map((b) => ({
        id: b.id,
        label: b.id === 'b:roll' ? 'Roll' : b.id === 'b:double' ? `Double to ${v.cube.value * 2}` : 'Done',
        primary: b.id !== 'b:double',
        focused: b.id === fid,
      })),
    };
  });

  protected readonly noMoves = computed(() => {
    const v = this.store.view();
    if (v.phase !== 'turn-done' || !v.noMoves || this.store.rolling() !== null) return null;
    // Centered on the bar, between the two players' bar stacks.
    const x = this.store.geo().mirror ? BW - BAR_X - BAR_W / 2 : BAR_X + BAR_W / 2;
    return { x, y: MID_Y };
  });

  protected readonly arrows = computed(() =>
    this.store.hintArrows().map((a, i) => {
      const mx = (a.from.x + a.to.x) / 2;
      const my = (a.from.y + a.to.y) / 2;
      const dx = a.to.x - a.from.x;
      const dy = a.to.y - a.from.y;
      const len = Math.max(Math.hypot(dx, dy), 1);
      const bend = Math.min(90, len * 0.25);
      const cx = mx - (dy / len) * bend;
      const cy = my + (dx / len) * bend;
      return { key: i, d: `M ${a.from.x} ${a.from.y} Q ${cx} ${cy} ${a.to.x} ${a.to.y}`, to: a.to };
    }),
  );

  protected readonly ghost = computed(() => {
    const gh = this.store.ghost();
    return gh ? { ...gh, tone: tone(gh.side) } : null;
  });

  protected hover(cand: string | null): void {
    if (cand) this.store.hoverCand(cand);
  }

  protected click(cand: string | null): void {
    if (cand) this.store.clickCand(cand);
  }

  protected tf(xy: XY, w = CK, h = CK): string {
    return `translate(${xy.x - w / 2}px, ${xy.y - h / 2}px)`;
  }

  protected toneOf(side: Side): Tone {
    return tone(side);
  }
}
