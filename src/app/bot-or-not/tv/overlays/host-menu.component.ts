import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TvAction } from '../../../shared/tv/tv.types';
import { COPY } from '../../core/copy';
import { Phase, PublicState, Settings } from '../../core/types';
import { AvatarComponent } from '../ui/avatar.component';

export type MenuCommand =
  | { readonly kind: 'resume' }
  | { readonly kind: 'skip' }
  | { readonly kind: 'hide' }
  | { readonly kind: 'remove'; readonly playerId: string }
  | { readonly kind: 'settings' }
  | { readonly kind: 'patch'; readonly patch: Partial<Settings> }
  | { readonly kind: 'end' }
  | { readonly kind: 'exit' };

type ItemId = 'resume' | 'skip' | 'hide' | 'remove' | 'family' | 'names' | 'settings' | 'end' | 'exit';
interface Item {
  readonly id: ItemId;
  readonly label: string;
  readonly value?: string;
}

const SKIP_LABEL: Partial<Record<Phase, string>> = {
  prompt: 'Start answers now',
  answering: 'End answers now',
  reveal: 'Show all cards',
  voting: 'End voting now',
  results: 'Next round',
  void: 'Next',
};
const IN_ROUND: readonly Phase[] = ['prompt', 'answering', 'reveal', 'voting', 'results', 'void'];
const WITH_CARDS: readonly Phase[] = ['reveal', 'voting', 'results'];

/** Host menu (+ / − on the controller, M on a keyboard). Timers wait while it's open. */
@Component({
  selector: 'bon-host-menu',
  standalone: true,
  imports: [AvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bon-scrim">
      <div class="bon-modal modal">
        @if (level() === 'main') {
          <h2 class="bon-title sm">{{ inRound() ? copy.paused : 'Menu' }}</h2>
          <div class="list">
            @for (item of items(); track item.id; let i = $index) {
              <button type="button" class="bon-item" [class.focus]="index() === i" (pointerenter)="index.set(i)" (click)="index.set(i); activate(item.id)">
                <span>{{ item.label }}</span>
                @if (item.value) {
                  <span class="val">{{ item.value }}</span>
                }
              </button>
            }
          </div>
        } @else {
          <h2 class="bon-title sm">Remove a player</h2>
          <div class="list">
            @for (p of humans(); track p.id; let i = $index) {
              <button type="button" class="bon-item person" [class.focus]="index() === i" (pointerenter)="index.set(i)" (click)="pickPlayer(p.id)">
                <span class="who"><bon-avatar [name]="p.name" [hue]="p.hue" [size]="44" />{{ p.name }}</span>
                <span class="val">Remove</span>
              </button>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: `
    .modal { width: 700px; padding: 44px 48px; }
    .list { display: flex; flex-direction: column; gap: 4px; margin-top: 24px; }
    .modal .bon-item { height: 70px; }
    .who { display: flex; align-items: center; gap: 16px; }
  `,
})
export class HostMenuComponent {
  readonly state = input.required<PublicState>();
  readonly command = output<MenuCommand>();

  protected readonly copy = COPY;
  protected readonly level = signal<'main' | 'players'>('main');
  protected readonly index = signal(0);

  protected readonly inRound = computed(() => IN_ROUND.includes(this.state().phase));
  protected readonly humans = computed(() => this.state().players.filter((p) => p.kind === 'human'));

  protected readonly items = computed<Item[]>(() => {
    const s = this.state();
    const items: Item[] = [{ id: 'resume', label: this.inRound() ? 'Resume' : 'Close' }];
    const skip = SKIP_LABEL[s.phase];
    if (skip) items.push({ id: 'skip', label: s.phase === 'results' && s.lastRound ? 'Final scores' : skip });
    if (WITH_CARDS.includes(s.phase)) items.push({ id: 'hide', label: 'Hide a card' });
    if (this.humans().length) items.push({ id: 'remove', label: 'Remove a player' });
    if (s.phase === 'lobby') items.push({ id: 'settings', label: COPY.settings });
    items.push({
      id: 'family',
      label: 'Family mode',
      value: s.live ? `On · ${COPY.lockedWhileLive}` : s.settings.familyMode ? 'On' : 'Off',
    });
    items.push({ id: 'names', label: 'Names on TV', value: s.settings.showNames ? 'Show' : 'Hide' });
    if (s.phase !== 'lobby') items.push({ id: 'end', label: 'End game' });
    items.push({ id: 'exit', label: 'Back to watch' });
    return items;
  });

  handle(a: TvAction): void {
    const list = this.level() === 'main' ? this.items().length : this.humans().length;
    switch (a) {
      case 'up':
        this.index.update((i) => (i - 1 + list) % Math.max(1, list));
        break;
      case 'down':
        this.index.update((i) => (i + 1) % Math.max(1, list));
        break;
      case 'left':
      case 'right':
        if (this.level() === 'main') {
          const id = this.items()[this.index()]?.id;
          if (id === 'family' || id === 'names') this.activate(id);
        }
        break;
      case 'select':
        if (this.level() === 'main') {
          const id = this.items()[this.index()]?.id;
          if (id) this.activate(id);
        } else {
          const p = this.humans()[this.index()];
          if (p) this.pickPlayer(p.id);
        }
        break;
      case 'back':
      case 'menu':
        if (this.level() === 'players') {
          this.level.set('main');
          this.index.set(Math.max(0, this.items().findIndex((i) => i.id === 'remove')));
        } else {
          this.command.emit({ kind: 'resume' });
        }
        break;
      default:
        break;
    }
  }

  protected activate(id: ItemId): void {
    const s = this.state().settings;
    switch (id) {
      case 'resume':
        this.command.emit({ kind: 'resume' });
        break;
      case 'skip':
        this.command.emit({ kind: 'skip' });
        break;
      case 'hide':
        this.command.emit({ kind: 'hide' });
        break;
      case 'remove':
        this.level.set('players');
        this.index.set(0);
        break;
      case 'settings':
        this.command.emit({ kind: 'settings' });
        break;
      case 'family':
        if (!this.state().live) this.command.emit({ kind: 'patch', patch: { familyMode: !s.familyMode } });
        break;
      case 'names':
        this.command.emit({ kind: 'patch', patch: { showNames: !s.showNames } });
        break;
      case 'end':
        this.command.emit({ kind: 'end' });
        break;
      case 'exit':
        this.command.emit({ kind: 'exit' });
        break;
    }
  }

  protected pickPlayer(id: string): void {
    this.command.emit({ kind: 'remove', playerId: id });
    this.level.set('main');
    this.index.set(0);
  }
}
