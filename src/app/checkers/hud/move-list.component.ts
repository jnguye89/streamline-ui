import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { GameStore } from '../game-store.service';

interface Row {
  readonly n: number;
  readonly dark: string;
  readonly light: string;
}

const VISIBLE_ROWS = 9;

/** Last moves in standard notation. No scrolling: the newest rows are always on screen. */
@Component({
  selector: 'ck-move-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ck-card card">
      <div class="head">
        <span class="h">Moves</span>
        <span class="cols">
          <span class="col"><i class="sw dark"></i>{{ darkLabel() }}</span>
          <span class="col"><i class="sw light"></i>{{ lightLabel() }}</span>
        </span>
      </div>
      @if (rows().length) {
        <ol>
          @for (row of rows(); track row.n; let last = $last) {
            <li>
              <span class="n">{{ row.n }}</span>
              <span class="mv" [class.latest]="last && !row.light">{{ row.dark }}</span>
              <span class="mv" [class.latest]="last && !!row.light">{{ row.light }}</span>
            </li>
          }
        </ol>
      } @else {
        <p class="empty">No moves yet.</p>
      }
    </div>
  `,
  styles: `
    :host { display: block; flex: 1; min-height: 0; }
    .card { height: 100%; padding: 26px 28px; display: flex; flex-direction: column; }
    .head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 14px; }
    .h { font: 600 24px/1 var(--font-ui); color: var(--text-2); }
    .cols { display: flex; gap: 18px; font: 500 18px/1 var(--font-ui); color: var(--text-3); }
    .col { display: inline-flex; align-items: center; gap: 8px; }
    .sw { width: 24px; height: 24px; border-radius: 7px; display: inline-grid; place-items: center; background: var(--sq-dark); }
    .sw::after { content: ''; width: 14px; height: 14px; border-radius: 50%; }
    .sw.dark::after { background: var(--p-dark-top); }
    .sw.light::after { background: var(--p-light-top); }
    ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; }
    li { display: grid; grid-template-columns: 44px 1fr 1fr; align-items: center; height: 42px; font: 500 24px/1 var(--font-mono); }
    .n { color: var(--text-3); font-size: 20px; }
    .mv { padding: 6px 10px; border-radius: 10px; justify-self: start; }
    .mv.latest { background: rgba(255,255,255,0.1); }
    .empty { margin: auto 0 0; font: 500 22px/1.3 var(--font-ui); color: var(--text-3); }
  `,
})
export class MoveListComponent {
  private readonly store = inject(GameStore);

  protected readonly darkLabel = computed(() => (this.store.playerColor() === 'dark' ? 'You' : 'Computer'));
  protected readonly lightLabel = computed(() => (this.store.playerColor() === 'light' ? 'You' : 'Computer'));

  protected readonly rows = computed<Row[]>(() => {
    const recs = this.store.records();
    const rows: Row[] = [];
    for (let i = 0; i < recs.length; i += 2) {
      rows.push({ n: i / 2 + 1, dark: recs[i]?.text ?? '', light: recs[i + 1]?.text ?? '' });
    }
    return rows.slice(-VISIBLE_ROWS);
  });
}
