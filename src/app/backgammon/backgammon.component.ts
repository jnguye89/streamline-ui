import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ViewEncapsulation,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { opponent } from '@skriin/backgammon-core';
import { TvAction } from './backgammon.types';
import { BoardComponent } from './board/board.component';
import { BACKGAMMON_ENGINE, BACKGAMMON_PREVIEW } from './engine/engine.tokens';
import { PlaceholderEngine } from './engine/placeholder-engine';
import { SCENARIOS } from './engine/preview-states';
import { formatClock } from './format';
import { GameStore } from './game-store.service';
import { ControlsLegendComponent } from './hud/controls-legend.component';
import { MatchInfoComponent } from './hud/match-info.component';
import { MoveListComponent } from './hud/move-list.component';
import { PlayerCardComponent } from './hud/player-card.component';
import { DoubleOverlayComponent } from './overlays/double-overlay.component';
import { PauseMenuComponent } from './overlays/pause-menu.component';
import { ResignOverlayComponent } from './overlays/resign-overlay.component';
import { ResultOverlayComponent } from './overlays/result-overlay.component';
import { StartOverlayComponent } from './overlays/start-overlay.component';
import { VerifyDiceComponent } from './overlays/verify-dice.component';
import { SoundService } from './sound.service';
import { TvInputService } from './tv-input.service';

const STAGE_W = 1920;
const STAGE_H = 1080;

interface Status {
  readonly hero: string;
  readonly sub: string;
  readonly tone: '' | 'good' | 'hint' | 'warn';
}

/**
 * skriin ai TV · Backgammon.
 * Drop-in standalone page: <skriin-backgammon (exit)="goBack()" />
 * Draws a fixed 1920×1080 stage and scales it to the screen (1080p, 4K, laptop).
 */
@Component({
  selector: 'skriin-backgammon',
  standalone: true,
  imports: [
    BoardComponent,
    PlayerCardComponent,
    MatchInfoComponent,
    MoveListComponent,
    ControlsLegendComponent,
    StartOverlayComponent,
    PauseMenuComponent,
    DoubleOverlayComponent,
    ResultOverlayComponent,
    ResignOverlayComponent,
    VerifyDiceComponent,
  ],
  providers: [
    PlaceholderEngine,
    { provide: BACKGAMMON_ENGINE, useExisting: PlaceholderEngine },
    { provide: BACKGAMMON_PREVIEW, useExisting: PlaceholderEngine },
    GameStore,
    TvInputService,
    SoundService,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  templateUrl: './backgammon.component.html',
  styleUrl: './backgammon.component.css',
  host: {
    class: 'skriin-backgammon',
    '(window:resize)': 'fit()',
  },
})
export class BackgammonComponent {
  /** Player chose Exit. The host app navigates back. */
  readonly exit = output<void>();
  /** Review builds only: P / Shift+P cycle the 12 preview states. */
  readonly previewEnabled = input(false);

  protected readonly store = inject(GameStore);
  private readonly input = inject(TvInputService);
  protected readonly scale = signal(1);

  private readonly startOverlay = viewChild(StartOverlayComponent);
  private readonly pauseMenu = viewChild(PauseMenuComponent);
  private readonly doubleOverlay = viewChild(DoubleOverlayComponent);
  private readonly resultOverlay = viewChild(ResultOverlayComponent);
  private readonly resignOverlay = viewChild(ResignOverlayComponent);
  private readonly verify = viewChild(VerifyDiceComponent);

  protected readonly top = computed(() => opponent(this.store.bottom()));

  protected readonly showResult = computed(() => {
    const p = this.store.view().phase;
    return this.store.playing() && this.store.resultReady() && (p === 'game-over' || p === 'match-over');
  });
  protected readonly showDouble = computed(
    () => this.store.playing() && (this.store.view().phase === 'double-offered' || this.store.cubeNote() !== null),
  );
  protected readonly showResign = computed(
    () => this.store.overlay() === 'resign' || (this.store.playing() && this.store.view().phase === 'resign-offered'),
  );
  protected readonly previewLabel = computed(() => {
    const i = this.store.previewIndex();
    return i === null ? null : `Preview ${i + 1}/${SCENARIOS.length} · ${SCENARIOS[i].label}`;
  });

  protected readonly clock = computed(() => formatClock(this.store.elapsed()));

  /** Couch mode: whose controller turn it is, above the turn line. */
  protected readonly chip = computed(() => {
    const v = this.store.view();
    if (v.config.mode !== 'couch' || !this.store.playing()) return null;
    if (v.phase === 'game-over' || v.phase === 'match-over' || v.phase === 'opening') return null;
    return this.store.seats()[v.turn].name;
  });

  protected readonly status = computed<Status>(() => {
    const s = this.store;
    const v = s.view();
    const seats = s.seats();
    const seat = seats[v.turn];
    const other = seats[opponent(v.turn)];
    const local = v.localSides.includes(v.turn);
    const op = s.openingShow();

    if (op?.settled && op.tie) return { hero: 'Tie.', sub: `Both rolled ${op.dice[0]}. Rolling again.`, tone: '' };
    if (op?.settled) {
      const w = seats[op.dice[0] > op.dice[1] ? 0 : 1];
      return {
        hero: w.name === 'You' ? 'You go first.' : `${w.name} goes first.`,
        sub: `${op.dice[0]} against ${op.dice[1]}: play both.`,
        tone: 'good',
      };
    }

    switch (v.phase) {
      case 'opening':
        return {
          hero: 'Opening roll.',
          sub: v.match.crawford ? 'Crawford game — no doubling' : 'Higher die goes first.',
          tone: '',
        };
      case 'pre-roll': {
        if (!local) return { hero: `${seat.possessive} roll.`, sub: v.thinking ? 'Thinking…' : 'Rolling…', tone: '' };
        if (v.canDouble) return { hero: 'Your roll.', sub: `Roll, or double to ${v.cube.value * 2}.`, tone: '' };
        if (v.match.crawford) return { hero: 'Your roll.', sub: 'Crawford game — no doubling', tone: 'warn' };
        if (v.config.cube && v.cube.owner === opponent(v.turn)) {
          return { hero: 'Your roll.', sub: `${other.name} ${other.name === 'You' ? 'own' : 'owns'} the cube.`, tone: '' };
        }
        return { hero: 'Your roll.', sub: 'Rolling…', tone: '' };
      }
      case 'moving': {
        if (!local) {
          const d = v.dice;
          return { hero: `${seat.possessive} move.`, sub: v.thinking ? 'Thinking…' : d ? `Rolled ${d[0]} and ${d[1]}.` : '', tone: '' };
        }
        const h = s.hint();
        if (h) return { hero: 'Your move.', sub: `Hint: ${h.notation}`, tone: 'hint' };
        if (s.hintPending()) return { hero: 'Your move.', sub: 'Finding a hint…', tone: '' };
        if (v.board.bar[v.turn] > 0) return { hero: 'Your move.', sub: 'Enter from the bar.', tone: '' };
        if (s.activeSelection() !== null) return { hero: 'Your move.', sub: 'Pick a spot.', tone: '' };
        if (s.bearingOff()) return { hero: 'Your move.', sub: 'Bear off.', tone: '' };
        return { hero: 'Your move.', sub: 'Pick a checker.', tone: '' };
      }
      case 'turn-done': {
        if (v.noMoves) {
          return {
            hero: 'No moves.',
            sub: local && seat.name === 'You' ? 'Your turn passes.' : `${seat.possessive} turn passes.`,
            tone: 'warn',
          };
        }
        if (!local) return { hero: `${seat.possessive} move.`, sub: '', tone: '' };
        if (!s.settings().autoFinish) return { hero: 'Your move.', sub: 'Press A for Done. X to undo.', tone: '' };
        return { hero: 'Your move.', sub: v.canUndo ? 'X to undo' : 'Forced move.', tone: '' };
      }
      case 'double-offered': {
        const o = v.offer;
        if (o?.kind !== 'double') return { hero: '', sub: '', tone: '' };
        const by = seats[o.by];
        const to = seats[opponent(o.by)];
        if (v.localSides.includes(to.side)) return { hero: 'Double offered.', sub: 'Take or drop?', tone: 'warn' };
        return { hero: by.name === 'You' ? 'You doubled.' : `${by.name} doubled.`, sub: `${to.name} is deciding…`, tone: '' };
      }
      case 'resign-offered':
        return { hero: 'Resign offered.', sub: 'Waiting for an answer.', tone: '' };
      case 'game-over':
      case 'match-over': {
        const r = v.result;
        if (!r) return { hero: '', sub: '', tone: '' };
        const w = seats[r.winner];
        const kind = r.kind === 'single' ? '' : `${r.kind === 'gammon' ? 'Gammon' : 'Backgammon'} · `;
        const pts = `${r.points} ${r.points === 1 ? 'point' : 'points'}`;
        const hero =
          v.phase === 'match-over'
            ? w.name === 'You'
              ? 'You win the match.'
              : `${w.name} wins the match.`
            : w.name === 'You'
              ? 'You win.'
              : `${w.name} wins.`;
        return { hero, sub: `${kind}${pts}`, tone: 'good' };
      }
    }
  });

  constructor() {
    this.fit();
    const off = this.input.on((a) => this.route(a));
    inject(DestroyRef).onDestroy(off);
  }

  protected fit(): void {
    const w = globalThis.innerWidth || STAGE_W;
    const h = globalThis.innerHeight || STAGE_H;
    this.scale.set(Math.min(w / STAGE_W, h / STAGE_H));
  }

  protected onExit(): void {
    this.store.toStartScreen();
    this.exit.emit();
  }

  /** Sends each press to whatever is on top: verify › resign › menu › start › result › cube › board. */
  private route(a: TvAction): void {
    if (a === 'preview-next' || a === 'preview-prev') {
      if (this.previewEnabled()) this.store.previewStep(a === 'preview-next' ? 1 : -1);
      return;
    }
    const overlay = this.store.overlay();
    if (overlay === 'verify') return this.verify()?.handle(a);
    if (overlay === 'resign') return this.resignOverlay()?.handle(a);
    if (overlay === 'menu') return this.pauseMenu()?.handle(a);
    if (this.store.screen() === 'start') return this.startOverlay()?.handle(a);
    if (this.showResult()) return this.resultOverlay()?.handle(a);
    if (this.showDouble()) return this.doubleOverlay()?.handle(a);
    if (this.showResign()) {
      if (a === 'menu') return this.store.openMenu();
      return this.resignOverlay()?.handle(a);
    }
    this.store.handle(a);
  }
}
