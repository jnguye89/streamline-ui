// backgammon-demo.component.ts
//
// The backgammon tile in the watch feed - same idea as the other game
// previews: a board that plays itself, so the tile looks alive like the
// videos around it, with a "Press to play" call to action on top.
//
// It's the real game: backgammon's own engine in self-play (the computer
// plays both sides, single games, no cube, a new game after each one ends)
// and GameStore in demo mode (two computers, no sound, nothing local so no
// cursor or prompts), drawn by the same board, player cards and move list
// /play/backgammon uses. Left out on purpose: TvInputService (it would grab
// the watch page's keys and controller), the controls legend, the "Back to
// watch" button and the overlays. The 1920×1080 stage is scaled to fit.
//
// Pure decoration: actually playing is delegated back up via `join`, which
// WatchComponent turns into a navigation to /play/backgammon.
import { isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  EventEmitter,
  NgZone,
  OnInit,
  Output,
  PLATFORM_ID,
  ViewChild,
  ViewEncapsulation,
  computed,
  inject,
  signal,
} from '@angular/core';
import { opponent } from '@skriin/backgammon-core';

import { GamepadFocusableDirective } from '../../directives/gamepad-focusable.directive';
import { BoardComponent } from '../../backgammon/board/board.component';
import { BACKGAMMON_ENGINE } from '../../backgammon/engine/engine.tokens';
import { PlaceholderEngine } from '../../backgammon/engine/placeholder-engine';
import { GameStore } from '../../backgammon/game-store.service';
import { MatchInfoComponent } from '../../backgammon/hud/match-info.component';
import { MoveListComponent } from '../../backgammon/hud/move-list.component';
import { PlayerCardComponent } from '../../backgammon/hud/player-card.component';
import { SoundService } from '../../backgammon/sound.service';

const STAGE_W = 1920;
const STAGE_H = 1080;

interface Status {
  readonly hero: string;
  readonly sub: string;
}

@Component({
  selector: 'app-backgammon-demo',
  standalone: true,
  imports: [GamepadFocusableDirective, BoardComponent, MatchInfoComponent, MoveListComponent, PlayerCardComponent],
  providers: [
    PlaceholderEngine,
    { provide: BACKGAMMON_ENGINE, useExisting: PlaceholderEngine },
    GameStore,
    SoundService,
  ],
  // Unencapsulated, like BackgammonComponent: the table layout (.bg-stage,
  // .bg-col, ...) and board themes live in backgammon.component.css, which
  // only ships with /play/backgammon otherwise.
  encapsulation: ViewEncapsulation.None,
  templateUrl: './backgammon-demo.component.html',
  styleUrls: ['../../backgammon/backgammon.component.css', './backgammon-demo.component.scss'],
  host: { class: 'app-backgammon-demo' },
})
export class BackgammonDemoComponent implements OnInit, AfterViewInit {
  @Output() join = new EventEmitter<void>();
  @ViewChild('stageArea', { static: true }) stageArea!: ElementRef<HTMLElement>;

  protected readonly store = inject(GameStore);
  protected readonly scale = signal(0.5);
  protected readonly top = computed(() => opponent(this.store.bottom()));

  // A spectator's version of BackgammonComponent.status: nobody here is
  // "you", so it only ever says whose roll/move it is and how it ended.
  protected readonly status = computed<Status>(() => {
    const v = this.store.view();
    const seats = this.store.seats();
    const seat = seats[v.turn];
    const op = this.store.openingShow();
    if (op?.settled && op.tie) return { hero: 'Tie.', sub: `Both rolled ${op.dice[0]}. Rolling again.` };
    if (op?.settled) {
      const w = seats[op.dice[0] > op.dice[1] ? 0 : 1];
      return { hero: `${w.name} goes first.`, sub: `${op.dice[0]} against ${op.dice[1]}.` };
    }
    switch (v.phase) {
      case 'opening':
        return { hero: 'Opening roll.', sub: 'Higher die goes first.' };
      case 'pre-roll':
        return { hero: `${seat.possessive} roll.`, sub: 'Rolling…' };
      case 'moving':
      case 'turn-done': {
        if (v.noMoves) return { hero: 'No moves.', sub: `${seat.possessive} turn passes.` };
        const d = v.dice;
        return { hero: `${seat.possessive} move.`, sub: v.thinking ? 'Thinking…' : d ? `Rolled ${d[0]} and ${d[1]}.` : '' };
      }
      case 'game-over':
      case 'match-over': {
        const r = v.result;
        if (!r) return { hero: '', sub: '' };
        const kind = r.kind === 'single' ? '' : r.kind === 'gammon' ? ' Gammon!' : ' Backgammon!';
        return { hero: `${seats[r.winner].name} wins.`, sub: `New game in a moment.${kind}` };
      }
      default:
        return { hero: '', sub: '' };
    }
  });

  private readonly engine = inject(PlaceholderEngine);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    // The game runs on timers, which would keep SSR from ever settling.
    if (!this.isBrowser) return;
    this.store.startDemo();
    this.engine.startSelfPlay();
  }

  ngAfterViewInit(): void {
    if (!this.isBrowser || typeof ResizeObserver === 'undefined') return;
    const el = this.stageArea.nativeElement;
    const fit = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width && height) this.zone.run(() => this.scale.set(Math.min(width / STAGE_W, height / STAGE_H)));
    };
    const resize = new ResizeObserver(fit);
    resize.observe(el);
    fit();
    this.destroyRef.onDestroy(() => resize.disconnect());
  }

  onJoinClick(): void {
    this.join.emit();
  }
}
