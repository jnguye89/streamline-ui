import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import {
  AudioMixState,
  AudioMeterState,
  MediaInputState,
  MediaPreviewState,
} from '../../models/media-input.models';
import { GamepadNavigationService } from '../../services/gamepad-navigation.service';
import { DeviceAuthService } from '../../services/device-auth.service';
import { MediaInputService } from '../../services/media-input.service';
import { RtcStreamService } from '../../services/agora/rtc-stream.service';
import { SeoService } from '../../services/seo.service';
import { StreamService } from '../../services/stream.service';
import { UserService } from '../../services/user.service';
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
  let audioMeter$: BehaviorSubject<AudioMeterState>;
  let mediaInput: jasmine.SpyObj<MediaInputService>;
  let rtc: jasmine.SpyObj<RtcStreamService>;
  let streamService: jasmine.SpyObj<StreamService>;
  let socket: jasmine.SpyObj<RecordingSocketService>;
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
    audioMeter$ = new BehaviorSubject<AudioMeterState>({
      game: 0,
      microphone: 0,
      output: 0,
    });
    mediaInput = jasmine.createSpyObj<MediaInputService>(
      'MediaInputService',
      [
        'initialize',
        'selectVideo',
        'selectOverlayVideo',
        'selectGameAudio',
        'selectMicrophone',
        'setGameLevel',
        'setGameMuted',
        'setMicrophoneLevel',
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
        audioMeter$: audioMeter$.asObservable(),
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
      }),
    );
    streamService.stop.and.resolveTo({ filename: '' });
    chatMessage$ = new Subject<ChatMessage>();
    socket = jasmine.createSpyObj<RecordingSocketService>(
      'RecordingSocketService',
      ['connect', 'joinRoom', 'leaveRoom', 'sendChat'],
      { chatMessage$ },
    );

    await TestBed.configureTestingModule({
      imports: [StreamComponent],
      providers: [
        { provide: DeviceAuthService, useValue: auth },
        { provide: MediaInputService, useValue: mediaInput },
        { provide: RtcStreamService, useValue: rtc },
        { provide: StreamService, useValue: streamService },
        {
          provide: UserService,
          useValue: { getAuth0User: () => of({ agoraUserId: 42 }) },
        },
        { provide: RecordingSocketService, useValue: socket },
        { provide: SeoService, useValue: { setTags: () => undefined } },
        {
          provide: Router,
          useValue: { url: '/stream', navigate: () => Promise.resolve(true) },
        },
        { provide: MatDialog, useValue: { open: jasmine.createSpy('open') } },
        {
          provide: GamepadNavigationService,
          useValue: {
            register: () => undefined,
            unregister: () => undefined,
            setBackAction: () => undefined,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StreamComponent);
    fixture.componentInstance.inputPanelOpen = true;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => {
    state$.complete();
    preview$.complete();
    audioMix$.complete();
    audioMeter$.complete();
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

  it('keeps stream inputs dismissed until opened from the toolbar', () => {
    fixture.componentInstance.inputPanelOpen = false;
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.input-panel')).toBeNull();
    const inputsButton = fixture.nativeElement.querySelector(
      '[aria-label="Show stream inputs"]',
    ) as HTMLButtonElement;
    expect(inputsButton).not.toBeNull();

    inputsButton.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.input-panel')).not.toBeNull();
    expect(inputsButton.getAttribute('aria-expanded')).toBe('true');
  });

  it('updates and previews primary video and microphone independently', async () => {
    const video = fixture.nativeElement.querySelector(
      '#stream-video-input',
    ) as HTMLSelectElement;
    video.value = 'video-2';
    video.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    expect(mediaInput.selectVideo).toHaveBeenCalledWith('video-2');
    expect(mediaInput.refreshPrimaryVideo).toHaveBeenCalled();

    mediaInput.refreshAudioSources.calls.reset();
    const microphone = fixture.nativeElement.querySelector(
      '#microphone-input',
    ) as HTMLSelectElement;
    microphone.value = 'audio-1';
    microphone.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    expect(mediaInput.selectMicrophone).toHaveBeenCalledWith('audio-1');
    expect(mediaInput.refreshAudioSources).toHaveBeenCalled();
  });

  it('publishes a newly selected audio source while live', async () => {
    const publishStream = {} as MediaStream;
    Object.defineProperty(mediaInput, 'previewSnapshot', {
      get: () => ({ ...idlePreview, stream: publishStream }),
    });
    isLive$.next(true);

    await fixture.componentInstance.selectMicrophone('audio-1');

    expect(mediaInput.refreshAudioSources).toHaveBeenCalled();
    expect(rtc.syncPublishedAudio).toHaveBeenCalledWith(publishStream);
  });

  it('shows source activity at the selected level while preserving muted activity', () => {
    audioMeter$.next({ game: -18, microphone: -14, output: -16 });
    audioMix$.next({
      ...audioMix$.value,
      gameLevel: 0.5,
      gameMuted: true,
    });
    fixture.detectChanges();

    const meter = fixture.nativeElement.querySelector(
      '[aria-label="Main audio activity"]',
    ) as HTMLElement;
    expect(meter.classList).toContain('muted');
    expect((meter.firstElementChild as HTMLElement).style.transform).toBe(
      'scaleX(0.7)',
    );
    expect(meter.dataset['band']).toBe('green');
    expect(fixture.componentInstance.meterBand(-8)).toBe('yellow');
    expect(fixture.componentInstance.meterBand(-2)).toBe('red');

    audioMeter$.next({ game: 0, microphone: -60, output: -1 });
    fixture.detectChanges();
    expect(meter.classList).toContain('clipping');
  });

  it('serializes complete input changes so their capture steps cannot interleave', async () => {
    let resolveVideo!: (stream: MediaStream | null) => void;
    mediaInput.refreshPrimaryVideo.and.returnValue(
      new Promise<MediaStream | null>((resolve) => {
        resolveVideo = resolve;
      }),
    );

    const videoChange = fixture.componentInstance.selectVideo('video-2');
    const microphoneChange = fixture.componentInstance.selectMicrophone('audio-1');
    await Promise.resolve();

    expect(mediaInput.selectMicrophone).not.toHaveBeenCalled();
    resolveVideo(null);
    await videoChange;
    await microphoneChange;

    expect(mediaInput.selectMicrophone).toHaveBeenCalledWith('audio-1');
  });

  it('turns input replacement failures into a recoverable UI state', async () => {
    mediaInput.refreshAudioSources.and.rejectWith(
      new DOMException('Device is busy', 'NotReadableError'),
    );
    const microphone = fixture.nativeElement.querySelector(
      '#microphone-input',
    ) as HTMLSelectElement;

    microphone.dispatchEvent(new Event('change'));
    await fixture.whenStable();
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
      }),
    );
    retry.click();
    await fixture.whenStable();

    expect(fixture.componentInstance.isReady).toBeTrue();
    expect(rtc.join).toHaveBeenCalled();
  });

  it('shows loading, missing-device, and recoverable error states', () => {
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

    expect(fixture.nativeElement.textContent).toContain('No video inputs found');
    expect(fixture.nativeElement.textContent).toContain(
      'No audio input is available',
    );
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

  it('renders source-specific negotiated formats and compatibility notice', () => {
    state$.next({
      ...readyState,
      videoInputs: [
        {
          ...readyState.videoInputs[0],
          displayLabel: 'Yuan SC400N2 Video',
        },
        readyState.videoInputs[1],
      ],
      selection: {
        ...readyState.selection,
        videoDeviceId: 'video-1',
      },
    });
    preview$.next({
      ...idlePreview,
      status: 'ready',
      videoSettings: {
        width: 1280,
        height: 720,
        frameRate: 30,
        fallbackTier: 'bounded',
        belowTarget: true,
      },
      overlayVideoSettings: {
        width: 1920,
        height: 1080,
        frameRate: 50,
        fallbackTier: 'exact',
        belowTarget: false,
      },
    });
    fixture.detectChanges();

    const video = fixture.nativeElement.querySelector(
      '#stream-video-input',
    ) as HTMLSelectElement;
    expect(video.options[0].text).toContain('Yuan SC400N2 Video');
    expect(
      fixture.nativeElement.querySelector('#stream-audio-input'),
    ).toBeNull();
    expect(
      fixture.nativeElement.querySelector('#game-audio-level'),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('#microphone-level'),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelectorAll('.source-group').length,
    ).toBe(2);
    const renderedText = fixture.nativeElement.textContent.replace(/\s+/g, ' ');
    expect(renderedText).toContain(
      'Main stream: 1280×720 @ 30 fps',
    );
    expect(renderedText).toContain(
      'Facecam: 1920×1080 @ 50 fps',
    );
    expect(renderedText).toContain(
      'best compatible format available',
    );
  });
});
