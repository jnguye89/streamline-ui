import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject, NEVER, of, throwError } from 'rxjs';

import { StreamPlatform } from '../../models/stream-key.model';
import { DeviceAuthService } from '../../services/device-auth.service';
import { UserService } from '../../services/user.service';
import { LinkPageComponent, cleanCode } from './link-page.component';

describe('LinkPageComponent (skriin.com/link)', () => {
  let fixture: ComponentFixture<LinkPageComponent>;
  let page: LinkPageComponent;
  let signedIn$: BehaviorSubject<boolean>;
  let users: jasmine.SpyObj<UserService>;
  let auth: {
    isAuthenticated$: BehaviorSubject<boolean>;
    user$: BehaviorSubject<{ nickname: string } | null>;
    initiateDeviceFlow: jasmine.Spy;
    pollForToken: jasmine.Spy;
  };

  async function open(code: string | null, signedIn: boolean) {
    signedIn$ = new BehaviorSubject(signedIn);
    auth = {
      isAuthenticated$: signedIn$,
      user$: new BehaviorSubject(signedIn ? { nickname: 'hashem27' } : null),
      initiateDeviceFlow: jasmine.createSpy('initiateDeviceFlow').and.returnValue(
        of({
          deviceCode: 'dev-1',
          userCode: 'ABCD-EFGH',
          verificationUri: 'https://auth.skriin.com/activate',
          verificationUriComplete: 'https://auth.skriin.com/activate?user_code=ABCD-EFGH',
          expiresIn: 900,
          interval: 5,
        }),
      ),
      pollForToken: jasmine.createSpy('pollForToken').and.returnValue(NEVER),
    };
    users = jasmine.createSpyObj<UserService>('UserService', ['lookupStreamKeyLink', 'sendStreamKeyLink']);
    users.lookupStreamKeyLink.and.callFake((c: string) =>
      of({ code: c, platform: StreamPlatform.KICK, requiresUrl: true, status: 'waiting' as const }),
    );
    users.sendStreamKeyLink.and.returnValue(of({ platform: StreamPlatform.KICK }));

    await TestBed.configureTestingModule({
      imports: [LinkPageComponent],
      providers: [
        { provide: UserService, useValue: users },
        { provide: DeviceAuthService, useValue: auth },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(code ? { code } : {}) } },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(LinkPageComponent);
    page = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  it('cleans a typed code the way the TV makes them', () => {
    expect(cleanCode(' k2-ck ')).toBe('K2CK');
    expect(cleanCode('0O1I7K2M')).toBe('7K2M');
  });

  it('signed out: offers sign-in with the code filled in, and waits for it', async () => {
    await open('K2CK', false);

    const link = fixture.nativeElement.querySelector('a.link-btn') as HTMLAnchorElement;
    expect(link.href).toBe('https://auth.skriin.com/activate?user_code=ABCD-EFGH');
    expect(link.target).toBe('_blank');
    expect(text()).toContain('ABCD-EFGH');
    expect(auth.pollForToken).toHaveBeenCalledWith('dev-1', 5);
    expect(users.lookupStreamKeyLink).not.toHaveBeenCalled();
  });

  it('carries on with the TV code as soon as sign-in finishes', async () => {
    await open('K2CK', false);

    signedIn$.next(true);
    fixture.detectChanges();

    expect(users.lookupStreamKeyLink).toHaveBeenCalledWith('K2CK');
    expect(text()).toContain('Add your Kick key');
  });

  it('opened from the QR while signed in: goes straight to the key for that platform', async () => {
    await open('k2ck', true);

    expect(users.lookupStreamKeyLink).toHaveBeenCalledWith('K2CK');
    expect(text()).toContain('Add your Kick key');
    expect(text()).toContain('For your TV · K2CK');
    expect(fixture.nativeElement.querySelector('input[aria-label="Stream URL"]')).not.toBeNull();
  });

  it('opened without a code: asks for the one on the TV', async () => {
    await open(null, true);

    expect(text()).toContain('Link to your TV');
    expect(text()).toContain('Signed in as hashem27');
    expect(users.lookupStreamKeyLink).not.toHaveBeenCalled();
  });

  it('says plainly when a code has expired or is for another account', async () => {
    users = jasmine.createSpyObj<UserService>('UserService', ['lookupStreamKeyLink', 'sendStreamKeyLink']);
    await open(null, true);
    users.lookupStreamKeyLink.and.returnValue(throwError(() => new HttpErrorResponse({ status: 404 })));

    page.onCodeInput('ZZZZ');
    page.check();
    fixture.detectChanges();

    expect(text()).toContain('expired or is for another account');
    expect(page.step.kind).toBe('enterCode');
  });

  it('checks the Kick URL before sending, then sends the key and shows done', async () => {
    await open('K2CK', true);

    page.streamKey = 'sk_live_1';
    page.streamUrl = 'not a url';
    page.send();
    expect(users.sendStreamKeyLink).not.toHaveBeenCalled();
    expect(page.error).toContain('rtmp://');

    page.streamUrl = ' rtmps://fa723fc1b171.global-contribute.live-video.net/app ';
    page.send();
    fixture.detectChanges();

    expect(users.sendStreamKeyLink).toHaveBeenCalledWith(
      'K2CK',
      'sk_live_1',
      'rtmps://fa723fc1b171.global-contribute.live-video.net/app',
    );
    expect(text()).toContain('Sent to your TV');
    expect(text()).toContain('Kick is on for your next live');
  });

  it('sends the code back to the start if it expired while pasting', async () => {
    await open('K2CK', true);
    users.sendStreamKeyLink.and.returnValue(throwError(() => new HttpErrorResponse({ status: 404 })));

    page.streamKey = 'sk_live_1';
    page.streamUrl = 'rtmps://x/app';
    page.send();

    expect(page.step.kind).toBe('enterCode');
    expect(page.error).toContain('Get a new one on your TV');
  });
});
