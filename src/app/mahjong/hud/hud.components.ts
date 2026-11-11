import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TvAction } from '../mahjong.types';
import { TableStore } from '../table-store.service';
import { TvInputService } from '../tv-input.service';

/** Top-left: "East round, hand 3 · Dealer: you". */
@Component({
  selector: 'mj-round-info',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.roundInfo(); as r) {
      <div class="round">
        <div class="title">{{ r.title }}</div>
        <div class="dealer">{{ r.dealer }}</div>
        @if (r.repeat) {
          <div class="again">Dealing again{{ r.repeat > 1 ? ' ×' + r.repeat : '' }}</div>
        }
      </div>
    }
  `,
  styles: `
    .round {
      padding: 14px 4px;
    }
    .title {
      font: 600 29px/1.1 var(--font-display);
      letter-spacing: -0.02em;
      white-space: nowrap;
    }
    .again {
      margin-top: 8px;
      font: 500 22px/1.1 var(--font-ui);
      color: var(--text-2);
    }
    .dealer {
      margin-top: 12px;
      font: 500 28px/1.1 var(--font-ui);
      color: var(--lav-soft);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  `,
})
export class RoundInfoComponent {
  protected readonly store = inject(TableStore);
}

interface LegendItem {
  readonly glyph: string;
  readonly label: string;
  readonly action: TvAction;
  readonly menu?: boolean;
}

/** Top-right: controller buttons, always visible; each is clickable with a mouse. */
@Component({
  selector: 'mj-controls-legend',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mj-card card">
      <div class="grid">
        @for (item of items(); track item.glyph) {
          <button class="item" type="button" (click)="input.emit(item.action)">
            <span class="mj-glyph" [class.menu]="item.menu">
              @if (item.menu) {
                <svg viewBox="0 0 24 24"><path d="M5 7h14M5 12h14M5 17h14" /></svg>
              } @else {
                {{ item.glyph }}
              }
            </span>
            <span class="label">{{ item.label }}</span>
          </button>
        }
      </div>
    </div>
  `,
  styles: `
    .card {
      padding: 10px 14px;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2px 6px;
    }
    .item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 3px;
      border: 0;
      background: none;
      color: inherit;
      cursor: pointer;
      border-radius: 12px;
      text-align: left;
    }
    .item:hover {
      background: rgba(255, 255, 255, 0.06);
    }
    .label {
      font: 500 21px/1.1 var(--font-ui);
      color: var(--text-2);
      white-space: nowrap;
    }
    .mj-glyph {
      width: 36px;
      height: 36px;
      font-size: 18px;
    }
    .mj-glyph svg {
      width: 18px;
      height: 18px;
      stroke: currentColor;
      stroke-width: 2.4;
      stroke-linecap: round;
      fill: none;
    }
  `,
})
export class ControlsLegendComponent {
  protected readonly input = inject(TvInputService);
  private readonly store = inject(TableStore);
  protected readonly items = computed<LegendItem[]>(() => [
    {
      glyph: 'A',
      label: this.store.zone() === 'claim' || this.store.zone() === 'chow' ? 'Choose' : 'Discard',
      action: 'select',
    },
    { glyph: 'B', label: this.store.zone() === 'claim' ? 'Pass' : 'Back', action: 'back' },
    { glyph: 'X', label: this.store.sorted() ? 'As drawn' : 'Sort', action: 'sort' },
    { glyph: 'Y', label: 'Hint', action: 'hint' },
    { glyph: '≡', label: 'Menu', action: 'menu', menu: true },
  ]);
}
