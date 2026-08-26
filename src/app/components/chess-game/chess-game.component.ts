// chess-game.component.ts
//
// Owns everything about *playing/watching one specific game*: joining its
// socket room, syncing full state on load (so a spectator scrolling in
// mid-game, or a reconnecting player, isn't waiting on the next move to see
// the board), submitting moves, and the join/resign/login-prompt actions.
//
// Mounted by WatchComponent via `*ngIf="currentItem?.type === 'chess'"`
// with `[game]="currentItem"` - see ngOnChanges below for why switching
// between two different chess games (not just entering/leaving chess
// entirely) still has to be handled explicitly rather than relying on
// Angular destroying/recreating the component.
import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';

import { GamepadFocusableDirective } from '../../directives/gamepad-focusable.directive';
import {
  ChessColor,
  ChessDrawDeclinedPayload,
  ChessDrawOfferedPayload,
  ChessEndedPayload,
  ChessGame,
  ChessGameItem,
  ChessJoinedPayload,
  ChessMovePayload,
} from '../../models/chess/chess-game.model';
import { DeviceAuthService } from '../../services/device-auth.service';
import { ChessService } from '../../services/chess/chess.service';
import { RecordingSocketService } from '../../services/socket/recording.service';
import { ChessBoardComponent } from '../chess-board/chess-board.component';
import { ChessPieceIconComponent, ChessPieceType } from '../chess-piece-icon/chess-piece-icon.component';

const roomFor = (id: number) => `chess:${id}`;

// A standard army's non-king piece counts - what each side starts with, so
// "how many are missing right now" (see missingPieces()) is just this minus
// what's still on the board. The king is never captured, so it's excluded
// here entirely rather than needing to be filtered out downstream.
const STARTING_COUNTS: Record<Exclude<ChessPieceType, 'k'>, number> = {
  p: 8, n: 2, b: 2, r: 2, q: 1,
};
// Standard relative piece values, for the material-advantage badge.
const PIECE_VALUE: Record<Exclude<ChessPieceType, 'k'>, number> = {
  p: 1, n: 3, b: 3, r: 5, q: 9,
};
// Captured-pieces trays conventionally read highest-value first.
const DISPLAY_ORDER: Exclude<ChessPieceType, 'k'>[] = ['q', 'r', 'b', 'n', 'p'];

@Component({
  selector: 'app-chess-game',
  standalone: true,
  imports: [CommonModule, ChessBoardComponent, ChessPieceIconComponent, GamepadFocusableDirective],
  templateUrl: './chess-game.component.html',
  styleUrl: './chess-game.component.scss',
})
export class ChessGameComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) game!: ChessGameItem;
  // Lets WatchComponent refresh its own polled feed item in place if it ever
  // wants to (not required for v1 - the socket keeps this component's own
  // `state` current regardless).
  @Output() stateChanged = new EventEmitter<ChessGame>();

  state: ChessGame | null = null;
  loading = false;
  errorMessage: string | null = null;

  private destroy$ = new Subject<void>();
  private joinedRoomId: string | null = null;
  private errorTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private chessService: ChessService,
    private socket: RecordingSocketService,
    private deviceAuth: DeviceAuthService,
    private router: Router,
  ) {
    this.socket.chessMove$.pipe(takeUntil(this.destroy$)).subscribe((p) => this.onMove(p));
    this.socket.chessEnded$.pipe(takeUntil(this.destroy$)).subscribe((p) => this.onEnded(p));
    // Notifies the creator (sitting on a 'waiting' game) the moment someone
    // else joins, rather than waiting on the next state fetch.
    this.socket.chessJoined$.pipe(takeUntil(this.destroy$)).subscribe((p) => this.onJoined(p));
    // Draw offer/decline both need to reach the *other* player in realtime
    // (that's the whole point - a banner with accept/decline shows up
    // without them refreshing). Acceptance doesn't need its own listener:
    // it ends the game, which is already the chess:ended broadcast onEnded
    // below already handles.
    this.socket.chessDrawOffered$.pipe(takeUntil(this.destroy$)).subscribe((p) => this.onDrawOffered(p));
    this.socket.chessDrawDeclined$.pipe(takeUntil(this.destroy$)).subscribe((p) => this.onDrawDeclined(p));
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['game']) return;
    const prevId = (changes['game'].previousValue as ChessGameItem | undefined)?.id;
    if (prevId === this.game?.id) return; // same game, e.g. a feed poll refreshed the reference only
    this.switchToGame(this.game.id);
  }

  ngOnDestroy(): void {
    this.leaveCurrentRoom();
    if (this.errorTimer) clearTimeout(this.errorTimer);
    this.destroy$.next();
    this.destroy$.complete();
  }

  get isLoggedIn(): boolean {
    return !!this.deviceAuth.getAccessToken();
  }

  get mySeat(): ChessColor | null {
    const uid = this.deviceAuth.getCurrentUserId();
    if (!uid || !this.state) return null;
    if (this.state.whiteUser?.auth0UserId === uid) return 'white';
    if (this.state.blackUser?.auth0UserId === uid) return 'black';
    return null;
  }

  get isSpectator(): boolean {
    return this.mySeat === null;
  }

  get orientation(): 'white' | 'black' {
    return this.mySeat === 'black' ? 'black' : 'white';
  }

  get isMyTurn(): boolean {
    return !!this.mySeat && this.state?.status === 'active' && this.state?.turn === this.mySeat;
  }

  get canJoin(): boolean {
    return !!this.state && this.state.status === 'waiting' && this.mySeat === null;
  }

  // True only for the seat that does NOT already have an offer standing -
  // covers both "no offer yet" and "opponent offered, it's your call now"
  // via the incomingDrawOffer check below taking over the UI in that case.
  get canOfferDraw(): boolean {
    return !!this.mySeat && this.state?.status === 'active' && !this.state?.drawOfferedBy;
  }

  get myDrawOfferPending(): boolean {
    return !!this.mySeat && this.state?.drawOfferedBy === this.mySeat;
  }

  get incomingDrawOffer(): boolean {
    return !!this.mySeat && !!this.state?.drawOfferedBy && this.state.drawOfferedBy !== this.mySeat;
  }

  // Pieces WHITE has taken off the board - i.e. missing BLACK pieces -
  // shown near white's name, same convention chess.com/lichess use (your
  // trophies sit by your own name, in your opponent's color).
  get capturedByWhite(): ChessPieceType[] {
    return this.missingPieces('b');
  }

  get capturedByBlack(): ChessPieceType[] {
    return this.missingPieces('w');
  }

  // Positive = white is up material, negative = black is. Purely derived
  // from the two captured lists above, not tracked separately.
  get materialDiff(): number {
    const value = (types: ChessPieceType[]) =>
      types.reduce((sum, t) => sum + (t === 'k' ? 0 : PIECE_VALUE[t]), 0);
    return value(this.capturedByWhite) - value(this.capturedByBlack);
  }

  // Every piece type still missing an instance from `color`'s starting army,
  // compared against what's actually left on the board right now (parsed
  // straight from the FEN's piece-placement field - no need for a chess.js
  // instance just to count letters).
  private missingPieces(color: 'w' | 'b'): ChessPieceType[] {
    if (!this.state?.fen) return [];
    const onBoard = this.pieceCountsOnBoard(color);
    const missing: ChessPieceType[] = [];
    for (const type of DISPLAY_ORDER) {
      const removed = STARTING_COUNTS[type] - (onBoard[type] ?? 0);
      for (let i = 0; i < removed; i++) missing.push(type);
    }
    return missing;
  }

  private pieceCountsOnBoard(color: 'w' | 'b'): Partial<Record<ChessPieceType, number>> {
    const placement = this.state?.fen.split(' ')[0] ?? '';
    const counts: Partial<Record<ChessPieceType, number>> = {};
    for (const ch of placement) {
      if (ch === '/' || /\d/.test(ch)) continue;
      const pieceColor: 'w' | 'b' = ch === ch.toUpperCase() ? 'w' : 'b';
      if (pieceColor !== color) continue;
      const type = ch.toLowerCase() as ChessPieceType;
      if (type === 'k') continue;
      counts[type] = (counts[type] ?? 0) + 1;
    }
    return counts;
  }

  get statusMessage(): string | null {
    if (!this.state) return this.loading ? 'Loading game…' : null;
    switch (this.state.status) {
      case 'waiting':
        return 'Waiting for an opponent to join…';
      case 'active':
        if (this.isSpectator) {
          const name = this.state.turn === 'white' ? this.state.whiteUser?.username : this.state.blackUser?.username;
          return `${name ?? 'White'} to move`;
        }
        return this.isMyTurn ? 'Your move' : "Opponent's move";
      case 'checkmate':
        return `Checkmate — ${this.capitalize(this.state.winner)} wins`;
      case 'stalemate':
        return 'Draw by stalemate';
      case 'draw':
        return 'Draw';
      case 'resigned':
        return `${this.capitalize(this.state.winner)} wins by resignation`;
      case 'timeout':
        return `${this.capitalize(this.state.winner)} wins by timeout`;
      case 'abandoned':
        return 'Game was cancelled';
      default:
        return null;
    }
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }

  join(): void {
    if (!this.isLoggedIn) {
      this.goToLogin();
      return;
    }
    if (!this.state) return;

    this.chessService
      .joinGame(this.state.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (state) => this.applyState(state),
        error: (err) => this.showError(err?.error?.message ?? 'Could not join this game.'),
      });
  }

  resign(): void {
    if (!this.state || !this.mySeat) return;

    this.chessService
      .resign(this.state.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (state) => this.applyState(state),
        error: () => this.showError('Could not resign.'),
      });
  }

  offerDraw(): void {
    if (!this.state || !this.canOfferDraw) return;

    this.chessService
      .offerDraw(this.state.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (state) => this.applyState(state),
        error: () => this.showError('Could not offer a draw.'),
      });
  }

  acceptDraw(): void {
    if (!this.state || !this.incomingDrawOffer) return;

    this.chessService
      .acceptDraw(this.state.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (state) => this.applyState(state),
        error: () => this.showError('Could not accept the draw.'),
      });
  }

  declineDraw(): void {
    if (!this.state || !this.incomingDrawOffer) return;

    this.chessService
      .declineDraw(this.state.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (state) => this.applyState(state),
        error: () => this.showError('Could not decline the draw.'),
      });
  }

  async onMoveAttempt(move: { from: string; to: string; promotion?: string }): Promise<void> {
    if (!this.state || !this.isMyTurn) return;
    const ack = await this.socket.sendChessMove(this.state.id, move.from, move.to, move.promotion);
    if (!ack.ok) {
      this.showError(ack.error ?? 'Illegal move');
    }
  }

  private switchToGame(id: number): void {
    this.leaveCurrentRoom();
    this.errorMessage = null;
    this.state = null;
    this.loading = true;

    // Join the room before the REST fetch resolves, so a move that lands in
    // the gap isn't missed.
    const roomId = roomFor(id);
    this.socket.joinRoom(roomId);
    this.joinedRoomId = roomId;

    this.chessService
      .getGame(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (state) => {
          this.loading = false;
          this.applyState(state);
        },
        error: () => {
          this.loading = false;
          this.showError('Could not load this game.');
        },
      });
  }

  private leaveCurrentRoom(): void {
    if (this.joinedRoomId) {
      this.socket.leaveRoom(this.joinedRoomId);
      this.joinedRoomId = null;
    }
  }

  private onMove(payload: ChessMovePayload): void {
    if (!this.state || payload.gameId !== this.state.id) return;
    this.applyState({
      ...this.state,
      fen: payload.fen,
      turn: payload.turn,
      status: payload.status,
      winner: payload.winner,
      drawOfferedBy: payload.drawOfferedBy,
    });
  }

  private onEnded(payload: ChessEndedPayload): void {
    if (!this.state || payload.gameId !== this.state.id) return;
    this.applyState({ ...this.state, status: payload.status, winner: payload.winner, drawOfferedBy: null });
  }

  private onDrawOffered(payload: ChessDrawOfferedPayload): void {
    if (!this.state || payload.gameId !== this.state.id) return;
    this.applyState({ ...this.state, drawOfferedBy: payload.offeredBy });
  }

  private onDrawDeclined(payload: ChessDrawDeclinedPayload): void {
    if (!this.state || payload.gameId !== this.state.id) return;
    // Capture before clearing - only meaningful for whoever made the offer,
    // so this has to be checked against the *old* drawOfferedBy value, not
    // the null applyState is about to set it to.
    const wasMyOffer = this.mySeat && this.state.drawOfferedBy === this.mySeat;
    this.applyState({ ...this.state, drawOfferedBy: null });
    // Tell the offering player plainly rather than leaving their "Draw
    // offer sent..." pill to just silently vanish.
    if (wasMyOffer) {
      this.showError('Draw declined.');
    }
  }

  private onJoined(payload: ChessJoinedPayload): void {
    if (!this.state || payload.gameId !== this.state.id) return;
    this.applyState({
      ...this.state,
      blackUser: payload.blackUser,
      status: payload.status,
      turn: payload.turn,
    });
  }

  private applyState(state: ChessGame): void {
    this.state = state;
    this.stateChanged.emit(state);
  }

  private showError(message: string): void {
    this.errorMessage = message;
    if (this.errorTimer) clearTimeout(this.errorTimer);
    this.errorTimer = setTimeout(() => {
      this.errorMessage = null;
      this.errorTimer = null;
    }, 3000);
  }

  private capitalize(value: string | null): string {
    if (!value) return '';
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
}
