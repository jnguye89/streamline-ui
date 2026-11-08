import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { Standing } from '../core/api';
import { TvAction } from '../poker.types';
import { ordinal } from '../session/status';

type ButtonId = 'again' | 'exit';

/** Sit & Go end screen. The prize is a trophy on this screen, nothing else (approved answer 4). */
@Component({
  selector: 'pk-finished',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ck-scrim">
      <div class="ck-modal modal" [class.win]="won()">
        <div class="trophy" aria-hidden="true">
          <svg viewBox="0 0 64 64">
            <path class="cup" d="M18 8h28v14c0 9-6 16-14 16s-14-7-14-16z" />
            <path class="handle" d="M18 13H9v5c0 6 4 10 10 10M46 13h9v5c0 6-4 10-10 10" />
            <path class="stem" d="M28 38h8v8h-8zM20 50h24v6H20z" />
          </svg>
        </div>
        <div class="badge">Sit &amp; Go</div>
        <h1 class="ck-title">{{ title() }}</h1>
        <ol class="places">
          @for (s of sorted(); track s.playerId) {
            <li [class.me]="s.playerId === myId()"><span class="p">{{ place(s.place) }}</span>{{ s.playerId === myId() ? 'You' : s.name }}</li>
          }
        </ol>
        <div class="actions">
          @for (b of buttons; track b.id; let i = $index) {
            <button type="button" class="ck-btn" [class.primary]="i === 0" [class.focus]="index() === i" (pointerenter)="index.set(i)" (click)="picked.emit(b.id)">
              {{ b.label }}
            </button>
          }
        </div>
      </div>
    </div>
  `,
  styles: `
    .modal { width: 1040px; text-align: center; }
    .trophy { width: 132px; height: 132px; margin: 0 auto 12px; }
    .trophy svg { width: 100%; height: 100%; }
    .cup { fill: #fff; }
    .win .cup { fill: var(--lav-soft); }
    .handle { fill: none; stroke: #fff; stroke-width: 4; stroke-linecap: round; }
    .stem { fill: var(--indigo); }
    .badge { display: inline-block; padding: 10px 18px; border-radius: 999px; background: var(--indigo); font: 600 28px/1 var(--font-ui); margin-bottom: 20px; }
    .places { list-style: none; margin: 34px auto 0; padding: 0; width: 520px; text-align: left; display: flex; flex-direction: column; gap: 8px; }
    .places li { display: flex; align-items: center; gap: 22px; height: 56px; padding: 0 22px; border-radius: 16px; font: 600 30px/1 var(--font-ui); color: var(--text-2); }
    .places li.me { background: rgba(255,255,255,0.08); color: #fff; }
    .p { width: 72px; font: 600 30px/1 var(--font-display); color: #fff; }
    .actions { display: flex; justify-content: center; gap: 16px; margin-top: 40px; }
  `,
})
export class FinishedComponent {
  readonly standings = input.required<readonly Standing[]>();
  readonly myId = input('you');
  readonly picked = output<ButtonId>();

  protected readonly index = signal(0);
  protected readonly buttons: ReadonlyArray<{ id: ButtonId; label: string }> = [
    { id: 'again', label: 'Play again' },
    { id: 'exit', label: 'Leave table' },
  ];
  protected readonly sorted = computed(() => [...this.standings()].sort((a, b) => a.place - b.place));
  protected readonly myPlace = computed(() => this.standings().find((s) => s.playerId === this.myId())?.place ?? null);
  protected readonly won = computed(() => this.myPlace() === 1);
  protected readonly title = computed(() => {
    const p = this.myPlace();
    if (p === 1) return 'You win the Sit & Go.';
    return p ? `You finished ${ordinal(p)}.` : 'Sit & Go over.';
  });

  protected place(n: number): string {
    return ordinal(n);
  }

  handle(a: TvAction): void {
    switch (a) {
      case 'left':
      case 'up':
        this.index.set(0);
        break;
      case 'right':
      case 'down':
        this.index.set(1);
        break;
      case 'select':
        this.picked.emit(this.buttons[this.index()]!.id);
        break;
      case 'back':
        this.picked.emit('exit');
        break;
      default:
        break;
    }
  }
}
