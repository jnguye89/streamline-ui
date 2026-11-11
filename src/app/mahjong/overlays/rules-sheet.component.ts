import { ChangeDetectionStrategy, Component, ElementRef, inject, viewChild } from '@angular/core';
import { HALF_SPICY } from '@skriin/mahjong-core';
import { TvAction } from '../mahjong.types';
import { TableStore } from '../table-store.service';

/** Rule summary from the approved Hong Kong sheet (Menu → Rules). ▲▼ scroll, B closes. */
@Component({
  selector: 'mj-rules-sheet',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mj-scrim">
      <div class="mj-modal modal">
        <header>
          <h2 class="mj-title sm">Rules</h2>
          <span class="sub">Hong Kong Old Style · 3 faan to win</span>
          <span class="close"><span class="mj-glyph sm">B</span> Close</span>
        </header>
        <div class="body" #body>
          <section class="col">
            @for (s of sections; track s.title) {
              <h3>{{ s.title }}</h3>
              <p>{{ s.text }}</p>
            }
            <h3>Faan → points</h3>
            <div class="points">
              @for (p of points; track $index) {
                <span
                  ><b>{{ $index }}</b
                  >{{ p }}</span
                >
              }
            </div>
            <p>
              10 faan is the limit. Win on a discard: the discarder loses 2× the points, the other
              two 1× each. Self-drawn: each player loses 2×.
            </p>
          </section>
          <section class="col faan">
            @for (g of faan; track g.value) {
              <div class="group">
                <div class="val">{{ g.value }}</div>
                <div class="items">
                  @for (i of g.items; track i) {
                    <span>{{ i }}</span>
                  }
                </div>
              </div>
            }
          </section>
        </div>
      </div>
    </div>
  `,
  styles: `
    .modal {
      width: 1680px;
      height: 960px;
      padding: 40px 48px 0;
      display: flex;
      flex-direction: column;
    }
    header {
      display: flex;
      align-items: baseline;
      gap: 24px;
    }
    .sub {
      font: 500 26px/1 var(--font-ui);
      color: var(--text-2);
      flex: 1;
    }
    .close {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      font: 500 24px/1 var(--font-ui);
      color: var(--text-2);
    }
    .body {
      flex: 1;
      overflow-y: auto;
      margin-top: 26px;
      padding-bottom: 40px;
      display: grid;
      grid-template-columns: 700px 1fr;
      gap: 56px;
      scrollbar-width: none;
    }
    .body::-webkit-scrollbar {
      display: none;
    }
    h3 {
      margin: 26px 0 8px;
      font: 600 28px/1.2 var(--font-display);
      letter-spacing: -0.01em;
    }
    h3:first-child {
      margin-top: 0;
    }
    p {
      margin: 0;
      font: 500 25px/1.42 var(--font-ui);
      color: var(--text-2);
    }
    .points {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 12px;
    }
    .points span {
      display: inline-flex;
      gap: 8px;
      align-items: baseline;
      padding: 8px 12px;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.06);
      font: 500 22px/1 var(--font-mono);
    }
    .points b {
      color: var(--lav-soft);
      font-weight: 500;
    }
    .faan {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .group {
      display: grid;
      grid-template-columns: 150px 1fr;
      gap: 20px;
      align-items: start;
      padding: 16px 20px;
      border-radius: 20px;
      background: rgba(255, 255, 255, 0.04);
    }
    .val {
      font: 600 30px/1.2 var(--font-display);
      color: var(--lav-soft);
    }
    .items {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .items span {
      padding: 9px 16px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.08);
      font: 500 24px/1.1 var(--font-ui);
    }
  `,
})
export class RulesSheetComponent {
  private readonly store = inject(TableStore);
  private readonly body = viewChild.required<ElementRef<HTMLElement>>('body');

  protected readonly points = HALF_SPICY;
  protected readonly sections = [
    {
      title: 'Win',
      text: 'Make 4 sets and a pair. A set is a chow (3 in a row, one suit), a pung (3 of a kind) or a kong (4 of a kind). Thirteen orphans and nine gates also win.',
    },
    {
      title: 'Your turn',
      text: 'Draw, then discard one tile. Flowers and seasons go aside and you draw a replacement from the back of the wall. On your turn you can also win on the tile you drew or declare a kong.',
    },
    {
      title: 'Calls on a discard',
      text: 'Win: anyone. Pung or kong: anyone. Chow: only the next player. Win beats pung and kong, which beat chow. If two players can win, the first after the discarder in turn order takes it.',
    },
    {
      title: 'End of a hand',
      text: 'Someone wins, or the wall runs out and nobody scores. If the dealer wins or nobody wins, the dealer deals again; otherwise the deal moves to the right. After all four have dealt, the round wind moves on.',
    },
  ];
  protected readonly faan = [
    {
      value: '1 faan',
      items: [
        'Self-drawn',
        'Concealed hand',
        'Win on a replacement tile',
        'Robbing the kong',
        'Last tile',
        'All chows',
        'Each dragon pung',
        'Seat-wind pung',
        'Prevailing-wind pung',
        'No bonus tiles',
        'Own flower',
        'Own season',
      ],
    },
    { value: '2 faan', items: ['All 4 flowers', 'All 4 seasons'] },
    { value: '3 faan', items: ['All pungs', 'Mixed one suit'] },
    { value: '5 faan', items: ['Small three dragons'] },
    { value: '7 faan', items: ['Pure one suit'] },
    { value: '8 faan', items: ['Big three dragons', 'All 8 bonus tiles'] },
    {
      value: 'Limit',
      items: [
        'Small four winds',
        'All honors',
        'All terminals',
        'Heavenly hand',
        'Earthly hand',
        'Thirteen orphans',
        'Big four winds',
        'Nine gates',
        'Four kongs',
      ],
    },
  ];

  handle(a: TvAction): void {
    const el = this.body().nativeElement;
    switch (a) {
      case 'up':
        el.scrollBy({ top: -160, behavior: 'smooth' });
        break;
      case 'down':
        el.scrollBy({ top: 160, behavior: 'smooth' });
        break;
      case 'back':
      case 'select':
      case 'menu':
        this.store.rulesOpen.set(false);
        break;
      default:
        break;
    }
  }
}
