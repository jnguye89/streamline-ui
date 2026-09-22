import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';

import { WatchComponent } from './watch.component';
import { TEST_PROVIDERS } from '../../../testing/test-providers';
import { ChessGameItem } from '../../models/chess/chess-game.model';
import { DeviceAuthService } from '../../services/device-auth.service';

const HUMAN = 'auth0|human';

function chessItem(overrides: Partial<ChessGameItem> = {}): ChessGameItem {
  return {
    id: 1,
    type: 'chess',
    status: 'active',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    pgn: '',
    turn: 'white',
    winner: null,
    drawOfferedBy: null,
    createdAt: new Date().toISOString(),
    whiteUser: { auth0UserId: HUMAN, username: 'human' } as never,
    blackUser: { auth0UserId: 'auth0|other', username: 'other' } as never,
    ...overrides,
  } as ChessGameItem;
}

describe('WatchComponent', () => {
  let component: WatchComponent;
  let fixture: ComponentFixture<WatchComponent>;
  let deviceAuthSpy: jasmine.SpyObj<Pick<DeviceAuthService, 'getCurrentUserId' | 'getAccessToken'>>;
  let snackBarSpy: jasmine.SpyObj<Pick<MatSnackBar, 'open'>>;

  beforeEach(async () => {
    deviceAuthSpy = jasmine.createSpyObj('DeviceAuthService', ['getCurrentUserId', 'getAccessToken']);
    snackBarSpy = jasmine.createSpyObj('MatSnackBar', ['open']);

    await TestBed.configureTestingModule({
      imports: [WatchComponent],
      providers: [
        ...TEST_PROVIDERS,
        { provide: DeviceAuthService, useValue: deviceAuthSpy },
        { provide: MatSnackBar, useValue: snackBarSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WatchComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // The bottom-bar nav buttons, the D-pad, and the keyboard's ArrowLeft/
  // ArrowRight all ultimately call next()/previous() (see
  // syncDpadActionsForCurrentItem and the window:keydown handler's own
  // comment) - guarding those two methods directly is what covers all
  // three input paths in one place.
  describe('navigation lock during a seated chess game', () => {
    it('blocks next() for a seated player mid-game and shows an error', () => {
      const item = chessItem();
      component.currentItem = item;
      component.playlist = [item];
      component.currentIndex = 0;
      deviceAuthSpy.getCurrentUserId.and.returnValue(HUMAN);
      const stopProgressPingSpy = spyOn<any>(component, 'stopProgressPing');

      component.next();

      expect(snackBarSpy.open).toHaveBeenCalledTimes(1);
      expect(stopProgressPingSpy).not.toHaveBeenCalled(); // bailed before any real navigation work
      expect(component.currentItem).toBe(item); // unchanged
    });

    it('blocks previous() the same way, for a creator still waiting on an opponent', () => {
      // "Joined but not actively playing" - a 'waiting' game the viewer
      // created is still a seat, not just spectating.
      component.currentItem = chessItem({ status: 'waiting', blackUser: null });
      component.playlist = [component.currentItem];
      component.currentIndex = 0;
      deviceAuthSpy.getCurrentUserId.and.returnValue(HUMAN);

      component.previous();

      expect(snackBarSpy.open).toHaveBeenCalledTimes(1);
    });

    it('does not block a spectator who is not seated in the game', () => {
      component.currentItem = chessItem();
      component.playlist = [component.currentItem, chessItem({ id: 2 })];
      component.currentIndex = 0;
      deviceAuthSpy.getCurrentUserId.and.returnValue('auth0|someone-else-entirely');

      component.next();

      expect(snackBarSpy.open).not.toHaveBeenCalled();
    });

    it('does not block once the game has ended (e.g. after resigning)', () => {
      component.currentItem = chessItem({ status: 'resigned', winner: 'black' });
      component.playlist = [component.currentItem];
      component.currentIndex = 0;
      deviceAuthSpy.getCurrentUserId.and.returnValue(HUMAN);

      component.next();

      expect(snackBarSpy.open).not.toHaveBeenCalled();
    });

    it('does not block navigation away from a non-chess item', () => {
      component.currentItem = { id: 5, type: 'vod' } as never;
      component.playlist = [component.currentItem];
      component.currentIndex = 0;
      deviceAuthSpy.getCurrentUserId.and.returnValue(HUMAN);

      component.next();

      expect(snackBarSpy.open).not.toHaveBeenCalled();
    });
  });

  describe('onChessStateChanged', () => {
    it('updates currentItem and the matching playlist entry in place, unlocking navigation immediately', () => {
      const original = chessItem();
      component.currentItem = original;
      component.playlist = [original];
      component.currentIndex = 0;
      deviceAuthSpy.getCurrentUserId.and.returnValue(HUMAN);

      // Resigning: reaches WatchComponent via ChessGameComponent's own
      // (stateChanged) output, independent of the next 15s chess$ poll.
      const resigned: ChessGameItem = { ...original, status: 'resigned', winner: 'black' };
      component.onChessStateChanged(resigned);

      expect((component.currentItem as ChessGameItem).status).toBe('resigned');
      expect((component.playlist[0] as ChessGameItem).status).toBe('resigned');

      component.next();
      expect(snackBarSpy.open).not.toHaveBeenCalled(); // no longer blocked
    });

    it('ignores a state update for a different game than the one on screen', () => {
      const original = chessItem({ id: 1 });
      component.currentItem = original;
      component.playlist = [original];
      component.currentIndex = 0;

      const other: ChessGameItem = { ...original, id: 999, status: 'resigned' };
      component.onChessStateChanged(other);

      expect((component.currentItem as ChessGameItem).id).toBe(1);
      expect((component.currentItem as ChessGameItem).status).toBe('active');
    });
  });
});
