import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { TvAction } from '../poker.types';

export interface Choice {
  readonly id: string;
  readonly label: string;
  readonly primary?: boolean;
  /** Small glyph shown in the button, e.g. "A" or "B". */
  readonly glyph?: string;
}

/**
 * A short question with 2–3 buttons: 18+ check, "Check instead?", "Top up to 1,000?".
 * D-pad moves, A picks. B picks the button marked `backId` (or closes when none).
 */
@Component({
  selector: 'pk-choice',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ck-scrim" [class.light]="light()">
      <div class="ck-modal modal" [style.width.px]="width()" role="dialog" [attr.aria-label]="title()">
        @if (badge(); as b) {
          <div class="badge">{{ b }}</div>
        }
        <h1 class="ck-title" [class.sm]="small()">{{ title() }}</h1>
        @if (lead(); as l) {
          <p class="ck-lead">{{ l }}</p>
        }
        <div class="actions">
          @for (c of choices(); track c.id; let i = $index) {
            <button
              type="button"
              class="ck-btn"
              [class.primary]="c.primary"
              [class.focus]="index() === i"
              (pointerenter)="index.set(i)"
              (click)="picked.emit(c.id)"
            >
              {{ c.label }}
              @if (c.glyph) {
                <span class="ck-glyph sm">{{ c.glyph }}</span>
              }
            </button>
          }
        </div>
      </div>
    </div>
  `,
  styles: `
    .badge { display: inline-block; padding: 10px 18px; border-radius: 999px; font: 600 28px/1 var(--font-ui); background: rgba(255,255,255,0.08); color: var(--text-2); margin-bottom: 24px; }
    .actions { margin-top: 44px; display: flex; justify-content: center; gap: 16px; }
    .actions .ck-btn { min-width: 240px; justify-content: center; gap: 16px; }
    .ck-scrim.light { background: rgba(0,0,0,0.5); }
  `,
})
export class ChoiceComponent {
  readonly title = input.required<string>();
  readonly lead = input<string>('');
  readonly badge = input<string>('');
  readonly choices = input.required<readonly Choice[]>();
  readonly backId = input<string | null>(null);
  readonly width = input(860);
  readonly small = input(false);
  readonly light = input(false);
  readonly picked = output<string>();

  protected readonly index = signal(0);

  handle(a: TvAction): void {
    const n = this.choices().length;
    switch (a) {
      case 'left':
      case 'up':
        this.index.update((i) => Math.max(0, i - 1));
        break;
      case 'right':
      case 'down':
        this.index.update((i) => Math.min(n - 1, i + 1));
        break;
      case 'select': {
        const c = this.choices()[this.index()];
        if (c) this.picked.emit(c.id);
        break;
      }
      case 'back': {
        const id = this.backId();
        if (id) this.picked.emit(id);
        break;
      }
      default:
        break;
    }
  }
}
