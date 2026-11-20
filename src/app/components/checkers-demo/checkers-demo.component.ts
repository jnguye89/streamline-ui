// checkers-demo.component.ts
//
// The checkers tile in the watch feed - same idea as ChessDemoComponent: an
// auto-playing, non-interactive board that makes the tile look alive like the
// videos around it, with a "Press to play" call to action on top.
//
// Unlike the chess demo's fixed script, the game here is generated live from
// the real rules engine (checkers/engine/core), so every move is legal and
// every loop plays out differently. Moves are picked with a tiny heuristic
// (take what's free, crown when you can, don't hang a piece, otherwise
// random) - plausible-looking, instant, and no Web Worker needed.
//
// Pure decoration: actually playing is delegated back up via `join`, which
// WatchComponent turns into a navigation to /play/checkers.
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, EventEmitter, OnDestroy, OnInit, Output, PLATFORM_ID, inject } from '@angular/core';

import { GamepadFocusableDirective } from '../../directives/gamepad-focusable.directive';
import { toRC } from '../../checkers/board-geometry';
import { PieceColor } from '../../checkers/checkers.types';
import { Board, DARK, Side, initialBoard } from '../../checkers/engine/core/board';
import { CMove, generateMoves, hasJump, makeMove } from '../../checkers/engine/core/movegen';
import { PieceComponent } from '../../checkers/piece/piece.component';

interface DemoPiece {
  id: number;
  color: PieceColor;
  king: boolean;
  sq: number;
  gone: boolean;
}

// Time between moves - slow enough to follow, quick enough to feel alive.
const MOVE_GAP_MS = 1400;
// Each hop of a (multi-)jump, so a double jump visibly lands twice.
const HOP_MS = 340;
// Captured pieces fade for this long before they're dropped from the list.
const FADE_MS = 260;
// Dwell on the opening position and on the final one before starting over.
const LOOP_PAUSE_MS = 2600;
// Cap a game's length: two kings chasing each other around would otherwise
// loop for ages. The board just resets, same as a finished game.
const MAX_PLIES = 80;

@Component({
  selector: 'app-checkers-demo',
  standalone: true,
  imports: [CommonModule, PieceComponent, GamepadFocusableDirective],
  templateUrl: './checkers-demo.component.html',
  styleUrl: './checkers-demo.component.scss',
})
export class CheckersDemoComponent implements OnInit, OnDestroy {
  @Output() join = new EventEmitter<void>();

  // 64 cells in screen order; -1 for light (unplayable) squares.
  readonly cells: number[] = Array.from({ length: 64 }, (_, i) => {
    const r = i >> 3;
    const c = i & 7;
    return (r + c) % 2 === 1 ? r * 4 + (c >> 1) : -1;
  });

  pieces: DemoPiece[] = [];
  lastSquares = new Set<number>();

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private board: Board = initialBoard();
  private side: Side = DARK;
  private plies = 0;
  private nextId = 1;
  private timers = new Set<ReturnType<typeof setTimeout>>();

  ngOnInit(): void {
    this.reset();
    // Server render just shows the opening position; no timers there, or
    // they'd keep SSR from ever settling.
    if (this.isBrowser) this.later(LOOP_PAUSE_MS, () => this.playNext());
  }

  ngOnDestroy(): void {
    this.timers.forEach(t => clearTimeout(t));
    this.timers.clear();
  }

  onJoinClick(): void {
    this.join.emit();
  }

  // translate % is relative to the piece's own box (1/8 of the board), so
  // column/row * 100% lands it exactly on its square.
  pieceTransform(sq: number): string {
    const { r, c } = toRC(sq);
    return `translate(${c * 100}%, ${r * 100}%)`;
  }

  trackPiece(_: number, p: DemoPiece): number {
    return p.id;
  }

  private reset(): void {
    this.board = initialBoard();
    this.side = DARK;
    this.plies = 0;
    this.lastSquares = new Set();
    this.pieces = [];
    this.board.forEach((v, sq) => {
      if (v !== 0) this.pieces.push({ id: this.nextId++, color: v > 0 ? 'dark' : 'light', king: Math.abs(v) === 2, sq, gone: false });
    });
  }

  private playNext(): void {
    const moves = generateMoves(this.board, this.side);
    if (moves.length === 0 || this.plies >= MAX_PLIES) {
      this.later(LOOP_PAUSE_MS, () => {
        this.reset();
        this.later(LOOP_PAUSE_MS, () => this.playNext());
      });
      return;
    }

    const move = this.pick(moves);
    makeMove(this.board, move);
    this.side = -this.side as Side;
    this.plies++;
    this.animate(move);
  }

  private pick(moves: CMove[]): CMove {
    let best = moves[0];
    let bestScore = -Infinity;
    for (const m of moves) {
      const b = this.board.slice();
      makeMove(b, m);
      const score =
        m.caps.length * 10 +
        (m.promote ? 6 : 0) -
        (hasJump(b, -this.side as Side) ? 7 : 0) +
        Math.random() * 4;
      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
    }
    return best;
  }

  // Walks the moving piece hop by hop, fading each jumped piece as it's
  // passed, then crowns it (if it got there) and schedules the next move.
  private animate(move: CMove): void {
    const mover = this.pieces.find(p => p.sq === move.from && !p.gone);
    this.lastSquares = new Set([move.from, ...move.path]);

    move.path.forEach((to, i) => {
      this.later(i * HOP_MS, () => {
        if (mover) mover.sq = to;
        const cap = move.caps[i];
        if (cap !== undefined) {
          const victim = this.pieces.find(p => p.sq === cap && !p.gone && p !== mover);
          if (victim) victim.gone = true;
        }
      });
    });

    const landed = move.path.length * HOP_MS;
    this.later(landed, () => {
      if (mover && move.promote) mover.king = true;
    });
    this.later(landed + FADE_MS, () => {
      this.pieces = this.pieces.filter(p => !p.gone);
    });
    this.later(landed + MOVE_GAP_MS, () => this.playNext());
  }

  private later(ms: number, fn: () => void): void {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }
}
