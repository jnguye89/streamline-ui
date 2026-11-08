import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { PlayerView } from '../core/api';
import { ScreenFlags } from '../poker.types';
import { TableScreenComponent } from '../table/table-screen.component';
import { PhoneSeatComponent } from './phone-seat.component';

/**
 * Couch play preview: the TV's public view (left, drawn smaller here; full size on the real TV)
 * next to one player's phone (right). Hole cards and action buttons live only on the phone.
 */
@Component({
  selector: 'pk-couch-preview',
  standalone: true,
  imports: [TableScreenComponent, PhoneSeatComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="head">
      <h1>Couch play</h1>
      <p>The TV shows only what everyone can see. Each player's cards and buttons are on their phone.</p>
      @if (previewLabel(); as p) {
        <p class="preview-chip">{{ p }}</p>
      }
    </header>

    <p class="cap tv-cap">TV · public view</p>
    <div class="tv">
      <div class="tv-mini">
        <pk-table-screen [view]="tvView()" [flags]="tvFlags()" />
      </div>
    </div>

    <div class="phone-wrap">
      <pk-phone-seat [view]="phoneView()" [raiseTo]="raiseTo()" />
      <p class="cap">{{ phoneCaption() }}</p>
    </div>
  `,
  styles: `
    :host { position: absolute; inset: 0; display: block; }
    .head { position: absolute; left: 64px; top: 36px; width: 1180px; }
    .head h1 { margin: 0; font: 600 48px/1 var(--font-display); letter-spacing: -0.02em; }
    .head p { margin: 12px 0 0; font: 500 28px/1.3 var(--font-ui); color: var(--text-2); }
    .head .preview-chip { display: inline-block; margin-top: 14px; padding: 10px 18px; border-radius: 999px; background: var(--lav-soft); color: #1e1b4b; font: 600 28px/1 var(--font-ui); }
    .cap { margin: 0; font: 600 28px/1 var(--font-ui); color: var(--text-2); }
    .tv-cap { position: absolute; left: 64px; top: 262px; }
    .tv { position: absolute; left: 64px; top: 310px; width: 1176px; height: 672px; padding: 12px; border-radius: 22px; background: #111117; box-shadow: 0 0 0 2px rgba(255,255,255,0.12); }
    .tv-mini { position: relative; width: 1152px; height: 648px; overflow: hidden; border-radius: 12px; background: #000; }
    .tv-mini pk-table-screen { transform: scale(0.6); transform-origin: 0 0; }
    .phone-wrap { position: absolute; left: 1320px; top: 40px; display: flex; flex-direction: column; align-items: center; gap: 22px; }
  `,
})
export class CouchPreviewComponent {
  readonly tvView = input.required<PlayerView>();
  readonly tvFlags = input.required<ScreenFlags>();
  readonly phoneView = input.required<PlayerView>();
  readonly raiseTo = input<number | null>(null);
  readonly phoneCaption = input("Maya's phone");
  readonly previewLabel = input<string | null>(null);
}
