import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ResultKind, opponent } from '@skriin/backgammon-core';
import { TvAction } from '../backgammon.types';
import { GameStore } from '../game-store.service';

const KIND_LABEL: Record<ResultKind, string> = { single: 'Single', gammon: 'Gammon', backgammon: 'Backgammon' };
const MULT: Record<ResultKind, number> = { single: 1, gammon: 2, backgammon: 3 };

/**
 * Resign: pick what to offer (single, gammon or backgammon × cube), then the other side
 * accepts or declines. In couch mode the other player answers here too.
 */
@Component({
  selector: 'bg-resign-overlay',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bg-scrim">
      <div class="bg-modal modal">
        @if (mode() === 'pick') {
          <h2 class="bg-title sm">Resign this game?</h2>
          <p class="bg-lead sm">Offer a result. {{ otherName() }} can accept or play on.</p>
        } @else if (mode() === 'answer') {
          <h2 class="bg-title sm">{{ offerTitle() }}</h2>
          <p class="bg-lead sm">{{ answerName() }}: accept and win, or play on.</p>
        } @else {
          <h2 class="bg-title sm">{{ offerTitle() }}</h2>
          <p class="bg-lead sm">{{ otherName() }} is deciding.</p>
        }
        @if (options().length) {
          <div class="list">
            @for (o of options(); track o.id; let i = $index) {
              <button
                type="button"
                class="bg-item"
                [class.focus]="index() === i"
                (pointerenter)="index.set(i)"
                (click)="pick(i)"
              >
                <span>{{ o.label }}</span>
                @if (o.value) {
                  <span class="val">{{ o.value }}</span>
                }
              </button>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: `
    .modal { width: 760px; }
    .list { display: flex; flex-direction: column; gap: 4px; margin-top: 30px; }
  `,
})
export class ResignOverlayComponent {
  protected readonly store = inject(GameStore);
  protected readonly index = signal(0);

  protected readonly mode = computed<'pick' | 'answer' | 'wait'>(() => {
    if (this.store.overlay() === 'resign') return 'pick';
    const v = this.store.view();
    const o = v.offer;
    if (o?.kind === 'resign' && v.localSides.includes(opponent(o.by))) return 'answer';
    return 'wait';
  });

  protected readonly otherName = computed(() => {
    const v = this.store.view();
    const o = v.offer;
    const by = o?.kind === 'resign' ? o.by : v.config.mode === 'couch' ? v.turn : this.store.bottom();
    return this.store.seats()[opponent(by)].name;
  });

  protected readonly answerName = computed(() => this.otherName());

  protected readonly offerTitle = computed(() => {
    const o = this.store.view().offer;
    if (o?.kind !== 'resign') return '';
    const by = this.store.seats()[o.by];
    const pts = `${o.points} ${o.points === 1 ? 'point' : 'points'}`;
    return `${by.name} ${by.name === 'You' ? 'offer' : 'offers'} a ${KIND_LABEL[o.result].toLowerCase()} (${pts}).`;
  });

  /** Under the Jacoby rule with the cube never turned, gammons don't count: only a single is offered. */
  protected readonly options = computed(() => {
    const v = this.store.view();
    if (this.mode() === 'pick') {
      const jacobyBlocks = v.config.length === 0 && v.config.cube && v.config.jacoby && v.cube.value === 1;
      const kinds: ResultKind[] = jacobyBlocks ? ['single'] : ['single', 'gammon', 'backgammon'];
      return [
        ...kinds.map((k) => {
          const pts = MULT[k] * v.cube.value;
          return { id: k as string, label: KIND_LABEL[k], value: `${pts} ${pts === 1 ? 'point' : 'points'}` };
        }),
        { id: 'cancel', label: 'Cancel', value: '' },
      ];
    }
    if (this.mode() === 'answer') {
      return [
        { id: 'accept', label: 'Accept', value: '' },
        { id: 'decline', label: 'Decline · play on', value: '' },
      ];
    }
    return [];
  });

  handle(a: TvAction): void {
    const n = this.options().length;
    if (!n) return;
    switch (a) {
      case 'up':
      case 'left':
        this.index.update((i) => (i - 1 + n) % n);
        break;
      case 'down':
      case 'right':
        this.index.update((i) => (i + 1) % n);
        break;
      case 'select':
        this.pick(this.index());
        break;
      case 'back':
        if (this.mode() === 'pick') this.store.closeOverlay();
        break;
      default:
        break;
    }
  }

  protected pick(i: number): void {
    const o = this.options()[i];
    if (!o) return;
    this.index.set(0);
    if (o.id === 'cancel') this.store.closeOverlay();
    else if (o.id === 'accept') this.store.answerResign(true);
    else if (o.id === 'decline') this.store.answerResign(false);
    else this.store.resign(o.id as ResultKind);
  }
}
