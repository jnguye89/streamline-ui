import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { ordinal, signedScore } from '../format';
import { TvAction } from '../mahjong.types';
import { TableStore } from '../table-store.service';

type ButtonId = 'again' | 'exit';

/** End of the East round (quick game) or of all four rounds: final scores. */
@Component({
  selector: 'mj-game-end',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (rows().length) {
      <div class="mj-scrim">
        <div class="mj-modal modal">
          <div class="badge">{{ badge() }}</div>
          <h1 class="mj-title">{{ title() }}</h1>
          <p class="mj-lead">{{ lead() }}</p>

          <div class="table">
            @for (r of rows(); track r.seat) {
              <div class="row" [class.first]="r.place === 1" [class.you]="r.you">
                <span class="place">{{ r.placeText }}</span>
                <span class="name">{{ r.name }}</span>
                <span class="wins">{{ r.winsText }}</span>
                <span class="score">{{ r.scoreText }}</span>
              </div>
            }
          </div>

          <div class="actions">
            @for (b of buttons; track b.id; let i = $index) {
              <button
                type="button"
                class="mj-btn"
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
    }
  `,
  styles: `
    .modal {
      width: 1000px;
    }
    .badge {
      display: inline-block;
      padding: 10px 18px;
      border-radius: 999px;
      font: 600 22px/1 var(--font-ui);
      background: rgba(255, 255, 255, 0.08);
      color: var(--text-2);
      margin-bottom: 18px;
    }
    .table {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 34px;
    }
    .row {
      display: grid;
      grid-template-columns: 90px 1fr 260px 160px;
      align-items: center;
      padding: 18px 24px;
      border-radius: 20px;
      background: rgba(255, 255, 255, 0.05);
    }
    .row.first {
      background: rgba(79, 70, 229, 0.3);
    }
    .place {
      font: 600 28px/1 var(--font-display);
      color: var(--text-2);
    }
    .row.first .place {
      color: #fff;
    }
    .name {
      font: 600 34px/1 var(--font-display);
      letter-spacing: -0.02em;
    }
    .wins {
      font: 500 24px/1 var(--font-ui);
      color: var(--text-2);
    }
    .score {
      text-align: right;
      font: 600 36px/1 var(--font-display);
      font-variant-numeric: tabular-nums;
    }
    .actions {
      display: flex;
      justify-content: center;
      gap: 16px;
      margin-top: 40px;
    }
  `,
})
export class GameEndComponent {
  protected readonly store = inject(TableStore);
  readonly exit = output<void>();

  protected readonly index = signal(0);
  protected readonly buttons: ReadonlyArray<{ id: ButtonId; label: string }> = [
    { id: 'again', label: 'Play again' },
    { id: 'exit', label: 'Exit' },
  ];

  protected readonly rows = computed(() => {
    const v = this.store.view();
    if (!v?.standings) return [];
    return v.standings.map((s) => ({
      seat: s.seat,
      place: s.place,
      placeText: ordinal(s.place),
      you: s.seat === v.you,
      name: s.seat === v.you ? 'You' : v.seats[s.seat].name,
      winsText: s.wins
        ? `${s.wins} ${s.wins === 1 ? 'win' : 'wins'}${s.selfDrawn ? ` · ${s.selfDrawn} self-drawn` : ''}`
        : 'No wins',
      scoreText: signedScore(s.score),
    }));
  });
  protected readonly badge = computed(() => {
    const v = this.store.view();
    if (!v) return '';
    const hands = v.round.handsPlayed + 1;
    return `${v.round.length === 'quick' ? 'Quick game' : 'Full game'} · ${hands} hands`;
  });
  protected readonly title = computed(() =>
    this.store.view()?.round.length === 'quick' ? 'East round over.' : 'Game over.',
  );
  protected readonly lead = computed(() => {
    const first = this.rows()[0];
    if (!first) return '';
    return first.you ? 'You finish first.' : `${first.name} finishes first.`;
  });

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
    if (id === 'again') {
      if (this.store.preview()) {
        this.store.showToast('Preview only. Press P to leave the preview.');
        return;
      }
      this.store.startGame();
    } else this.exit.emit();
  }
}
