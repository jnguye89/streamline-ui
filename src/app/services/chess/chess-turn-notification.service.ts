// chess-turn-notification.service.ts
//
// App-wide "it's your turn" popup for chess. Deliberately NOT owned by
// ChessGameComponent or WatchComponent - those only exist while the watch
// page happens to have this exact game as the current playlist item, so a
// listener scoped to either one would miss every turn notification for any
// screen other than "already staring at this exact board." This service is
// instantiated once from AppComponent (see the constructor injection there)
// so its subscription to RecordingSocketService.chessYourTurn$ is live for
// the whole session, on every route.
import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';

import { RecordingSocketService } from '../socket/recording.service';
import { ChessViewStateService } from './chess-view-state.service';

@Injectable({ providedIn: 'root' })
export class ChessTurnNotificationService {
  constructor(
    private socket: RecordingSocketService,
    private snackBar: MatSnackBar,
    private router: Router,
    private chessViewState: ChessViewStateService,
  ) {
    this.socket.chessYourTurn$.subscribe((payload) => {
      const message = payload.opponentUsername
        ? `${payload.opponentUsername} moved — your turn!`
        : "It's your turn!";

      // No point offering to jump to a board the player is already looking
      // at - ChessViewStateService reflects whatever game ChessGameComponent
      // currently has mounted, updated on every switchToGame()/ngOnDestroy().
      const alreadyOnBoard = this.chessViewState.isViewing(payload.gameId);

      const ref = this.snackBar.open(message, alreadyOnBoard ? '' : 'View board', {
        duration: 8000,
        panelClass: 'chess-turn-snackbar',
        horizontalPosition: 'end',
        verticalPosition: 'top',
      });

      if (!alreadyOnBoard) {
        ref.onAction().subscribe(() => {
          // Deep-links into the watch feed at this specific game, same as
          // ChessGameComponent's own join/select flow - WatchComponent's
          // playlist subscription picks the id up from the route and selects
          // the matching chess item regardless of what was on screen before.
          void this.router.navigate(['/watch', payload.gameId]);
        });
      }
    });
  }
}
