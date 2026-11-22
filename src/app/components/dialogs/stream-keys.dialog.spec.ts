import { ComponentFixture, TestBed, discardPeriodicTasks, fakeAsync, tick } from '@angular/core/testing';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';

import { StreamPlatform } from '../../models/stream-key.model';
import { GamepadNavigationService } from '../../services/gamepad-navigation.service';
import { UserService } from '../../services/user.service';
import { LINK_PAGE, StreamKeysDialog } from './stream-keys.dialog';

describe('StreamKeysDialog: Add key from a phone', () => {
  let fixture: ComponentFixture<StreamKeysDialog>;
  let dialog: StreamKeysDialog;
  let users: jasmine.SpyObj<UserService>;
  let statuses: ('waiting' | 'done' | 'expired')[];

  beforeEach(async () => {
    statuses = [];
    users = jasmine.createSpyObj<UserService>('UserService', [
      'getStreamKeys',
      'saveStreamKey',
      'createStreamKeyLink',
      'getStreamKeyLinkStatus',
      'setStreamKeyEnabled',
    ]);
    users.setStreamKeyEnabled.and.returnValue(of({ platform: StreamPlatform.YOUTUBE, streamKey: 'yt' }));
    users.getStreamKeys.and.returnValue(of([]));
    let next = 0;
    users.createStreamKeyLink.and.callFake((platform: StreamPlatform) =>
      of({ code: ['K2CK', 'W7XZ'][next++] ?? 'ZZZZ', platform, expiresInSeconds: 600 }),
    );
    users.getStreamKeyLinkStatus.and.callFake(() => of({ status: statuses.shift() ?? 'waiting' }));

    await TestBed.configureTestingModule({
      imports: [StreamKeysDialog],
      providers: [
        { provide: UserService, useValue: users },
        { provide: MatDialogRef, useValue: { close: jasmine.createSpy('close') } },
        { provide: MatDialog, useValue: { open: jasmine.createSpy('open') } },
        {
          provide: GamepadNavigationService,
          useValue: jasmine.createSpyObj('GamepadNavigationService', [
            'clearFocus', 'requestFocus', 'setBackAction', 'setAuxButtonActions', 'clearAuxButtonActions',
            'register', 'unregister',
          ]),
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StreamKeysDialog);
    dialog = fixture.componentInstance;
    fixture.detectChanges();
  });

  const kick = () => dialog.platforms.find((p) => p.platform === StreamPlatform.KICK)!;

  it('asks the API for a code for that platform and shows it as a QR for skriin.com/link', fakeAsync(() => {
    dialog.openAdd(kick());
    fixture.detectChanges();

    expect(users.createStreamKeyLink).toHaveBeenCalledWith(StreamPlatform.KICK);
    expect(dialog.phoneCode).toBe('K2CK');
    expect(dialog.linkUrl).toBe(`${LINK_PAGE}?code=K2CK`);
    expect(fixture.nativeElement.querySelector('.sim-code b').textContent).toContain('K2CK');
    expect(fixture.nativeElement.querySelector('bon-qr')).not.toBeNull();

    dialog.backToList();
    tick(); // the focus-restore timer
    discardPeriodicTasks();
  }));

  it('goes back to the list with the platform on once the phone sends the key', fakeAsync(() => {
    users.getStreamKeys.and.returnValue(
      of([{ platform: StreamPlatform.KICK, streamKey: 'sk_live', streamUrl: 'rtmps://ingest' }]),
    );
    statuses = ['waiting', 'done'];

    dialog.openAdd(kick());
    tick(2500);

    expect(dialog.adding).toBeNull();
    expect(dialog.hasKey(kick())).toBeTrue();
    expect(kick().on).toBeTrue();

    // And it stops asking.
    const calls = users.getStreamKeyLinkStatus.calls.count();
    tick(10000);
    expect(users.getStreamKeyLinkStatus.calls.count()).toBe(calls);
  }));

  it('swaps in a fresh code when the old one expires', fakeAsync(() => {
    statuses = ['expired'];

    dialog.openAdd(kick());

    expect(users.createStreamKeyLink).toHaveBeenCalledTimes(2);
    expect(dialog.phoneCode).toBe('W7XZ');

    dialog.backToList();
    tick(); // the focus-restore timer
    discardPeriodicTasks();
  }));

  it('stops asking when you leave the Add key screen', fakeAsync(() => {
    dialog.openAdd(kick());
    tick(2500);
    dialog.backToList();
    const calls = users.getStreamKeyLinkStatus.calls.count();

    tick(10000);

    expect(users.getStreamKeyLinkStatus.calls.count()).toBe(calls);
    discardPeriodicTasks();
  }));

  it('still offers typing on the TV when no code can be had', fakeAsync(() => {
    users.createStreamKeyLink.and.returnValue(throwError(() => new Error('offline')));

    dialog.openAdd(kick());
    fixture.detectChanges();

    expect(dialog.phoneCode).toBe('');
    expect(dialog.codeError).toContain('type the key on the TV');
    expect(fixture.nativeElement.textContent).toContain('Type it on the TV instead');
    expect(users.getStreamKeyLinkStatus).not.toHaveBeenCalled();
  }));

  it('shows each key on or off as saved on the account', async () => {
    users.getStreamKeys.and.returnValue(of([
      { platform: StreamPlatform.YOUTUBE, streamKey: 'yt', enabled: true },
      { platform: StreamPlatform.TWITCH, streamKey: 'tw', enabled: false },
    ]));
    fixture = TestBed.createComponent(StreamKeysDialog);
    dialog = fixture.componentInstance;
    fixture.detectChanges();

    const row = (p: StreamPlatform) => dialog.platforms.find((e) => e.platform === p)!;
    expect(dialog.status(row(StreamPlatform.YOUTUBE))).toContain('on for your next live');
    expect(dialog.status(row(StreamPlatform.TWITCH))).toContain('off');
  });

  it('saves A on a row to the account, and puts it back if that fails', () => {
    const youtube = dialog.platforms.find((e) => e.platform === StreamPlatform.YOUTUBE)!;
    youtube.streamKey = 'yt';
    youtube.on = true;

    dialog.activate(youtube);
    expect(users.setStreamKeyEnabled).toHaveBeenCalledWith(StreamPlatform.YOUTUBE, false);
    expect(youtube.on).toBeFalse();

    users.setStreamKeyEnabled.and.returnValue(throwError(() => new Error('offline')));
    dialog.activate(youtube);
    fixture.detectChanges();
    expect(youtube.on).toBeFalse();
    expect(fixture.nativeElement.querySelector('.sim-error').textContent).toContain('Couldn’t switch YouTube on');
  });
});
