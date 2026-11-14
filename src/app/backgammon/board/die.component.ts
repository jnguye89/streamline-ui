import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import { Die } from '@skriin/backgammon-core';
import { Tone } from './checker.component';

/** Pip positions on a 3 × 3 grid (0–8, row by row). */
const PIPS: Record<Die, readonly number[]> = {
  1: [4],
  2: [2, 6],
  3: [2, 4, 6],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

/** One die. While rolling it tumbles through random faces (≤ 600 ms, set by the store). */
@Component({
  selector: 'bg-die',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': 'tone()',
    '[class.used]': 'used()',
    '[class.rolling]': 'rolling()',
    '[class.win]': 'win()',
    '[attr.aria-label]': '"Die " + value()',
  },
  template: `
    <div class="face">
      @for (cell of cells; track cell) {
        <span class="cell">
          @if (pips().includes(cell)) {
            <i></i>
          }
        </span>
      }
    </div>
  `,
  styles: `
    :host { display: block; width: var(--die, 76px); height: var(--die, 76px); transition: opacity 200ms ease, transform 200ms var(--ease); }
    .face { width: 100%; height: 100%; border-radius: 22%; display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, 1fr); padding: 16%; box-sizing: border-box; }
    :host(.light) .face { background: #fff; box-shadow: inset 0 -5px 0 #c7cbe0, 0 8px 18px rgba(0,0,0,0.45); --pip: #1e1b4b; }
    :host(.dark) .face { background: #1d1d26; border: 1.5px solid rgba(255,255,255,0.22); box-shadow: inset 0 -5px 0 #0b0b10, 0 8px 18px rgba(0,0,0,0.45); --pip: #fff; }
    .cell { display: grid; place-items: center; }
    .cell i { width: 74%; height: 74%; border-radius: 50%; background: var(--pip); }
    :host(.used) { opacity: 0.28; transform: scale(0.9); }
    :host(.win) .face { box-shadow: 0 0 0 4px var(--lav-soft), 0 8px 18px rgba(0,0,0,0.45); }
    :host(.rolling) .face { animation: tumble 160ms linear infinite; }
    @keyframes tumble { 0% { transform: rotate(-14deg) scale(0.94); } 50% { transform: rotate(12deg) scale(1.04); } 100% { transform: rotate(-14deg) scale(0.94); } }
    @media (prefers-reduced-motion: reduce) { :host(.rolling) .face { animation: none; } }
  `,
})
export class DieComponent {
  readonly value = input.required<Die>();
  readonly tone = input<Tone>('light');
  readonly used = input(false);
  readonly rolling = input(false);
  readonly win = input(false);

  protected readonly cells = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  private readonly face = signal<Die>(1);
  protected readonly pips = computed(() => PIPS[this.rolling() ? this.face() : this.value()]);

  constructor() {
    effect((onCleanup) => {
      if (!this.rolling()) return;
      const t = setInterval(() => this.face.set((1 + Math.floor(Math.random() * 6)) as Die), 75);
      onCleanup(() => clearInterval(t));
    });
  }
}
