import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { LEVELS, LEVEL_LABEL, PieceColor, TvAction } from '../checkers.types';
import { GameStore } from '../game-store.service';

/**
 * New-game screen. One press of A starts with the last-used settings,
 * or resumes the saved game when there is one.
 */
@Component({
  selector: 'ck-start-overlay',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ck-scrim">
      <div class="ck-modal modal">
        <h1 class="ck-title">Checkers</h1>
        <p class="ck-lead">Play the computer. Take every piece or leave it no move to win.</p>

        <div class="rows">
          <div class="ck-row" [class.focus]="row() === 0" (pointerenter)="row.set(0)">
            <span class="ck-row-label">Level</span>
            <div class="ck-seg">
              @for (lv of levels; track lv) {
                <button type="button" [class.on]="store.settings().level === lv" (click)="store.setLevel(lv)">
                  {{ levelLabel[lv] }}
                </button>
              }
            </div>
          </div>

          <div class="ck-row" [class.focus]="row() === 1" (pointerenter)="row.set(1)">
            <span class="ck-row-label">Play as</span>
            <div class="ck-seg">
              @for (c of colors; track c.value) {
                <button
                  type="button"
                  [class.on]="store.settings().playerColor === c.value"
                  (click)="store.setPlayerColor(c.value)"
                >
                  <i class="sw" [class]="c.value"></i>{{ c.label }}
                </button>
              }
            </div>
          </div>
        </div>

        <div class="actions">
          @for (b of buttons(); track b.id; let i = $index) {
            <button
              type="button"
              class="ck-btn"
              [class.primary]="i === 0"
              [class.focus]="row() === 2 && action() === i"
              (pointerenter)="row.set(2); action.set(i)"
              (click)="run(b.id)"
            >
              {{ b.label }}
              @if (i === 0) {
                <span class="ck-glyph sm">A</span>
              }
            </button>
          }
        </div>
        @if (store.saved(); as s) {
          <p class="saved">
            Saved game · {{ levelLabel[s.level] }} · {{ s.playerColor === 'dark' ? 'Dark' : 'Light' }} ·
            {{ s.moves }} {{ s.moves === 1 ? 'move' : 'moves' }} played
          </p>
        }
      </div>
    </div>
  `,
  styles: `
    .modal { width: 820px; }
    .rows { display: flex; flex-direction: column; gap: 14px; margin-top: 40px; }
    .actions { margin-top: 40px; display: flex; justify-content: center; gap: 16px; }
    .actions .ck-btn { min-width: 210px; justify-content: center; gap: 18px; }
    .saved { margin: 22px 0 0; text-align: center; font: 500 22px/1.3 var(--font-ui); color: var(--text-3); }
    .sw { width: 22px; height: 22px; border-radius: 50%; display: inline-block; margin-right: 12px; vertical-align: -4px; }
    .sw.dark { background: var(--p-dark-top); box-shadow: inset 0 -3px 0 var(--p-dark-edge), 0 0 0 1px rgba(255,255,255,0.35); }
    .sw.light { background: var(--p-light-top); box-shadow: inset 0 -3px 0 var(--p-light-edge), 0 0 0 1px rgba(0,0,0,0.25); }
  `,
})
export class StartOverlayComponent {
  protected readonly store = inject(GameStore);
  readonly exit = output<void>();

  protected readonly row = signal(2);
  protected readonly action = signal(0);
  protected readonly levels = LEVELS;
  protected readonly levelLabel = LEVEL_LABEL;
  protected readonly colors: ReadonlyArray<{ value: PieceColor; label: string }> = [
    { value: 'dark', label: 'Dark · first' },
    { value: 'light', label: 'Light · second' },
  ];
  protected readonly buttons = computed(() =>
    this.store.saved()
      ? [
          { id: 'resume' as const, label: 'Resume' },
          { id: 'new' as const, label: 'New game' },
          // skriin.com: visible way back to the feed (B does the same on this screen).
          { id: 'exit' as const, label: 'Back to watch' },
        ]
      : [
          { id: 'new' as const, label: 'Play' },
          { id: 'exit' as const, label: 'Back to watch' },
        ],
  );

  handle(a: TvAction): void {
    const r = this.row();
    const n = this.buttons().length;
    switch (a) {
      case 'up':
        this.row.set(Math.max(0, r - 1));
        break;
      case 'down':
        this.row.set(Math.min(2, r + 1));
        break;
      case 'left':
      case 'right':
        if (r === 0) this.store.cycleLevel(a === 'right' ? 1 : -1);
        if (r === 1) this.store.setPlayerColor(a === 'right' ? 'light' : 'dark');
        if (r === 2) this.action.set(Math.max(0, Math.min(n - 1, this.action() + (a === 'right' ? 1 : -1))));
        break;
      case 'select':
        if (r === 2) this.run(this.buttons()[Math.min(this.action(), n - 1)].id);
        else this.row.set(r + 1);
        break;
      case 'back':
        this.exit.emit();
        break;
      default:
        break;
    }
  }

  protected run(id: 'resume' | 'new' | 'exit'): void {
    if (id === 'exit') {
      this.exit.emit();
      return;
    }
    this.store.playUi('select');
    if (id === 'resume') this.store.continueSaved();
    else this.store.start();
  }
}
