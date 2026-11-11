import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActionOption, kindOf, tileName } from '@skriin/mahjong-core';
import { TableStore } from '../table-store.service';
import { TileComponent } from '../tile/tile.component';

/** Your-turn choices above the hand: self-drawn win (focused first), concealed kong, promoted kong. */
@Component({
  selector: 'mj-turn-actions',
  standalone: true,
  imports: [TileComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.turnActions().length) {
      <div class="row" [class.active]="store.zone() === 'actions'">
        @if (store.zone() !== 'actions') {
          <span class="hint-up"><span class="mj-glyph sm">▲</span></span>
        }
        @for (o of store.turnActions(); track $index) {
          <button
            type="button"
            class="mj-btn"
            [class.primary]="o.action.type === 'win'"
            [class.focus]="store.zone() === 'actions' && store.actionIndex() === $index"
            (click)="store.pressTurnAction($index)"
          >
            <span>{{ label(o) }}</span>
            @if (o.meld && o.action.type === 'kong') {
              <span class="mini">
                @for (t of o.meld; track t) {
                  <mj-tile [tile]="t" size="mini" [marks]="store.settings().marks" />
                }
              </span>
            }
            @if (store.zone() === 'actions' && store.actionIndex() === $index) {
              <span class="mj-glyph sm">A</span>
            }
          </button>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .row {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 14px;
      animation: rise 200ms var(--ease);
    }
    .mj-btn {
      gap: 14px;
    }
    .mini {
      display: inline-flex;
      gap: 2px;
      --tw: 30px;
    }
    .hint-up {
      opacity: 0.7;
    }
    @keyframes rise {
      from {
        transform: translateY(16px);
        opacity: 0;
      }
    }
  `,
})
export class TurnActionsComponent {
  protected readonly store = inject(TableStore);

  protected label(o: ActionOption): string {
    if (o.action.type === 'win') return 'Win · self-drawn';
    if (o.action.type === 'kong' && o.meld) {
      const name = tileName(kindOf(o.meld[0]));
      return o.kongKind === 'promoted' ? `Add to pung · ${name}` : `Kong · ${name}`;
    }
    return '';
  }
}
