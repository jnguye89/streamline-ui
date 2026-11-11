import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { LEVEL_LABEL, TvAction } from '../checkers.types';
import { GameStore } from '../game-store.service';
import { formatClock } from '../format';

type ButtonId = 'again' | 'new' | 'exit';

@Component({
  selector: 'ck-game-over',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ck-scrim">
      <div class="ck-modal modal" [class]="mood()">
        <div class="badge">{{ badge() }}</div>
        <h1 class="ck-title">{{ title() }}</h1>
        <p class="ck-lead">{{ reason() }}</p>

        <div class="stats">
          <div class="stat"><span class="v">{{ moves() }}</span><span class="k">Moves</span></div>
          <div class="stat"><span class="v">{{ taken() }}</span><span class="k">You captured</span></div>
          <div class="stat"><span class="v">{{ clock() }}</span><span class="k">Time</span></div>
        </div>

        <p class="tally">
          This session · You <b>{{ store.tally().you }}</b> · Computer <b>{{ store.tally().cpu }}</b>
          @if (store.tally().draws) {
            · Draws <b>{{ store.tally().draws }}</b>
          }
        </p>

        <div class="actions">
          @for (b of buttons; track b.id; let i = $index) {
            <button
              type="button"
              class="ck-btn"
              [class.primary]="b.id === 'again'"
              [class.focus]="index() === i"
              (pointerenter)="index.set(i)"
              (click)="activate(b.id)"
            >
              {{ b.label }}
            </button>
          }
        </div>
      </div>
    </div>
  `,
  styles: `
    .modal { width: 860px; }
    .badge { display: inline-block; padding: 10px 18px; border-radius: 999px; font: 600 20px/1 var(--font-ui); background: rgba(255,255,255,0.08); color: var(--text-2); margin-bottom: 22px; }
    .win .badge { background: var(--indigo); color: #fff; }
    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 36px; }
    .stat { background: rgba(255,255,255,0.05); border-radius: 20px; padding: 22px 24px; display: flex; flex-direction: column; gap: 8px; }
    .v { font: 600 44px/1 var(--font-display); letter-spacing: -0.02em; }
    .k { font: 500 20px/1 var(--font-ui); color: var(--text-3); }
    .tally { margin: 26px 0 0; font: 500 22px/1.3 var(--font-ui); color: var(--text-2); }
    .tally b { color: #fff; font-weight: 600; }
    .actions { display: flex; justify-content: center; gap: 16px; margin-top: 40px; }
  `,
})
export class GameOverComponent {
  protected readonly store = inject(GameStore);
  readonly exit = output<void>();

  protected readonly index = signal(0);
  protected readonly buttons: ReadonlyArray<{ id: ButtonId; label: string }> = [
    { id: 'again', label: 'Play again' },
    { id: 'new', label: 'Change level' },
    { id: 'exit', label: 'Exit' },
  ];

  protected readonly mood = computed(() => {
    const o = this.store.outcome();
    if (!o || o.winner === null) return 'draw';
    return o.winner === this.store.playerColor() ? 'win' : 'loss';
  });
  protected readonly badge = computed(() => `Game over · ${LEVEL_LABEL[this.store.settings().level]}`);
  protected readonly title = computed(() =>
    this.mood() === 'win' ? 'You win.' : this.mood() === 'loss' ? 'Computer wins.' : 'Draw.',
  );
  protected readonly reason = computed(() => {
    const o = this.store.outcome();
    if (!o) return '';
    const you = this.mood() === 'win';
    switch (o.reason) {
      case 'no-pieces':
        return you ? 'You took every piece.' : 'The computer took every piece.';
      case 'no-moves':
        return you ? 'The computer has no moves left.' : 'You have no moves left.';
      case 'repetition':
        return 'The same position came up three times.';
      case 'no-progress':
        return '40 moves each with no capture and no man moved.';
      case 'agreement':
        return 'The computer accepted your draw offer.';
      case 'resign':
        return 'You resigned.';
    }
  });
  protected readonly moves = computed(() => Math.ceil(this.store.records().length / 2));
  protected readonly taken = computed(() => 12 - this.store.counts()[this.store.cpuColor()]);
  protected readonly clock = computed(() => formatClock(this.store.elapsed()));

  handle(a: TvAction): void {
    const n = this.buttons.length;
    switch (a) {
      case 'left':
      case 'up':
        this.index.update((i) => (i - 1 + n) % n);
        break;
      case 'right':
      case 'down':
        this.index.update((i) => (i + 1) % n);
        break;
      case 'select':
        this.activate(this.buttons[this.index()].id);
        break;
      case 'back':
        this.exit.emit();
        break;
      default:
        break;
    }
  }

  protected activate(id: ButtonId): void {
    if (id === 'again') this.store.start();
    else if (id === 'new') this.store.toStartScreen();
    else this.exit.emit();
  }
}
