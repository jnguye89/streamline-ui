import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { THEME_LABEL, TvAction } from '../checkers.types';
import { GameStore } from '../game-store.service';

type ItemId = 'resume' | 'undo' | 'draw' | 'resign' | 'new' | 'theme' | 'sound' | 'numbers' | 'exit';

@Component({
  selector: 'ck-pause-menu',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ck-scrim">
      <div class="ck-modal modal">
        <h2 class="ck-title sm">Paused</h2>
        <div class="list">
          @for (item of items(); track item.id; let i = $index) {
            <button
              type="button"
              class="ck-item"
              [class.focus]="index() === i"
              (pointerenter)="index.set(i)"
              (click)="index.set(i); activate(item.id, 1)"
            >
              <span>{{ item.label }}</span>
              @if (item.value) {
                <span class="val">
                  @if (item.id === 'theme') {
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
    .modal { width: 640px; padding: 44px 48px; }
    .list { display: flex; flex-direction: column; gap: 4px; margin-top: 24px; }
    .modal .ck-item { height: 66px; }
    .arrow { color: var(--text-3); padding: 0 12px; }
  `,
})
export class PauseMenuComponent {
  protected readonly store = inject(GameStore);
  readonly exit = output<void>();

  protected readonly index = signal(0);
  protected readonly items = computed(() => {
    const s = this.store.settings();
    return [
      { id: 'resume' as ItemId, label: 'Resume', value: '' },
      { id: 'undo' as ItemId, label: 'Undo move', value: '' },
      { id: 'draw' as ItemId, label: 'Offer a draw', value: '' },
      { id: 'resign' as ItemId, label: 'Resign', value: '' },
      { id: 'new' as ItemId, label: 'New game', value: '' },
      { id: 'theme' as ItemId, label: 'Board', value: THEME_LABEL[s.theme] },
      { id: 'sound' as ItemId, label: 'Sound', value: s.sound ? 'On' : 'Off' },
      { id: 'numbers' as ItemId, label: 'Square numbers', value: s.numbers ? 'On' : 'Off' },
      { id: 'exit' as ItemId, label: 'Back to watch', value: '' },
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
        if (id === 'theme') this.store.cycleTheme(a === 'right' ? 1 : -1);
        if (id === 'sound' || id === 'numbers') this.activate(id, 1);
        break;
      case 'select':
        this.activate(id, 1);
        break;
      case 'back':
      case 'menu':
        this.store.resume();
        break;
      default:
        break;
    }
  }

  protected activate(id: ItemId, step: 1 | -1): void {
    switch (id) {
      case 'resume':
        this.store.resume();
        break;
      case 'undo':
        this.store.resume();
        this.store.undo();
        break;
      case 'draw':
        this.store.resume();
        void this.store.offerDraw();
        break;
      case 'resign':
        this.store.resume();
        this.store.resign();
        break;
      case 'new':
        this.store.toStartScreen();
        break;
      case 'theme':
        this.store.cycleTheme(step);
        break;
      case 'sound':
        this.store.toggleSound();
        break;
      case 'numbers':
        this.store.toggleNumbers();
        break;
      case 'exit':
        this.exit.emit();
        break;
    }
  }
}
