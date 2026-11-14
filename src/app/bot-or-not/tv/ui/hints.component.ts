import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { TvInput } from '../../../shared/tv/tv-input-dedupe.service';
import { TvAction } from '../../../shared/tv/tv.types';

export interface Hint {
  readonly glyph: 'A' | 'B' | 'menu';
  readonly label: string;
}

const ACTION: Record<Hint['glyph'], TvAction> = { A: 'select', B: 'back', menu: 'menu' };

/** The buttons that do something right now. Each is also clickable with a mouse. */
@Component({
  selector: 'bon-hints',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (h of items(); track h.glyph) {
      <button type="button" class="hint" (click)="input.emit(action[h.glyph])">
        <span class="bon-glyph" [class.menu]="h.glyph === 'menu'">
          @if (h.glyph === 'menu') {
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14" /></svg>
          } @else {
            {{ h.glyph }}
          }
        </span>
        <span class="label">{{ h.label }}</span>
      </button>
    }
  `,
  styles: `
    :host { display: flex; align-items: center; gap: 26px; }
    .hint { display: flex; align-items: center; gap: 12px; padding: 0; border: 0; background: none; color: inherit; cursor: pointer; }
    .label { font: 500 28px/1 var(--font-ui); color: var(--text-2); white-space: nowrap; }
    svg { width: 22px; height: 22px; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; fill: none; }
  `,
})
export class HintsComponent {
  readonly items = input<readonly Hint[]>([]);
  protected readonly input = inject(TvInput);
  protected readonly action = ACTION;
}
