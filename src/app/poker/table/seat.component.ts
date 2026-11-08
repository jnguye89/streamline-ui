import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Card, SeatView, TurnView } from '../core/api';
import { chips } from '../core/cards';
import { SEAT_VIDEO } from '../session/ports';
import { actionLabel } from '../session/status';
import { CardComponent } from './card.component';

const STATUS_CHIP: Partial<Record<SeatView['status'], string>> = {
  allIn: 'All-in',
  folded: 'Folded',
  sittingOut: 'Sitting out',
  busted: 'Out',
  waitingForBigBlind: 'Waiting',
  leaving: 'Leaving',
};

/**
 * One seat: camera tile (or avatar initial — no video stack yet), name, stack, last action,
 * Thinking + timer ring, All-in / Folded, and button / small blind / big blind markers.
 */
@Component({
  selector: 'pk-seat',
  standalone: true,
  imports: [CardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'pk-seat',
    '[class.turn]': 'isTurn()',
    '[class.out]': "seat().status === 'folded' || seat().status === 'sittingOut' || seat().status === 'busted'",
    '[class.winner]': 'winner()',
    '[class.me]': 'isMe()',
  },
  template: `
    <div class="tile" [style.--hue]="hue()">
      @if (stream(); as s) {
        <video class="video" autoplay muted playsinline [srcObject]="s"></video>
      } @else {
        <div class="avatar">{{ initial() }}</div>
      }
      @if (!shown()) {
        <div class="name">{{ name() }}</div>
      }

      @if (shown(); as cards) {
        <div class="shown">
          <pk-card [card]="cards[0]" size="seat" [state]="cardState(cards[0])" />
          <pk-card [card]="cards[1]" size="seat" [state]="cardState(cards[1])" />
        </div>
      } @else if (seat().dealtIn) {
        <div class="backs"><pk-card size="back" /><pk-card size="back" /></div>
      }

      @if (isTurn()) {
        @if (isMe()) {
          <span class="chip thinking">Your turn</span>
        } @else {
          <span class="chip thinking">Thinking<span class="dots"><i></i><i></i><i></i></span></span>
        }
        @if (ring(); as r) {
          <svg class="ring" viewBox="0 0 280 158" preserveAspectRatio="none" aria-hidden="true">
            <rect
              x="3"
              y="3"
              width="274"
              height="152"
              rx="18"
              pathLength="100"
              [style.animation-duration.ms]="r.total"
              [style.animation-delay.ms]="-r.elapsed"
            />
          </svg>
        }
      } @else {
        @if (chipText(); as chip) {
          <span class="chip" [class.allin]="seat().status === 'allIn'">{{ chip }}</span>
        }
      }
    </div>

    <div class="info">
      <span class="stack">{{ stack() }}</span>
      @if (shown()) {
        <span class="act who">{{ name() }}</span>
      } @else {
        <span class="act">{{ action() }}</span>
      }
    </div>

    @if (markers().length) {
      <div class="markers">
        @for (m of markers(); track m) {
          <span class="marker" [class.dealer]="m === 'D'">{{ m }}</span>
        }
      </div>
    }
  `,
  styles: `
    :host { position: absolute; width: 280px; display: block; transition: opacity 200ms ease; }
    :host(.out) { opacity: 0.45; }
    .tile { position: relative; height: 158px; border-radius: 20px; overflow: visible; background: linear-gradient(160deg, hsl(var(--hue) 55% 34%), hsl(calc(var(--hue) + 18) 60% 22%)); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.1); }
    :host(.turn) .tile { box-shadow: inset 0 0 0 2px var(--lav-soft); }
    :host(.winner) .tile { box-shadow: 0 0 0 5px #fff; }
    .video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; border-radius: 20px; }
    .avatar { position: absolute; left: 50%; top: 44%; transform: translate(-50%, -50%); width: 92px; height: 92px; border-radius: 50%; display: grid; place-items: center; background: rgba(255,255,255,0.14); font: 600 52px/1 var(--font-display); color: #fff; }
    .name { position: absolute; left: 0; right: 0; bottom: 0; padding: 22px 16px 10px; border-radius: 0 0 20px 20px; background: linear-gradient(transparent, rgba(0,0,0,0.62)); font: 600 28px/1.1 var(--font-ui); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .backs { position: absolute; right: 12px; top: 12px; display: flex; }
    .backs pk-card + pk-card { margin-left: -26px; transform: rotate(6deg); }
    .shown { position: absolute; left: 50%; top: -6px; transform: translateX(-50%); display: flex; gap: 8px; z-index: 2; }
    .chip { position: absolute; left: 12px; top: 12px; height: 44px; padding: 0 16px; border-radius: 999px; display: inline-flex; align-items: center; gap: 10px; background: rgba(0,0,0,0.55); font: 600 28px/1 var(--font-ui); z-index: 3; }
    .chip.allin { background: #fff; color: #1e1b4b; }
    .chip.thinking { background: var(--lav-soft); color: #1e1b4b; }
    .dots { display: inline-flex; gap: 4px; }
    .dots i { width: 7px; height: 7px; border-radius: 50%; background: currentColor; animation: pk-blink 1.2s infinite ease-in-out; }
    .dots i:nth-child(2) { animation-delay: 0.15s; }
    .dots i:nth-child(3) { animation-delay: 0.3s; }
    .ring { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; z-index: 2; }
    .ring rect { fill: none; stroke: #fff; stroke-width: 6; stroke-dasharray: 100 100; stroke-dashoffset: 0; animation-name: pk-ring; animation-timing-function: linear; animation-fill-mode: forwards; vector-effect: non-scaling-stroke; }
    @keyframes pk-ring { to { stroke-dashoffset: 100; } }
    .info { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 12px 6px 0; }
    .stack { font: 600 36px/1 var(--font-display); letter-spacing: -0.02em; }
    .act { font: 500 28px/1 var(--font-ui); color: var(--text-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .act.who { color: #fff; font-weight: 600; }
    .markers { position: absolute; top: -24px; right: 12px; display: flex; gap: 8px; z-index: 4; }
    .marker { height: 52px; min-width: 52px; padding: 0 12px; border-radius: 999px; display: grid; place-items: center; background: var(--lav-soft); color: #1e1b4b; font: 700 28px/1 var(--font-ui); box-shadow: 0 2px 0 rgba(0,0,0,0.4); }
    .marker.dealer { background: #fff; }
    @keyframes pk-blink { 0%, 80%, 100% { opacity: 0.25; } 40% { opacity: 1; } }
  `,
})
export class SeatComponent {
  readonly seat = input.required<SeatView>();
  readonly name = input.required<string>();
  readonly isMe = input(false);
  readonly isTurn = input(false);
  readonly turn = input<TurnView | null>(null);
  readonly engineNow = input(0);
  readonly clockOn = input(false);
  readonly winner = input(false);
  readonly winning = input<ReadonlySet<Card>>(new Set());
  readonly showdown = input(false);
  readonly markers = input<readonly string[]>([]);

  private readonly video = inject(SEAT_VIDEO);

  protected readonly stream = computed(() => this.video.stream(this.seat().player.id));
  protected readonly initial = computed(() => (this.isMe() ? 'Y' : (this.seat().player.name[0] ?? '?')).toUpperCase());
  /** Indigo family only (230–260°), stable per player. */
  protected readonly hue = computed(() => {
    const id = this.seat().player.id;
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997;
    return 232 + (h % 30);
  });
  protected readonly stack = computed(() => chips(this.seat().stack));
  protected readonly action = computed(() => actionLabel(this.seat()));
  protected readonly shown = computed(() => this.seat().shownCards);
  /** Status chip on the tile; hidden while the cards are face up so ranks stay readable. */
  protected readonly chipText = computed(() => (this.shown() ? '' : (STATUS_CHIP[this.seat().status] ?? '')));
  protected readonly ring = computed(() => {
    const t = this.turn();
    if (!this.clockOn() || !t || !t.turnEndsAt) return null;
    const end = t.usingTimeBank ? t.timeBankEndsAt : t.turnEndsAt;
    const start = t.usingTimeBank ? t.turnEndsAt : t.startedAt;
    return { total: Math.max(1, end - start), elapsed: Math.max(0, this.engineNow() - start) };
  });

  protected cardState(c: Card): string {
    if (!this.showdown()) return '';
    return this.winning().has(c) ? 'win' : this.winner() ? '' : 'dim';
  }
}
