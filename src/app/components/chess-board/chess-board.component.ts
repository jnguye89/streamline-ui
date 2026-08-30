// chess-board.component.ts
//
// Pure orientation-flipped 2D board: the viewer's own pieces always render
// at the bottom of their screen (white orientation shows rank 1 at the
// bottom; black orientation flips it), which is the "POV" the watch-page
// chess feature was scoped to - not a camera/AR overlay.
//
// chess.js runs client-side purely for FEN parsing and legal-move
// highlighting (instant feedback, no round trip needed to see where a piece
// can go). It is never the authority on whether a move is actually legal -
// ChessGameComponent submits the move over the socket and the API's own
// chess.js instance, loaded from the game's server-side `fen`, is what
// actually decides.
import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { Chess, Square } from 'chess.js';
import { GamepadFocusableDirective } from '../../directives/gamepad-focusable.directive';
import { ChessPieceIconComponent, ChessPieceType } from '../chess-piece-icon/chess-piece-icon.component';

interface BoardPiece {
  // Narrowed to ChessPieceType (not a bare string) so this binds straight
  // into <app-chess-piece-icon>'s [type] input without a cast - chess.js's
  // own PieceSymbol type is this same 'p'|'n'|'b'|'r'|'q'|'k' set.
  type: ChessPieceType;
  color: 'w' | 'b';
}

interface BoardSquare {
  square: Square;
  isLight: boolean;
  piece: BoardPiece | null;
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

@Component({
  selector: 'app-chess-board',
  standalone: true,
  imports: [CommonModule, GamepadFocusableDirective, ChessPieceIconComponent],
  templateUrl: './chess-board.component.html',
  styleUrl: './chess-board.component.scss',
})
export class ChessBoardComponent implements OnChanges {
  @Input() fen = '';
  @Input() orientation: 'white' | 'black' = 'white';
  // Gate on whether it's this viewer's turn to move at all - spectators and
  // an out-of-turn seated player both render read-only.
  @Input() interactive = false;

  @Output() move = new EventEmitter<{ from: string; to: string; promotion?: string }>();

  // Always built in white-orientation order (a8..h8 ... a1..h1); the
  // template reverses it for a black-seated viewer via `orderedSquares`.
  squares: BoardSquare[] = [];
  selected: Square | null = null;
  legalTargets = new Set<string>();
  // Square of whichever king is currently in check, or null - set from the
  // same chess.js load already done for `squares` below, so this always
  // matches the position actually on screen instead of needing its own
  // separate re-derivation.
  checkedKingSquare: Square | null = null;

  private chess = new Chess();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['fen']) {
      this.loadFen();
    }
    // Clear any selection whenever the position changes (an opponent's move,
    // or the board simply loading in) - and also when `interactive` flips to
    // false, which happens the instant *our own* move goes through and the
    // turn passes to the other side. onSquareClick already clears selection
    // immediately when a move is made locally, but that update and the
    // fen/interactive inputs coming back down from ChessGameComponent (via
    // the socket round-trip) land as separate change-detection cycles - this
    // is the belt-and-suspenders backstop so a selection can't survive
    // whichever of those actually lands last.
    if (changes['fen'] || (changes['interactive'] && !this.interactive)) {
      this.selected = null;
      this.legalTargets.clear();
    }
  }

  get orderedSquares(): BoardSquare[] {
    return this.orientation === 'black' ? [...this.squares].reverse() : this.squares;
  }

  trackSquare(_: number, sq: BoardSquare): string {
    return sq.square;
  }

  onSquareClick(sq: BoardSquare): void {
    if (!this.interactive) return;

    if (this.selected && this.legalTargets.has(sq.square)) {
      const promotion = this.needsPromotion(this.selected, sq.square) ? 'q' : undefined;
      this.move.emit({ from: this.selected, to: sq.square, promotion });
      this.selected = null;
      this.legalTargets.clear();
      return;
    }

    const myColor = this.orientation === 'white' ? 'w' : 'b';
    if (sq.piece && sq.piece.color === myColor) {
      this.selected = sq.square;
      this.legalTargets = new Set(
        this.chess.moves({ square: sq.square, verbose: true }).map((m) => m.to),
      );
      return;
    }

    this.selected = null;
    this.legalTargets.clear();
  }

  private loadFen(): void {
    try {
      this.chess.load(this.fen);
    } catch {
      this.chess.reset();
    }

    // Whichever side is to move is the only side that can currently BE in
    // check (moving out of check is mandatory), so a checked king is always
    // this color's king - no need to test both.
    const inCheck = this.chess.isCheck();
    const sideToMove = this.chess.turn();
    let checkedKingSquare: Square | null = null;

    const board = this.chess.board(); // board[0] = rank 8 ... board[7] = rank 1
    const built: BoardSquare[] = [];
    for (let r = 0; r < 8; r++) {
      const rank = 8 - r;
      for (let f = 0; f < 8; f++) {
        const cell = board[r][f];
        const square = `${FILES[f]}${rank}` as Square;
        if (inCheck && cell?.type === 'k' && cell.color === sideToMove) {
          checkedKingSquare = square;
        }
        built.push({
          square,
          // Real chess: a1 is dark, h1 is light ("light on right"), and the
          // white king's start square (e1) is dark - the opposite of its
          // own color, per the "queen on her own color" convention (the
          // white queen's d1 is light). `(f + rank) % 2 === 1` had this
          // inverted (a1/e1 rendering light, h1 dark) - flipped to `=== 0`
          // so square colors match a real board.
          isLight: (f + rank) % 2 === 0,
          piece: cell ? { type: cell.type, color: cell.color } : null,
        });
      }
    }
    this.squares = built;
    this.checkedKingSquare = checkedKingSquare;
  }

  // v1 always auto-promotes to queen - no promotion-choice UI yet.
  private needsPromotion(from: Square, to: Square): boolean {
    const piece = this.chess.get(from);
    if (!piece || piece.type !== 'p') return false;
    return to[1] === '1' || to[1] === '8';
  }
}
