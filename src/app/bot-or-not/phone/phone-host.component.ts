import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { COPY } from '../core/copy';
import { MIN_HUMANS } from '../core/settings';
import { Phase, PublicState } from '../core/types';
import { HostActions } from '../data/game-client';

const SKIP_LABEL: Partial<Record<Phase, string>> = {
  prompt: 'Start answers now',
  answering: 'End answers now',
  reveal: 'Show all cards',
  voting: 'End voting now',
  results: 'Next round',
  void: 'Next',
};

/** Host tools on a phone (when the room is hosted from a phone). Same powers as the TV menu. */
@Component({
  selector: 'bon-phone-host',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="scrim" (click)="close.emit()"></div>
    <section class="sheet" role="dialog" aria-label="Host tools">
      <div class="grab"></div>
      @switch (level()) {
        @case ('cards') {
          <h2>Hide a card</h2>
          <div class="list">
            @for (c of state().cards; track c.id) {
              <button type="button" class="row" (click)="actions().hideCard(c.id)">
                <span><b>{{ c.letter }}</b> {{ c.hidden ? copy.hiddenByHost : c.text }}</span>
                <span class="val">{{ c.hidden ? 'Show' : 'Hide' }}</span>
              </button>
            }
          </div>
          <button type="button" class="ph-btn ghost" (click)="level.set('main')">Done</button>
        }
        @case ('players') {
          <h2>Remove a player</h2>
          <div class="list">
            @for (p of humans(); track p.id) {
              <button type="button" class="row" [disabled]="p.id === selfId()" (click)="actions().removePlayer(p.id)">
                <span>{{ p.name }}{{ p.id === selfId() ? ' (you)' : '' }}</span>
                <span class="val">Remove</span>
              </button>
            }
          </div>
          <button type="button" class="ph-btn ghost" (click)="level.set('main')">Done</button>
        }
        @default {
          <h2>Host</h2>
          <div class="list">
            @if (state().phase === 'lobby') {
              <button type="button" class="row strong" [disabled]="!canStart()" (click)="actions().start(); close.emit()">
                <span>{{ canStart() ? copy.start : copy.needMore(missing()) }}</span>
              </button>
            }
            @if (skipLabel(); as label) {
              <button type="button" class="row strong" (click)="actions().skip(); close.emit()"><span>{{ label }}</span></button>
            }
            @if (hasCards()) {
              <button type="button" class="row" (click)="level.set('cards')"><span>Hide a card</span><span class="val">›</span></button>
            }
            <button type="button" class="row" (click)="level.set('players')"><span>Remove a player</span><span class="val">›</span></button>
            <button type="button" class="row" [disabled]="state().live" (click)="actions().updateSettings({ familyMode: !state().settings.familyMode })">
              <span>Family mode</span>
              <span class="val">{{ state().live ? 'On · ' + copy.lockedWhileLive : state().settings.familyMode ? 'On' : 'Off' }}</span>
            </button>
            <button type="button" class="row" (click)="actions().updateSettings({ showNames: !state().settings.showNames })">
              <span>Names on TV</span><span class="val">{{ state().settings.showNames ? 'Show' : 'Hide' }}</span>
            </button>
            @if (state().phase === 'final') {
              <button type="button" class="row strong" (click)="actions().playAgain(); close.emit()"><span>{{ copy.playAgain }}</span></button>
            }
            @if (state().phase !== 'lobby') {
              <button type="button" class="row" (click)="actions().toLobby(); close.emit()"><span>End game</span></button>
            }
          </div>
          <button type="button" class="ph-btn ghost" (click)="close.emit()">Close</button>
        }
      }
    </section>
  `,
  styles: `
    :host { position: absolute; inset: 0; z-index: 30; display: block; }
    .scrim { position: absolute; inset: 0; background: rgba(11, 11, 16, 0.4); }
    .sheet {
      position: absolute; left: 0; right: 0; bottom: 0; max-height: 86%; overflow-y: auto; padding: 10px 18px 22px;
      background: #fff; border-radius: 24px 24px 0 0; display: flex; flex-direction: column; gap: 12px;
    }
    .grab { width: 44px; height: 5px; border-radius: 3px; background: #d4d4dc; align-self: center; margin-bottom: 4px; }
    h2 { margin: 4px 2px; font: 600 24px/1.1 var(--ph-display); letter-spacing: -0.01em; }
    .list { display: flex; flex-direction: column; gap: 6px; }
    .row {
      min-height: 56px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px;
      border: 0; border-radius: 14px; background: #f4f4f7; color: #0b0b10; font: 600 17px/1.25 var(--ph-ui); text-align: left; cursor: pointer;
    }
    .row:disabled { opacity: 0.5; cursor: default; }
    .row.strong { background: #4f46e5; color: #fff; }
    .row b { font-family: var(--ph-display); margin-right: 6px; }
    .val { color: #6b6b7b; font-weight: 500; white-space: nowrap; }
  `,
})
export class PhoneHostComponent {
  readonly state = input.required<PublicState>();
  readonly actions = input.required<HostActions>();
  readonly selfId = input<string | null>(null);
  readonly close = output<void>();

  protected readonly copy = COPY;
  protected readonly level = signal<'main' | 'cards' | 'players'>('main');
  protected readonly humans = computed(() => this.state().players.filter((p) => p.kind === 'human'));
  protected readonly canStart = computed(() => this.humans().filter((p) => p.connected).length >= MIN_HUMANS);
  protected readonly missing = computed(() => Math.max(0, MIN_HUMANS - this.humans().filter((p) => p.connected).length));
  protected readonly skipLabel = computed(() => {
    const s = this.state();
    return s.phase === 'results' && s.lastRound ? 'Final scores' : (SKIP_LABEL[s.phase] ?? null);
  });
  protected readonly hasCards = computed(() => ['reveal', 'voting', 'results'].includes(this.state().phase));
}
