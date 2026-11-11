import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { SeatPublic } from '@skriin/mahjong-core';
import { TableStore } from '../table-store.service';
import { TileComponent } from '../tile/tile.component';

/** One player's discards, 6 per row, in order. The latest discard on the table has an indigo ring. */
@Component({
  selector: 'mj-pond',
  standalone: true,
  imports: [TileComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pond" [class.dense]="tiles().length > 18">
      @for (t of tiles(); track t) {
        <mj-tile
          [tile]="t"
          size="pond"
          [marks]="store.settings().marks"
          [class.latest]="t === latest()"
        />
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .pond {
      --tw: 54px;
      display: grid;
      grid-template-columns: repeat(6, var(--tw));
      gap: 4px;
    }
    .pond.dense {
      --tw: 44px;
      gap: 3px;
    }
    mj-tile {
      animation: land 200ms var(--ease);
    }
    .latest {
      box-shadow:
        0 0 0 4px var(--indigo),
        0 0 0 7px rgba(199, 210, 254, 0.5);
      z-index: 1;
      transform: scale(1.06);
    }
    @keyframes land {
      from {
        transform: translateY(-14px) scale(1.1);
        opacity: 0;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      mj-tile {
        animation: none;
      }
    }
  `,
})
export class PondComponent {
  readonly seat = input.required<SeatPublic>();
  protected readonly store = inject(TableStore);
  protected readonly tiles = computed(() =>
    this.seat()
      .discards.filter((d) => !d.claimed)
      .map((d) => d.tile),
  );
  protected readonly latest = computed(() => {
    const last = this.store.view()?.lastDiscard;
    return last && last.from === this.seat().seat ? last.tile : null;
  });
}
