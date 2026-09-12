// chess-view-state.service.ts
//
// Tracks which chess game (if any) is the one actually rendered by
// ChessGameComponent right now - i.e. which board the player is already
// looking at in the watch feed. Exists so app-wide consumers, namely
// ChessTurnNotificationService, can tell "is this notification about the
// board already on screen" without reaching into WatchComponent's
// playlist/routing state (which isn't URL-driven while scrolling the feed
// anyway - see ChessTurnNotificationService for why that matters).
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ChessViewStateService {
  private readonly currentGameId$ = new BehaviorSubject<number | null>(null);

  setCurrentGame(gameId: number | null): void {
    this.currentGameId$.next(gameId);
  }

  isViewing(gameId: number): boolean {
    return this.currentGameId$.value === gameId;
  }
}
