import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { LEVEL_LABEL, matchLabel } from '../backgammon.types';
import { GameStore } from '../game-store.service';
import { CubeComponent } from './cube.component';

/** Right column top: title, match length, game number, Crawford label, and the cube with its owner side. */
@Component({
  selector: 'bg-match-info',
  standalone: true,
  imports: [CubeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="head">
      <h2>Backgammon</h2>
      <p>{{ subtitle() }}</p>
      <div class="chips">
        <span class="chip">{{ match() }}</span>
        <span class="chip">Game {{ store.view().match.game }}</span>
        @if (store.view().match.crawford) {
          <span class="chip crawford">Crawford game</span>
        } @else if (store.view().match.postCrawford) {
          <span class="chip">Post-Crawford</span>
        }
      </div>
    </header>

    <div class="bg-card cube-card">
      <div class="track" aria-hidden="true">
        <span class="slot" [class.on]="slot() === 'top'"></span>
        <span class="slot" [class.on]="slot() === 'mid'"></span>
        <span class="slot" [class.on]="slot() === 'bottom'"></span>
      </div>
      <bg-cube class="cube" [class.muted]="store.view().match.crawford" [value]="cube().value" [size]="88" [off]="cubeOff()" />
      <div class="txt">
        <div class="k">{{ cubeLabel() }}</div>
        <div class="v">{{ cubeText() }}</div>
      </div>
    </div>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 20px; }
    h2 { margin: 0; font: 600 48px/1 var(--font-display); letter-spacing: -0.02em; }
    .head p { margin: 12px 0 0; font: 500 24px/1 var(--font-ui); color: var(--text-2); }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
    .chip { padding: 9px 14px; border-radius: 999px; background: rgba(255,255,255,0.08); font: 600 19px/1 var(--font-ui); color: var(--text-2); }
    .chip.crawford { background: var(--indigo); color: #fff; }
    .cube-card { display: flex; align-items: center; gap: 20px; padding: 20px 24px; }
    .track { display: flex; flex-direction: column; gap: 8px; }
    .slot { width: 12px; height: 26px; border-radius: 6px; background: rgba(255,255,255,0.1); }
    .slot.on { background: #fff; }
    .cube { flex: none; transition: opacity 200ms ease; }
    .cube.muted { opacity: 0.35; }
    .txt { min-width: 0; }
    .k { font: 500 20px/1 var(--font-ui); color: var(--text-3); }
    .v { margin-top: 8px; font: 600 28px/1.15 var(--font-ui); }
  `,
})
export class MatchInfoComponent {
  protected readonly store = inject(GameStore);

  protected readonly cube = computed(() => this.store.view().cube);
  protected readonly cubeOff = computed(() => !this.store.view().config.cube);
  protected readonly match = computed(() => matchLabel(this.store.view().match.length));
  protected readonly subtitle = computed(() => {
    const cfg = this.store.view().config;
    return cfg.mode === 'couch' ? 'Couch · 2 players' : `vs Computer · ${LEVEL_LABEL[cfg.level]}`;
  });
  /** Owner shown by side: top = the player at the top, bottom = the player at the bottom. */
  protected readonly slot = computed(() => {
    const c = this.cube();
    if (this.cubeOff() || c.owner === null) return 'mid';
    return c.owner === this.store.bottom() ? 'bottom' : 'top';
  });
  protected readonly cubeLabel = computed(() => {
    const c = this.cube();
    return this.cubeOff() || c.value === 1 ? 'Cube' : `Cube at ${c.value}`;
  });
  /** The face shows the value; the text says who owns it. */
  protected readonly cubeText = computed(() => {
    const v = this.store.view();
    if (this.cubeOff()) return 'Off this match';
    if (v.match.crawford) return 'No doubling this game';
    const c = v.cube;
    if (c.owner === null) return 'In the middle';
    const seat = this.store.seats()[c.owner];
    return seat.name === 'You' ? 'Yours' : seat.possessive;
  });
}
