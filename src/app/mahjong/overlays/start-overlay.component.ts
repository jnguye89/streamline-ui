import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { BotLevel, GameLength } from '@skriin/mahjong-core';
import { LENGTH_LABEL, LEVEL_LABEL, TvAction } from '../mahjong.types';
import { TableStore } from '../table-store.service';

/** New-game screen. One press of A starts with the last-used settings. */
@Component({
  selector: 'mj-start-overlay',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mj-scrim">
      <div class="mj-modal modal">
        <h1 class="mj-title">Mahjong</h1>
        <p class="mj-lead">Hong Kong rules. Make four sets and a pair, worth 3 faan or more.</p>

        <div class="rows">
          <div class="mj-row" [class.focus]="row() === 0" (pointerenter)="row.set(0)">
            <span class="mj-row-label">Game</span>
            <div class="mj-seg">
              @for (l of lengths; track l) {
                <button
                  type="button"
                  [class.on]="store.settings().length === l"
                  (click)="store.patchSettings({ length: l })"
                >
                  {{ lengthLabel[l] }}
                </button>
              }
            </div>
          </div>
          <div class="mj-row" [class.focus]="row() === 1" (pointerenter)="row.set(1)">
            <span class="mj-row-label">Bots</span>
            <div class="mj-seg">
              @for (lv of levels; track lv) {
                <button
                  type="button"
                  [class.on]="store.settings().botLevel === lv"
                  (click)="store.patchSettings({ botLevel: lv })"
                >
                  {{ levelLabel[lv] }}
                </button>
              }
            </div>
          </div>
        </div>

        <div class="actions">
          <button
            type="button"
            class="mj-btn primary"
            [class.focus]="row() === 2 && action() === 0"
            (pointerenter)="row.set(2); action.set(0)"
            (click)="play()"
          >
            Play vs 3 bots <span class="mj-glyph sm">A</span>
          </button>
          <!-- skriin.com: visible way back to the feed (B does the same on this screen). -->
          <button
            type="button"
            class="mj-btn"
            [class.focus]="row() === 2 && action() === 1"
            (pointerenter)="row.set(2); action.set(1)"
            (click)="exit.emit()"
          >
            Back to watch
          </button>
        </div>
        @if (previewEnabled()) {
          <button type="button" class="review" (click)="store.cyclePreview()">
            Review build · press <b>P</b> (or click here) to see the 8 preview states
          </button>
        }
      </div>
    </div>
  `,
  styles: `
    .modal {
      width: 900px;
    }
    .rows {
      display: flex;
      flex-direction: column;
      gap: 14px;
      margin-top: 40px;
    }
    .actions {
      margin-top: 40px;
      display: flex;
      justify-content: center;
      gap: 16px;
    }
    .actions .mj-btn {
      min-width: 340px;
      justify-content: center;
      gap: 18px;
    }
    .review {
      display: block;
      width: 100%;
      margin: 26px 0 0;
      padding: 0;
      border: 0;
      background: none;
      cursor: pointer;
      text-align: center;
      font: 500 22px/1.3 var(--font-ui);
      color: var(--text-3);
    }
    .review b {
      color: var(--text-2);
      font-family: var(--font-mono);
    }
  `,
})
export class StartOverlayComponent {
  protected readonly store = inject(TableStore);
  readonly exit = output<void>();
  /** Review builds only: shows the "press P" button. */
  readonly previewEnabled = input(false);

  protected readonly row = signal(2);
  /** Which button on the bottom row: 0 = Play, 1 = Back to watch. */
  protected readonly action = signal(0);
  protected readonly lengths: readonly GameLength[] = ['quick', 'full'];
  protected readonly levels: readonly BotLevel[] = ['easy', 'medium', 'hard'];
  protected readonly lengthLabel = LENGTH_LABEL;
  protected readonly levelLabel = LEVEL_LABEL;

  handle(a: TvAction): void {
    const r = this.row();
    switch (a) {
      case 'up':
        this.row.set(Math.max(0, r - 1));
        break;
      case 'down':
        this.row.set(Math.min(2, r + 1));
        break;
      case 'left':
      case 'right': {
        const step = a === 'right' ? 1 : -1;
        if (r === 0) this.store.patchSettings({ length: step > 0 ? 'full' : 'quick' });
        if (r === 2) this.action.set(step > 0 ? 1 : 0);
        if (r === 1) {
          const i = this.levels.indexOf(this.store.settings().botLevel);
          this.store.patchSettings({ botLevel: this.levels[Math.max(0, Math.min(2, i + step))] });
        }
        break;
      }
      case 'select':
        if (r === 2) {
          if (this.action() === 1) this.exit.emit();
          else this.play();
        } else this.row.set(r + 1);
        break;
      case 'back':
        this.exit.emit();
        break;
      default:
        break;
    }
  }

  protected play(): void {
    this.store.playUi('turn');
    this.store.startGame();
  }
}
