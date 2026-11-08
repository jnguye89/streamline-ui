import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { PokerMode, TvAction } from '../poker.types';
import { joinUrl } from '../session/ports';
import { QrComponent } from './qr.component';

/**
 * Join screen for a friends table or couch play: 4-consonant code, the same link as a QR,
 * and who's in. Joining is connected in Phase 3; in this preview the seats are examples.
 */
@Component({
  selector: 'pk-lobby',
  standalone: true,
  imports: [QrComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ck-scrim">
      <div class="ck-modal modal">
        <div class="cols">
          <div class="left">
            <h1 class="ck-title sm">{{ mode() === 'couch' ? 'Couch play' : 'Friends table' }}</h1>
            <p class="ck-lead">{{ lead() }}</p>
            <div class="code" aria-label="Table code">{{ code() }}</div>
            <p class="url">{{ url() }}</p>
            <ul class="seats">
              @for (s of seats(); track s.name) {
                <li [class.wait]="s.waiting"><span class="dot"></span>{{ s.name }}<span class="tag">{{ s.tag }}</span></li>
              }
            </ul>
          </div>
          <div class="right">
            <pk-qr [text]="'https://' + url()" [size]="360" />
            <p class="scan">Scan with a phone camera</p>
          </div>
        </div>
        <p class="note">Preview: joining isn't connected yet. B to go back.</p>
      </div>
    </div>
  `,
  styles: `
    .modal { width: 1240px; padding: 56px 64px; }
    .cols { display: flex; gap: 64px; align-items: flex-start; }
    .left { flex: 1; }
    .code { margin-top: 36px; font: 600 132px/1 var(--font-display); letter-spacing: 0.12em; }
    .url { margin: 18px 0 0; font: 500 32px/1 var(--font-mono); color: var(--lav-soft); }
    .seats { list-style: none; margin: 36px 0 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
    .seats li { display: flex; align-items: center; gap: 16px; font: 600 30px/1 var(--font-ui); }
    .seats li.wait { color: var(--text-3); }
    .dot { width: 14px; height: 14px; border-radius: 50%; background: var(--lav-soft); }
    .wait .dot { background: transparent; box-shadow: inset 0 0 0 2px rgba(255,255,255,0.4); }
    .tag { font: 500 28px/1 var(--font-ui); color: var(--text-3); }
    .right { display: flex; flex-direction: column; align-items: center; gap: 20px; padding-top: 12px; }
    .scan { margin: 0; font: 500 28px/1 var(--font-ui); color: var(--text-2); }
    .note { margin: 40px 0 0; font: 500 28px/1.3 var(--font-ui); color: var(--text-3); }
  `,
})
export class LobbyComponent {
  readonly mode = input.required<PokerMode>();
  readonly code = input('BKTR');
  readonly back = output<void>();

  protected readonly url = computed(() => joinUrl(this.code()));
  protected readonly lead = computed(() =>
    this.mode() === 'couch'
      ? 'Everyone on this couch joins on their phone. Cards and buttons stay on the phone; the TV shows the table.'
      : 'Friends join from any phone browser or the skriin ai TV app. Bots fill empty seats.',
  );
  protected readonly seats = computed(() => [
    { name: 'You', tag: 'host', waiting: false },
    { name: 'Maya', tag: this.mode() === 'couch' ? 'on the couch' : 'joined', waiting: false },
    { name: 'Waiting for a friend…', tag: '', waiting: true },
    { name: 'Bot · Nova', tag: 'fills a seat', waiting: false },
  ]);

  handle(a: TvAction): void {
    if (a === 'back' || a === 'select') this.back.emit();
  }
}
