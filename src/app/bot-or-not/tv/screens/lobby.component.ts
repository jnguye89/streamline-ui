import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TvAction } from '../../../shared/tv/tv.types';
import { COPY } from '../../core/copy';
import { MIN_HUMANS } from '../../core/settings';
import { PublicState } from '../../core/types';
import { QrComponent } from '../ui/qr.component';

/** Lobby: room code + QR on the right, Start (A) once 3+ humans are in. */
@Component({
  selector: 'bon-lobby',
  standalone: true,
  imports: [QrComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="left">
      <h1 class="title">{{ copy.title }}</h1>
      <p class="lead">{{ copy.lobbyLead }}</p>

      <div class="count">
        <span class="n">{{ copy.playersIn(humans()) }}</span>
        <span class="sum">{{ summary() }}</span>
      </div>

      <div class="actions">
        <button
          type="button"
          class="bon-btn primary start"
          [class.focus]="focus() === 0"
          [class.off]="!canStart()"
          (pointerenter)="focus.set(0)"
          (click)="activate(0)"
        >
          {{ canStart() ? copy.start : copy.needMore(missing()) }}
          @if (canStart()) {
            <span class="bon-glyph sm">A</span>
          }
        </button>
        <button type="button" class="bon-btn" [class.focus]="focus() === 1" (pointerenter)="focus.set(1)" (click)="activate(1)">
          {{ copy.settings }}
        </button>
        <button type="button" class="bon-btn" [class.focus]="focus() === 2" (pointerenter)="focus.set(2)" (click)="activate(2)">
          Back to watch
        </button>
      </div>
    </section>

    <aside class="join bon-panel">
      <bon-qr [text]="joinUrl()" [size]="300" />
      <div class="how">
        <span class="scan">{{ copy.scanToJoin }}</span>
        <span class="or">{{ copy.orGoTo }} skriin.com/play</span>
      </div>
      <div class="code" aria-label="Room code">{{ state().code }}</div>
    </aside>
  `,
  styles: `
    :host { position: absolute; inset: 0; display: block; }
    .left { position: absolute; left: 24px; top: 64px; width: 1040px; }
    .title { margin: 0; font: 600 140px/0.95 var(--font-display); letter-spacing: -0.045em; }
    .lead { margin: 30px 0 0; font: 500 40px/1.3 var(--font-ui); color: var(--text-2); max-width: 900px; }
    .count { display: flex; flex-direction: column; gap: 12px; margin-top: 54px; }
    .count .n { font: 600 44px/1 var(--font-display); letter-spacing: -0.02em; }
    .count .sum { font: 500 28px/1.2 var(--font-ui); color: var(--text-3); }
    .actions { display: flex; gap: 18px; margin-top: 40px; }
    .start { min-width: 280px; justify-content: center; gap: 18px; }
    .start.off { background: rgba(255, 255, 255, 0.1); color: var(--text-2); }
    .join { position: absolute; right: 24px; top: 40px; width: 560px; padding: 44px 40px 40px; display: flex; flex-direction: column; align-items: center; }
    .how { display: flex; flex-direction: column; align-items: center; gap: 10px; margin-top: 28px; }
    .scan { font: 600 32px/1 var(--font-ui); }
    .or { font: 500 28px/1 var(--font-ui); color: var(--text-2); }
    .code { margin-top: 22px; font: 500 104px/1 var(--font-mono); letter-spacing: 0.14em; padding-left: 0.14em; color: #fff; }
  `,
})
export class LobbyComponent {
  readonly state = input.required<PublicState>();
  readonly start = output<void>();
  readonly openSettings = output<void>();
  /** skriin.com: leave the game for the watch feed. */
  readonly exit = output<void>();

  protected readonly copy = COPY;
  protected readonly focus = signal(0);

  protected readonly humans = computed(() => this.state().players.filter((p) => p.kind === 'human' && p.connected).length);
  protected readonly canStart = computed(() => this.humans() >= MIN_HUMANS);
  protected readonly missing = computed(() => Math.max(0, MIN_HUMANS - this.humans()));
  protected readonly joinUrl = computed(() => `https://skriin.com/play/${this.state().code}`);
  protected readonly summary = computed(() => {
    const s = this.state().settings;
    const mode = s.mode === 'classic' ? 'Classic' : 'Bluff';
    return `${s.rounds} rounds · ${mode} · Family mode ${s.familyMode ? 'on' : 'off'}`;
  });

  handle(a: TvAction): void {
    switch (a) {
      case 'left':
      case 'up':
        this.focus.set(Math.max(0, this.focus() - 1));
        break;
      case 'right':
      case 'down':
        this.focus.set(Math.min(2, this.focus() + 1));
        break;
      case 'select':
        this.activate(this.focus());
        break;
      default:
        break;
    }
  }

  protected activate(i: number): void {
    this.focus.set(i);
    if (i === 1) this.openSettings.emit();
    else if (i === 2) this.exit.emit();
    else if (this.canStart()) this.start.emit();
  }
}
