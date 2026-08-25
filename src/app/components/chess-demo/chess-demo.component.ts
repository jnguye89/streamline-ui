// chess-demo.component.ts
//
// Stand-in for the chess feed slot when ChessService.listGames() comes back
// empty - i.e. nobody is actually playing right now. Rather than the feed
// simply having no chess item at all (which means most viewers never even
// discover the feature), WatchComponent swaps in a single synthetic
// { type: 'chess-demo' } playlist entry, rendered by this component: an
// auto-playing, non-interactive board looping through a short scripted
// opening (so the tile *looks* alive, like the video tiles around it)
// with a large "start a game" call to action layered on top.
//
// This never touches the real ChessService/socket - it's pure decoration.
// Actually starting a game is delegated back up to WatchComponent via the
// `join` output, which already owns startChessGame() (used by the
// always-present bottom-bar "Play Chess" button too).
import { CommonModule } from '@angular/common';
import { Component, EventEmitter, OnDestroy, OnInit, Output } from '@angular/core';
import { Subject, takeUntil, timer } from 'rxjs';

import { GamepadFocusableDirective } from '../../directives/gamepad-focusable.directive';
import { ChessBoardComponent } from '../chess-board/chess-board.component';

// A short, plausible-looking opening (Ruy Lopez-ish - no castling, so the
// board tracker generating these stayed simple) captured as a sequence of
// FEN snapshots, one per half-move. Purely cosmetic: this board is always
// `interactive="false"`, so chess.js on the ChessBoardComponent side never
// needs to derive legal moves from these positions, just render them.
const DEMO_FENS: string[] = [
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1',
  'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b - - 0 1',
  'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w - - 0 2',
  'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b - - 0 2',
  'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w - - 0 3',
  'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b - - 0 3',
  'r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w - - 0 4',
  'r1bqkbnr/1ppp1ppp/p1n5/4p3/B3P3/5N2/PPPP1PPP/RNBQK2R b - - 0 4',
  'r1bqkb1r/1ppp1ppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQK2R w - - 0 5',
  'r1bqkb1r/1ppp1ppp/p1n2n2/4p3/B3P3/3P1N2/PPP2PPP/RNBQK2R b - - 0 5',
  'r1bqk2r/1ppp1ppp/p1n2n2/2b1p3/B3P3/3P1N2/PPP2PPP/RNBQK2R w - - 0 6',
  'r1bqk2r/1ppp1ppp/p1n2n2/2b1p3/B3P3/2PP1N2/PP3PPP/RNBQK2R b - - 0 6',
  'r1bqk2r/1pp2ppp/p1np1n2/2b1p3/B3P3/2PP1N2/PP3PPP/RNBQK2R w - - 0 7',
  'r1bqk2r/1pp2ppp/p1np1n2/2b1p3/B3P3/2PP1N2/PP1N1PPP/R1BQK2R b - - 0 7',
  'r2qk2r/1ppb1ppp/p1np1n2/2b1p3/B3P3/2PP1N2/PP1N1PPP/R1BQK2R w - - 0 8',
  'r2qk2r/1ppb1ppp/p1np1n2/2b1p3/B3P3/2PP1N2/PP1NKPPP/R1BQ3R b - - 0 8',
  'r3k2r/1ppbqppp/p1np1n2/2b1p3/B3P3/2PP1N2/PP1NKPPP/R1BQ3R w - - 0 9',
  'r3k2r/1ppbqppp/p1np1n2/2b1p3/B3P3/2PP1N2/PP2KPPP/R1BQ1N1R b - - 0 9',
  '1r2k2r/1ppbqppp/p1np1n2/2b1p3/B3P3/2PP1N2/PP2KPPP/R1BQ1N1R w - - 0 10',
  '1r2k2r/1ppbqppp/p1np1n2/2b1p3/B3P3/2PP1NN1/PP2KPPP/R1BQ3R b - - 0 10',
  '2r1k2r/1ppbqppp/p1np1n2/2b1p3/B3P3/2PP1NN1/PP2KPPP/R1BQ3R w - - 0 11',
];

// How long each position stays on screen before advancing to the next -
// slow enough to read as deliberate moves, not a flicker.
const STEP_MS = 2200;
// Extra dwell time on the final position and on the reset starting
// position, so the loop point doesn't feel like a jump-cut.
const LOOP_PAUSE_MS = 3200;

@Component({
  selector: 'app-chess-demo',
  standalone: true,
  imports: [CommonModule, ChessBoardComponent, GamepadFocusableDirective],
  templateUrl: './chess-demo.component.html',
  styleUrl: './chess-demo.component.scss',
})
export class ChessDemoComponent implements OnInit, OnDestroy {
  @Output() join = new EventEmitter<void>();

  demoFen = DEMO_FENS[0];

  private destroy$ = new Subject<void>();
  private step = 0;

  ngOnInit(): void {
    this.scheduleNext();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onJoinClick(): void {
    this.join.emit();
  }

  private scheduleNext(): void {
    const atEnd = this.step === DEMO_FENS.length - 1;
    const atStart = this.step === 0;
    const delay = atEnd || atStart ? LOOP_PAUSE_MS : STEP_MS;

    timer(delay)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.step = atEnd ? 0 : this.step + 1;
        this.demoFen = DEMO_FENS[this.step];
        this.scheduleNext();
      });
  }
}
