import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { WIND_NAME } from '@skriin/mahjong-core';
import { signedScore } from '../format';
import { SeatVideoComponent } from '../seat-video/seat-video.component';
import { TableStore } from '../table-store.service';
import { TileComponent } from '../tile/tile.component';

/** You, bottom-left: camera, seat wind, score, bonus tiles (a new one is ringed). */
@Component({
  selector: 'mj-self-card',
  standalone: true,
  imports: [SeatVideoComponent, TileComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (me(); as me) {
      <div class="mj-card card" [class.turn]="store.myTurn()">
        <div class="row">
          <mj-seat-video class="video" [seat]="me" [self]="true" />
          <div class="who">
            <div class="name-row">
              <span class="name">You</span>
              @if (me.dealer) {
                <span class="dealer">Dealer</span>
              }
            </div>
            <div class="wind">
              <b>{{ me.wind }}</b
              >{{ windName() }}
            </div>
          </div>
        </div>
        <div class="row2">
          <span class="score">{{ score() }}</span>
          <div class="bonus">
            @for (t of me.bonus; track t) {
              <mj-tile [tile]="t" size="mini" [class.fresh]="note()?.tile === t" />
            }
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      position: relative;
    }
    .card {
      padding: 12px 14px 12px;
      height: 164px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .card.turn {
      border-color: var(--lav);
      box-shadow: inset 0 0 0 1px var(--lav);
    }
    .row {
      display: flex;
      gap: 14px;
      align-items: center;
    }
    .video {
      width: 112px;
      flex: none;
      --cam-h: 63px;
    }
    .video ::ng-deep .tag {
      display: none;
    }
    .name-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .name {
      font: 600 30px/1.1 var(--font-display);
      letter-spacing: -0.02em;
    }
    .dealer {
      padding: 5px 10px;
      border-radius: 999px;
      background: var(--indigo);
      font: 600 17px/1 var(--font-ui);
    }
    .wind {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
      font: 500 22px/1 var(--font-ui);
      color: var(--text-2);
    }
    .wind b {
      display: inline-grid;
      place-items: center;
      width: 32px;
      height: 32px;
      border-radius: 9px;
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
      font: 700 18px/1 var(--font-ui);
    }
    .row2 {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 10px;
    }
    .score {
      font: 600 34px/1 var(--font-display);
      letter-spacing: -0.02em;
      font-variant-numeric: tabular-nums;
    }
    .bonus {
      display: flex;
      gap: 3px;
      --tw: 34px;
    }
    .fresh {
      box-shadow: 0 0 0 3px var(--lav-soft);
      animation: pop 360ms var(--ease);
    }
    @keyframes pop {
      from {
        transform: translateY(-24px) scale(1.3);
        opacity: 0;
      }
    }
  `,
})
export class SelfCardComponent {
  protected readonly store = inject(TableStore);
  protected readonly me = computed(() => this.store.view()?.seats[this.store.you()] ?? null);
  protected readonly windName = computed(() => WIND_NAME[this.me()?.wind ?? 'E']);
  protected readonly score = computed(() => signedScore(this.me()?.score ?? 0));
  protected readonly note = this.store.bonusNote;
}
