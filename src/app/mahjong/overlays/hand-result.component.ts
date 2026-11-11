import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { SEATS } from '@skriin/mahjong-core';
import { signedScore } from '../format';
import { TvAction } from '../mahjong.types';
import { MeldRowComponent } from '../seat/meld-row.component';
import { TableStore } from '../table-store.service';
import { TileComponent } from '../tile/tile.component';

/** End of a hand: the winning hand laid out, each faan line, total, points, new scores — or the draw. */
@Component({
  selector: 'mj-hand-result',
  standalone: true,
  imports: [TileComponent, MeldRowComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (result(); as r) {
      <div class="mj-scrim">
        <div class="mj-modal modal" [class.draw]="r.kind === 'draw'">
          <div class="badge" [class.on]="r.winner === store.you()">{{ badge() }}</div>
          <h1 class="mj-title">{{ title() }}</h1>

          @if (r.kind === 'win' && r.hand) {
            <div class="hand">
              @if (r.hand.melds.length) {
                <mj-meld-row class="melds" [melds]="r.hand.melds" size="result" [marks]="marks()" />
              }
              @for (g of r.hand.groups; track $index) {
                <div class="group">
                  @for (t of g; track t) {
                    <mj-tile
                      [tile]="t"
                      size="result"
                      [marks]="marks()"
                      [class.winning]="t === r.hand.winningTile"
                    />
                  }
                </div>
              }
              @if (r.hand.bonus.length) {
                <div class="group bonus">
                  @for (t of r.hand.bonus; track t) {
                    <mj-tile [tile]="t" size="mini" />
                  }
                </div>
              }
            </div>

            <div class="cols">
              <div class="faan">
                @for (l of r.faan; track l.id) {
                  <div class="line">
                    <span>{{ l.label }}</span>
                    <b>{{ l.limit ? 'Limit' : l.faan }}</b>
                  </div>
                }
                <div class="line total">
                  <span>{{ r.totalFaan }} faan{{ r.capped ? ' · limit' : '' }}</span>
                  <b>{{ r.points }} points</b>
                </div>
              </div>
              <div class="scores">
                @for (row of rows(); track row.seat) {
                  <div class="srow" [class.winner]="row.winner">
                    <span class="nm">{{ row.name }}</span>
                    <span class="dl" [class.up]="row.delta > 0">{{ row.deltaText }}</span>
                    <span class="sc">{{ row.scoreText }}</span>
                  </div>
                }
              </div>
            </div>
          } @else {
            <p class="mj-lead">The wall is empty. Nobody scores.</p>
          }

          <div class="foot">
            <button type="button" class="mj-btn primary focus" (click)="next()">
              {{ r.gameOver ? 'See final scores' : 'Next hand' }} <span class="mj-glyph sm">A</span>
            </button>
            @if (nextText(); as n) {
              <span class="next">{{ n }}</span>
            }
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    .modal {
      width: 1560px;
      padding: 44px 56px 48px;
    }
    .modal.draw {
      width: 1080px;
    }
    .badge {
      display: inline-block;
      padding: 10px 18px;
      border-radius: 999px;
      font: 600 22px/1 var(--font-ui);
      background: rgba(255, 255, 255, 0.08);
      color: var(--text-2);
      margin-bottom: 18px;
    }
    .badge.on {
      background: var(--indigo);
      color: #fff;
    }
    .hand {
      display: flex;
      align-items: flex-end;
      gap: 22px;
      margin-top: 30px;
      --tw: 66px;
      --meld-gap: 22px;
    }
    .group {
      display: flex;
      gap: 3px;
    }
    .group.bonus {
      --tw: 40px;
      margin-left: 10px;
    }
    .winning {
      box-shadow:
        0 0 0 4px var(--indigo),
        0 0 0 7px rgba(199, 210, 254, 0.55);
      transform: translateY(-8px);
    }
    .cols {
      display: grid;
      grid-template-columns: 1fr 560px;
      gap: 48px;
      margin-top: 36px;
    }
    .line {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding: 12px 0;
      border-bottom: 1px solid var(--line);
      font: 500 30px/1.1 var(--font-ui);
    }
    .line b {
      font: 600 30px/1 var(--font-display);
      color: var(--lav-soft);
    }
    .line.total {
      border-bottom: 0;
      padding-top: 18px;
    }
    .line.total span {
      font: 600 36px/1 var(--font-display);
    }
    .line.total b {
      font-size: 36px;
      color: #fff;
    }
    .scores {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .srow {
      display: grid;
      grid-template-columns: 1fr 140px 140px;
      align-items: baseline;
      padding: 14px 20px;
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.04);
    }
    .srow.winner {
      background: rgba(79, 70, 229, 0.28);
    }
    .nm {
      font: 600 30px/1 var(--font-display);
    }
    .dl {
      text-align: right;
      font: 500 28px/1 var(--font-mono);
      color: var(--text-2);
    }
    .dl.up {
      color: var(--lav-soft);
    }
    .sc {
      text-align: right;
      font: 600 30px/1 var(--font-display);
      font-variant-numeric: tabular-nums;
    }
    .foot {
      display: flex;
      align-items: center;
      gap: 28px;
      margin-top: 40px;
    }
    .next {
      font: 500 26px/1.3 var(--font-ui);
      color: var(--text-2);
    }
  `,
})
export class HandResultComponent {
  protected readonly store = inject(TableStore);
  protected readonly result = computed(() => this.store.view()?.result ?? null);
  protected readonly marks = computed(() => this.store.settings().marks);

  protected readonly badge = computed(() => {
    const r = this.result();
    const v = this.store.view();
    if (!r || !v) return '';
    if (r.kind === 'draw') return 'Exhaustive draw';
    if (r.selfDrawn) return 'Self-drawn';
    const from = r.from === null ? '' : r.from === v.you ? 'your' : `${v.seats[r.from].name}’s`;
    return `On ${from} discard`;
  });
  protected readonly title = computed(() => {
    const r = this.result();
    const v = this.store.view();
    if (!r || !v) return '';
    if (r.kind === 'draw' || r.winner === null) return 'Draw.';
    return r.winner === v.you ? 'You win.' : `${v.seats[r.winner].name} wins.`;
  });
  protected readonly rows = computed(() => {
    const r = this.result();
    const v = this.store.view();
    if (!r || !v) return [];
    return SEATS.map((s) => ({
      seat: s,
      name: s === v.you ? 'You' : v.seats[s].name,
      winner: r.winner === s,
      delta: r.deltas[s],
      deltaText: signedScore(r.deltas[s]),
      scoreText: signedScore(r.scores[s]),
    }));
  });
  protected readonly nextText = computed(() => {
    const r = this.result();
    const v = this.store.view();
    if (!r || !v || !r.nextLabel) return null;
    const dealer = v.seats.find((s) => s.dealer);
    const again = r.dealerStays
      ? dealer?.seat === v.you
        ? ' · you deal again'
        : ` · ${dealer?.name} deals again`
      : '';
    return `Next: ${r.nextLabel}${again}`;
  });

  handle(a: TvAction): void {
    if (a === 'select') this.next();
    else if (a === 'menu' || a === 'back') this.store.pause();
  }

  protected next(): void {
    this.store.act({ type: 'next' });
  }
}
