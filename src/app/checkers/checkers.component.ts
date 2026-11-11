import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ViewEncapsulation,
  computed,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { notation } from './board-geometry';
import { BoardComponent } from './board/board.component';
import { LEVEL_LABEL, OutcomeReason, TvAction } from './checkers.types';
import { AmericanCheckersEngine } from './engine/american-engine';
import { CHECKERS_ENGINE } from './engine/checkers-engine';
import { formatClock } from './format';
import { GameStore } from './game-store.service';
import { ControlsLegendComponent } from './hud/controls-legend.component';
import { MoveListComponent } from './hud/move-list.component';
import { PlayerCardComponent } from './hud/player-card.component';
import { GameOverComponent } from './overlays/game-over.component';
import { PauseMenuComponent } from './overlays/pause-menu.component';
import { StartOverlayComponent } from './overlays/start-overlay.component';
import { SoundService } from './sound.service';
import { TvInputService } from './tv-input.service';

const REASON_SHORT: Record<OutcomeReason, string> = {
  'no-pieces': 'All pieces taken.',
  'no-moves': 'No moves left.',
  repetition: 'Same position three times.',
  'no-progress': '40-move rule.',
  agreement: 'Draw agreed.',
  resign: 'You resigned.',
};

const STAGE_W = 1920;
const STAGE_H = 1080;

/**
 * skriin ai TV · Checkers (you vs computer).
 * Drop-in standalone page: <skriin-checkers (exit)="goBack()" />
 * Draws a fixed 1920×1080 stage and scales it to the screen (1080p, 4K, laptop).
 */
@Component({
  selector: 'skriin-checkers',
  standalone: true,
  imports: [
    BoardComponent,
    PlayerCardComponent,
    MoveListComponent,
    ControlsLegendComponent,
    StartOverlayComponent,
    PauseMenuComponent,
    GameOverComponent,
  ],
  providers: [
    GameStore,
    TvInputService,
    SoundService,
    { provide: CHECKERS_ENGINE, useClass: AmericanCheckersEngine },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  templateUrl: './checkers.component.html',
  styleUrl: './checkers.component.css',
  host: {
    class: 'skriin-checkers',
    '(window:resize)': 'fit()',
  },
})
export class CheckersComponent {
  /** Player chose Exit (B on the start screen, or Exit in a menu). Host app navigates back. */
  readonly exit = output<void>();

  protected readonly store = inject(GameStore);
  private readonly input = inject(TvInputService);

  protected readonly scale = signal(1);

  private readonly startOverlay = viewChild(StartOverlayComponent);
  private readonly pauseMenu = viewChild(PauseMenuComponent);
  private readonly gameOver = viewChild(GameOverComponent);

  protected readonly levelLabel = computed(() => LEVEL_LABEL[this.store.settings().level]);
  protected readonly clock = computed(() => formatClock(this.store.elapsed()));
  protected readonly moveNo = computed(() => Math.floor(this.store.records().length / 2) + 1);

  protected readonly status = computed(() => {
    const s = this.store;
    const out = s.outcome();
    if (out) {
      const reason = REASON_SHORT[out.reason];
      if (out.winner === null) return { hero: 'Draw.', sub: reason, tone: '' };
      return out.winner === s.playerColor()
        ? { hero: 'You win.', sub: reason, tone: 'good' }
        : { hero: 'Computer wins.', sub: reason, tone: '' };
    }
    if (s.turn() === s.cpuColor()) {
      return { hero: 'Computer’s move.', sub: s.thinking() ? 'Thinking…' : 'Moving…', tone: 'cpu' };
    }
    if (s.midJump()) {
      return {
        hero: 'Keep jumping.',
        sub: s.nextHops().length > 1 ? 'Pick your next jump.' : 'Same piece, next jump.',
        tone: 'jump',
      };
    }
    if (s.drawPending()) return { hero: 'Your move.', sub: 'Offering a draw…', tone: '' };
    if (s.hintPending()) return { hero: 'Your move.', sub: 'Finding a hint…', tone: '' };
    const hint = s.hint();
    if (hint) return { hero: 'Your move.', sub: `Hint: ${notation(hint)}`, tone: 'hint' };
    if (s.selection()) {
      return { hero: 'Your move.', sub: s.mustJump() ? 'Jump a red-ringed piece.' : 'Pick a square.', tone: '' };
    }
    if (s.mustJump()) return { hero: 'Your move.', sub: 'You must jump.', tone: 'jump' };
    return { hero: 'Your move.', sub: 'Pick a piece.', tone: '' };
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
    this.store.toStartScreen(); // the game in progress stays saved for Resume
    this.exit.emit();
  }

  /** Sends each press to whatever is on top: game over › menu › start › board. */
  private route(a: TvAction): void {
    if (this.store.screen() === 'over') {
      this.gameOver()?.handle(a);
      return;
    }
    if (this.store.paused()) {
      this.pauseMenu()?.handle(a);
      return;
    }
    if (this.store.screen() === 'start') {
      this.startOverlay()?.handle(a);
      return;
    }
    this.store.handle(a);
  }
}
