import { isPlatformBrowser } from '@angular/common';
import {
  Inject,
  Injectable,
  InjectionToken,
  OnDestroy,
  PLATFORM_ID,
} from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import {
  AudioChannel,
  AudioMeterState,
  AudioMixState,
  ConsoleInputSelection,
  MediaInputDevice,
  MediaInputEnvironment,
  MediaInputError,
  MediaInputSelection,
  MediaInputState,
  MediaPreviewState,
  NegotiatedVideoSettings,
} from '../models/media-input.models';
import { projectMediaInputDevice } from './media-input-device-projection';
export type { MediaInputEnvironment } from '../models/media-input.models';
import {
  AudioMixerChannelNodes,
  applyAudioMixState,
  connectAudioMixer,
} from './audio-mixer.service';
import {
  createVideoCompositor,
  VideoCompositorSession,
} from './video-compositor.service';
import {
  acquireOverlayVideo,
  acquirePrimaryVideo,
  isConstraintFailure,
} from './media-capture';

export const MEDIA_INPUT_ENVIRONMENT =
  new InjectionToken<MediaInputEnvironment>('MEDIA_INPUT_ENVIRONMENT', {
    providedIn: 'root',
    factory: () => ({
      mediaDevices:
        typeof navigator === 'undefined' ? undefined : navigator.mediaDevices,
      storage: typeof localStorage === 'undefined' ? undefined : localStorage,
      createMediaStream:
        typeof MediaStream === 'undefined'
          ? undefined
          : (tracks) => new MediaStream(tracks),
      createAudioContext:
        typeof AudioContext === 'undefined'
          ? undefined
          : () => new AudioContext(),
      createVideoElement:
        typeof document === 'undefined'
          ? undefined
          : () => document.createElement('video'),
      createCanvasElement:
        typeof document === 'undefined'
          ? undefined
          : () => document.createElement('canvas'),
      requestAnimationFrame:
        typeof requestAnimationFrame === 'undefined'
          ? undefined
          : (callback) => requestAnimationFrame(callback),
      cancelAnimationFrame:
        typeof cancelAnimationFrame === 'undefined'
          ? undefined
          : (handle) => cancelAnimationFrame(handle),
    }),
  });

const VIDEO_STORAGE_KEY = 'skriin_media_input_video_device_id';

const INITIAL_STATE: MediaInputState = {
  status: 'idle',
  permission: 'idle',
  videoInputs: [],
  audioInputs: [],
  selection: {
    videoDeviceId: null,
  },
  consoleSelection: {
    overlayVideoDeviceId: null,
    gameAudioDeviceId: null,
    microphoneDeviceId: null,
  },
  error: null,
};

const INITIAL_PREVIEW_STATE: MediaPreviewState = {
  status: 'idle',
  stream: null,
  error: null,
  overlayStream: null,
  videoSettings: null,
  overlayVideoSettings: null,
};

const INITIAL_AUDIO_MIX_STATE: AudioMixState = {
  gameLevel: 0.625,
  gameMuted: false,
  microphoneLevel: 1,
  microphoneMuted: false,
};

const INITIAL_AUDIO_METER_STATE: AudioMeterState = {
  game: -60,
  microphone: -60,
  output: -60,
};

const PERMISSION_DENIAL_ERRORS = new Set([
  'NotAllowedError',
  'SecurityError',
]);
const DEVICE_BUSY_ERRORS = new Set(['NotReadableError', 'TrackStartError']);
const DEVICE_REMOVED_ERRORS = new Set([
  'NotFoundError',
  'DevicesNotFoundError',
  'AbortError',
]);

@Injectable({ providedIn: 'root' })
export class MediaInputService implements OnDestroy {
  private readonly stateSubject = new BehaviorSubject<MediaInputState>(
    INITIAL_STATE,
  );
  private readonly previewSubject = new BehaviorSubject<MediaPreviewState>(
    INITIAL_PREVIEW_STATE,
  );
  private readonly audioMixSubject = new BehaviorSubject<AudioMixState>(
    INITIAL_AUDIO_MIX_STATE,
  );
  private readonly audioMeterSubject = new BehaviorSubject<AudioMeterState>(
    INITIAL_AUDIO_METER_STATE,
  );
  private readonly isBrowser: boolean;
  private listeningForDeviceChanges = false;
  private destroyed = false;
  private previewRequestId = 0;
  private ownedSourceStreams: MediaStream[] = [];
  private primaryVideoStream: MediaStream | null = null;
  private pendingPreviousPrimaryVideoStream: MediaStream | null = null;
  private overlayVideoStream: MediaStream | null = null;
  private gameAudioStream: MediaStream | null = null;
  private microphoneAudioStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private gameSourceNode: MediaStreamAudioSourceNode | null = null;
  private microphoneSourceNode: MediaStreamAudioSourceNode | null = null;
  private gameAudioChannel: AudioMixerChannelNodes | null = null;
  private microphoneAudioChannel: AudioMixerChannelNodes | null = null;
  private mixLimiterNode: DynamicsCompressorNode | null = null;
  private mixAnalyserNode: AnalyserNode | null = null;
  private meterAnimationFrame: number | null = null;
  private audioDestination: MediaStreamAudioDestinationNode | null = null;
  private videoCompositor: VideoCompositorSession | null = null;
  private readonly disabledConsoleSelections = new Set<
    keyof ConsoleInputSelection
  >();
  private readonly trackListeners = new Map<
    MediaStreamTrack,
    { ended: EventListener }
  >();

  readonly state$ = this.stateSubject.asObservable();
  readonly preview$ = this.previewSubject.asObservable();
  readonly audioMix$ = this.audioMixSubject.asObservable();
  readonly audioMeter$ = this.audioMeterSubject.asObservable();

  private readonly handleDeviceChange = async (): Promise<void> => {
    const previousSelection = this.snapshot.selection;
    const previousConsoleSelection = this.snapshot.consoleSelection;
    await this.refreshDevices();
    if (this.destroyed || !this.previewSnapshot.stream) return;

    const videoRemoved = this.isMissingDevice(
      this.snapshot.videoInputs,
      previousSelection.videoDeviceId,
    );
    const secondaryVideoRemoved = this.isMissingDevice(
      this.snapshot.videoInputs,
      previousConsoleSelection.overlayVideoDeviceId,
    );
    const selectedAudioRemoved = [
      previousConsoleSelection.gameAudioDeviceId,
      previousConsoleSelection.microphoneDeviceId,
    ].some((deviceId) =>
      this.isMissingDevice(this.snapshot.audioInputs, deviceId),
    );
    if (!videoRemoved && !secondaryVideoRemoved && !selectedAudioRemoved) return;

    void this.releaseCaptureSession().catch(() => undefined);
    this.publishPreviewError(
      'device-removed',
      'A selected media input was disconnected. Review the available inputs and retry.',
      null,
    );
  };

  constructor(
    @Inject(PLATFORM_ID) platformId: object,
    @Inject(MEDIA_INPUT_ENVIRONMENT)
    private readonly environment: MediaInputEnvironment,
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  get snapshot(): MediaInputState {
    return this.stateSubject.value;
  }

  get previewSnapshot(): MediaPreviewState {
    return this.previewSubject.value;
  }

  get audioMixSnapshot(): AudioMixState {
    return this.audioMixSubject.value;
  }

  async initialize(): Promise<void> {
    if (!this.canUseMediaDevices()) {
      this.publishUnavailable();
      return;
    }

    if (!this.listeningForDeviceChanges) {
      this.environment.mediaDevices!.addEventListener(
        'devicechange',
        this.handleDeviceChange,
      );
      this.listeningForDeviceChanges = true;
    }
    this.patchState({
      status: 'loading',
      permission: 'requesting',
      error: null,
    });

    const permissionResults = await Promise.allSettled([
      this.requestPermission({ video: true, audio: false }),
      this.requestPermission({ video: false, audio: true }),
    ]);
    const granted = permissionResults.some(
      (result) => result.status === 'fulfilled',
    );
    const denied = permissionResults.some(
      (result) =>
        result.status === 'rejected' &&
        this.isPermissionDenial(result.reason),
    );

    if (granted) {
      this.patchState({ permission: 'granted' });
      await this.refreshDevices();
      return;
    }

    if (denied) {
      this.publishError(
        'permission-denied',
        'Camera and microphone access was denied. Allow access and try again.',
        'denied',
      );
      return;
    }

    await this.refreshDevices();
  }

  async refreshDevices(): Promise<void> {
    if (!this.canUseMediaDevices() || this.destroyed) {
      if (!this.destroyed) {
        this.publishUnavailable();
      }
      return;
    }

    try {
      const devices = await this.environment.mediaDevices!.enumerateDevices();
      const videoInputs = this.toInputDevices(devices, 'videoinput');
      const audioInputs = this.toInputDevices(devices, 'audioinput');
      let storedVideoDeviceId: string | null = null;
      try {
        storedVideoDeviceId =
          this.environment.storage?.getItem(VIDEO_STORAGE_KEY) ?? null;
      } catch {
        // Fall back to the current or first device when storage is unavailable.
      }
      const currentVideoDeviceId = this.snapshot.selection.videoDeviceId;
      const availableVideoIds = new Set(
        videoInputs.map(({ deviceId }) => deviceId),
      );
      const videoDeviceId =
        (storedVideoDeviceId && availableVideoIds.has(storedVideoDeviceId)
          ? storedVideoDeviceId
          : null) ??
        (currentVideoDeviceId && availableVideoIds.has(currentVideoDeviceId)
          ? currentVideoDeviceId
          : null) ??
        videoInputs[0]?.deviceId ??
        null;
      this.persistSelection(VIDEO_STORAGE_KEY, videoDeviceId);
      const selection: MediaInputSelection = { videoDeviceId };
      const consoleSelection = this.reconcileConsoleSelection(
        selection.videoDeviceId,
        videoInputs,
        audioInputs,
      );
      this.patchState({
        status: 'ready',
        videoInputs,
        audioInputs,
        selection,
        consoleSelection,
        error: null,
      });
    } catch {
      this.publishError(
        'enumeration-failed',
        'Media inputs could not be listed. Check the devices and try again.',
        this.snapshot.permission,
      );
    }
  }

  selectVideo(deviceId: string | null): void {
    if (
      deviceId !== null &&
      !this.hasDevice(this.snapshot.videoInputs, deviceId)
    ) {
      return;
    }
    const selection = {
      ...this.snapshot.selection,
      videoDeviceId: deviceId,
    };
    this.patchState({
      selection,
      consoleSelection: this.reconcileConsoleSelection(
        deviceId,
        this.snapshot.videoInputs,
        this.snapshot.audioInputs,
      ),
    });
    this.persistSelection(VIDEO_STORAGE_KEY, deviceId);
  }

  selectOverlayVideo(deviceId: string | null): void {
    this.selectConsoleDevice(
      'overlayVideoDeviceId',
      deviceId,
      this.excludeDevice(
        this.snapshot.videoInputs,
        this.snapshot.selection.videoDeviceId,
      ),
    );
  }

  selectGameAudio(deviceId: string | null): void {
    this.selectAudioDevice(
      'gameAudioDeviceId',
      deviceId,
      'microphoneDeviceId',
    );
  }

  selectMicrophone(deviceId: string | null): void {
    this.selectAudioDevice(
      'microphoneDeviceId',
      deviceId,
      'gameAudioDeviceId',
    );
  }

  setGameLevel(level: number): void {
    this.setAudioLevel('game', level);
  }

  setGameMuted(gameMuted: boolean): void {
    this.setAudioMuted('game', gameMuted);
  }

  setMicrophoneLevel(level: number): void {
    this.setAudioLevel('microphone', level);
  }

  setMicrophoneMuted(microphoneMuted: boolean): void {
    this.setAudioMuted('microphone', microphoneMuted);
  }

  swapSources(): void {
    const primaryVideoDeviceId = this.snapshot.selection.videoDeviceId;
    const overlayVideoDeviceId =
      this.snapshot.consoleSelection.overlayVideoDeviceId;
    if (!primaryVideoDeviceId || !overlayVideoDeviceId) {
      return;
    }

    this.patchState({
      selection: {
        ...this.snapshot.selection,
        videoDeviceId: overlayVideoDeviceId,
      },
      consoleSelection: {
        overlayVideoDeviceId: primaryVideoDeviceId,
        gameAudioDeviceId:
          this.snapshot.consoleSelection.microphoneDeviceId,
        microphoneDeviceId:
          this.snapshot.consoleSelection.gameAudioDeviceId,
      },
    });
    this.patchAudioMix({
      gameLevel: this.audioMixSnapshot.microphoneLevel,
      gameMuted: this.audioMixSnapshot.microphoneMuted,
      microphoneLevel: this.audioMixSnapshot.gameLevel,
      microphoneMuted: this.audioMixSnapshot.gameMuted,
    });
    const gameAudioDisabled = this.disabledConsoleSelections.has(
      'gameAudioDeviceId',
    );
    const microphoneDisabled = this.disabledConsoleSelections.has(
      'microphoneDeviceId',
    );
    this.disabledConsoleSelections.delete('gameAudioDeviceId');
    this.disabledConsoleSelections.delete('microphoneDeviceId');
    if (gameAudioDisabled) {
      this.disabledConsoleSelections.add('microphoneDeviceId');
    }
    if (microphoneDisabled) {
      this.disabledConsoleSelections.add('gameAudioDeviceId');
    }
    this.persistSelection(VIDEO_STORAGE_KEY, overlayVideoDeviceId);
  }

  async resumeAudioContext(): Promise<void> {
    if (this.audioContext?.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  async startPreview(): Promise<MediaStream | null> {
    const requestId = ++this.previewRequestId;
    if (!this.canUseMediaDevices() || !this.environment.createMediaStream) {
      this.publishPreviewError(
        'devices-unavailable',
        'Media preview is unavailable in this browser or rendering environment.',
      );
      return null;
    }

    const { videoDeviceId } = this.snapshot.selection;
    if (!videoDeviceId) {
      this.publishPreviewError(
        'missing-video-input',
        'Connect or select a video input to start the preview.',
      );
      return null;
    }

    this.patchPreview({
      status: 'loading',
      error: null,
    });

    await this.releaseCaptureSession();
    const acquiredStreams: MediaStream[] = [];
    try {
      const videoCapture = await acquirePrimaryVideo(
        this.environment.mediaDevices!,
        videoDeviceId,
      );
      if (
        !this.retainPreviewAcquisition(
          requestId,
          acquiredStreams,
          videoCapture.stream,
        )
      ) {
        return this.previewSnapshot.stream;
      }

      const consoleSelection = this.snapshot.consoleSelection;
      const overlayCapture = await acquireOverlayVideo(
        this.environment.mediaDevices!,
        consoleSelection.overlayVideoDeviceId,
        videoDeviceId,
      );
      const overlayStream = overlayCapture?.stream ?? null;
      if (
        !this.retainPreviewAcquisition(
          requestId,
          acquiredStreams,
          overlayStream,
        )
      ) {
        return this.previewSnapshot.stream;
      }

      const gameStream = await this.acquireOptionalAudio(
        consoleSelection.gameAudioDeviceId,
      );
      if (
        !this.retainPreviewAcquisition(
          requestId,
          acquiredStreams,
          gameStream,
        )
      ) {
        return this.previewSnapshot.stream;
      }

      const microphoneStream = await this.acquireOptionalAudio(
        consoleSelection.microphoneDeviceId,
        true,
      );
      if (
        !this.retainPreviewAcquisition(
          requestId,
          acquiredStreams,
          microphoneStream,
        )
      ) {
        return this.previewSnapshot.stream;
      }
      let publishAudioTrack: MediaStreamTrack | undefined;
      if (gameStream || microphoneStream) {
        if (!this.environment.createAudioContext) {
          throw new Error('Web Audio is unavailable.');
        }
        this.audioContext = this.environment.createAudioContext();
        this.audioDestination = this.audioContext.createMediaStreamDestination();
        this.connectAudioSources(gameStream, microphoneStream);
        publishAudioTrack = this.audioDestination.stream.getAudioTracks()[0];
      }

      const publishVideoTrack = this.createCompositedVideoTrack(
        videoCapture.stream,
        overlayStream,
        videoCapture.settings,
      );
      const publishTracks = [
        ...(publishVideoTrack ? [publishVideoTrack] : []),
        ...(publishAudioTrack ? [publishAudioTrack] : []),
      ];
      const nextStream = this.environment.createMediaStream(publishTracks);
      if (!this.retainPreviewAcquisition(requestId, acquiredStreams, null)) {
        return this.previewSnapshot.stream;
      }
      this.ownedSourceStreams = acquiredStreams;
      this.primaryVideoStream = videoCapture.stream;
      this.overlayVideoStream = overlayStream;
      this.gameAudioStream = gameStream;
      this.microphoneAudioStream = microphoneStream;
      this.previewSubject.next({
        status: 'ready',
        stream: nextStream,
        error: null,
        overlayStream,
        videoSettings: videoCapture.settings,
        overlayVideoSettings: overlayCapture?.settings ?? null,
      });
      this.attachTrackListeners(nextStream);
      this.attachTrackListeners(videoCapture.stream);
      if (overlayStream) this.attachTrackListeners(overlayStream);
      return nextStream;
    } catch (error: unknown) {
      this.stopStreams(acquiredStreams);
      if (requestId !== this.previewRequestId) {
        return this.previewSnapshot.stream;
      }
      await this.closeAudioGraph();
      const name = this.errorName(error);
      const captureError = this.isPermissionDenial(error)
        ? this.createError(
            'permission-denied',
            'Camera or microphone access is blocked. Allow access and retry.',
          )
        : DEVICE_BUSY_ERRORS.has(name)
          ? this.createError(
              'device-busy',
              'The selected input is busy or could not be started. Close other apps using it and retry.',
            )
          : DEVICE_REMOVED_ERRORS.has(name)
            ? this.createError(
                'device-removed',
                'The selected input is no longer available. Reconnect it or choose another input.',
              )
            : isConstraintFailure(error)
              ? this.createError(
                  'unsupported-constraints',
                  'The selected input does not support a browser-compatible capture format.',
                )
              : this.createError(
                  'preview-failed',
                  'The selected media inputs could not be opened. Choose another input or retry.',
                );
      this.publishPreviewError(captureError.code, captureError.message, null);
      return null;
    }
  }

  async refreshPrimaryVideo(): Promise<MediaStream | null> {
    const deviceId = this.snapshot.selection.videoDeviceId;
    if (!deviceId || !this.environment.createMediaStream) return null;

    const capture = await acquirePrimaryVideo(
      this.environment.mediaDevices!,
      deviceId,
    );
    const previous = this.primaryVideoStream;
    this.primaryVideoStream = capture.stream;
    this.ownedSourceStreams.push(capture.stream);
    this.pendingPreviousPrimaryVideoStream = previous;
    this.videoCompositor?.setPrimary(capture.stream);

    const audioTrack = this.activeMixerTrack();
    const stream = this.environment.createMediaStream([
      ...(this.videoCompositor?.track
        ? [this.videoCompositor.track]
        : capture.stream.getVideoTracks()),
      ...(audioTrack ? [audioTrack] : []),
    ]);
    this.patchPreview({
      status: 'ready',
      stream,
      error: null,
      videoSettings: capture.settings,
    });
    this.attachTrackListeners(stream);
    this.attachTrackListeners(capture.stream);
    return stream;
  }

  commitPrimaryVideoRefresh(): void {
    const previous = this.pendingPreviousPrimaryVideoStream;
    this.pendingPreviousPrimaryVideoStream = null;
    if (!previous || previous === this.primaryVideoStream) return;
    this.ownedSourceStreams = this.ownedSourceStreams.filter(
      (stream) => stream !== previous,
    );
    this.stopStream(previous);
  }

  async refreshOverlayVideo(): Promise<MediaStream | null> {
    const deviceId = this.snapshot.consoleSelection.overlayVideoDeviceId;
    const capture = await acquireOverlayVideo(
      this.environment.mediaDevices!,
      deviceId,
      this.snapshot.selection.videoDeviceId,
    );
    const next = capture?.stream ?? null;
    const previous = this.overlayVideoStream;
    this.overlayVideoStream = next;
    this.replaceSourceStream(previous, next);
    this.videoCompositor?.setOverlay(next);
    this.patchPreview({
      overlayStream: next,
      overlayVideoSettings: capture?.settings ?? null,
      error: null,
    });
    if (next) this.attachTrackListeners(next);
    return next;
  }

  async refreshAudioSources(): Promise<void> {
    const selection = this.snapshot.consoleSelection;
    const nextGame = await this.acquireOptionalAudio(
      selection.gameAudioDeviceId,
    );
    let nextMicrophone: MediaStream | null = null;
    try {
      nextMicrophone = await this.acquireOptionalAudio(
        selection.microphoneDeviceId,
        true,
      );
    } catch (error) {
      this.stopStream(nextGame);
      throw error;
    }

    if ((nextGame || nextMicrophone) && !this.audioContext) {
      if (!this.environment.createAudioContext) {
        this.stopStream(nextGame);
        this.stopStream(nextMicrophone);
        throw new Error('Web Audio is unavailable.');
      }
      this.audioContext = this.environment.createAudioContext();
      this.audioDestination = this.audioContext.createMediaStreamDestination();
    }
    this.disconnectAudioSources();
    const previousGame = this.gameAudioStream;
    const previousMicrophone = this.microphoneAudioStream;
    this.gameAudioStream = nextGame;
    this.microphoneAudioStream = nextMicrophone;
    this.replaceSourceStream(previousGame, nextGame);
    this.replaceSourceStream(previousMicrophone, nextMicrophone);
    this.connectAudioSources(nextGame, nextMicrophone);
    this.refreshPublishedPreviewStream();
  }

  stopPreview(): void {
    this.previewRequestId += 1;
    void this.releaseCaptureSession().catch(() => undefined);
    this.previewSubject.next(INITIAL_PREVIEW_STATE);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.stopPreview();
    if (this.listeningForDeviceChanges) {
      this.environment.mediaDevices?.removeEventListener(
        'devicechange',
        this.handleDeviceChange,
      );
      this.listeningForDeviceChanges = false;
    }
    this.stateSubject.complete();
    this.previewSubject.complete();
    this.audioMixSubject.complete();
    this.audioMeterSubject.complete();
  }

  private canUseMediaDevices(): boolean {
    const mediaDevices = this.environment.mediaDevices;
    return (
      this.isBrowser &&
      !!mediaDevices &&
      typeof mediaDevices.getUserMedia === 'function' &&
      typeof mediaDevices.enumerateDevices === 'function'
    );
  }

  private toInputDevices(
    devices: MediaDeviceInfo[],
    kind: 'videoinput' | 'audioinput',
  ): MediaInputDevice[] {
    return devices
      .filter((device) => device.kind === kind && device.deviceId !== '')
      .map(projectMediaInputDevice)
      .filter((device): device is MediaInputDevice => device !== null);
  }

  private reconcileConsoleSelection(
    primaryVideoDeviceId: string | null,
    videoInputs: readonly MediaInputDevice[],
    audioInputs: readonly MediaInputDevice[],
  ): ConsoleInputSelection {
    const current = this.snapshot.consoleSelection;
    const primary = videoInputs.find(
      ({ deviceId }) => deviceId === primaryVideoDeviceId,
    );
    const overlayCandidates = this.excludeDevice(
      videoInputs,
      primaryVideoDeviceId,
    );
    const mainAudio = primary?.groupId
      ? audioInputs.find(({ groupId }) => groupId === primary.groupId)
      : undefined;
    const selectedMainAudio = mainAudio ?? audioInputs[0];
    const primaryChanged =
      primaryVideoDeviceId !== this.snapshot.selection.videoDeviceId;
    const overlayVideoDeviceId = this.keepOrDefault(
      current.overlayVideoDeviceId,
      overlayCandidates,
    );
    const overlay = videoInputs.find(
      ({ deviceId }) => deviceId === overlayVideoDeviceId,
    );
    const groupedFacecamAudio = overlay?.groupId
      ? audioInputs.find(
          ({ deviceId, groupId }) =>
            groupId === overlay.groupId &&
            deviceId !== selectedMainAudio?.deviceId,
        )
      : undefined;
    const gameAudioDeviceId = this.keepOrDefault(
      primaryChanged ? null : current.gameAudioDeviceId,
      audioInputs,
      selectedMainAudio?.deviceId ?? null,
    );
    const facecamAudioCandidates = this.excludeDevice(
      audioInputs,
      gameAudioDeviceId,
    );
    const microphoneDisabled = this.disabledConsoleSelections.has(
      'microphoneDeviceId',
    );

    return {
      overlayVideoDeviceId: this.enabledSelection(
        'overlayVideoDeviceId',
        overlayVideoDeviceId,
      ),
      gameAudioDeviceId: this.enabledSelection(
        'gameAudioDeviceId',
        gameAudioDeviceId,
      ),
      microphoneDeviceId: this.keepOrDefault(
        microphoneDisabled || primaryChanged
          ? null
          : current.microphoneDeviceId,
        microphoneDisabled ? [] : facecamAudioCandidates,
        microphoneDisabled
          ? null
          : groupedFacecamAudio?.deviceId ??
              facecamAudioCandidates[0]?.deviceId ??
              null,
      ),
    };
  }

  private keepOrDefault(
    currentId: string | null,
    devices: readonly MediaInputDevice[],
    preferredId: string | null = devices[0]?.deviceId ?? null,
  ): string | null {
    return this.hasDevice(devices, currentId)
      ? currentId
      : preferredId;
  }

  private selectConsoleDevice(
    key: keyof ConsoleInputSelection,
    deviceId: string | null,
    devices: readonly MediaInputDevice[],
  ): void {
    if (
      deviceId !== null &&
      !this.hasDevice(devices, deviceId)
    ) {
      return;
    }
    if (deviceId === null) {
      this.disabledConsoleSelections.add(key);
    } else {
      this.disabledConsoleSelections.delete(key);
    }
    this.patchState({
      consoleSelection: {
        ...this.snapshot.consoleSelection,
        [key]: deviceId,
      },
    });
  }

  private enabledSelection(
    key: keyof ConsoleInputSelection,
    deviceId: string | null,
  ): string | null {
    return this.disabledConsoleSelections.has(key) ? null : deviceId;
  }

  private selectAudioDevice(
    key: 'gameAudioDeviceId' | 'microphoneDeviceId',
    deviceId: string | null,
    excludedKey: 'gameAudioDeviceId' | 'microphoneDeviceId',
  ): void {
    this.selectConsoleDevice(
      key,
      deviceId,
      this.excludeDevice(
        this.snapshot.audioInputs,
        this.snapshot.consoleSelection[excludedKey],
      ),
    );
  }

  private excludeDevice(
    devices: readonly MediaInputDevice[],
    excludedDeviceId: string | null,
  ): MediaInputDevice[] {
    return devices.filter(({ deviceId }) => deviceId !== excludedDeviceId);
  }

  private hasDevice(
    devices: readonly MediaInputDevice[],
    deviceId: string | null,
  ): deviceId is string {
    return (
      deviceId !== null &&
      devices.some((device) => device.deviceId === deviceId)
    );
  }

  private isMissingDevice(
    devices: readonly MediaInputDevice[],
    deviceId: string | null,
  ): boolean {
    return deviceId !== null && !this.hasDevice(devices, deviceId);
  }

  private persistSelection(key: string, deviceId: string | null): void {
    try {
      if (deviceId) {
        this.environment.storage?.setItem(key, deviceId);
      } else {
        this.environment.storage?.removeItem(key);
      }
    } catch {
      // Selection still works for this session when storage is unavailable.
    }
  }

  private isPermissionDenial(error: unknown): boolean {
    return PERMISSION_DENIAL_ERRORS.has(this.errorName(error));
  }

  private acquireOptionalAudio(
    deviceId: string | null,
    microphone = false,
  ): Promise<MediaStream | null> {
    return deviceId
      ? this.environment.mediaDevices!.getUserMedia({
          video: false,
          audio: {
            deviceId: { exact: deviceId },
            ...(microphone
              ? {}
              : {
                  echoCancellation: false,
                  noiseSuppression: false,
                  autoGainControl: false,
                }),
          },
        })
      : Promise.resolve(null);
  }

  private connectAudioSources(
    gameStream: MediaStream | null,
    microphoneStream: MediaStream | null,
  ): void {
    if (!this.audioContext || !this.audioDestination) return;
    this.gameSourceNode = this.createAudioSourceNode(gameStream);
    this.microphoneSourceNode = this.createAudioSourceNode(microphoneStream);
    const gains = connectAudioMixer(
      this.audioContext,
      this.audioDestination,
      {
        game: this.gameSourceNode,
        microphone: this.microphoneSourceNode,
      },
      this.audioMixSnapshot,
      this.audioContext.destination,
    );
    this.gameAudioChannel = gains.game;
    this.microphoneAudioChannel = gains.microphone;
    this.mixLimiterNode = gains.limiter ?? null;
    this.mixAnalyserNode = gains.outputAnalyser ?? null;
    this.startAudioMeters();
  }

  private createAudioSourceNode(
    stream: MediaStream | null,
  ): MediaStreamAudioSourceNode | null {
    return stream?.getAudioTracks().length
      ? this.audioContext!.createMediaStreamSource(stream)
      : null;
  }

  private disconnectAudioSources(): void {
    this.stopAudioMeters();
    [
      this.gameSourceNode,
      this.microphoneSourceNode,
      this.gameAudioChannel?.level,
      this.gameAudioChannel?.analyser,
      this.gameAudioChannel?.mute,
      this.microphoneAudioChannel?.level,
      this.microphoneAudioChannel?.analyser,
      this.microphoneAudioChannel?.mute,
      this.mixLimiterNode,
      this.mixAnalyserNode,
    ].forEach((node) => {
      try {
        node?.disconnect();
      } catch {
        // A disconnected node is already safe to replace.
      }
    });
    this.gameSourceNode = null;
    this.microphoneSourceNode = null;
    this.gameAudioChannel = null;
    this.microphoneAudioChannel = null;
    this.mixLimiterNode = null;
    this.mixAnalyserNode = null;
  }

  private startAudioMeters(): void {
    const requestFrame = this.environment.requestAnimationFrame;
    if (!requestFrame || (!this.gameAudioChannel && !this.microphoneAudioChannel)) {
      return;
    }
    const sample = (): void => {
      this.audioMeterSubject.next({
        game: this.readAudioLoudness(this.gameAudioChannel?.analyser ?? null),
        microphone: this.readAudioLoudness(
          this.microphoneAudioChannel?.analyser ?? null,
        ),
        output: this.readAudioLoudness(this.mixAnalyserNode),
      });
      this.meterAnimationFrame = requestFrame(sample);
    };
    this.meterAnimationFrame = requestFrame(sample);
  }

  private stopAudioMeters(): void {
    if (this.meterAnimationFrame !== null) {
      this.environment.cancelAnimationFrame?.(this.meterAnimationFrame);
      this.meterAnimationFrame = null;
    }
    this.audioMeterSubject.next(INITIAL_AUDIO_METER_STATE);
  }

  private readAudioLoudness(analyser: AnalyserNode | null): number {
    if (!analyser) return -60;
    const samples = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(samples);
    let sum = 0;
    samples.forEach((sample) => {
      const normalized = (sample - 128) / 128;
      sum += normalized * normalized;
    });
    const rms = Math.sqrt(sum / samples.length);
    return rms > 0 ? Math.max(-60, 20 * Math.log10(rms)) : -60;
  }

  private setAudioLevel(channel: AudioChannel, level: number): void {
    this.patchAudioMix({
      [`${channel}Level`]: Number.isFinite(level)
        ? Math.min(1, Math.max(0, level))
        : 0,
    } as Partial<AudioMixState>);
  }

  private setAudioMuted(channel: AudioChannel, muted: boolean): void {
    this.patchAudioMix({
      [`${channel}Muted`]: muted,
    } as Partial<AudioMixState>);
  }

  private patchAudioMix(patch: Partial<AudioMixState>): void {
    this.audioMixSubject.next({ ...this.audioMixSnapshot, ...patch });
    if (this.audioContext) {
      applyAudioMixState(
        this.audioContext,
        { game: this.gameAudioChannel, microphone: this.microphoneAudioChannel },
        this.audioMixSnapshot,
        true,
      );
    }
  }

  private async releaseCaptureSession(): Promise<void> {
    const streams = [
      this.previewSnapshot.stream,
      this.previewSnapshot.overlayStream ?? null,
      ...this.ownedSourceStreams,
    ];
    this.ownedSourceStreams = [];
    this.primaryVideoStream = null;
    this.pendingPreviousPrimaryVideoStream = null;
    this.overlayVideoStream = null;
    this.gameAudioStream = null;
    this.microphoneAudioStream = null;
    this.stopTracks(
      new Set(streams.flatMap((stream) => stream?.getTracks() ?? [])),
    );
    this.videoCompositor?.dispose();
    this.videoCompositor = null;
    await this.closeAudioGraph();
  }

  private createCompositedVideoTrack(
    primary: MediaStream,
    overlay: MediaStream | null,
    settings: NegotiatedVideoSettings,
  ): MediaStreamTrack | null {
    const environment = this.environment;
    if (
      !environment.createVideoElement ||
      !environment.createCanvasElement ||
      !environment.requestAnimationFrame ||
      !environment.cancelAnimationFrame
    ) {
      return primary.getVideoTracks()[0] ?? null;
    }
    this.videoCompositor = createVideoCompositor(
      {
        createVideoElement: environment.createVideoElement,
        createCanvasElement: environment.createCanvasElement,
        requestAnimationFrame: environment.requestAnimationFrame,
        cancelAnimationFrame: environment.cancelAnimationFrame,
      },
      primary,
      overlay,
      settings,
    );
    return this.videoCompositor?.track ?? primary.getVideoTracks()[0] ?? null;
  }

  private async closeAudioGraph(): Promise<void> {
    const context = this.audioContext;
    const destination = this.audioDestination;
    this.disconnectAudioSources();
    this.stopStream(destination?.stream ?? null);
    this.audioContext = null;
    this.audioDestination = null;
    if (context && context.state !== 'closed') {
      try {
        await context.close();
      } catch {
        // Tracks and graph references are already released locally.
      }
    }
  }

  private replaceSourceStream(
    previous: MediaStream | null,
    next: MediaStream | null,
  ): void {
    this.ownedSourceStreams = this.ownedSourceStreams.filter(
      (stream) => stream !== previous,
    );
    if (next) this.ownedSourceStreams.push(next);
    this.stopStream(previous);
  }

  private refreshPublishedPreviewStream(): void {
    if (!this.previewSnapshot.stream || !this.environment.createMediaStream) {
      return;
    }
    const videoTracks = this.previewSnapshot.stream.getVideoTracks();
    const audioTrack = this.activeMixerTrack();
    const stream = this.environment.createMediaStream([
      ...videoTracks,
      ...(audioTrack ? [audioTrack] : []),
    ]);
    this.patchPreview({ stream });
    this.attachTrackListeners(stream);
  }

  private activeMixerTrack(): MediaStreamTrack | undefined {
    const { gameAudioDeviceId, microphoneDeviceId } =
      this.snapshot.consoleSelection;
    if (!gameAudioDeviceId && !microphoneDeviceId) return undefined;
    return this.audioDestination?.stream.getAudioTracks()[0];
  }

  private errorName(error: unknown): string {
    return typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      typeof error.name === 'string'
      ? error.name
      : '';
  }

  private async requestPermission(
    constraints: MediaStreamConstraints,
  ): Promise<void> {
    let stream: MediaStream | undefined;
    try {
      stream = await this.environment.mediaDevices!.getUserMedia(constraints);
    } finally {
      this.stopStream(stream ?? null);
    }
  }

  private publishUnavailable(): void {
    this.stateSubject.next({
      ...INITIAL_STATE,
      status: 'unavailable',
      permission: 'unavailable',
      error: this.createError(
        'devices-unavailable',
        'Media inputs are unavailable in this browser or rendering environment.',
      ),
    });
  }

  private publishError(
    code: MediaInputError['code'],
    message: string,
    permission: MediaInputState['permission'],
  ): void {
    this.patchState({
      status: 'error',
      permission,
      error: this.createError(code, message),
    });
  }

  private createError(
    code: MediaInputError['code'],
    message: string,
  ): MediaInputError {
    return { code, message, recoverable: true };
  }

  private publishPreviewError(
    code: MediaInputError['code'],
    message: string,
    stream: MediaStream | null = this.previewSnapshot.stream,
  ): void {
    this.patchPreview({
      status: 'error',
      stream,
      error: this.createError(code, message),
    });
  }

  private retainPreviewAcquisition(
    requestId: number,
    acquiredStreams: MediaStream[],
    stream: MediaStream | null,
  ): boolean {
    if (stream) acquiredStreams.push(stream);
    if (requestId === this.previewRequestId) return true;
    this.stopStreams(acquiredStreams);
    return false;
  }

  private stopStreams(streams: Iterable<MediaStream | null>): void {
    for (const stream of streams) this.stopStream(stream);
  }

  private stopStream(stream: MediaStream | null): void {
    this.stopTracks(stream?.getTracks() ?? []);
  }

  private stopTracks(tracks: Iterable<MediaStreamTrack>): void {
    for (const track of tracks) {
      const listeners = this.trackListeners.get(track);
      if (listeners && typeof track.removeEventListener === 'function') {
        track.removeEventListener('ended', listeners.ended);
        this.trackListeners.delete(track);
      }
      track.stop();
    }
  }

  private attachTrackListeners(stream: MediaStream): void {
    stream.getTracks().forEach((track) => {
      if (
        typeof track.addEventListener !== 'function' ||
        this.trackListeners.has(track)
      ) {
        return;
      }

      const ended: EventListener = () => {
        const isActive = [
          this.previewSnapshot.stream,
          this.previewSnapshot.overlayStream ?? null,
          this.primaryVideoStream,
          this.overlayVideoStream,
          this.gameAudioStream,
          this.microphoneAudioStream,
        ].some((stream) => stream?.getTracks().includes(track));
        if (!isActive) {
          return;
        }
        void this.releaseCaptureSession().catch(() => undefined);
        this.publishPreviewError(
          'device-removed',
          'A selected media input stopped unexpectedly. Reconnect it or choose another input, then retry.',
          null,
        );
      };
      track.addEventListener('ended', ended);

      this.trackListeners.set(track, { ended });
    });
  }

  private patchState(patch: Partial<MediaInputState>): void {
    this.stateSubject.next({ ...this.snapshot, ...patch });
  }

  private patchPreview(patch: Partial<MediaPreviewState>): void {
    this.previewSubject.next({ ...this.previewSnapshot, ...patch });
  }
}
