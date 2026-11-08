import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PlayerView } from '../core/api';
import { chips } from '../core/cards';
import { PRESET_LABEL } from '../session/action-bar.logic';
import { CardComponent } from '../table/card.component';

const SHORT_PRESET: Record<string, string> = { min: 'Min', halfPot: '½', threeQuarterPot: '¾', pot: 'Pot', allIn: 'All-in' };

/**
 * The phone "my seat" view for couch play and streamer mode (web seat view in Phase 3,
 * React Native in Phase 4): big hole cards (press and hold to peek), Fold / Check-Call / Raise,
 * a raise slider with presets. Drawn here as a preview inside a phone outline.
 */
@Component({
  selector: 'pk-phone-seat',
  standalone: true,
  imports: [CardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="phone">
      <div class="screen">
        <header>
          <span class="brand">skriin ai TV</span>
          <span class="table">Table {{ code() }}</span>
        </header>
        <p class="who">{{ name() }} · seat {{ seatNo() }}</p>
        <h3 class="turn">{{ legal() ? 'Your turn.' : 'Waiting…' }}</h3>

        @if (cards(); as c) {
          <div class="cards" [class.peek]="peeking()">
            <pk-card [card]="peeking() ? c[0] : null" size="phone" />
            <pk-card [card]="peeking() ? c[1] : null" size="phone" />
          </div>
          <p class="peek-note">{{ peeking() ? 'Holding to peek' : 'Press and hold to peek' }}</p>
        }
        @if (label(); as l) {
          <p class="label">{{ l }}</p>
        }
        <p class="stack">Stack {{ stack() }} · Pot {{ pot() }}</p>

        @if (legal(); as lg) {
          <div class="slider">
            <div class="track"><i [style.width.%]="sliderPct()"></i><b [style.left.%]="sliderPct()"></b></div>
            <div class="presets">
              @for (p of lg.presets; track p.id) {
                <span class="preset" [class.on]="p.id === activePreset()">{{ short(p.id) }}</span>
              }
            </div>
          </div>
          <div class="buttons">
            <span class="btn">Fold</span>
            <span class="btn primary">{{ lg.check ? 'Check' : 'Call ' + callAmount() }}</span>
            <span class="btn">{{ raiseLabel() }}</span>
          </div>
        }
      </div>
    </div>
  `,
  styles: `
    :host { display: block; }
    .phone { width: 520px; height: 940px; border-radius: 64px; background: #111117; padding: 16px; box-shadow: 0 0 0 2px rgba(255,255,255,0.16); }
    .screen { height: 100%; border-radius: 50px; background: #000; padding: 34px 26px; display: flex; flex-direction: column; align-items: center; overflow: hidden; }
    header { width: 100%; display: flex; justify-content: space-between; align-items: baseline; }
    .brand { font: 600 28px/1 var(--font-display); }
    .table { font: 500 28px/1 var(--font-mono); color: var(--lav-soft); }
    .who { align-self: flex-start; margin: 22px 0 0; font: 500 28px/1 var(--font-ui); color: var(--text-2); }
    .turn { align-self: flex-start; margin: 10px 0 0; font: 600 48px/1 var(--font-display); letter-spacing: -0.02em; }
    .cards { display: flex; gap: 14px; margin-top: 26px; }
    .peek-note { margin: 14px 0 0; font: 500 28px/1 var(--font-ui); color: var(--text-3); }
    .label { margin: 12px 0 0; padding: 10px 20px; border-radius: 999px; background: rgba(255,255,255,0.1); font: 600 28px/1 var(--font-ui); }
    .stack { margin: 14px 0 0; font: 500 28px/1 var(--font-ui); color: var(--text-2); }
    .slider { width: 100%; margin-top: auto; }
    .track { position: relative; height: 12px; border-radius: 6px; background: rgba(255,255,255,0.14); }
    .track i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 6px; background: var(--indigo); }
    .track b { position: absolute; top: 50%; width: 40px; height: 40px; border-radius: 50%; background: #fff; transform: translate(-50%, -50%); }
    .presets { display: flex; gap: 6px; margin-top: 22px; }
    .preset { flex: 1 1 auto; padding: 0 12px; text-align: center; height: 52px; line-height: 52px; border-radius: 999px; background: rgba(255,255,255,0.08); font: 600 28px/52px var(--font-ui); color: var(--text-2); white-space: nowrap; }
    .preset.on { background: #fff; color: #0b0b10; }
    .buttons { width: 100%; display: flex; gap: 8px; margin-top: 20px; }
    .btn { flex: 1 1 auto; padding: 0 18px; height: 76px; border-radius: 999px; display: grid; place-items: center; background: rgba(255,255,255,0.1); font: 600 28px/1 var(--font-ui); white-space: nowrap; }
    .btn.primary { background: var(--indigo); }
  `,
})
export class PhoneSeatComponent {
  readonly view = input.required<PlayerView>();
  readonly code = input('BKTR');
  readonly peeking = input(true);
  /** Raise amount picked on the slider. */
  readonly raiseTo = input<number | null>(null);

  protected readonly me = computed(() => this.view().me);
  protected readonly legal = computed(() => this.me()?.legal ?? null);
  protected readonly cards = computed(() => this.me()?.holeCards ?? null);
  protected readonly label = computed(() => (this.peeking() ? (this.me()?.handLabel ?? null) : null));
  protected readonly seatNo = computed(() => (this.me()?.seat ?? 0) + 1);
  protected readonly name = computed(() => {
    const me = this.me();
    return me ? (this.view().seats[me.seat]?.player.name ?? '') : '';
  });
  protected readonly stack = computed(() => {
    const me = this.me();
    return chips(me ? (this.view().seats[me.seat]?.stack ?? 0) : 0);
  });
  protected readonly pot = computed(() => {
    const v = this.view();
    return chips(v.pots.reduce((t, p) => t + p.amount, 0) + v.seats.reduce((t, s) => t + (s?.committed ?? 0), 0));
  });
  protected readonly callAmount = computed(() => chips(this.legal()?.call?.amount ?? 0));
  private readonly range = computed(() => this.legal()?.raise ?? this.legal()?.bet ?? null);
  private readonly to = computed(() => this.raiseTo() ?? this.range()?.minTo ?? 0);
  protected readonly raiseLabel = computed(() => (this.legal()?.bet ? `Bet ${chips(this.to())}` : `Raise ${chips(this.to())}`));
  protected readonly activePreset = computed(() => this.legal()?.presets.find((p) => p.to === this.to())?.id ?? null);
  protected readonly sliderPct = computed(() => {
    const r = this.range();
    if (!r || r.maxTo === r.minTo) return 0;
    return Math.round(((this.to() - r.minTo) / (r.maxTo - r.minTo)) * 100);
  });

  protected short(id: string): string {
    return SHORT_PRESET[id] ?? PRESET_LABEL[id as keyof typeof PRESET_LABEL] ?? id;
  }
}
