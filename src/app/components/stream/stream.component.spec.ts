import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import {
  AudioMixState,
  MediaInputState,
  MediaPreviewState,
} from '../../models/media-input.models';
import { DeviceAuthService } from '../../services/device-auth.service';
import { GamepadNavigationService } from '../../services/gamepad-navigation.service';
import { MediaInputService } from '../../services/media-input.service';
import { RtcStreamService } from '../../services/agora/rtc-stream.service';
import { SeoService } from '../../services/seo.service';
import { StreamService } from '../../services/stream.service';
import {
  ChatMessage,
  RecordingSocketService,
} from '../../services/socket/recording.service';
import { StreamComponent } from './stream.component';

const readyState: MediaInputState = {
  status: 'ready',
  permission: 'granted',
  videoInputs: [
    {
      deviceId: 'video-1',
      groupId: 'video-group',
      kind: 'videoinput',
      displayLabel: 'Webcam',
    },
    {
      deviceId: 'video-2',
      groupId: 'video-group-2',
      kind: 'videoinput',
      displayLabel: 'Second camera',
    },
  ],
  audioInputs: [
    {
      deviceId: 'audio-1',
      groupId: 'audio-group',
      kind: 'audioinput',
      displayLabel: 'Microphone',
    },
  ],
  selection: { videoDeviceId: 'video-1' },
  consoleSelection: {
    overlayVideoDeviceId: 'video-2',
    gameAudioDeviceId: 'audio-1',
    microphoneDeviceId: 'audio-1',
  },
  error: null,
};

const idlePreview: MediaPreviewState = {
  status: 'idle',
  stream: null,
  error: null,
};

describe('StreamComponent', () => {
  let fixture: ComponentFixture<StreamComponent>;
  let state$: BehaviorSubject<MediaInputState>;
  let preview$: BehaviorSubject<MediaPreviewState>;
  let audioMix$: BehaviorSubject<AudioMixState>;
  let mediaInput: jasmine.SpyObj<MediaInputService>;
  let rtc: jasmine.SpyObj<RtcStreamService>;
  let streamService: jasmine.SpyObj<StreamService>;
  let socket: jasmine.SpyObj<RecordingSocketService>;
  let gamepadNavigation: jasmine.SpyObj<GamepadNavigationService>;
  let chatMessage$: Subject<ChatMessage>;
  let isLive$: BehaviorSubject<boolean>;

  beforeEach(async () => {
    state$ = new BehaviorSubject(readyState);
    preview$ = new BehaviorSubject(idlePreview);
    audioMix$ = new BehaviorSubject<AudioMixState>({
      gameLevel: 0.625,
      gameMuted: false,
      microphoneLevel: 1,
      microphoneMuted: false,
    });
    mediaInput = jasmine.createSpyObj<MediaInputService>(
      'MediaInputService',
      [
        'initialize',
        'selectVideo',
        'selectOverlayVideo',
        'setGameMuted',
        'setMicrophoneMuted',
        'swapSources',
        'resumeAudioContext',
        'startPreview',
        'refreshPrimaryVideo',
        'commitPrimaryVideoRefresh',
        'refreshOverlayVideo',
        'refreshAudioSources',
        'stopPreview',
      ],
      {
        state$: state$.asObservable(),
        preview$: preview$.asObservable(),
        audioMix$: audioMix$.asObservable(),
        snapshot: readyState,
        previewSnapshot: idlePreview,
        audioMixSnapshot: audioMix$.value,
      },
    );
    mediaInput.initialize.and.resolveTo();
    mediaInput.startPreview.and.resolveTo(null);

    const auth = {
      isAuthenticated$: new BehaviorSubject(true),
      user$: new BehaviorSubject({ sub: 'auth0|viewer' }),
    };
    isLive$ = new BehaviorSubject(false);
    rtc = jasmine.createSpyObj<RtcStreamService>(
      'RtcStreamService',
      [
        'join',
        'startPublish',
        'replacePublishedVideo',
        'syncPublishedAudio',
        'stopPublish',
        'leave',
      ],
      { isLive$ },
    );
    rtc.join.and.resolveTo();
    rtc.syncPublishedAudio.and.resolveTo();
    rtc.stopPublish.and.resolveTo();
    rtc.leave.and.resolveTo();
    streamService = jasmine.createSpyObj<StreamService>('StreamService', [
      'ensureReady',
      'start',
      'stop',
      'process',
    ]);
    streamService.ensureReady.and.returnValue(
      of({
        appId: 'app',
        rtcToken: 'token',
        rtmToken: 'rtm-token',
        channelName: 'channel',
        expireAt: Date.now() + 60_000,
        agoraUid: 42,
      }),
    );
    streamService.stop.and.resolveTo({ filename: '' });
    chatMessage$ = new Subject<ChatMessage>();
    socket = jasmine.createSpyObj<RecordingSocketService>(
      'RecordingSocketService',
      ['connect', 'joinRoom', 'leaveRoom', 'sendChat'],
      { chatMessage$ },
    );
    gamepadNavigation = jasmine.createSpyObj<GamepadNavigationService>(
      'GamepadNavigationService',
      ['setAuxButtonActions', 'clearAuxButtonActions'],
    );

    await TestBed.configureTestingModule({
      imports: [StreamComponent],
      providers: [
        { provide: DeviceAuthService, useValue: auth },
        { provide: MediaInputService, useValue: mediaInput },
        { provide: RtcStreamService, useValue: rtc },
        { provide: StreamService, useValue: streamService },
        { provide: RecordingSocketService, useValue: socket },
        { provide: SeoService, useValue: { setTags: () => undefined } },
        {
          provide: Router,
          useValue: { url: '/stream', navigate: () => Promise.resolve(true) },
        },
        { provide: MatDialog, useValue: { open: jasmine.createSpy('open') } },
        { provide: GamepadNavigationService, useValue: gamepadNavigation },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StreamComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => {
    state$.complete();
    preview$.complete();
    audioMix$.complete();
    chatMessage$.complete();
  });

  it('joins chat without making it part of critical media setup', () => {
    expect(socket.connect).toHaveBeenCalled();
    expect(socket.joinRoom).toHaveBeenCalledWith(
      fixture.componentInstance.channelName!,
    );

    chatMessage$.next({
      userId: 'viewer-1',
      username: 'Viewer',
      text: 'hello',
      roomId: fixture.componentInstance.channelName!,
      ts: 1,
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.chat-message').textContent)
      .toContain('hello');
  });

  it('joins Agora with the UID returned by stream readiness', () => {
    expect(streamService.ensureReady).toHaveBeenCalled();
    expect(rtc.join).toHaveBeenCalledWith(
      'app',
      jasmine.any(String),
      'token',
      42,
    );
  });

  it('defaults to Screen + cam and remembers each role\'s device id', () => {
    expect(fixture.componentInstance.displayMode).toBe('screen-cam');
    expect(fixture.componentInstance.screenDeviceId).toBe('video-1');
    expect(fixture.componentInstance.webcamDeviceId).toBe('video-2');

    const active = fixture.nativeElement.querySelector('.mode-btn--active');
    expect(active.textContent).toContain('Screen + cam');
  });

  it('switches to webcam-only and disables the screen source', async () => {
    const webcamButton = fixture.nativeElement.querySelector(
      '[aria-label="Show webcam only"]',
    ) as HTMLButtonElement;

    webcamButton.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mediaInput.selectVideo).toHaveBeenCalledWith('video-2');
    expect(mediaInput.selectOverlayVideo).toHaveBeenCalledWith(null);
    expect(fixture.componentInstance.displayMode).toBe('webcam');
  });

  it('switches to screen-only and disables the webcam source', async () => {
    const screenButton = fixture.nativeElement.querySelector(
      '[aria-label="Show screen only"]',
    ) as HTMLButtonElement;

    screenButton.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mediaInput.selectVideo).toHaveBeenCalledWith('video-1');
    expect(mediaInput.selectOverlayVideo).toHaveBeenCalledWith(null);
    expect(fixture.componentInstance.displayMode).toBe('screen');
  });

  it('restores both sources when switching back to Screen + cam', async () => {
    await fixture.componentInstance.selectWebcamMode();
    mediaInput.selectVideo.calls.reset();
    mediaInput.selectOverlayVideo.calls.reset();

    const screenCamButton = fixture.nativeElement.querySelector(
      '[aria-label="Show screen and webcam"]',
    ) as HTMLButtonElement;
    screenCamButton.click();
    await fixture.whenStable();

    expect(mediaInput.selectVideo).toHaveBeenCalledWith('video-1');
    expect(mediaInput.selectOverlayVideo).toHaveBeenCalledWith('video-2');
    expect(fixture.componentInstance.displayMode).toBe('screen-cam');
  });

  it('swaps which source is primary only while Screen + cam is active', async () => {
    const swap = fixture.nativeElement.querySelector(
      '[aria-label="Swap main display and facecam (or press Y)"]',
    ) as HTMLButtonElement;
    expect(swap).not.toBeNull();

    swap.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mediaInput.swapSources).toHaveBeenCalled();

    await fixture.componentInstance.selectWebcamMode();
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector(
        '[aria-label="Swap main display and facecam (or press Y)"]',
      ),
    ).toBeNull();
  });

  it('binds Y/LB/RB controller shortcuts on init and releases them on destroy', () => {
    expect(gamepadNavigation.setAuxButtonActions).toHaveBeenCalledWith({
      y: jasmine.any(Function),
      lb: jasmine.any(Function),
      rb: jasmine.any(Function),
    });

    const bound = gamepadNavigation.setAuxButtonActions.calls.mostRecent()
      .args[0] as { y: () => void; lb: () => void; rb: () => void };

    bound.y();
    expect(mediaInput.swapSources).toHaveBeenCalled();

    bound.lb();
    expect(mediaInput.setMicrophoneMuted).toHaveBeenCalledWith(true);

    bound.rb();
    expect(mediaInput.setGameMuted).toHaveBeenCalledWith(true);

    fixture.destroy();
    expect(gamepadNavigation.clearAuxButtonActions).toHaveBeenCalled();
  });

  it('mutes and unmutes the microphone from the LB control', () => {
    const mic = fixture.nativeElement.querySelector(
      '[aria-label="Mute microphone (or press LB)"]',
    ) as HTMLButtonElement;

    mic.click();
    expect(mediaInput.setMicrophoneMuted).toHaveBeenCalledWith(true);

    audioMix$.next({ ...audioMix$.value, microphoneMuted: true });
    fixture.detectChanges();

    const unmute = fixture.nativeElement.querySelector(
      '[aria-label="Unmute microphone (or press LB)"]',
    ) as HTMLButtonElement;
    expect(unmute).not.toBeNull();
    expect(unmute.classList).toContain('audio-toggle--muted');
  });

  it('mutes and unmutes screen audio from the RB control', () => {
    const screenAudio = fixture.nativeElement.querySelector(
      '[aria-label="Mute screen audio (or press RB)"]',
    ) as HTMLButtonElement;

    screenAudio.click();
    expect(mediaInput.setGameMuted).toHaveBeenCalledWith(true);

    audioMix$.next({ ...audioMix$.value, gameMuted: true });
    fixture.detectChanges();

    const unmute = fixture.nativeElement.querySelector(
      '[aria-label="Unmute screen audio (or press RB)"]',
    ) as HTMLButtonElement;
    expect(unmute).not.toBeNull();
    expect(unmute.classList).toContain('audio-toggle--muted');
  });

  it('serializes complete input changes so their capture steps cannot interleave', async () => {
    let resolveVideo!: (stream: MediaStream | null) => void;
    mediaInput.refreshPrimaryVideo.and.returnValue(
      new Promise<MediaStream | null>((resolve) => {
        resolveVideo = resolve;
      }),
    );

    const videoChange = fixture.componentInstance.selectVideo('video-2');
    const overlayChange = fixture.componentInstance.selectOverlayVideo('video-1');
    await Promise.resolve();

    expect(mediaInput.selectOverlayVideo).not.toHaveBeenCalled();
    resolveVideo(null);
    await videoChange;
    await overlayChange;

    expect(mediaInput.selectOverlayVideo).toHaveBeenCalledWith('video-1');
  });

  it('turns input replacement failures into a recoverable UI state', async () => {
    mediaInput.refreshOverlayVideo.and.rejectWith(
      new DOMException('Device is busy', 'NotReadableError'),
    );

    await fixture.componentInstance.selectOverlayVideo('video-1');
    fixture.detectChanges();

    expect(mediaInput.stopPreview).toHaveBeenCalled();
    expect(fixture.componentInstance.workflowError).toContain(
      'could not be applied',
    );
    expect(fixture.nativeElement.textContent).toContain(
      'Review the available devices and retry',
    );
  });

  it('allows the complete workflow to retry after initialization fails', async () => {
    streamService.ensureReady.and.returnValue(
      throwError(() => new Error('backend unavailable')),
    );

    await fixture.componentInstance.init();
    fixture.detectChanges();

    expect(fixture.componentInstance.channelName).toBeUndefined();
    const retry = [...fixture.nativeElement.querySelectorAll('button')].find(
      (button: HTMLButtonElement) => button.textContent?.includes('Retry setup'),
    ) as HTMLButtonElement;
    expect(retry).toBeDefined();

    streamService.ensureReady.and.returnValue(
      of({
        appId: 'app',
        rtcToken: 'token',
        rtmToken: 'rtm-token',
        channelName: 'channel',
        expireAt: Date.now() + 60_000,
        agoraUid: 42,
      }),
    );
    retry.click();
    await fixture.whenStable();

    expect(fixture.componentInstance.isReady).toBeTrue();
    expect(rtc.join).toHaveBeenCalled();
  });

  it('shows loading and recoverable error states', () => {
    state$.next({
      ...readyState,
      status: 'loading',
      permission: 'requesting',
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="status"]')).not.toBeNull();

    state$.next({
      ...readyState,
      status: 'error',
      videoInputs: [],
      audioInputs: [],
      selection: { videoDeviceId: null },
      error: {
        code: 'permission-denied',
        message: 'Allow camera and microphone access.',
        recoverable: true,
      },
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      'Allow camera and microphone access.',
    );
    expect(
      fixture.nativeElement.querySelector('button[mat-flat-button]'),
    ).not.toBeNull();
  });

  it('shows safe preview errors and retries without reloading', async () => {
    preview$.next({
      status: 'error',
      stream: null,
      error: {
        code: 'device-busy',
        message:
          'The selected input is busy or could not be started. Close other apps using it and retry.',
        recoverable: true,
      },
    });
    fixture.detectChanges();

    const alert = fixture.nativeElement.querySelector(
      '.status-message.error',
    ) as HTMLElement;
    const retry = [...fixture.nativeElement.querySelectorAll('button')].find(
      (button: HTMLButtonElement) => button.textContent?.includes('Retry inputs'),
    ) as HTMLButtonElement;
    expect(alert.textContent).toContain('selected input is busy');
    expect(retry).toBeDefined();

    retry.click();
    await fixture.whenStable();

    expect(mediaInput.initialize).toHaveBeenCalledTimes(2);
    expect(mediaInput.startPreview).toHaveBeenCalled();
  });

  it('stops the backend even when Agora unpublish fails', async () => {
    rtc.stopPublish.and.rejectWith(new Error('Agora unavailable'));

    await fixture.componentInstance.stopWebcam(false);

    expect(streamService.stop).toHaveBeenCalledWith(
      fixture.componentInstance.channelName,
    );
    expect(fixture.componentInstance.workflowError).toContain(
      'shutdown steps failed',
    );
    expect(mediaInput.startPreview).toHaveBeenCalled();
  });

  it('restores the selected-source preview after stopping publication', async () => {
    const restoredPreview = new MediaStream();
    spyOn(
      fixture.componentInstance.videoElement.nativeElement,
      'play',
    ).and.resolveTo();
    mediaInput.startPreview.calls.reset();
    mediaInput.startPreview.and.resolveTo(restoredPreview);

    await fixture.componentInstance.stopWebcam(false);

    expect(rtc.stopPublish).toHaveBeenCalled();
    expect(streamService.stop).toHaveBeenCalled();
    expect(mediaInput.startPreview).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.workflowError).toBeNull();
  });

  it('stops the backend when live replacement clears the Agora live flag', async () => {
    isLive$.next(true);
    mediaInput.refreshPrimaryVideo.and.resolveTo({} as MediaStream);
    rtc.replacePublishedVideo.and.callFake(async () => {
      isLive$.next(false);
      throw new Error('replacement failed');
    });

    await fixture.componentInstance.selectVideo('video-2');

    expect(streamService.stop).toHaveBeenCalledWith(
      fixture.componentInstance.channelName,
    );
    expect(fixture.componentInstance.workflowError).toContain(
      'could not be applied',
    );
  });
});


describe('StreamComponent screen/webcam role detection', () => {
  const idlePreview: MediaPreviewState = {
    status: 'idle',
    stream: null,
    error: null,
  };

  async function createFixture(
    initialState: MediaInputState,
  ): Promise<{
    fixture: ComponentFixture<StreamComponent>;
    mediaInput: jasmine.SpyObj<MediaInputService>;
  }> {
    const state$ = new BehaviorSubject(initialState);
    const preview$ = new BehaviorSubject(idlePreview);
    const audioMix$ = new BehaviorSubject<AudioMixState>({
      gameLevel: 0.625,
      gameMuted: false,
      microphoneLevel: 1,
      microphoneMuted: false,
    });
    const mediaInput = jasmine.createSpyObj<MediaInputService>(
      'MediaInputService',
      [
        'initialize',
        'selectVideo',
        'selectOverlayVideo',
        'setGameMuted',
        'setMicrophoneMuted',
        'swapSources',
        'resumeAudioContext',
        'startPreview',
        'refreshPrimaryVideo',
        'commitPrimaryVideoRefresh',
        'refreshOverlayVideo',
        'refreshAudioSources',
        'stopPreview',
      ],
      {
        state$: state$.asObservable(),
        preview$: preview$.asObservable(),
        audioMix$: audioMix$.asObservable(),
        snapshot: initialState,
        previewSnapshot: idlePreview,
        audioMixSnapshot: audioMix$.value,
      },
    );
    mediaInput.initialize.and.resolveTo();
    mediaInput.startPreview.and.resolveTo(null);

    const auth = {
      isAuthenticated$: new BehaviorSubject(true),
      user$: new BehaviorSubject({ sub: 'auth0|viewer' }),
    };
    const rtc = jasmine.createSpyObj<RtcStreamService>(
      'RtcStreamService',
      [
        'join',
        'startPublish',
        'replacePublishedVideo',
        'syncPublishedAudio',
        'stopPublish',
        'leave',
      ],
      { isLive$: new BehaviorSubject(false) },
    );
    rtc.join.and.resolveTo();
    rtc.leave.and.resolveTo();
    const streamService = jasmine.createSpyObj<StreamService>('StreamService', [
      'ensureReady',
      'start',
      'stop',
      'process',
    ]);
    streamService.ensureReady.and.returnValue(
      of({
        appId: 'app',
        rtcToken: 'token',
        rtmToken: 'rtm-token',
        channelName: 'channel',
        expireAt: Date.now() + 60_000,
        agoraUid: 42,
      }),
    );
    const socket = jasmine.createSpyObj<RecordingSocketService>(
      'RecordingSocketService',
      ['connect', 'joinRoom', 'leaveRoom', 'sendChat'],
      { chatMessage$: new Subject<ChatMessage>() },
    );
    const gamepadNavigation = jasmine.createSpyObj<GamepadNavigationService>(
      'GamepadNavigationService',
      ['setAuxButtonActions', 'clearAuxButtonActions'],
    );

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [StreamComponent],
      providers: [
        { provide: DeviceAuthService, useValue: auth },
        { provide: MediaInputService, useValue: mediaInput },
        { provide: RtcStreamService, useValue: rtc },
        { provide: StreamService, useValue: streamService },
        { provide: RecordingSocketService, useValue: socket },
        { provide: SeoService, useValue: { setTags: () => undefined } },
        {
          provide: Router,
          useValue: { url: '/stream', navigate: () => Promise.resolve(true) },
        },
        { provide: MatDialog, useValue: { open: jasmine.createSpy('open') } },
        { provide: GamepadNavigationService, useValue: gamepadNavigation },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(StreamComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    return { fixture, mediaInput };
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('identifies the console capture card as "screen" even when it enumerates after the webcam', async () => {
    const { fixture, mediaInput } = await createFixture({
      status: 'ready',
      permission: 'granted',
      videoInputs: [
        {
          deviceId: 'webcam-1',
          groupId: 'webcam-group',
          kind: 'videoinput',
          displayLabel: 'Webcam',
        },
        {
          deviceId: 'capture-1',
          groupId: 'capture-group',
          kind: 'videoinput',
          displayLabel: 'Console Video 1',
          isCaptureDevice: true,
        },
      ],
      audioInputs: [],
      // MediaInputService enumerated the webcam first and the capture card
      // second - the opposite of what naive enumeration-order pairing
      // would need to get screen/webcam right.
      selection: { videoDeviceId: 'webcam-1' },
      consoleSelection: {
        overlayVideoDeviceId: 'capture-1',
        gameAudioDeviceId: null,
        microphoneDeviceId: null,
      },
      error: null,
    });

    expect(fixture.componentInstance.screenDeviceId).toBe('capture-1');
    expect(fixture.componentInstance.webcamDeviceId).toBe('webcam-1');
    expect(mediaInput.selectVideo).toHaveBeenCalledWith('webcam-1');
    expect(mediaInput.selectOverlayVideo).toHaveBeenCalledWith('capture-1');
  });

  it('identifies the console capture card as "screen" even when it enumerates before the webcam', async () => {
    const { fixture } = await createFixture({
      status: 'ready',
      permission: 'granted',
      videoInputs: [
        {
          deviceId: 'capture-1',
          groupId: 'capture-group',
          kind: 'videoinput',
          displayLabel: 'Console Video 1',
          isCaptureDevice: true,
        },
        {
          deviceId: 'webcam-1',
          groupId: 'webcam-group',
          kind: 'videoinput',
          displayLabel: 'Webcam',
        },
      ],
      audioInputs: [],
      selection: { videoDeviceId: 'capture-1' },
      consoleSelection: {
        overlayVideoDeviceId: 'webcam-1',
        gameAudioDeviceId: null,
        microphoneDeviceId: null,
      },
      error: null,
    });

    expect(fixture.componentInstance.screenDeviceId).toBe('capture-1');
    expect(fixture.componentInstance.webcamDeviceId).toBe('webcam-1');
  });

  it('falls back to enumeration order when neither device is a recognized capture card', async () => {
    const { fixture } = await createFixture({
      status: 'ready',
      permission: 'granted',
      videoInputs: [
        {
          deviceId: 'video-1',
          groupId: 'video-group',
          kind: 'videoinput',
          displayLabel: 'Webcam',
        },
        {
          deviceId: 'video-2',
          groupId: 'video-group-2',
          kind: 'videoinput',
          displayLabel: 'Second camera',
        },
      ],
      audioInputs: [],
      selection: { videoDeviceId: 'video-1' },
      consoleSelection: {
        overlayVideoDeviceId: 'video-2',
        gameAudioDeviceId: null,
        microphoneDeviceId: null,
      },
      error: null,
    });

    expect(fixture.componentInstance.screenDeviceId).toBe('video-1');
    expect(fixture.componentInstance.webcamDeviceId).toBe('video-2');
  });

  it('treats a lone capture card as "screen" rather than mislabeling it "webcam"', async () => {
    const { fixture } = await createFixture({
      status: 'ready',
      permission: 'granted',
      videoInputs: [
        {
          deviceId: 'capture-1',
          groupId: 'capture-group',
          kind: 'videoinput',
          displayLabel: 'Console Video 1',
          isCaptureDevice: true,
        },
      ],
      audioInputs: [],
      selection: { videoDeviceId: 'capture-1' },
      consoleSelection: {
        overlayVideoDeviceId: null,
        gameAudioDeviceId: null,
        microphoneDeviceId: null,
      },
      error: null,
    });

    expect(fixture.componentInstance.screenDeviceId).toBe('capture-1');
    expect(fixture.componentInstance.webcamDeviceId).toBeNull();
    expect(fixture.componentInstance.displayMode).toBe('screen');
  });

  it('treats a lone unrecognized video device as "webcam", as before', async () => {
    const { fixture } = await createFixture({
      status: 'ready',
      permission: 'granted',
      videoInputs: [
        {
          deviceId: 'webcam-1',
          groupId: 'webcam-group',
          kind: 'videoinput',
          displayLabel: 'Webcam',
        },
      ],
      audioInputs: [],
      selection: { videoDeviceId: 'webcam-1' },
      consoleSelection: {
        overlayVideoDeviceId: null,
        gameAudioDeviceId: null,
        microphoneDeviceId: null,
      },
      error: null,
    });

    expect(fixture.componentInstance.webcamDeviceId).toBe('webcam-1');
    expect(fixture.componentInstance.screenDeviceId).toBeNull();
    expect(fixture.componentInstance.displayMode).toBe('webcam');
  });
});
