import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Side } from '@skriin/backgammon-core';
import { LEVEL_LABEL } from '../backgammon.types';
import { CheckerComponent } from '../board/checker.component';
import { GameStore } from '../game-store.service';

/** Player card: who, what they're doing, pip count, score. */
@Component({
  selector: 'bg-player-card',
  standalone: true,
  imports: [CheckerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bg-card card" [class.active]="active()">
      <div class="row">
        <div class="avatar"><bg-checker [tone]="side() === 0 ? 'light' : 'dark'" /></div>
        <div class="who">
          <div class="name">{{ seat().name }}</div>
          <div class="sub">
            @if (thinking()) {
              <span class="dots"><i></i><i></i><i></i></span> Thinking
            } @else {
              {{ sub() }}
            }
          </div>
        </div>
      </div>
      <div class="tiles">
        @if (store.settings().pips) {
          <div class="tile">
            <span class="v">{{ pips() }}</span>
            <span class="k">pips</span>
          </div>
        }
        <div class="tile">
          <span class="v">{{ score() }}</span>
          <span class="k">{{ scoreLabel() }}</span>
        </div>
      </div>
    </div>
  `,
  styles: `
    .card { padding: 24px 26px 22px; transition: border-color 200ms ease, box-shadow 200ms ease; }
    .card.active { border-color: var(--lav); box-shadow: inset 0 0 0 1px var(--lav); }
    .row { display: flex; align-items: center; gap: 18px; }
    .avatar { width: 64px; height: 64px; flex: none; border-radius: 16px; background: var(--pt-a); padding: 8px; box-sizing: border-box; }
    .who { flex: 1; min-width: 0; }
    .name { font: 600 32px/1.1 var(--font-display); letter-spacing: -0.02em; }
    .sub { margin-top: 6px; font: 500 22px/1.2 var(--font-ui); color: var(--text-2); display: flex; align-items: center; gap: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .card.active .sub { color: var(--lav-soft); }
    .tiles { display: flex; gap: 10px; margin-top: 20px; }
    .tile { flex: 1; display: flex; align-items: baseline; gap: 10px; padding: 14px 18px; border-radius: 16px; background: rgba(255,255,255,0.05); }
    .v { font: 600 40px/1 var(--font-display); letter-spacing: -0.02em; }
    .k { font: 500 20px/1 var(--font-ui); color: var(--text-3); }
    .dots { display: inline-flex; gap: 5px; }
    .dots i { width: 8px; height: 8px; border-radius: 50%; background: currentColor; animation: blink 1.2s infinite ease-in-out; }
    .dots i:nth-child(2) { animation-delay: 0.15s; }
    .dots i:nth-child(3) { animation-delay: 0.3s; }
    @keyframes blink { 0%, 80%, 100% { opacity: 0.25; } 40% { opacity: 1; } }
  `,
})
export class PlayerCardComponent {
  readonly side = input.required<Side>();
  protected readonly store = inject(GameStore);

  protected readonly seat = computed(() => this.store.seats()[this.side()]);
  protected readonly active = computed(() => {
    const v = this.store.view();
    const over = v.phase === 'game-over' || v.phase === 'match-over';
    return this.store.playing() && !over && v.turn === this.side();
  });
  protected readonly thinking = computed(() => this.active() && this.seat().isBot && this.store.view().thinking);
  protected readonly pips = computed(() => this.store.view().pips[this.side()]);
  protected readonly score = computed(() => this.store.view().score[this.side()]);
  protected readonly scoreLabel = computed(() => {
    const len = this.store.view().match.length;
    return len > 0 ? `of ${len}` : this.score() === 1 ? 'point' : 'points';
  });
  protected readonly sub = computed(() => {
    const v = this.store.view();
    const seat = this.seat();
    if (this.active()) {
      if (v.phase === 'opening') return 'Opening roll';
      if (v.phase === 'pre-roll' || v.phase === 'double-offered') return 'To roll';
      return 'To move';
    }
    if (seat.isBot) return `${LEVEL_LABEL[v.config.level]} level`;
    const bottom = this.side() === this.store.bottom();
    const left = this.store.settings().homeLeft;
    return `Home ${bottom ? 'bottom' : 'top'}-${left ? 'left' : 'right'}`;
  });
}
