import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Meld } from '@skriin/mahjong-core';
import { TileComponent } from '../tile/tile.component';
import { TileSize } from '../tile/tile-art';

/** Exposed sets. A concealed kong shows its two end tiles face down. */
@Component({
  selector: 'mj-meld-row',
  standalone: true,
  imports: [TileComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (m of melds(); track $index) {
      <div class="meld" [class.kong]="m.type === 'kong'">
        @for (t of m.tiles; track t; let i = $index) {
          <mj-tile
            [tile]="t"
            [faceDown]="m.concealed && (i === 0 || i === 3)"
            [size]="size()"
            [marks]="marks()"
            [class.taken]="m.claimed?.tile === t"
          />
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-wrap: wrap;
      gap: var(--meld-gap, 12px);
      align-items: flex-end;
    }
    .meld {
      display: flex;
      gap: 2px;
    }
    /* The tile taken from a discard sits slightly lower, like a real table. */
    .taken {
      transform: translateY(4px);
    }
  `,
})
export class MeldRowComponent {
  readonly melds = input.required<readonly Meld[]>();
  readonly size = input<TileSize>('meld');
  readonly marks = input(true);
}
