import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TvAction } from '../checkers.types';
import { TvInputService } from '../tv-input.service';

interface LegendItem {
  readonly glyph: string;
  readonly label: string;
  readonly action: TvAction;
  readonly menu?: boolean;
}

/** Controller buttons, always visible. Each one is also clickable with a mouse. */
@Component({
  selector: 'ck-controls-legend',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ck-card card">
      <div class="grid">
        @for (item of items; track item.glyph) {
          <button class="item" type="button" (click)="input.emit(item.action)">
            <span class="ck-glyph" [class.menu]="item.menu">
              @if (item.menu) {
                <svg viewBox="0 0 24 24"><path d="M5 7h14M5 12h14M5 17h14" /></svg>
              } @else {
                {{ item.glyph }}
              }
            </span>
            <span class="label">{{ item.label }}</span>
          </button>
        }
      </div>
      <p class="remote">Short remote: OK = A · Back = B</p>
    </div>
  `,
  styles: `
    .card { padding: 24px 24px 22px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 8px; }
    .item { display: flex; align-items: center; gap: 14px; padding: 6px; border: 0; background: none; color: inherit; cursor: pointer; border-radius: 14px; text-align: left; }
    .item:hover { background: rgba(255,255,255,0.06); }
    .label { font: 500 22px/1.1 var(--font-ui); color: var(--text-2); }
    .remote { margin: 16px 6px 0; font: 500 18px/1.3 var(--font-ui); color: var(--text-3); }
    .ck-glyph svg { width: 22px; height: 22px; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; fill: none; }
  `,
})
export class ControlsLegendComponent {
  protected readonly input = inject(TvInputService);
  protected readonly items: readonly LegendItem[] = [
    { glyph: 'A', label: 'Select', action: 'select' },
    { glyph: 'B', label: 'Back', action: 'back' },
    { glyph: 'X', label: 'Undo', action: 'undo' },
    { glyph: 'Y', label: 'Hint', action: 'hint' },
    { glyph: '≡', label: 'Menu', action: 'menu', menu: true },
  ];
}
