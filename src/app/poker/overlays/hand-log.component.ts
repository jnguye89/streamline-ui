import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { Card, HandSummary, Street } from '../core/api';
import { chips } from '../core/cards';
import { TvAction } from '../poker.types';
import { CardComponent } from '../table/card.component';

const STREET_LABEL: Record<Street | 'showdown', string> = {
  preflop: 'Before the flop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
  showdown: 'Showdown',
};

const SECOND_PERSON: Record<string, string> = {
  posts: 'post',
  calls: 'call',
  raises: 'raise',
  bets: 'bet',
  checks: 'check',
  folds: 'fold',
  shows: 'show',
  mucks: 'muck',
  wins: 'win',
  gets: 'get',
  is: 'are',
};

/** "calls 40" → "call 40" for your own lines. */
function secondPerson(text: string): string {
  const [verb = '', ...rest] = text.split(' ');
  return [SECOND_PERSON[verb] ?? verb, ...rest].join(' ');
}

interface Group {
  readonly street: Street | 'showdown';
  readonly label: string;
  readonly cards: readonly Card[];
  readonly lines: readonly string[];
}

/**
 * Last-hand log (X). Public information plus only your own hole cards (approved extra rule 1:
 * last 20 hands, kept in memory only). ◀ ▶ older / newer · ▲ ▼ scroll · B closes.
 */
@Component({
  selector: 'pk-hand-log',
  standalone: true,
  imports: [CardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ck-scrim">
      <div class="ck-modal modal">
        @if (hand(); as h) {
          <header class="head">
            <h2 class="ck-title sm">Hand {{ h.handNumber }}</h2>
            <span class="pager">{{ index() + 1 }} of {{ hands().length }} · ◀ ▶ hands · ▲▼ scroll · B close</span>
          </header>
          <div class="meta">
            <span>Blinds {{ blinds() }}</span>
            @if (h.myHoleCards; as mine) {
              <span class="mine">You <pk-card [card]="mine[0]" size="seat" /><pk-card [card]="mine[1]" size="seat" /></span>
            }
          </div>
          <div class="scroll">
            <div class="inner" [style.transform]="'translateY(' + -offset() * 104 + 'px)'">
              @for (g of groups(); track g.street) {
                <div class="group">
                  <div class="street" [class.has-cards]="g.cards.length > 0">
                    {{ g.label }}
                    @for (c of g.cards; track c) {
                      <pk-card [card]="c" size="seat" />
                    }
                  </div>
                  @for (l of g.lines; track $index) {
                    <p class="line">{{ l }}</p>
                  }
                </div>
              }
            </div>
          </div>
        } @else {
          <h2 class="ck-title sm">No hands yet</h2>
          <p class="ck-lead">Finished hands show up here. B to close.</p>
        }
      </div>
    </div>
  `,
  styles: `
    .modal { width: 1280px; height: 900px; padding: 44px 56px; display: flex; flex-direction: column; }
    .head { display: flex; align-items: baseline; justify-content: space-between; gap: 24px; }
    .pager { font: 500 28px/1 var(--font-ui); color: var(--text-3); }
    .meta { display: flex; align-items: center; gap: 36px; margin-top: 20px; font: 500 28px/1 var(--font-ui); color: var(--text-2); }
    .mine { display: inline-flex; align-items: center; gap: 10px; color: #fff; }
    .scroll { flex: 1; min-height: 0; overflow: hidden; margin-top: 24px; }
    .inner { transition: transform 160ms var(--ease); }
    .group { margin-bottom: 18px; }
    .street { display: flex; align-items: center; gap: 10px; min-height: 60px; font: 600 30px/1 var(--font-ui); color: var(--lav-soft); }
    .street.has-cards { min-height: 176px; }
    .street pk-card:first-of-type { margin-left: 10px; }
    .line { margin: 0; height: 52px; display: flex; align-items: center; font: 500 28px/1 var(--font-mono); color: #fff; }
  `,
})
export class HandLogComponent {
  readonly hands = input.required<readonly HandSummary[]>();
  /** Your seat, so your own lines read "You call 40". */
  readonly mySeat = input<number | null>(null);
  readonly close = output<void>();

  protected readonly index = signal(0);
  protected readonly offset = signal(0);
  protected readonly hand = computed(() => this.hands()[this.index()] ?? null);
  protected readonly blinds = computed(() => {
    const h = this.hand();
    return h ? `${chips(h.blinds.small)}/${chips(h.blinds.big)}` : '';
  });

  protected readonly groups = computed<Group[]>(() => {
    const h = this.hand();
    if (!h) return [];
    const order: (Street | 'showdown')[] = ['preflop', 'flop', 'turn', 'river', 'showdown'];
    const cardsFor: Record<string, readonly Card[]> = {
      preflop: [],
      flop: h.board.slice(0, 3),
      turn: h.board.slice(3, 4),
      river: h.board.slice(4, 5),
      showdown: [],
    };
    return order
      .map((street) => ({
        street,
        label: STREET_LABEL[street],
        cards: cardsFor[street] ?? [],
        lines: h.lines.filter((l) => l.street === street).map((l) => (l.seat === this.mySeat() ? `You ${secondPerson(l.text)}` : `${l.name} ${l.text}`)),
      }))
      .filter((g) => g.lines.length || g.cards.length);
  });

  private lineCount(): number {
    return this.groups().reduce((t, g) => t + Math.ceil(g.lines.length / 2) + (g.cards.length ? 2 : 1), 0);
  }

  handle(a: TvAction): void {
    const n = this.hands().length;
    switch (a) {
      case 'left':
        if (this.index() < n - 1) {
          this.index.update((i) => i + 1);
          this.offset.set(0);
        }
        break;
      case 'right':
        if (this.index() > 0) {
          this.index.update((i) => i - 1);
          this.offset.set(0);
        }
        break;
      case 'down':
        this.offset.update((o) => Math.min(Math.max(0, this.lineCount() - 5), o + 1));
        break;
      case 'up':
        this.offset.update((o) => Math.max(0, o - 1));
        break;
      case 'back':
      case 'undo':
      case 'select':
        this.close.emit();
        break;
      default:
        break;
    }
  }
}
