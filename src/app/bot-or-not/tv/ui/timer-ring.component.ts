import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Timer } from '../../core/types';

/** Countdown ring. The server owns the timer; this only draws what's left. */
@Component({
  selector: 'bon-timer-ring',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ring" [style.width.px]="size()" [style.height.px]="size()" [class.low]="seconds() <= 5">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle class="track" cx="50" cy="50" r="44" />
        <circle class="left" cx="50" cy="50" r="44" pathLength="100" [style.stroke-dashoffset]="100 - fraction() * 100" />
      </svg>
      <span class="n" [style.font-size.px]="size() * 0.36">{{ seconds() }}</span>
    </div>
  `,
  styles: `
    :host { display: inline-block; }
    .ring { position: relative; display: grid; place-items: center; }
    svg { position: absolute; inset: 0; transform: rotate(-90deg); }
    circle { fill: none; stroke-width: 7; }
    .track { stroke: rgba(255, 255, 255, 0.12); }
    .left { stroke: var(--lav-soft, #c7d2fe); stroke-linecap: round; stroke-dasharray: 100; transition: stroke-dashoffset 120ms linear, stroke 200ms ease; }
    .low .left { stroke: #fff; }
    .n { font-family: 'JetBrains Mono', ui-monospace, monospace; font-weight: 500; line-height: 1; color: #fff; }
  `,
})
export class TimerRingComponent {
  readonly timer = input<Timer | null>(null);
  readonly now = input(0);
  readonly size = input(140);

  private readonly remaining = computed(() => {
    const t = this.timer();
    if (!t) return 0;
    return t.running && t.endsAt !== null ? Math.max(0, t.endsAt - this.now()) : t.remainingMs;
  });
  protected readonly fraction = computed(() => {
    const t = this.timer();
    return t && t.totalMs > 0 ? Math.min(1, this.remaining() / t.totalMs) : 0;
  });
  protected readonly seconds = computed(() => Math.ceil(this.remaining() / 1000));
}
