import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TvAction } from '../../../shared/tv/tv.types';
import { COPY } from '../../core/copy';
import { ANSWER_OPTIONS, ROUND_OPTIONS } from '../../core/settings';
import { Settings } from '../../core/types';

interface Option {
  readonly label: string;
  readonly patch: Partial<Settings>;
  readonly on: boolean;
}
interface SettingRow {
  readonly id: string;
  readonly label: string;
  readonly options: readonly Option[];
  readonly locked?: string;
}

/** Lobby settings. D-pad up/down picks a row, left/right changes it, A on Done (or B) closes. */
@Component({
  selector: 'bon-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bon-scrim">
      <div class="bon-modal modal">
        <h2 class="bon-title sm">{{ copy.settings }}</h2>
        <div class="rows">
          @for (r of rows(); track r.id; let i = $index) {
            <div class="bon-row" [class.focus]="row() === i" (pointerenter)="row.set(i)">
              <span class="bon-row-label">{{ r.label }}</span>
              @if (r.locked) {
                <span class="locked">{{ r.locked }}</span>
              } @else {
                <div class="bon-seg">
                  @for (o of r.options; track o.label) {
                    <button type="button" [class.on]="o.on" (click)="change.emit(o.patch)">{{ o.label }}</button>
                  }
                </div>
              }
            </div>
          }
        </div>
        <div class="done">
          <button type="button" class="bon-btn primary" [class.focus]="row() === rows().length" (pointerenter)="row.set(rows().length)" (click)="close.emit()">
            Done <span class="bon-glyph sm">A</span>
          </button>
        </div>
      </div>
    </div>
  `,
  styles: `
    .modal { width: 1080px; padding: 48px 56px; }
    .rows { display: flex; flex-direction: column; gap: 10px; margin-top: 30px; }
    .locked { font: 500 28px/1 var(--font-ui); color: var(--text-3); padding: 22px 24px; }
    .done { display: flex; justify-content: center; margin-top: 34px; }
    .done .bon-btn { min-width: 240px; justify-content: center; gap: 18px; }
  `,
})
export class SettingsComponent {
  readonly settings = input.required<Settings>();
  readonly live = input(false);
  readonly change = output<Partial<Settings>>();
  readonly close = output<void>();

  protected readonly copy = COPY;
  protected readonly row = signal(0);

  protected readonly rows = computed<SettingRow[]>(() => {
    const s = this.settings();
    return [
      {
        id: 'rounds',
        label: 'Rounds',
        options: ROUND_OPTIONS.map((n) => ({ label: String(n), patch: { rounds: n }, on: s.rounds === n })),
      },
      {
        id: 'answer',
        label: 'Time to answer',
        options: ANSWER_OPTIONS.map((n) => ({ label: `${n} s`, patch: { answerSeconds: n }, on: s.answerSeconds === n })),
      },
      {
        id: 'mode',
        label: 'Scoring',
        options: [
          { label: 'Classic', patch: { mode: 'classic' }, on: s.mode === 'classic' },
          { label: 'Bluff', patch: { mode: 'bluff' }, on: s.mode === 'bluff' },
        ],
      },
      {
        id: 'bot2',
        label: 'Second bot at 7+ players',
        options: [
          { label: 'On', patch: { secondBot: true }, on: s.secondBot },
          { label: 'Off', patch: { secondBot: false }, on: !s.secondBot },
        ],
      },
      {
        id: 'family',
        label: 'Family mode',
        locked: this.live() ? `On · ${COPY.lockedWhileLive}` : undefined,
        options: [
          { label: 'On', patch: { familyMode: true }, on: s.familyMode },
          { label: 'Off', patch: { familyMode: false }, on: !s.familyMode },
        ],
      },
      {
        id: 'names',
        label: 'Names on TV',
        options: [
          { label: 'Show', patch: { showNames: true }, on: s.showNames },
          { label: 'Hide', patch: { showNames: false }, on: !s.showNames },
        ],
      },
    ];
  });

  handle(a: TvAction): void {
    const rows = this.rows();
    const r = this.row();
    switch (a) {
      case 'up':
        this.row.set(Math.max(0, r - 1));
        break;
      case 'down':
        this.row.set(Math.min(rows.length, r + 1));
        break;
      case 'left':
      case 'right': {
        const current = rows[r];
        if (!current || current.locked) break;
        const at = current.options.findIndex((o) => o.on);
        const next = current.options[Math.max(0, Math.min(current.options.length - 1, at + (a === 'right' ? 1 : -1)))];
        if (next && next !== current.options[at]) this.change.emit(next.patch);
        break;
      }
      case 'select':
        if (r >= rows.length) this.close.emit();
        else this.row.set(r + 1);
        break;
      case 'back':
      case 'menu':
        this.close.emit();
        break;
      default:
        break;
    }
  }
}
