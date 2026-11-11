import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { TvAction } from '../mahjong.types';
import { TableStore } from '../table-store.service';

type ItemId = 'resume' | 'pace' | 'marks' | 'confirm' | 'faan' | 'sound' | 'rules' | 'leave';

/** + / − / M: speed, Western marks, confirm discard, faan so far, sound, rule summary, leave. */
@Component({
  selector: 'mj-pause-menu',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mj-scrim">
      <div class="mj-modal modal">
        <h2 class="mj-title sm">Menu</h2>
        <div class="list">
          @for (item of items(); track item.id; let i = $index) {
            <button
              type="button"
              class="mj-item"
              [class.focus]="index() === i"
              (pointerenter)="index.set(i)"
              (click)="index.set(i); activate(item.id)"
            >
              <span>{{ item.label }}</span>
              @if (item.value) {
                <span class="val">{{ item.value }}</span>
              }
            </button>
          }
        </div>
      </div>
    </div>
  `,
  styles: `
    .modal {
      width: 680px;
      padding: 44px 48px;
    }
    .list {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-top: 24px;
    }
    .modal .mj-item {
      height: 66px;
    }
  `,
})
export class PauseMenuComponent {
  protected readonly store = inject(TableStore);
  readonly exit = output<void>();

  protected readonly index = signal(0);
  protected readonly items = computed(() => {
    const s = this.store.settings();
    const onOff = (b: boolean) => (b ? 'On' : 'Off');
    return [
      { id: 'resume' as ItemId, label: 'Resume', value: '' },
      { id: 'pace' as ItemId, label: 'Speed', value: s.pace === 'fast' ? 'Fast' : 'Normal' },
      { id: 'marks' as ItemId, label: 'Western marks', value: onOff(s.marks) },
      { id: 'confirm' as ItemId, label: 'Confirm discard', value: onOff(s.confirmDiscard) },
      { id: 'faan' as ItemId, label: 'Faan so far', value: onOff(s.faanSoFar) },
      { id: 'sound' as ItemId, label: 'Sound', value: onOff(s.sound) },
      { id: 'rules' as ItemId, label: 'Rules', value: '' },
      { id: 'leave' as ItemId, label: 'Back to watch', value: '' },
    ];
  });

  handle(a: TvAction): void {
    const n = this.items().length;
    const id = this.items()[this.index()].id;
    switch (a) {
      case 'up':
        this.index.update((i) => (i - 1 + n) % n);
        break;
      case 'down':
        this.index.update((i) => (i + 1) % n);
        break;
      case 'left':
      case 'right':
        if (id !== 'resume' && id !== 'rules' && id !== 'leave') this.activate(id);
        break;
      case 'select':
        this.activate(id);
        break;
      case 'back':
      case 'menu':
        this.store.resume();
        break;
      default:
        break;
    }
  }

  protected activate(id: ItemId): void {
    const s = this.store.settings();
    switch (id) {
      case 'resume':
        this.store.resume();
        break;
      case 'pace':
        this.store.patchSettings({ pace: s.pace === 'fast' ? 'normal' : 'fast' });
        break;
      case 'marks':
        this.store.patchSettings({ marks: !s.marks });
        break;
      case 'confirm':
        this.store.patchSettings({ confirmDiscard: !s.confirmDiscard });
        break;
      case 'faan':
        this.store.patchSettings({ faanSoFar: !s.faanSoFar });
        break;
      case 'sound':
        this.store.patchSettings({ sound: !s.sound });
        break;
      case 'rules':
        this.store.rulesOpen.set(true);
        break;
      case 'leave':
        this.exit.emit();
        break;
    }
  }
}
