import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { BotLevel } from '../core/api';
import { chips } from '../core/cards';
import { BOT_LEVEL_LABEL, PokerSettings, TvAction } from '../poker.types';

export type MenuItemId =
  | 'resume'
  | 'topUp'
  | 'sitOut'
  | 'handLabel'
  | 'autoShow'
  | 'bots'
  | 'animations'
  | 'sound'
  | 'live'
  | 'leave'
  | 'exit';

interface Item {
  readonly id: MenuItemId;
  readonly label: string;
  readonly value: string;
  readonly cycle?: boolean;
}

/** Menu (+ / − / M): leave table, sit out, top up, settings. */
@Component({
  selector: 'pk-menu',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ck-scrim">
      <div class="ck-modal modal">
        <h2 class="ck-title sm">Menu</h2>
        <div class="list">
          @for (item of items(); track item.id; let i = $index) {
            <button
              type="button"
              class="ck-item"
              [class.focus]="index() === i"
              (pointerenter)="index.set(i)"
              (click)="index.set(i); pick.emit({ id: item.id, step: 1 })"
            >
              <span>{{ item.label }}</span>
              @if (item.value) {
                <span class="val">
                  @if (item.cycle) {
                    <span class="arrow">‹</span>{{ item.value }}<span class="arrow">›</span>
                  } @else {
                    {{ item.value }}
                  }
                </span>
              }
            </button>
          }
        </div>
      </div>
    </div>
  `,
  styles: `
    .modal { width: 720px; padding: 44px 48px; }
    .list { display: flex; flex-direction: column; gap: 2px; margin-top: 20px; }
    /* 60px rows so the longest menu (top-up + sit-out showing, 12 items) still fits the 1080 stage. */
    .modal .ck-item { height: 60px; }
    .arrow { color: var(--text-3); padding: 0 12px; }
  `,
})
export class MenuComponent {
  readonly settings = input.required<PokerSettings>();
  readonly canTopUp = input<number | null>(null);
  readonly sittingOut = input(false);
  readonly live = input(false);
  readonly inGame = input(true);
  readonly pick = output<{ id: MenuItemId; step: 1 | -1 }>();
  readonly close = output<void>();

  protected readonly index = signal(0);
  protected readonly items = computed<Item[]>(() => {
    const s = this.settings();
    const out: Item[] = [{ id: 'resume', label: 'Back to the table', value: '' }];
    const top = this.canTopUp();
    if (top !== null) out.push({ id: 'topUp', label: `Top up to ${chips(top)}`, value: 'Free' });
    if (this.inGame()) out.push({ id: 'sitOut', label: this.sittingOut() ? "I'm back" : 'Sit out next hand', value: '' });
    out.push(
      { id: 'handLabel', label: 'Hand name under my cards', value: s.handLabel ? 'On' : 'Off' },
      { id: 'autoShow', label: 'Auto-show at showdown', value: s.autoShow ? 'On' : 'Off' },
      { id: 'bots', label: 'Bots', value: BOT_LEVEL_LABEL[s.botLevel as BotLevel], cycle: true },
      { id: 'animations', label: 'Animations', value: s.animations ? 'On' : 'Off' },
      { id: 'sound', label: 'Sound', value: s.sound ? 'On' : 'Off' },
      { id: 'live', label: 'Live (preview)', value: this.live() ? 'On' : 'Off' },
      { id: 'leave', label: 'Leave table', value: '' },
      // skriin.com: leave the table and go back to the watch feed in one step.
      { id: 'exit', label: 'Back to watch', value: '' },
    );
    return out;
  });

  handle(a: TvAction): void {
    const items = this.items();
    const n = items.length;
    const item = items[Math.min(this.index(), n - 1)]!;
    switch (a) {
      case 'up':
        this.index.update((i) => (i - 1 + n) % n);
        break;
      case 'down':
        this.index.update((i) => (i + 1) % n);
        break;
      case 'left':
      case 'right':
        if (item.cycle || item.value === 'On' || item.value === 'Off') this.pick.emit({ id: item.id, step: a === 'right' ? 1 : -1 });
        break;
      case 'select':
        this.pick.emit({ id: item.id, step: 1 });
        break;
      case 'back':
      case 'menu':
        this.close.emit();
        break;
      default:
        break;
    }
  }
}
