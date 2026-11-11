import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { kindOf, tileName } from '@skriin/mahjong-core';
import { TableStore } from '../table-store.service';
import { TileComponent } from '../tile/tile.component';

const RING_R = 30;
const RING_C = 2 * Math.PI * RING_R;

/**
 * Slides up only when you can legally claim the discard: [Win] [Kong] [Pung] [Chow] [Pass] with the 5 s ring.
 * Default focus: Win if possible, otherwise Pass. Several chows → a second step shows each option.
 */
@Component({
  selector: 'mj-claim-bar',
  standalone: true,
  imports: [TileComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (claim(); as c) {
      <div class="bar" role="dialog" [attr.aria-label]="'Claim ' + discardName()">
        <div class="discard">
          <mj-tile class="big" [tile]="c.tile" size="claim" [marks]="marks()" />
          <div class="txt">
            <div class="who">{{ fromName() }} discarded</div>
            <div class="what">{{ discardName() }}</div>
          </div>
        </div>

        @if (store.zone() === 'chow') {
          <div class="choices">
            <div class="lead">Pick a chow</div>
            <div class="opts">
              @for (o of store.chowChoices(); track $index) {
                <button
                  type="button"
                  class="choice"
                  [class.focus]="store.chowIndex() === $index"
                  (click)="store.pressChow($index)"
                >
                  @for (t of o.meld ?? []; track t) {
                    <mj-tile
                      [tile]="t"
                      size="pond"
                      [marks]="marks()"
                      [class.theirs]="t === c.tile"
                    />
                  }
                </button>
              }
            </div>
            <div class="back"><span class="mj-glyph sm">B</span> Back</div>
          </div>
        } @else {
          <div class="btns">
            @for (b of store.claimButtons(); track b.id; let i = $index) {
              <button
                type="button"
                class="cbtn"
                [class]="b.id"
                [class.focus]="store.claimIndex() === i"
                (click)="store.pressClaim(i)"
              >
                <span class="lbl">{{ b.label }}</span>
                @if (b.meld) {
                  <span class="meld">
                    @for (t of b.meld; track t) {
                      <mj-tile
                        [tile]="t"
                        size="mini"
                        [marks]="marks()"
                        [class.theirs]="t === c.tile"
                      />
                    }
                  </span>
                }
              </button>
            }
          </div>
        }

        <div class="ring" [attr.aria-label]="seconds() + ' seconds left'">
          <svg viewBox="0 0 72 72">
            <circle cx="36" cy="36" [attr.r]="r" class="track" />
            <circle
              cx="36"
              cy="36"
              [attr.r]="r"
              class="left"
              [attr.stroke-dasharray]="circ"
              [attr.stroke-dashoffset]="offset()"
            />
          </svg>
          <span class="secs">{{ seconds() }}</span>
        </div>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .bar {
      display: flex;
      align-items: center;
      gap: 28px;
      padding: 20px 26px;
      border-radius: 28px;
      background: #101018;
      border: 1px solid rgba(199, 210, 254, 0.28);
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6);
      animation: up 220ms var(--ease);
    }
    .discard {
      display: flex;
      align-items: center;
      gap: 18px;
    }
    .big {
      --tw: 84px;
      box-shadow: 0 0 0 4px var(--indigo);
      border-radius: 10px;
    }
    .who {
      font: 500 24px/1.1 var(--font-ui);
      color: var(--text-2);
      white-space: nowrap;
    }
    .what {
      margin-top: 6px;
      font: 600 32px/1.1 var(--font-display);
      letter-spacing: -0.02em;
      white-space: nowrap;
    }
    .btns {
      display: flex;
      gap: 12px;
    }
    .cbtn {
      min-width: 132px;
      height: 112px;
      padding: 0 22px;
      border: 0;
      border-radius: 22px;
      background: rgba(255, 255, 255, 0.08);
      color: #fff;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      cursor: pointer;
      transition:
        transform 140ms var(--ease),
        background 140ms ease,
        box-shadow 140ms ease;
    }
    .cbtn .lbl {
      font: 600 32px/1 var(--font-ui);
      white-space: nowrap;
    }
    .cbtn.win {
      background: var(--indigo);
    }
    .cbtn.pass .lbl {
      color: var(--text-2);
    }
    .cbtn.focus {
      transform: scale(1.07);
      box-shadow: 0 0 0 4px #fff;
    }
    .cbtn.focus:not(.win) {
      background: rgba(255, 255, 255, 0.18);
    }
    .cbtn.focus.pass .lbl {
      color: #fff;
    }
    .meld {
      display: flex;
      gap: 2px;
      --tw: 30px;
    }
    .theirs {
      box-shadow: 0 0 0 2px var(--indigo);
      border-radius: 5px;
    }
    .choices {
      display: flex;
      align-items: center;
      gap: 18px;
    }
    .lead {
      font: 600 28px/1.1 var(--font-ui);
      white-space: nowrap;
    }
    .opts {
      display: flex;
      gap: 14px;
    }
    .choice {
      display: flex;
      gap: 3px;
      padding: 12px;
      border: 0;
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.08);
      cursor: pointer;
      transition:
        transform 140ms var(--ease),
        box-shadow 140ms ease,
        background 140ms ease;
    }
    .choice.focus {
      transform: scale(1.07);
      box-shadow: 0 0 0 4px #fff;
      background: rgba(255, 255, 255, 0.18);
    }
    .choice mj-tile {
      --tw: 50px;
    }
    .back {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      font: 500 22px/1 var(--font-ui);
      color: var(--text-2);
      white-space: nowrap;
    }
    .ring {
      position: relative;
      width: 72px;
      height: 72px;
      flex: none;
      margin-left: 4px;
    }
    .ring svg {
      width: 72px;
      height: 72px;
      transform: rotate(-90deg);
    }
    .track {
      fill: none;
      stroke: rgba(255, 255, 255, 0.12);
      stroke-width: 6;
    }
    .left {
      fill: none;
      stroke: var(--lav-soft);
      stroke-width: 6;
      stroke-linecap: round;
      transition: stroke-dashoffset 100ms linear;
    }
    .secs {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      font: 500 28px/1 var(--font-mono);
    }
    @keyframes up {
      from {
        transform: translateY(40px);
        opacity: 0;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .bar {
        animation: none;
      }
    }
  `,
})
export class ClaimBarComponent {
  protected readonly store = inject(TableStore);
  protected readonly r = RING_R;
  protected readonly circ = RING_C;
  protected readonly claim = computed(() =>
    this.store.claimButtons().length ? (this.store.view()?.claim ?? null) : null,
  );
  protected readonly marks = computed(() => this.store.settings().marks);
  protected readonly discardName = computed(() => {
    const c = this.claim();
    return c ? tileName(kindOf(c.tile)) : '';
  });
  protected readonly fromName = computed(() => {
    const c = this.claim();
    const v = this.store.view();
    return c && v ? v.seats[c.from].name : '';
  });
  protected readonly seconds = computed(() => Math.ceil(this.store.claimMs() / 1000));
  protected readonly offset = computed(() => {
    const c = this.claim();
    if (!c) return 0;
    return RING_C * (1 - this.store.claimMs() / c.windowMs);
  });
}
