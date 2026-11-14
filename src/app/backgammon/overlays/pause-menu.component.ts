import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { LEVEL_LABEL, THEME_LABEL, TvAction, matchLabel } from '../backgammon.types';
import { GameStore } from '../game-store.service';

type ItemId =
  | 'resume'
  | 'resign'
  | 'new'
  | 'verify'
  | 'theme'
  | 'direction'
  | 'finish'
  | 'pips'
  | 'match'
  | 'cube'
  | 'jacoby'
  | 'level'
  | 'sound'
  | 'exit';

interface Item {
  readonly id: ItemId;
  readonly label: string;
  readonly value: string;
  /** Cycles with ← → */
  readonly cycles: boolean;
  /** Applies from the next match. */
  readonly next: boolean;
}

/** Menu (+ / − / M): game actions and every setting. */
@Component({
  selector: 'bg-pause-menu',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bg-scrim">
      <div class="bg-modal modal">
        <h2 class="bg-title sm">Menu</h2>
        <div class="list">
          @for (item of items(); track item.id; let i = $index) {
            <button
              type="button"
              class="bg-item"
              [class.focus]="index() === i"
              [class.gap]="item.id === 'theme' || item.id === 'exit'"
              (pointerenter)="index.set(i)"
              (click)="index.set(i); activate(item.id, 1)"
            >
              <span>{{ item.label }}</span>
              @if (item.value) {
                <span class="val">
                  @if (item.next) {
                    <em>next match</em>
                  }
                  @if (item.cycles) {
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
    .modal { width: 760px; padding: 34px 44px 30px; }
    .list { display: flex; flex-direction: column; gap: 2px; margin-top: 18px; }
    .modal .bg-item { height: 54px; }
    .bg-item.gap { margin-top: 10px; }
    .arrow { color: var(--text-3); padding: 0 12px; }
    em { font: 500 18px/1 var(--font-ui); font-style: normal; color: var(--lav-soft); margin-right: 14px; }
  `,
})
export class PauseMenuComponent {
  protected readonly store = inject(GameStore);
  readonly exit = output<void>();

  protected readonly index = signal(0);
  protected readonly items = computed<Item[]>(() => {
    const s = this.store.settings();
    const cfg = this.store.view().config;
    const onOff = (v: boolean) => (v ? 'On' : 'Off');
    const it = (id: ItemId, label: string, value = '', cycles = false, next = false): Item => ({
      id,
      label,
      value,
      cycles,
      next,
    });
    return [
      it('resume', 'Resume'),
      it('resign', 'Resign…'),
      it('new', 'New match'),
      it('verify', 'Verify dice'),
      it('theme', 'Board', THEME_LABEL[s.theme], true),
      it('direction', 'Home board', s.homeLeft ? 'Bottom-left' : 'Bottom-right', true),
      it('finish', 'Finish turn', s.autoFinish ? 'Auto · X to undo' : 'Press Done', true),
      it('pips', 'Pip counts', onOff(s.pips), true),
      it('match', 'Match', matchLabel(s.matchLength), true, s.matchLength !== cfg.length),
      it('cube', 'Doubling cube', onOff(s.cube), true, s.cube !== cfg.cube),
      it('jacoby', 'Jacoby (single games)', onOff(s.jacoby), true, s.jacoby !== cfg.jacoby),
      it('level', 'Computer level', LEVEL_LABEL[s.level], true, s.level !== cfg.level),
      it('sound', 'Sound', onOff(s.sound), true),
      it('exit', 'Back to watch'),
    ];
  });

  handle(a: TvAction): void {
    const list = this.items();
    const n = list.length;
    const item = list[this.index()];
    switch (a) {
      case 'up':
        this.index.update((i) => (i - 1 + n) % n);
        break;
      case 'down':
        this.index.update((i) => (i + 1) % n);
        break;
      case 'left':
      case 'right':
        if (item.cycles) this.activate(item.id, a === 'right' ? 1 : -1);
        break;
      case 'select':
        this.activate(item.id, 1);
        break;
      case 'back':
      case 'menu':
        this.store.closeOverlay();
        break;
      default:
        break;
    }
  }

  protected activate(id: ItemId, step: 1 | -1): void {
    const s = this.store;
    switch (id) {
      case 'resume':
        s.closeOverlay();
        break;
      case 'resign':
        s.openResign();
        break;
      case 'new':
        s.toStartScreen();
        break;
      case 'verify':
        s.openVerify();
        break;
      case 'theme':
        s.cycle('theme', step);
        break;
      case 'direction':
        s.toggle('homeLeft');
        break;
      case 'finish':
        s.toggle('autoFinish');
        break;
      case 'pips':
        s.toggle('pips');
        break;
      case 'match':
        s.cycle('matchLength', step);
        break;
      case 'cube':
        s.toggle('cube');
        break;
      case 'jacoby':
        s.toggle('jacoby');
        break;
      case 'level':
        s.cycle('level', step);
        break;
      case 'sound':
        s.toggle('sound');
        break;
      case 'exit':
        this.exit.emit();
        break;
    }
  }
}
