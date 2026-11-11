import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { WIND_NAME, Wind } from '@skriin/mahjong-core';
import { SPOTS, Spot } from '../mahjong.types';
import { TableStore } from '../table-store.service';

const WIND_GLYPH: Record<Wind, string> = { E: '東', S: '南', W: '西', N: '北' };

/** Middle of the table: prevailing wind, tiles left in the wall, each seat's wind, dealer and whose turn. */
@Component({
  selector: 'mj-center-box',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.view(); as v) {
      <div class="box">
        @for (e of edges(); track e.spot) {
          <div class="edge" [class]="e.spot" [class.turn]="e.turn">
            <span class="wtag" [class.dealer]="e.dealer" [attr.aria-label]="e.label">{{
              e.wind
            }}</span>
          </div>
        }
        <div class="mid">
          <div class="pw">
            <span class="glyph">{{ glyph() }}</span>
            <span class="pw-label">{{ prevailing() }} wind</span>
          </div>
          <div class="wall">
            <span class="n">{{ v.wallLeft }}</span>
            <span class="l">tiles left</span>
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .box {
      position: relative;
      width: 220px;
      height: 228px;
      border-radius: 28px;
      background: var(--surface);
      border: 1px solid var(--line);
    }
    .mid {
      position: absolute;
      inset: 40px 30px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
    }
    .pw {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .glyph {
      font:
        900 44px/1 'skriin tiles',
        'Noto Serif CJK HK',
        serif;
      color: var(--lav-soft);
    }
    .pw-label {
      font: 600 22px/1.1 var(--font-ui);
      color: var(--text-2);
    }
    .wall {
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .n {
      font: 500 46px/1 var(--font-mono);
      letter-spacing: -0.02em;
    }
    .l {
      margin-top: 4px;
      font: 500 18px/1 var(--font-ui);
      color: var(--text-3);
    }
    .edge {
      position: absolute;
      display: grid;
      place-items: center;
    }
    .edge.bottom {
      left: 0;
      right: 0;
      bottom: -1px;
      height: 40px;
    }
    .edge.top {
      left: 0;
      right: 0;
      top: -1px;
      height: 40px;
    }
    .edge.left {
      top: 0;
      bottom: 0;
      left: -1px;
      width: 40px;
    }
    .edge.right {
      top: 0;
      bottom: 0;
      right: -1px;
      width: 40px;
    }
    .edge::after {
      content: '';
      position: absolute;
      background: transparent;
      border-radius: 4px;
      transition: background 160ms ease;
    }
    .edge.bottom::after {
      left: 36px;
      right: 36px;
      bottom: 0;
      height: 4px;
    }
    .edge.top::after {
      left: 36px;
      right: 36px;
      top: 0;
      height: 4px;
    }
    .edge.left::after {
      top: 36px;
      bottom: 36px;
      left: 0;
      width: 4px;
    }
    .edge.right::after {
      top: 36px;
      bottom: 36px;
      right: 0;
      width: 4px;
    }
    .edge.turn::after {
      background: var(--indigo);
    }
    .wtag {
      width: 30px;
      height: 30px;
      border-radius: 9px;
      display: grid;
      place-items: center;
      font: 700 17px/1 var(--font-ui);
      color: var(--text-2);
      background: rgba(255, 255, 255, 0.06);
    }
    .edge.turn .wtag {
      background: #fff;
      color: #0b0b10;
    }
    .wtag.dealer {
      box-shadow: 0 0 0 2px var(--indigo);
    }
  `,
})
export class CenterBoxComponent {
  protected readonly store = inject(TableStore);
  protected readonly prevailing = computed(
    () => WIND_NAME[this.store.view()?.round.prevailing ?? 'E'],
  );
  protected readonly glyph = computed(() => WIND_GLYPH[this.store.view()?.round.prevailing ?? 'E']);
  protected readonly edges = computed(() => {
    const v = this.store.view();
    if (!v) return [];
    return SPOTS.map((spot: Spot) => {
      const s = this.store.seatAt()(spot)!;
      return {
        spot,
        wind: s.wind,
        dealer: s.dealer,
        turn: (v.phase === 'turn' || v.phase === 'claim') && v.turn === s.seat,
        label: `${s.seat === v.you ? 'You' : s.name}: ${WIND_NAME[s.wind]}${s.dealer ? ', dealer' : ''}`,
      };
    });
  });
}
