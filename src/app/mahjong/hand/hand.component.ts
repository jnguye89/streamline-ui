import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MeldRowComponent } from '../seat/meld-row.component';
import { TableStore } from '../table-store.service';
import { TileComponent } from '../tile/tile.component';

/** Your hand at the bottom: tiles sorted (or as drawn), the drawn tile set apart on the right, then your sets. */
@Component({
  selector: 'mj-hand',
  standalone: true,
  imports: [TileComponent, MeldRowComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="hand" [class.live]="store.myTurn()">
      <div class="concealed">
        @for (t of store.handOrder(); track t) {
          <div
            class="slot"
            [class.focus]="focus() === t"
            [class.armed]="armed() === t"
            [class.hinted]="hinted() === t"
            (click)="store.clickTile(t)"
          >
            @if (hinted() === t) {
              <span class="tag">Hint</span>
            }
            @if (armed() === t) {
              <span class="tag armed">A again</span>
            }
            <mj-tile [tile]="t" size="hand" [marks]="marks()" />
          </div>
        }
      </div>
      @if (drawn() !== null) {
        @for (t of [drawn()!]; track t) {
          <div
            class="slot drawn"
            [class.focus]="focus() === t"
            [class.armed]="armed() === t"
            [class.hinted]="hinted() === t"
            (click)="store.clickTile(t)"
          >
            @if (hinted() === t) {
              <span class="tag">Hint</span>
            }
            @if (armed() === t) {
              <span class="tag armed">A again</span>
            }
            <mj-tile [tile]="t" size="hand" [marks]="marks()" />
          </div>
        }
      }
      @if (melds().length) {
        <mj-meld-row class="melds" [melds]="melds()" size="meld" [marks]="marks()" />
      }
      @if (!store.sorted()) {
        <span class="order">As drawn</span>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .hand {
      position: relative;
      height: 180px;
      display: flex;
      align-items: flex-end;
      padding-bottom: 20px;
    }
    .concealed {
      display: flex;
      gap: 6px;
      align-items: flex-end;
    }
    .slot {
      position: relative;
      border-radius: 13px;
      transition:
        transform 140ms var(--ease),
        box-shadow 140ms ease;
      cursor: default;
    }
    .hand.live .slot {
      cursor: pointer;
    }
    .slot mj-tile {
      --tw: 104px;
    }
    .slot.focus {
      transform: translateY(-18px) scale(1.07);
      box-shadow: 0 0 0 4px #fff;
      z-index: 2;
    }
    .slot.armed {
      transform: translateY(-30px) scale(1.08);
      box-shadow:
        0 0 0 4px #fff,
        0 0 0 9px var(--indigo);
      z-index: 2;
    }
    .slot.hinted:not(.focus) {
      box-shadow: 0 0 0 3px var(--lav-soft);
    }
    .drawn {
      margin-left: 26px;
    }
    .drawn mj-tile {
      animation: arrive 220ms var(--ease);
    }
    .melds {
      margin-left: 34px;
      --tw: 66px;
      --meld-gap: 14px;
    }
    .tag {
      position: absolute;
      left: 50%;
      bottom: calc(100% + 10px);
      transform: translateX(-50%);
      padding: 7px 14px;
      border-radius: 999px;
      background: var(--lav-soft);
      color: #1e1b4b;
      font: 700 20px/1 var(--font-ui);
      white-space: nowrap;
    }
    .tag.armed {
      background: #fff;
    }
    .order {
      position: absolute;
      right: 0;
      top: 0;
      padding: 6px 14px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.1);
      font: 600 20px/1 var(--font-ui);
      color: var(--text-2);
    }
    @keyframes arrive {
      from {
        transform: translateY(-40px);
        opacity: 0;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .slot {
        transition: none;
      }
      .drawn mj-tile {
        animation: none;
      }
    }
  `,
})
export class HandComponent {
  protected readonly store = inject(TableStore);
  protected readonly drawn = computed(() => this.store.view()?.drawn ?? null);
  protected readonly melds = computed(() => this.store.view()?.seats[this.store.you()].melds ?? []);
  protected readonly focus = this.store.focus;
  protected readonly armed = this.store.armed;
  protected readonly hinted = computed(() => this.store.hint()?.discard ?? null);
  protected readonly marks = computed(() => this.store.settings().marks);
}
