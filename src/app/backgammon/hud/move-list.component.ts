import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { diceText } from '@skriin/backgammon-core';
import { GameStore } from '../game-store.service';

/** Rendered rows; the list shows as many of the newest as fit and fades the rest. */
const VISIBLE_ROWS = 12;

/** This game's moves in standard notation. No scrolling: the newest rows are always on screen. */
@Component({
  selector: 'bg-move-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bg-card card">
      <div class="head">
        <span class="h">Moves</span>
        <span class="h2">Game {{ store.view().match.game }}</span>
      </div>
      @if (rows().length) {
        <ol>
          @for (row of rows(); track row.i; let last = $last) {
            <li [class.latest]="last" [class.note]="row.note">
              <i class="sw" [class]="row.tone"></i>
              <span class="dice">{{ row.dice }}</span>
              <span class="mv">{{ row.text }}</span>
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
    .card { height: 100%; padding: 24px 24px; display: flex; flex-direction: column; box-sizing: border-box; }
    .head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; }
    .h { font: 600 24px/1 var(--font-ui); color: var(--text-2); }
    .h2 { font: 500 18px/1 var(--font-ui); color: var(--text-3); }
    /* Newest at the bottom; older rows fade out at the top instead of being cut. */
    ol {
      list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; justify-content: flex-end;
      flex: 1; min-height: 0; overflow: hidden;
      -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 44px);
      mask-image: linear-gradient(to bottom, transparent 0, #000 44px);
    }
    li { flex: none; display: grid; grid-template-columns: 20px 34px 1fr; align-items: start; gap: 10px; padding: 7px 8px; border-radius: 10px; font: 500 20px/1.3 var(--font-mono); }
    li.latest { background: rgba(255,255,255,0.1); }
    li.note .mv { font-family: var(--font-ui); font-weight: 600; color: var(--lav-soft); }
    .sw { width: 20px; height: 20px; margin-top: 3px; border-radius: 50%; }
    .sw.light { background: var(--ck-light-top); box-shadow: inset 0 -3px 0 var(--ck-light-edge); }
    .sw.dark { background: var(--ck-dark-top); box-shadow: inset 0 -3px 0 var(--ck-dark-edge), 0 0 0 1.5px rgba(255,255,255,0.4); }
    .dice { color: var(--text-3); }
    .mv { overflow-wrap: anywhere; }
    .empty { margin: auto 0 0; font: 500 22px/1.3 var(--font-ui); color: var(--text-3); }
  `,
})
export class MoveListComponent {
  protected readonly store = inject(GameStore);

  protected readonly rows = computed(() => {
    const v = this.store.view();
    const game = v.match.game;
    return v.log
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => e.game === game)
      .slice(-VISIBLE_ROWS)
      .map(({ e, i }) => ({
        i,
        tone: e.side === 0 ? 'light' : 'dark',
        dice: e.dice ? diceText(e.dice) : '',
        text: e.text,
        note: e.kind !== 'move',
      }));
  });
}
