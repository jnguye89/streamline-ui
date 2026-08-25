// chess-piece-icon.component.ts
//
// The hand-authored piece SVGs used to live inline in chess-board.component's
// per-square template (one <svg> per occupied square). Pulled out into its
// own component so the exact same artwork can also be used at a small size
// in ChessGameComponent's "captured pieces" tray, without either duplicating
// ~90 lines of SVG path data or having the tray render squares it doesn't
// have.
//
// Relies on the shared `whitePieceGradient`/`blackPieceGradient` <linearGradient>
// defs still declared once in chess-board.component.html - SVG `url(#id)`
// references resolve document-wide regardless of which component's template
// they came from, so this only ever renders correctly while an
// <app-chess-board> is also present on the page. In practice that's always
// true: every place this is used (the board itself, and ChessGameComponent's
// captured-pieces tray) has one mounted alongside it.
import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

export type ChessPieceType = 'p' | 'r' | 'b' | 'n' | 'q' | 'k';
export type ChessPieceColor = 'w' | 'b';

@Component({
  selector: 'app-chess-piece-icon',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './chess-piece-icon.component.html',
  styleUrl: './chess-piece-icon.component.scss',
})
export class ChessPieceIconComponent {
  @Input({ required: true }) type!: ChessPieceType;
  @Input({ required: true }) color!: ChessPieceColor;
  // 'board': sized to fill a chess-board square (78% of it), the original
  // behavior. 'tray': small fixed size for the captured-pieces list.
  @Input() size: 'board' | 'tray' = 'board';
}
