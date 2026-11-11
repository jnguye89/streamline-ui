import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { LEVEL_LABEL } from '../checkers.types';
import { GameStore } from '../game-store.service';
import { PieceComponent } from '../piece/piece.component';

@Component({
  selector: 'ck-player-card',
  standalone: true,
  imports: [PieceComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ck-card card" [class.active]="active()">
      <div class="row">
        <div class="avatar"><ck-piece [color]="color()" /></div>
        <div class="who">
          <div class="name">{{ who() === 'you' ? 'You' : 'Computer' }}</div>
          <div class="sub">
            @if (thinking()) {
              <span class="dots"><i></i><i></i><i></i></span> Thinking
            } @else if (active()) {
              To move
            } @else {
              {{ sub() }}
            }
          </div>
        </div>
        <div class="count">
          <div class="n">{{ left() }}</div>
          <div class="l">{{ left() === 1 ? 'piece' : 'pieces' }}</div>
        </div>
      </div>
      <div class="pips" [class]="color()">
        @for (pip of pips(); track $index) {
          <span class="pip" [class.lost]="pip === 'lost'" [class.king]="pip === 'king'"></span>
        }
      </div>
    </div>
  `,
  styles: `
    .card { padding: 26px 28px 24px; position: relative; transition: border-color 200ms ease, box-shadow 200ms ease; }
    .card.active { border-color: var(--lav); box-shadow: inset 0 0 0 1px var(--lav); }
    .row { display: flex; align-items: center; gap: 18px; }
    .avatar { width: 64px; height: 64px; flex: none; border-radius: 16px; background: var(--sq-dark); padding: 9px; }
    .who { flex: 1; min-width: 0; }
    .name { font: 600 32px/1.1 var(--font-display); letter-spacing: -0.02em; }
    .sub { margin-top: 6px; font: 500 22px/1.2 var(--font-ui); color: var(--text-2); display: flex; align-items: center; gap: 10px; white-space: nowrap; }
    .card.active .sub { color: var(--lav-soft); }
    .count { text-align: right; }
    .n { font: 600 48px/1 var(--font-display); letter-spacing: -0.02em; }
    .l { margin-top: 4px; font: 500 18px/1 var(--font-ui); color: var(--text-3); }
    /* Remaining pieces sit in a tray the color of the board's dark squares, so both colors read. */
    .pips { display: flex; justify-content: space-between; margin-top: 22px; padding: 9px 12px; border-radius: 999px; background: var(--sq-dark); }
    .pip { width: 18px; height: 18px; border-radius: 50%; background: var(--top); box-shadow: inset 0 -3px 0 var(--edge); }
    .pips.light { --top: var(--p-light-top); --edge: var(--p-light-edge); }
    .pips.dark { --top: var(--p-dark-top); --edge: var(--p-dark-edge); }
    .pip.lost { background: transparent; box-shadow: inset 0 0 0 2px rgba(255,255,255,0.28); transform: scale(0.6); }
    .pip.king { background: var(--crown); box-shadow: inset 0 0 0 4px var(--top), inset 0 -3px 0 4px var(--edge); }
    .pips.light { --crown: var(--p-light-crown); }
    .pips.dark { --crown: var(--p-dark-crown); }
    .dots { display: inline-flex; gap: 5px; }
    .dots i { width: 8px; height: 8px; border-radius: 50%; background: currentColor; animation: blink 1.2s infinite ease-in-out; }
    .dots i:nth-child(2) { animation-delay: 0.15s; }
    .dots i:nth-child(3) { animation-delay: 0.3s; }
    @keyframes blink { 0%, 80%, 100% { opacity: 0.25; } 40% { opacity: 1; } }
  `,
})
export class PlayerCardComponent {
  readonly who = input.required<'you' | 'cpu'>();
  private readonly store = inject(GameStore);

  protected readonly color = computed(() =>
    this.who() === 'you' ? this.store.playerColor() : this.store.cpuColor(),
  );
  protected readonly active = computed(
    () =>
      this.store.screen() === 'playing' && !this.store.outcome() && this.store.turn() === this.color(),
  );
  protected readonly thinking = computed(() => this.who() === 'cpu' && this.store.thinking());
  protected readonly left = computed(() => this.store.counts()[this.color()]);
  protected readonly kings = computed(() =>
    this.color() === 'dark' ? this.store.counts().darkKings : this.store.counts().lightKings,
  );
  /** Kings first (crown-colored center), then men, then captured slots. */
  protected readonly pips = computed(() =>
    Array.from({ length: 12 }, (_, i) => (i < this.kings() ? 'king' : i < this.left() ? 'man' : 'lost')),
  );
  protected readonly sub = computed(() =>
    this.who() === 'cpu'
      ? `${LEVEL_LABEL[this.store.settings().level]} level`
      : this.color() === 'dark'
        ? 'Dark · first'
        : 'Light · second',
  );
}
