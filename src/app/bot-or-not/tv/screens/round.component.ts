import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { COPY } from '../../core/copy';
import { PublicState } from '../../core/types';
import { TimerRingComponent } from '../ui/timer-ring.component';

/** Prompt intro, answering (who's in, never what), and the "not enough answers" beat. */
@Component({
  selector: 'bon-round',
  standalone: true,
  imports: [TimerRingComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (state().phase === 'void') {
      <section class="void">
        <h1 class="big">{{ copy.notEnough }}</h1>
        <p class="sub">{{ state().voidRetry ? copy.newPrompt : copy.skipping }}</p>
      </section>
    } @else {
      @if (state().lastRound) {
        <div class="tags"><span class="bon-pill hot">{{ copy.lastRound }}</span></div>
      }
      <section class="prompt" [class.intro]="state().phase === 'prompt'">
        @for (k of roundKey(); track k) {
          <h1 class="text">{{ state().prompt }}</h1>
        }
        <p class="sub">{{ copy.answerOnPhone }}</p>
      </section>
      @if (state().phase === 'answering') {
        <aside class="clock">
          <bon-timer-ring [timer]="state().timer" [now]="now()" [size]="200" />
          <span class="in">{{ answersIn() }}</span>
        </aside>
      }
    }
  `,
  styles: `
    :host { position: absolute; inset: 0; display: block; }
    .tags { position: absolute; left: 24px; top: 40px; }
    .prompt { position: absolute; left: 24px; top: 190px; width: 1360px; }
    .prompt.intro .text { animation: enter 420ms var(--ease) both; }
    .text { margin: 0; font: 600 80px/1.08 var(--font-display); letter-spacing: -0.03em; text-wrap: balance; }
    .sub { margin: 34px 0 0; font: 500 36px/1.3 var(--font-ui); color: var(--text-2); }
    .clock { position: absolute; right: 40px; top: 170px; display: flex; flex-direction: column; align-items: center; gap: 22px; }
    .in { font: 500 32px/1 var(--font-mono); color: var(--text-2); }
    .void { position: absolute; left: 24px; top: 210px; }
    .big { margin: 0; font: 600 96px/1 var(--font-display); letter-spacing: -0.035em; }
    @keyframes enter { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { .prompt.intro .text { animation: none; } }
  `,
})
export class RoundComponent {
  readonly state = input.required<PublicState>();
  readonly now = input(0);
  protected readonly copy = COPY;
  /** Re-creates the prompt each round so its entrance plays again. */
  protected readonly roundKey = computed(() => [this.state().roundKey]);
  protected readonly answersIn = computed(() => COPY.answersIn(this.state().answersIn, this.state().answersExpected));
}
