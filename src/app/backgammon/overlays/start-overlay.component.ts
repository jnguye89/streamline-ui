import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { MatchLength } from '@skriin/backgammon-core';
import { LEVELS, LEVEL_LABEL, MATCH_LENGTHS, PlayMode, TvAction } from '../backgammon.types';
import { GameStore } from '../game-store.service';

type Row = 'mode' | 'level' | 'match' | 'play';

/** New-match screen. One press of A starts with the last-used setup. */
@Component({
  selector: 'bg-start-overlay',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bg-scrim">
      <div class="bg-modal modal">
        <h1 class="bg-title">Backgammon</h1>
        <p class="bg-lead">Race your 15 checkers home and bear them off first.</p>

        <div class="rows">
          <div class="bg-row" [class.focus]="row() === 'mode'" (pointerenter)="row.set('mode')">
            <span class="bg-row-label">Play</span>
            <div class="bg-seg">
              @for (m of modes; track m.value) {
                <button type="button" [class.on]="s().mode === m.value" (click)="setMode(m.value)">{{ m.label }}</button>
              }
              <button type="button" class="soon" disabled>Online · soon</button>
            </div>
          </div>

          <div class="bg-row" [class.focus]="row() === 'level'" [class.dim]="s().mode === 'couch'" (pointerenter)="row.set('level')">
            <span class="bg-row-label">Level</span>
            <div class="bg-seg">
              @for (lv of levels; track lv) {
                <button type="button" [class.on]="s().level === lv" (click)="store.patchSettings({ level: lv })">
                  {{ levelLabel[lv] }}
                </button>
              }
            </div>
          </div>

          <div class="bg-row" [class.focus]="row() === 'match'" (pointerenter)="row.set('match')">
            <span class="bg-row-label">Match</span>
            <div class="bg-seg">
              @for (n of lengths; track n) {
                <button type="button" [class.on]="s().matchLength === n" (click)="setLength(n)">
                  {{ n === 0 ? 'Single game' : n }}
                </button>
              }
            </div>
          </div>
        </div>

        <p class="note">{{ note() }}</p>

        <div class="actions">
          <button
            type="button"
            class="bg-btn primary"
            [class.focus]="row() === 'play' && action() === 0"
            (pointerenter)="row.set('play'); action.set(0)"
            (click)="play()"
          >
            Play <span class="bg-glyph sm">A</span>
          </button>
          <!-- skriin.com: visible way back to the feed (B does the same on this screen). -->
          <button
            type="button"
            class="bg-btn"
            [class.focus]="row() === 'play' && action() === 1"
            (pointerenter)="row.set('play'); action.set(1)"
            (click)="exit.emit()"
          >
            Back to watch
          </button>
        </div>
      </div>
    </div>
  `,
  styles: `
    .modal { width: 1000px; }
    .rows { display: flex; flex-direction: column; gap: 14px; margin-top: 40px; }
    .bg-row.dim { opacity: 0.4; }
    .soon { opacity: 0.45; cursor: default; }
    .note { margin: 22px 0 0; font: 500 22px/1.35 var(--font-ui); color: var(--text-3); text-align: center; }
    .actions { margin-top: 30px; display: flex; justify-content: center; gap: 16px; }
    .actions .bg-btn { min-width: 280px; justify-content: center; gap: 18px; }
  `,
})
export class StartOverlayComponent {
  protected readonly store = inject(GameStore);
  readonly exit = output<void>();

  protected readonly row = signal<Row>('play');
  /** Which button on the bottom row: 0 = Play, 1 = Back to watch. */
  protected readonly action = signal(0);
  protected readonly s = this.store.settings;
  protected readonly levels = LEVELS;
  protected readonly levelLabel = LEVEL_LABEL;
  protected readonly lengths = MATCH_LENGTHS;
  protected readonly modes: ReadonlyArray<{ value: PlayMode; label: string }> = [
    { value: 'bot', label: 'vs Computer' },
    { value: 'couch', label: 'Couch · 2 players' },
  ];

  protected readonly rows = computed<Row[]>(() =>
    this.s().mode === 'couch' ? ['mode', 'match', 'play'] : ['mode', 'level', 'match', 'play'],
  );

  protected readonly note = computed(() => {
    const st = this.s();
    const cube = st.cube ? 'Doubling cube on' : 'Cube off';
    if (st.matchLength === 0) return `${cube}${st.cube && st.jacoby ? ' · Jacoby rule' : ''} · points only, nothing to win`;
    return `${cube} · Crawford rule · first to ${st.matchLength} ${st.matchLength === 1 ? 'point' : 'points'}`;
  });

  handle(a: TvAction): void {
    const rows = this.rows();
    const i = Math.max(0, rows.indexOf(this.row()));
    switch (a) {
      case 'up':
        this.row.set(rows[Math.max(0, i - 1)]);
        break;
      case 'down':
        this.row.set(rows[Math.min(rows.length - 1, i + 1)]);
        break;
      case 'left':
      case 'right': {
        const step = a === 'right' ? 1 : -1;
        if (this.row() === 'mode') this.setMode(this.s().mode === 'bot' ? 'couch' : 'bot');
        if (this.row() === 'level') this.store.cycle('level', step);
        if (this.row() === 'match') this.store.cycle('matchLength', step);
        if (this.row() === 'play') this.action.set(step > 0 ? 1 : 0);
        break;
      }
      case 'select':
        if (this.row() === 'play') {
          if (this.action() === 1) this.exit.emit();
          else this.play();
        } else this.row.set(rows[Math.min(rows.length - 1, i + 1)]);
        break;
      case 'back':
        this.exit.emit();
        break;
      default:
        break;
    }
  }

  protected setMode(mode: PlayMode): void {
    this.store.patchSettings({ mode });
  }

  protected setLength(n: MatchLength): void {
    this.store.patchSettings({ matchLength: n });
  }

  protected play(): void {
    this.store.playUi('select');
    this.store.start();
  }
}
