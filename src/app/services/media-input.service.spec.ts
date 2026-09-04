import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  MEDIA_INPUT_ENVIRONMENT,
  MediaInputEnvironment,
  MediaInputService,
} from './media-input.service';

const VIDEO_KEY = 'skriin_media_input_video_device_id';

function device(
  kind: MediaDeviceKind,
  deviceId: string,
  label: string,
  groupId = `${deviceId}-group`,
): MediaDeviceInfo {
  return {
    deviceId,
    groupId,
    kind,
    label,
    toJSON: () => ({}),
  };
}

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

class FakeMediaDevices extends EventTarget {
  devices: MediaDeviceInfo[] = [];
  readonly stopTrack = jasmine.createSpy('stop');
  readonly getUserMedia = jasmine
    .createSpy('getUserMedia')
    .and.callFake(async (): Promise<MediaStream> => {
      return {
        getTracks: () => [{ stop: this.stopTrack }],
      } as unknown as MediaStream;
    });
  readonly enumerateDevices = jasmine
    .createSpy('enumerateDevices')
    .and.callFake(async (): Promise<MediaDeviceInfo[]> => this.devices);
}

function track(
  kind: 'audio' | 'video',
  settings: MediaTrackSettings = {},
): MediaStreamTrack {
  const mediaTrack = new EventTarget();
  Object.defineProperties(mediaTrack, {
    kind: { value: kind },
    readyState: { value: 'live', configurable: true },
    stop: { value: jasmine.createSpy(`${kind} track stop`) },
    getSettings: { value: () => settings },
  });
  return mediaTrack as unknown as MediaStreamTrack;
}

class FakeAudioNode {
  readonly connect = jasmine.createSpy('connect');
  readonly disconnect = jasmine.createSpy('disconnect');
}

class FakeGainNode extends FakeAudioNode {
  readonly gain = {
    value: 0,
    cancelScheduledValues: jasmine.createSpy('cancelScheduledValues'),
    setTargetAtTime: jasmine.createSpy('setTargetAtTime'),
  };
}

class FakeAnalyserNode extends FakeAudioNode {
  fftSize = 2048;
  smoothingTimeConstant = 0;
  getByteTimeDomainData(samples: Uint8Array): void {
    samples.fill(128);
  }
}

class FakeCompressorNode extends FakeAudioNode {
  readonly threshold = { value: 0 };
  readonly knee = { value: 0 };
  readonly ratio = { value: 0 };
  readonly attack = { value: 0 };
  readonly release = { value: 0 };
}

class FakeAudioContext {
  state: AudioContextState = 'suspended';
  currentTime = 1;
  readonly destinationTrack = track('audio');
  readonly gains: FakeGainNode[] = [];
  readonly sources: FakeAudioNode[] = [];
  readonly close = jasmine.createSpy('close').and.callFake(async () => {
    this.state = 'closed';
  });
  readonly resume = jasmine.createSpy('resume').and.callFake(async () => {
    this.state = 'running';
  });

  createMediaStreamDestination(): MediaStreamAudioDestinationNode {
    return {
      stream: stream([this.destinationTrack]),
    } as MediaStreamAudioDestinationNode;
  }

  createMediaStreamSource(): MediaStreamAudioSourceNode {
    const source = new FakeAudioNode();
    this.sources.push(source);
    return source as unknown as MediaStreamAudioSourceNode;
  }

  createGain(): GainNode {
    const gain = new FakeGainNode();
    this.gains.push(gain);
    return gain as unknown as GainNode;
  }

  createAnalyser(): AnalyserNode {
    return new FakeAnalyserNode() as unknown as AnalyserNode;
  }

  createDynamicsCompressor(): DynamicsCompressorNode {
    return new FakeCompressorNode() as unknown as DynamicsCompressorNode;
  }
}

function stream(tracks: MediaStreamTrack[]): MediaStream {
  return {
    getTracks: () => tracks,
    getVideoTracks: () => tracks.filter(({ kind }) => kind === 'video'),
    getAudioTracks: () => tracks.filter(({ kind }) => kind === 'audio'),
  } as unknown as MediaStream;
}

describe('MediaInputService', () => {
  let mediaDevices: FakeMediaDevices;
  let storage: MemoryStorage;
  let service: MediaInputService;
  let previewAudioContexts: FakeAudioContext[];

  function configure(
    platformId: Object = 'browser',
    environment?: MediaInputEnvironment,
  ): void {
    TestBed.configureTestingModule({
      providers: [
        MediaInputService,
        { provide: PLATFORM_ID, useValue: platformId },
        {
          provide: MEDIA_INPUT_ENVIRONMENT,
          useValue:
            environment ??
            ({
              mediaDevices: mediaDevices as unknown as MediaDevices,
              storage,
            } satisfies MediaInputEnvironment),
        },
      ],
    });
    service = TestBed.inject(MediaInputService);
  }

  function configurePreview(): void {
    configure('browser', {
      mediaDevices: mediaDevices as unknown as MediaDevices,
      storage,
      createMediaStream: stream,
      createAudioContext: () => {
        const context = new FakeAudioContext();
        previewAudioContexts.push(context);
        return context as unknown as AudioContext;
      },
    });
  }

  beforeEach(() => {
    mediaDevices = new FakeMediaDevices();
    storage = new MemoryStorage();
    previewAudioContexts = [];
  });

  afterEach(() => {
    service?.ngOnDestroy();
    TestBed.resetTestingModule();
  });

  it('requests permission, enumerates labeled inputs, and stops permission tracks', async () => {
    mediaDevices.devices = [
      device('videoinput', 'video-1', 'Webcam'),
      device('audioinput', 'audio-1', 'Microphone'),
      device('audiooutput', 'speaker-1', 'Speakers'),
    ];
    configure();

    await service.initialize();

    expect(mediaDevices.getUserMedia).toHaveBeenCalledWith({
      video: true,
      audio: false,
    });
    expect(mediaDevices.getUserMedia).toHaveBeenCalledWith({
      video: false,
      audio: true,
    });
    expect(mediaDevices.enumerateDevices).toHaveBeenCalled();
    expect(mediaDevices.stopTrack).toHaveBeenCalled();
    expect(service.snapshot.status).toBe('ready');
    expect(service.snapshot.permission).toBe('granted');
    expect(
      service.snapshot.videoInputs.map(({ displayLabel }) => displayLabel),
    ).toEqual(['Webcam']);
    expect(
      service.snapshot.audioInputs.map(({ displayLabel }) => displayLabel),
    ).toEqual(['Microphone']);
  });

  it('preserves browser device labels without vendor-specific rewriting', async () => {
    mediaDevices.devices = [
      device('videoinput', 'console-1', 'YUAN SC400N2 Video'),
      device('videoinput', 'console-2', 'sc400 capture'),
      device('videoinput', 'camera-1', 'Logitech Brio'),
      device('audioinput', 'audio-1', 'Yuan SC400N2 Audio'),
    ];
    configure();

    await service.initialize();

    expect(
      service.snapshot.videoInputs.map(({ displayLabel }) => displayLabel),
    ).toEqual([
      'YUAN SC400N2 Video',
      'sc400 capture',
      'Logitech Brio',
    ]);
    expect(service.snapshot.audioInputs[0].displayLabel).toBe(
      'Yuan SC400N2 Audio',
    );
  });

  it('projects supported labels and removes browser alias devices', async () => {
    mediaDevices.devices = [
      device('videoinput', 'console-video', 'SC0710 PCI, Video 01 Capture'),
      device('videoinput', 'default-video', 'Default - USB Camera'),
      device(
        'audioinput',
        'console-audio',
        'SC0710 PCI, Analog 02 Audio (SC0710 PCI)',
      ),
      device(
        'audioinput',
        'microphone',
        'Microphone (Realtek(R) Audio)',
      ),
      device(
        'audioinput',
        'communications',
        'Communications - USB Headset',
      ),
    ];
    configure();

    await service.initialize();

    expect(service.snapshot.videoInputs).toEqual([
      jasmine.objectContaining({
        deviceId: 'console-video',
        displayLabel: 'Console Video 1',
      }),
    ]);
    expect(
      service.snapshot.audioInputs.map(({ deviceId, displayLabel }) => ({
        deviceId,
        displayLabel,
      })),
    ).toEqual([
      {
        deviceId: 'console-audio',
        displayLabel: 'Console Audio 2',
      },
      {
        deviceId: 'microphone',
        displayLabel: 'Skriin Microphone',
      },
    ]);
  });

  it('pairs Console and Facecam inputs by device group', async () => {
    mediaDevices.devices = [
      device('videoinput', 'camera', 'Webcam', 'webcam-group'),
      device('videoinput', 'console', 'Yuan SC400N2', 'console-group'),
      device('audioinput', 'mic', 'USB Microphone', 'mic-group'),
      device('audioinput', 'game', 'SC400 Audio', 'console-group'),
    ];
    configure();
    await service.initialize();

    service.selectVideo('console');

    expect(service.snapshot.consoleSelection).toEqual({
      overlayVideoDeviceId: 'camera',
      gameAudioDeviceId: 'game',
      microphoneDeviceId: 'mic',
    });
  });

  it('swaps both source assignments and their audio settings', async () => {
    mediaDevices.devices = [
      device('videoinput', 'camera', 'Webcam', 'webcam-group'),
      device('videoinput', 'console', 'Yuan SC400N2', 'console-group'),
      device('audioinput', 'mic', 'USB Microphone', 'webcam-group'),
      device('audioinput', 'game', 'SC400 Audio', 'console-group'),
    ];
    configure();
    await service.initialize();
    service.selectVideo('console');
    service.setGameLevel(0.4);
    service.setGameMuted(false);
    service.setMicrophoneLevel(0.75);

    service.swapSources();

    expect(service.snapshot.selection.videoDeviceId).toBe('camera');
    expect(service.snapshot.consoleSelection).toEqual({
      overlayVideoDeviceId: 'console',
      gameAudioDeviceId: 'mic',
      microphoneDeviceId: 'game',
    });
    expect(service.audioMixSnapshot).toEqual({
      gameLevel: 0.75,
      gameMuted: false,
      microphoneLevel: 0.4,
      microphoneMuted: false,
    });
    expect(storage.getItem(VIDEO_KEY)).toBe('camera');
  });

  it('defaults to multi-source capture when a driver label is not recognized', async () => {
    mediaDevices.devices = [
      device('videoinput', 'capture', 'USB Video', 'capture-group'),
      device('videoinput', 'camera', 'Webcam', 'webcam-group'),
      device('audioinput', 'game', 'Digital Audio', 'capture-group'),
      device('audioinput', 'mic', 'USB Microphone', 'mic-group'),
    ];
    configure();
    await service.initialize();

    service.selectVideo('capture');

    expect(service.snapshot.consoleSelection).toEqual({
      overlayVideoDeviceId: 'camera',
      gameAudioDeviceId: 'game',
      microphoneDeviceId: 'mic',
    });
  });

  it('keeps explicitly disabled secondary sources disabled for the session', async () => {
    mediaDevices.devices = [
      device('videoinput', 'camera', 'Webcam', 'webcam-group'),
      device('videoinput', 'console', 'Yuan SC400N2', 'console-group'),
      device('audioinput', 'mic', 'USB Microphone', 'webcam-group'),
      device('audioinput', 'game', 'SC400 Audio', 'console-group'),
    ];
    configure();
    await service.initialize();

    service.selectOverlayVideo(null);
    service.selectMicrophone(null);
    await service.refreshDevices();

    expect(service.snapshot.consoleSelection).toEqual({
      overlayVideoDeviceId: null,
      gameAudioDeviceId: 'mic',
      microphoneDeviceId: null,
    });
  });

  it('reports permission denial as a recoverable state', async () => {
    mediaDevices.getUserMedia.and.rejectWith(
      new DOMException('denied', 'NotAllowedError'),
    );
    configure();

    await service.initialize();

    expect(service.snapshot.status).toBe('error');
    expect(service.snapshot.permission).toBe('denied');
    expect(service.snapshot.error).toEqual(
      jasmine.objectContaining({
        code: 'permission-denied',
        recoverable: true,
      }),
    );
    expect(mediaDevices.enumerateDevices).not.toHaveBeenCalled();
  });

  it('represents empty device lists as a ready state with null selections', async () => {
    configure();

    await service.initialize();

    expect(service.snapshot.status).toBe('ready');
    expect(service.snapshot.videoInputs).toEqual([]);
    expect(service.snapshot.audioInputs).toEqual([]);
    expect(service.snapshot.selection).toEqual({
      videoDeviceId: null,
    });
  });

  it('keeps video inputs usable when no audio capture device exists', async () => {
    mediaDevices.devices = [
      device('videoinput', 'video-1', 'Webcam'),
    ];
    mediaDevices.getUserMedia.and.callFake(
      async (constraints: MediaStreamConstraints): Promise<MediaStream> => {
        if (constraints.audio) {
          throw new DOMException('Requested device not found', 'NotFoundError');
        }
        return {
          getTracks: () => [{ stop: mediaDevices.stopTrack }],
        } as unknown as MediaStream;
      },
    );
    configure();

    await service.initialize();

    expect(service.snapshot.status).toBe('ready');
    expect(service.snapshot.permission).toBe('granted');
    expect(service.snapshot.videoInputs.length).toBe(1);
    expect(service.snapshot.audioInputs).toEqual([]);
    expect(mediaDevices.stopTrack).toHaveBeenCalled();
  });

  it('surfaces a busy-camera error even when the microphone probe succeeds', async () => {
    mediaDevices.devices = [
      device('audioinput', 'audio-1', 'Microphone'),
    ];
    mediaDevices.getUserMedia.and.callFake(
      async (constraints: MediaStreamConstraints): Promise<MediaStream> => {
        if (constraints.video) {
          throw new DOMException('raw driver detail', 'NotReadableError');
        }
        return {
          getTracks: () => [{ stop: mediaDevices.stopTrack }],
        } as unknown as MediaStream;
      },
    );
    configure();

    await service.initialize();

    // A camera that's busy/blocked must not look identical to "no camera
    // was ever plugged in" just because the microphone probe succeeded -
    // otherwise the page silently ends up with no video input and no
    // explanation anywhere in the UI.
    expect(service.snapshot.status).toBe('error');
    expect(service.snapshot.permission).toBe('granted');
    expect(service.snapshot.error).toEqual(
      jasmine.objectContaining({
        code: 'device-busy',
        recoverable: true,
      }),
    );
  });

  it('surfaces a camera-specific permission-denied error even when the microphone probe succeeds', async () => {
    mediaDevices.devices = [
      device('audioinput', 'audio-1', 'Microphone'),
    ];
    mediaDevices.getUserMedia.and.callFake(
      async (constraints: MediaStreamConstraints): Promise<MediaStream> => {
        if (constraints.video) {
          throw new DOMException('denied', 'NotAllowedError');
        }
        return {
          getTracks: () => [{ stop: mediaDevices.stopTrack }],
        } as unknown as MediaStream;
      },
    );
    configure();

    await service.initialize();

    expect(service.snapshot.status).toBe('error');
    expect(service.snapshot.permission).toBe('granted');
    expect(service.snapshot.error).toEqual(
      jasmine.objectContaining({
        code: 'permission-denied',
        recoverable: true,
      }),
    );
  });

  it('does not access browser media APIs during server rendering', async () => {
    configure('server');

    await service.initialize();

    expect(mediaDevices.getUserMedia).not.toHaveBeenCalled();
    expect(mediaDevices.enumerateDevices).not.toHaveBeenCalled();
    expect(service.snapshot.status).toBe('unavailable');
    expect(service.snapshot.permission).toBe('unavailable');
    expect(service.snapshot.error?.code).toBe('devices-unavailable');
  });

  it('reports unavailable browser APIs without throwing', async () => {
    configure('browser', { storage });

    await service.initialize();

    expect(service.snapshot.status).toBe('unavailable');
    expect(service.snapshot.error?.recoverable).toBeTrue();
  });

  it('restores a valid persisted video selection', async () => {
    storage.setItem(VIDEO_KEY, 'video-2');
    mediaDevices.devices = [
      device('videoinput', 'video-1', 'Camera'),
      device('videoinput', 'video-2', 'Capture card'),
      device('audioinput', 'audio-1', 'Microphone'),
      device('audioinput', 'audio-2', 'Capture audio'),
    ];
    configure();

    await service.initialize();

    expect(service.snapshot.selection).toEqual({
      videoDeviceId: 'video-2',
    });
  });

  it('reapplies persisted selections after an early default-device refresh', async () => {
    mediaDevices.devices = [
      device('videoinput', 'video-1', 'Camera'),
      device('videoinput', 'video-2', 'Capture card'),
      device('audioinput', 'audio-1', 'Microphone'),
      device('audioinput', 'audio-2', 'Capture audio'),
    ];
    configure();
    await service.initialize();
    expect(service.snapshot.selection.videoDeviceId).toBe('video-1');

    storage.setItem(VIDEO_KEY, 'video-2');
    await service.refreshDevices();

    expect(service.snapshot.selection).toEqual({
      videoDeviceId: 'video-2',
    });
  });

  it('replaces stale persisted IDs with the first available devices', async () => {
    storage.setItem(VIDEO_KEY, 'missing-video');
    mediaDevices.devices = [
      device('videoinput', 'video-1', 'Camera'),
      device('audioinput', 'audio-1', 'Microphone'),
    ];
    configure();

    await service.initialize();

    expect(service.snapshot.selection).toEqual({
      videoDeviceId: 'video-1',
    });
    expect(storage.getItem(VIDEO_KEY)).toBe('video-1');
  });

  it('persists explicit selection changes and ignores unknown IDs', async () => {
    mediaDevices.devices = [
      device('videoinput', 'video-1', 'Camera'),
      device('videoinput', 'video-2', 'Capture card'),
    ];
    configure();
    await service.initialize();

    service.selectVideo('video-2');
    service.selectVideo('unknown');

    expect(service.snapshot.selection.videoDeviceId).toBe('video-2');
    expect(storage.getItem(VIDEO_KEY)).toBe('video-2');
  });

  it('preserves a selection when a device connects and falls back when it is removed', async () => {
    mediaDevices.devices = [
      device('videoinput', 'video-1', 'Camera'),
      device('audioinput', 'audio-1', 'Microphone'),
    ];
    configure();
    await service.initialize();

    mediaDevices.devices = [
      ...mediaDevices.devices,
      device('videoinput', 'video-2', 'Capture card'),
    ];
    mediaDevices.dispatchEvent(new Event('devicechange'));
    await Promise.resolve();
    await Promise.resolve();
    expect(service.snapshot.selection.videoDeviceId).toBe('video-1');
    expect(service.snapshot.videoInputs.length).toBe(2);

    service.selectVideo('video-2');
    mediaDevices.devices = [
      device('videoinput', 'video-1', 'Camera'),
      device('audioinput', 'audio-1', 'Microphone'),
    ];
    mediaDevices.dispatchEvent(new Event('devicechange'));
    await Promise.resolve();
    await Promise.resolve();

    expect(service.snapshot.selection.videoDeviceId).toBe('video-1');
    expect(storage.getItem(VIDEO_KEY)).toBe('video-1');
  });

  it('registers one devicechange listener and removes it on teardown', async () => {
    const addEventListener = spyOn(mediaDevices, 'addEventListener').and.callThrough();
    const removeEventListener = spyOn(
      mediaDevices,
      'removeEventListener',
    ).and.callThrough();
    configure();

    await service.initialize();
    await service.initialize();
    service.ngOnDestroy();

    expect(addEventListener).toHaveBeenCalledTimes(1);
    expect(removeEventListener).toHaveBeenCalledOnceWith(
      'devicechange',
      jasmine.any(Function),
    );
  });

  it('previews independently selected video and audio inputs', async () => {
    const videoTrack = track('video');
    const audioTrack = track('audio');
    mediaDevices.devices = [
      device('videoinput', 'video-1', 'Capture card'),
      device('audioinput', 'audio-1', 'Capture audio'),
    ];
    configurePreview();
    await service.initialize();
    mediaDevices.getUserMedia.calls.reset();
    mediaDevices.getUserMedia.and.callFake(
      async (constraints: MediaStreamConstraints): Promise<MediaStream> => {
        if (
          typeof constraints.video === 'object' &&
          constraints.video.deviceId
        ) {
          return stream([videoTrack]);
        }
        if (
          typeof constraints.audio === 'object' &&
          constraints.audio.deviceId
        ) {
          return stream([audioTrack]);
        }
        return stream([]);
      },
    );
    const preview = await service.startPreview();

    expect(mediaDevices.getUserMedia).toHaveBeenCalledWith({
      video: {
        deviceId: { exact: 'video-1' },
        width: { exact: 1920 },
        height: { exact: 1080 },
        frameRate: { exact: 60 },
        resizeMode: { exact: 'none' },
      },
      audio: false,
    });
    expect(mediaDevices.getUserMedia).toHaveBeenCalledWith({
      video: false,
      audio: {
        deviceId: { exact: 'audio-1' },
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    expect(preview?.getVideoTracks()).toEqual([videoTrack]);
    expect(preview?.getAudioTracks()).toEqual([
      previewAudioContexts[0].destinationTrack,
    ]);
  });

  it('creates a genuine video-only preview without Web Audio', async () => {
    const videoTrack = track('video');
    mediaDevices.devices = [
      device('videoinput', 'video-1', 'Capture card'),
    ];
    configure('browser', {
      mediaDevices: mediaDevices as unknown as MediaDevices,
      storage,
      createMediaStream: stream,
    });
    await service.initialize();
    mediaDevices.getUserMedia.and.resolveTo(stream([videoTrack]));

    const preview = await service.startPreview();

    expect(preview?.getVideoTracks()).toEqual([videoTrack]);
    expect(preview?.getAudioTracks()).toEqual([]);
    expect(service.previewSnapshot.status).toBe('ready');
  });

  it('omits mixer output when every audio source is disabled', async () => {
    const videoTrack = track('video');
    const firstAudioTrack = track('audio');
    mediaDevices.devices = [
      device('videoinput', 'video-1', 'Capture card'),
      device('audioinput', 'audio-1', 'Capture audio'),
    ];
    configurePreview();
    await service.initialize();
    mediaDevices.getUserMedia.and.callFake(
      async (constraints: MediaStreamConstraints): Promise<MediaStream> =>
        constraints.video ? stream([videoTrack]) : stream([firstAudioTrack]),
    );
    const preview = await service.startPreview();
    expect(preview?.getAudioTracks()).toHaveSize(1);

    service.selectGameAudio(null);
    await service.refreshAudioSources();

    expect(service.previewSnapshot.stream?.getAudioTracks()).toEqual([]);
    expect(previewAudioContexts).toHaveSize(1);
    expect(previewAudioContexts[0].close).not.toHaveBeenCalled();
    expect(firstAudioTrack.stop).toHaveBeenCalled();
  });

  it('retains mixer output when the selected audio source is muted', async () => {
    const videoTrack = track('video');
    const audioTrack = track('audio');
    mediaDevices.devices = [
      device('videoinput', 'video-1', 'Capture card'),
      device('audioinput', 'audio-1', 'Capture audio'),
    ];
    configurePreview();
    await service.initialize();
    mediaDevices.getUserMedia.and.callFake(
      async (constraints: MediaStreamConstraints): Promise<MediaStream> =>
        constraints.video ? stream([videoTrack]) : stream([audioTrack]),
    );
    const preview = await service.startPreview();
    const mixerTrack = preview?.getAudioTracks()[0];

    service.setGameMuted(true);

    expect(service.previewSnapshot.stream?.getAudioTracks()[0]).toBe(
      mixerTrack,
    );
  });

  it('keeps the previous primary source alive until replacement commits', async () => {
    const previousVideo = track('video');
    const replacementVideo = track('video');
    mediaDevices.devices = [device('videoinput', 'video-1', 'Camera')];
    configurePreview();
    await service.initialize();
    mediaDevices.getUserMedia.and.resolveTo(stream([previousVideo]));
    await service.startPreview();

    mediaDevices.devices = [
      device('videoinput', 'video-1', 'Camera'),
      device('videoinput', 'video-2', 'Capture card'),
    ];
    await service.refreshDevices();
    service.selectVideo('video-2');
    mediaDevices.getUserMedia.and.resolveTo(stream([replacementVideo]));

    await service.refreshPrimaryVideo();

    expect(previousVideo.stop).not.toHaveBeenCalled();
    service.commitPrimaryVideoRefresh();
    expect(previousVideo.stop).toHaveBeenCalledTimes(1);
    expect(replacementVideo.stop).not.toHaveBeenCalled();
  });

  it('stops every old track after replacing a preview', async () => {
    const oldVideo = track('video');
    const oldAudio = track('audio');
    const newVideo = track('video');
    const newAudio = track('audio');
    const captures = [oldVideo, oldAudio, newVideo, newAudio];
    mediaDevices.devices = [
      device('videoinput', 'video-1', 'Capture card'),
      device('audioinput', 'audio-1', 'Capture audio'),
    ];
    configurePreview();
    await service.initialize();
    mediaDevices.getUserMedia.and.callFake(
      async (): Promise<MediaStream> => stream([captures.shift()!]),
    );
    await service.startPreview();
    await service.startPreview();

    expect(oldVideo.stop).toHaveBeenCalled();
    expect(oldAudio.stop).toHaveBeenCalled();
    expect(newVideo.stop).not.toHaveBeenCalled();
    expect(newAudio.stop).not.toHaveBeenCalled();
  });

  it('falls back to the best bounded mode when exact modes fail', async () => {
    const videoTrack = track('video');
    mediaDevices.devices = [
      device('videoinput', 'video-1', 'Capture card'),
    ];
    configurePreview();
    await service.initialize();
    mediaDevices.getUserMedia.calls.reset();
    mediaDevices.getUserMedia.and.callFake(
      async (constraints: MediaStreamConstraints): Promise<MediaStream> => {
        const width =
          typeof constraints.video === 'object'
            ? constraints.video.width
            : undefined;
        if (typeof width === 'object' && 'exact' in width) {
          throw new DOMException('unsupported', 'OverconstrainedError');
        }
        return stream([videoTrack]);
      },
    );
    await service.startPreview();

    expect(mediaDevices.getUserMedia).toHaveBeenCalledTimes(8);
    expect(mediaDevices.getUserMedia).toHaveBeenCalledWith({
      video: {
        deviceId: { exact: 'video-1' },
        width: { ideal: 1920, max: 1920 },
        height: { ideal: 1080, max: 1080 },
        frameRate: { ideal: 60, max: 60 },
        resizeMode: { ideal: 'none' },
      },
      audio: false,
    });
    expect(service.previewSnapshot.videoSettings?.fallbackTier).toBe(
      'bounded',
    );
  });

  it('cleans up partial and active tracks when replacement fails', async () => {
    const oldVideo = track('video');
    const oldAudio = track('audio');
    const partialVideo = track('video');
    let call = 0;
    mediaDevices.devices = [
      device('videoinput', 'video-1', 'Capture card'),
      device('audioinput', 'audio-1', 'Capture audio'),
    ];
    configurePreview();
    await service.initialize();
    mediaDevices.getUserMedia.and.callFake(
      async (): Promise<MediaStream> => {
        call += 1;
        if (call === 1) return stream([oldVideo]);
        if (call === 2) return stream([oldAudio]);
        if (call === 3) return stream([partialVideo]);
        throw new DOMException('raw device driver detail', 'NotReadableError');
      },
    );
    await service.startPreview();

    const result = await service.startPreview();

    expect(result).toBeNull();
    expect(partialVideo.stop).toHaveBeenCalled();
    expect(oldVideo.stop).toHaveBeenCalled();
    expect(oldAudio.stop).toHaveBeenCalled();
    expect(service.previewSnapshot.stream).toBeNull();
    expect(service.previewSnapshot.error?.code).toBe('device-busy');
    expect(service.previewSnapshot.error?.message).not.toContain(
      'raw device driver detail',
    );
  });

  it('maps capture permission changes to a safe recoverable error', async () => {
    mediaDevices.devices = [
      device('videoinput', 'video-1', 'Capture card'),
    ];
    configurePreview();
    await service.initialize();
    mediaDevices.getUserMedia.calls.reset();
    mediaDevices.getUserMedia.and.rejectWith(
      new DOMException('raw browser detail', 'NotAllowedError'),
    );

    await service.startPreview();

    expect(service.previewSnapshot.error).toEqual(
      jasmine.objectContaining({
        code: 'permission-denied',
        recoverable: true,
      }),
    );
    expect(service.previewSnapshot.error?.message).not.toContain(
      'raw browser detail',
    );
  });

  it('reports unsupported constraints when relaxed capture also fails', async () => {
    mediaDevices.devices = [
      device('videoinput', 'video-1', 'Capture card'),
    ];
    configurePreview();
    await service.initialize();
    mediaDevices.getUserMedia.calls.reset();
    mediaDevices.getUserMedia.and.rejectWith(
      new DOMException('unsupported detail', 'OverconstrainedError'),
    );

    await service.startPreview();

    expect(mediaDevices.getUserMedia).toHaveBeenCalledTimes(8);
    expect(service.previewSnapshot.error?.code).toBe(
      'unsupported-constraints',
    );
    expect(service.previewSnapshot.error?.message).not.toContain(
      'unsupported detail',
    );
  });

  it('stops the active preview and reports a removed selected device', async () => {
    const videoTrack = track('video');
    mediaDevices.devices = [
      device('videoinput', 'video-1', 'Capture card'),
    ];
    configurePreview();
    await service.initialize();
    mediaDevices.getUserMedia.and.returnValue(
      Promise.resolve(stream([videoTrack])),
    );
    await service.startPreview();

    mediaDevices.devices = [];
    mediaDevices.dispatchEvent(new Event('devicechange'));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(videoTrack.stop).toHaveBeenCalled();
    expect(service.previewSnapshot.stream).toBeNull();
    expect(service.previewSnapshot.error?.code).toBe('device-removed');
  });

  it('reports an active track ending as device removal', async () => {
    const videoTrack = track('video');
    const addEventListener = spyOn(
      videoTrack,
      'addEventListener',
    ).and.callThrough();
    mediaDevices.devices = [
      device('videoinput', 'video-1', 'Capture card'),
    ];
    configurePreview();
    await service.initialize();
    mediaDevices.getUserMedia.and.returnValue(
      Promise.resolve(stream([videoTrack])),
    );
    await service.startPreview();

    expect(addEventListener).toHaveBeenCalledTimes(1);

    videoTrack.dispatchEvent(new Event('ended'));

    expect(videoTrack.stop).toHaveBeenCalled();
    expect(service.previewSnapshot.stream).toBeNull();
    expect(service.previewSnapshot.error?.code).toBe('device-removed');
  });

  it('stops all preview tracks during explicit cleanup', async () => {
    const videoTrack = track('video');
    mediaDevices.devices = [
      device('videoinput', 'video-1', 'Capture card'),
    ];
    configurePreview();
    await service.initialize();
    mediaDevices.getUserMedia.and.returnValue(
      Promise.resolve(stream([videoTrack])),
    );
    await service.startPreview();

    service.stopPreview();

    expect(videoTrack.stop).toHaveBeenCalled();
    expect(service.previewSnapshot.status).toBe('idle');
    expect(service.previewSnapshot.stream).toBeNull();
  });

  it('discards a stale preview when a newer selection finishes first', async () => {
    const staleTrack = track('video');
    const currentTrack = track('video');
    let resolveStale!: (value: MediaStream) => void;
    const staleCapture = new Promise<MediaStream>((resolve) => {
      resolveStale = resolve;
    });
    mediaDevices.devices = [
      device('videoinput', 'video-1', 'Camera'),
      device('videoinput', 'video-2', 'Capture card'),
    ];
    configurePreview();
    await service.initialize();
    service.selectOverlayVideo(null);
    mediaDevices.getUserMedia.and.callFake(
      async (constraints: MediaStreamConstraints): Promise<MediaStream> => {
        const videoConstraints = constraints.video as MediaTrackConstraints;
        const selectedId = (videoConstraints.deviceId as ConstrainDOMStringParameters)
          .exact;
        return selectedId === 'video-1'
          ? staleCapture
          : stream([currentTrack]);
      },
    );

    const firstPreview = service.startPreview();
    service.selectVideo('video-2');
    const secondPreview = await service.startPreview();
    resolveStale(stream([staleTrack]));
    await firstPreview;

    expect(secondPreview?.getVideoTracks()).toEqual([currentTrack]);
    expect(service.previewSnapshot.stream).toBe(secondPreview);
    expect(staleTrack.stop).toHaveBeenCalled();
    expect(currentTrack.stop).not.toHaveBeenCalled();
  });

  it('captures Console sources, mixes one audio track, and reports negotiation', async () => {
    const consoleVideo = track('video', {
      width: 1920,
      height: 1080,
      frameRate: 60,
    });
    const webcamVideo = track('video', {
      width: 1280,
      height: 720,
      frameRate: 60,
    });
    const gameAudio = track('audio');
    const microphoneAudio = track('audio');
    const audioContext = new FakeAudioContext();
    mediaDevices.devices = [
      device('videoinput', 'camera', 'Webcam', 'webcam-group'),
      device('videoinput', 'console', 'Yuan SC400N2', 'console-group'),
      device('audioinput', 'mic', 'USB Microphone', 'mic-group'),
      device('audioinput', 'game', 'SC400 Audio', 'console-group'),
    ];
    configure('browser', {
      mediaDevices: mediaDevices as unknown as MediaDevices,
      storage,
      createMediaStream: stream,
      createAudioContext: () => audioContext as unknown as AudioContext,
    });
    await service.initialize();
    service.selectVideo('console');
    mediaDevices.getUserMedia.calls.reset();
    mediaDevices.getUserMedia.and.callFake(
      async (constraints: MediaStreamConstraints): Promise<MediaStream> => {
        const mediaConstraints =
          (constraints.video || constraints.audio) as MediaTrackConstraints;
        const exact = (
          mediaConstraints.deviceId as ConstrainDOMStringParameters
        ).exact;
        if (exact === 'console') return stream([consoleVideo]);
        if (exact === 'camera') return stream([webcamVideo]);
        if (exact === 'game') return stream([gameAudio]);
        if (exact === 'mic') return stream([microphoneAudio]);
        return stream([]);
      },
    );

    const preview = await service.startPreview();

    expect(mediaDevices.getUserMedia.calls.argsFor(0)[0]).toEqual({
      video: jasmine.objectContaining({
        deviceId: { exact: 'console' },
        width: { exact: 1920 },
        height: { exact: 1080 },
        frameRate: { exact: 60 },
        resizeMode: { exact: 'none' },
      }),
      audio: false,
    });
    expect(mediaDevices.getUserMedia.calls.argsFor(1)[0]).toEqual({
      video: jasmine.objectContaining({
        deviceId: { exact: 'camera' },
        width: { exact: 1920 },
        height: { exact: 1080 },
        frameRate: { exact: 60 },
        resizeMode: { exact: 'none' },
      }),
      audio: false,
    });
    expect(preview?.getVideoTracks()).toEqual([consoleVideo]);
    expect(preview?.getAudioTracks()).toEqual([
      audioContext.destinationTrack,
    ]);
    expect(service.previewSnapshot.overlayStream?.getVideoTracks()).toEqual([
      webcamVideo,
    ]);
    expect(service.previewSnapshot.videoSettings).toEqual(
      jasmine.objectContaining({
        width: 1920,
        height: 1080,
        frameRate: 60,
        fallbackTier: 'exact',
        belowTarget: false,
      }),
    );
    expect(service.previewSnapshot.overlayVideoSettings).toEqual(
      jasmine.objectContaining({
        width: 1280,
        height: 720,
        frameRate: 60,
        fallbackTier: 'exact',
      }),
    );
    expect(audioContext.gains.map(({ gain }) => gain.value)).toEqual([
      0.625, 1, 1, 1,
    ]);

    service.setGameMuted(false);
    service.setGameLevel(0.4);
    service.setMicrophoneMuted(true);
    expect(audioContext.gains[0].gain.setTargetAtTime).toHaveBeenCalledWith(
      0.4,
      1,
      0.02,
    );
    expect(audioContext.gains[3].gain.setTargetAtTime).toHaveBeenCalledWith(
      0,
      1,
      0.02,
    );

    await service.resumeAudioContext();
    expect(audioContext.resume).toHaveBeenCalled();
    service.stopPreview();
    expect(consoleVideo.stop).toHaveBeenCalled();
    expect(webcamVideo.stop).toHaveBeenCalled();
    expect(gameAudio.stop).toHaveBeenCalled();
    expect(microphoneAudio.stop).toHaveBeenCalled();
    expect(audioContext.close).toHaveBeenCalled();
  });

  it('tries supported modes in resolution-first order before bounded fallback', async () => {
    const consoleVideo = track('video', {
      width: 1280,
      height: 720,
      frameRate: 30,
    });
    mediaDevices.devices = [
      device('videoinput', 'console', 'SC400 Video'),
    ];
    configurePreview();
    await service.initialize();
    mediaDevices.getUserMedia.calls.reset();
    mediaDevices.getUserMedia.and.callFake(
      async (constraints: MediaStreamConstraints): Promise<MediaStream> => {
        const video = constraints.video as MediaTrackConstraints;
        const width = video.width;
        if (typeof width === 'object' && 'exact' in width) {
          throw new DOMException('unsupported', 'OverconstrainedError');
        }
        return stream([consoleVideo]);
      },
    );

    await service.startPreview();

    expect(mediaDevices.getUserMedia).toHaveBeenCalledTimes(8);
    const attemptedModes = mediaDevices.getUserMedia.calls
      .allArgs()
      .slice(0, 7)
      .map(([constraints]) => {
        const video = constraints.video as MediaTrackConstraints;
        return [
          (video.width as ConstrainULongRange).exact,
          (video.height as ConstrainULongRange).exact,
          (video.frameRate as ConstrainDoubleRange).exact,
        ];
      });
    expect(attemptedModes).toEqual([
      [1920, 1080, 60],
      [1920, 1080, 50],
      [1920, 1080, 30],
      [1920, 1080, 25],
      [1920, 1080, 24],
      [1280, 720, 60],
      [1280, 720, 50],
    ]);
    expect(service.previewSnapshot.videoSettings).toEqual(
      jasmine.objectContaining({
        fallbackTier: 'bounded',
        belowTarget: true,
      }),
    );
  });
});
