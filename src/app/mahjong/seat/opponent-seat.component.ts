import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { SeatPublic, WIND_NAME } from '@skriin/mahjong-core';
import { signedScore } from '../format';
import { SeatVideoComponent } from '../seat-video/seat-video.component';
import { TableStore } from '../table-store.service';
import { TileComponent } from '../tile/tile.component';
import { MeldRowComponent } from './meld-row.component';

/** An opponent: camera tile, name, seat wind, score, hidden tiles, exposed sets and bonus tiles. */
@Component({
  selector: 'mj-opponent-seat',
  standalone: true,
  imports: [SeatVideoComponent, TileComponent, MeldRowComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mj-card seat" [class]="layout()" [class.turn]="isTurn()">
      <mj-seat-video class="video" [seat]="seat()" />
      <div class="info">
        <div class="name-row">
          <span class="name">{{ seat().name }}</span>
          @if (seat().dealer) {
            <span class="dealer">Dealer</span>
          }
        </div>
        <div class="meta">
          <span class="wind"
            ><b>{{ seat().wind }}</b
            >{{ windName() }}</span
          >
          <span class="score">{{ score() }}</span>
        </div>
        <div class="state">
          @if (isTurn()) {
            <span class="dots"><i></i><i></i><i></i></span>
            {{ seat().kind === 'bot' ? 'Thinking' : 'Playing' }}
          }
        </div>
      </div>
      <div class="tiles">
        <div class="backs" [attr.aria-label]="seat().concealedCount + ' tiles in hand'">
          @for (b of backs(); track $index) {
            <mj-tile [tile]="null" size="mini" />
          }
          @if (seat().hasDrawn) {
            <mj-tile class="drawn" [tile]="null" size="mini" />
          }
        </div>
        @if (seat().melds.length) {
          <mj-meld-row
            class="melds"
            [melds]="seat().melds"
            size="meld"
            [marks]="store.settings().marks"
          />
        }
        @if (seat().bonus.length) {
          <div class="bonus">
            @for (t of seat().bonus; track t) {
              <mj-tile [tile]="t" size="mini" />
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .seat {
      position: relative;
      padding: 14px;
      transition:
        border-color 200ms ease,
        box-shadow 200ms ease;
    }
    .seat.turn {
      border-color: var(--lav);
      box-shadow:
        inset 0 0 0 1px var(--lav),
        0 0 0 1px var(--lav);
    }
    .name-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .name {
      font: 600 32px/1.1 var(--font-display);
      letter-spacing: -0.02em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .dealer {
      padding: 6px 12px;
      border-radius: 999px;
      background: var(--indigo);
      font: 600 18px/1 var(--font-ui);
    }
    .meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 10px;
    }
    .wind {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      font: 500 24px/1 var(--font-ui);
      color: var(--text-2);
    }
    .wind b {
      display: inline-grid;
      place-items: center;
      width: 36px;
      height: 36px;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
      font: 700 20px/1 var(--font-ui);
    }
    .score {
      font: 600 32px/1 var(--font-display);
      letter-spacing: -0.02em;
      font-variant-numeric: tabular-nums;
    }
    .state {
      height: 26px;
      margin-top: 10px;
      display: flex;
      align-items: center;
      gap: 10px;
      font: 500 22px/1 var(--font-ui);
      color: var(--lav-soft);
    }
    .backs {
      display: flex;
      gap: 1px;
      --tw: 18px;
      align-items: flex-end;
    }
    .backs .drawn {
      margin-left: 8px;
    }
    .melds {
      margin-top: 12px;
      --tw: 38px;
      --meld-gap: 10px;
    }
    .bonus {
      display: flex;
      gap: 4px;
      margin-top: 12px;
      --tw: 34px;
    }
    .dots {
      display: inline-flex;
      gap: 5px;
    }
    .dots i {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: currentColor;
      animation: blink 1.2s infinite ease-in-out;
    }
    .dots i:nth-child(2) {
      animation-delay: 0.15s;
    }
    .dots i:nth-child(3) {
      animation-delay: 0.3s;
    }
    @keyframes blink {
      0%,
      80%,
      100% {
        opacity: 0.25;
      }
      40% {
        opacity: 1;
      }
    }

    /* Left / right: a tall card. */
    .side {
      height: 680px;
      display: flex;
      flex-direction: column;
    }
    .side .video {
      --cam-h: 248px;
    }
    .side .video ::ng-deep .cam {
      aspect-ratio: 1 / 1;
    }
    .side .info {
      margin-top: 14px;
      padding: 0 4px;
    }
    .side .tiles {
      margin-top: 18px;
      padding: 0 4px;
    }

    /* Top: a wide strip. */
    .top {
      height: 156px;
      display: grid;
      grid-template-columns: 220px 250px 1fr;
      gap: 20px;
      align-items: start;
      padding: 12px;
    }
    .top .video {
      --cam-h: 124px;
    }
    .top .info {
      padding-top: 4px;
    }
    .top .state {
      margin-top: 8px;
    }
    .top .tiles {
      display: grid;
      grid-template-columns: auto 1fr;
      grid-template-rows: auto auto;
      column-gap: 20px;
      row-gap: 10px;
      align-items: end;
    }
    .top .backs {
      grid-column: 1 / 3;
    }
    .top .melds {
      margin-top: 0;
    }
    .top .bonus {
      margin-top: 0;
      justify-self: end;
    }
  `,
})
export class OpponentSeatComponent {
  readonly seat = input.required<SeatPublic>();
  readonly layout = input<'side' | 'top'>('side');
  protected readonly store = inject(TableStore);

  protected readonly isTurn = computed(() => {
    const v = this.store.view();
    return !!v && (v.phase === 'turn' || v.phase === 'claim') && v.turn === this.seat().seat;
  });
  protected readonly backs = computed(() =>
    Array.from({
      length: Math.max(0, this.seat().concealedCount - (this.seat().hasDrawn ? 1 : 0)),
    }),
  );
  protected readonly windName = computed(() => WIND_NAME[this.seat().wind]);
  protected readonly score = computed(() => signedScore(this.seat().score));
}
