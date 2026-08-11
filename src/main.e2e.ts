import { bootstrapApplication } from '@angular/platform-browser';
import {
  IAgoraRTCClient,
  ILocalAudioTrack,
  ILocalTrack,
  ILocalVideoTrack,
} from 'agora-rtc-sdk-ng';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import {
  MEDIA_INPUT_ENVIRONMENT,
  MediaInputEnvironment,
} from './app/services/media-input.service';
import {
  RTC_STREAM_AGORA,
  RtcStreamAgora,
} from './app/services/agora/rtc-stream.service';
import './shims/wowza-global';

interface E2eLocalTrack {
  source: MediaStreamTrack;
  stopCalls: number;
  closeCalls: number;
}

interface E2eRtcState {
  joins: number;
  publishes: number;
  unpublishes: number;
  leaves: number;
  receivedKinds: string[];
  receivedTrackIds: string[];
  tracks: E2eLocalTrack[];
}

const state: E2eRtcState = {
  joins: 0,
  publishes: 0,
  unpublishes: 0,
  leaves: 0,
  receivedKinds: [],
  receivedTrackIds: [],
  tracks: [],
};

Object.assign(window, { __SKRIIN_E2E_RTC_STATE__: state });

function createLocalTrack(source: MediaStreamTrack): ILocalTrack {
  const record: E2eLocalTrack = {
    source,
    stopCalls: 0,
    closeCalls: 0,
  };
  state.tracks.push(record);

  return {
    stop: () => {
      record.stopCalls += 1;
    },
    close: () => {
      record.closeCalls += 1;
      source.stop();
    },
    __e2eSource: source,
  } as unknown as ILocalTrack;
}

const client = {
  setClientRole: async () => undefined,
  join: async () => {
    state.joins += 1;
    return 101;
  },
  publish: async (tracks: ILocalTrack[]) => {
    state.publishes += 1;
    state.receivedKinds = tracks.map(
      (track) =>
        (track as unknown as { __e2eSource: MediaStreamTrack }).__e2eSource
          .kind,
    );
    state.receivedTrackIds = tracks.map(
      (track) =>
        (track as unknown as { __e2eSource: MediaStreamTrack }).__e2eSource.id,
    );
  },
  unpublish: async () => {
    state.unpublishes += 1;
    state.receivedKinds = [];
    state.receivedTrackIds = [];
  },
  leave: async () => {
    state.leaves += 1;
  },
} as unknown as IAgoraRTCClient;

const e2eAgora: RtcStreamAgora = {
  createClient: async () => client,
  createCustomAudioTrack: async ({ mediaStreamTrack }) =>
    createLocalTrack(mediaStreamTrack) as ILocalAudioTrack,
  createCustomVideoTrack: async ({ mediaStreamTrack }) =>
    createLocalTrack(mediaStreamTrack) as ILocalVideoTrack,
};

const nativeMediaDevices = navigator.mediaDevices;
let nativeVideoId = '';
let nativeAudioId = '';

function virtualDevice(
  kind: 'videoinput' | 'audioinput',
  deviceId: string,
  groupId: string,
  label: string,
): MediaDeviceInfo {
  return {
    kind,
    deviceId,
    groupId,
    label,
    toJSON: () => ({ kind, deviceId, groupId, label }),
  };
}

function rewriteDeviceId(
  constraints: boolean | MediaTrackConstraints | undefined,
  nativeId: string,
): boolean | MediaTrackConstraints | undefined {
  if (!constraints || typeof constraints === 'boolean') return constraints;
  const deviceId = constraints.deviceId;
  const selectedId =
    typeof deviceId === 'string'
      ? deviceId
      : Array.isArray(deviceId)
        ? deviceId[0]
        : deviceId?.exact;
  if (
    typeof selectedId === 'string' &&
    selectedId.startsWith('e2e-')
  ) {
    return {
      ...constraints,
      deviceId: { exact: nativeId },
    };
  }
  return constraints;
}

const e2eMediaDevices = {
  getUserMedia: async (
    constraints: MediaStreamConstraints,
  ): Promise<MediaStream> =>
    nativeMediaDevices.getUserMedia({
      video: rewriteDeviceId(constraints.video, nativeVideoId),
      audio: rewriteDeviceId(constraints.audio, nativeAudioId),
    }),
  enumerateDevices: async (): Promise<MediaDeviceInfo[]> => {
    const devices = await nativeMediaDevices.enumerateDevices();
    nativeVideoId =
      devices.find(({ kind }) => kind === 'videoinput')?.deviceId ?? '';
    nativeAudioId =
      devices.find(({ kind }) => kind === 'audioinput')?.deviceId ?? '';
    return [
      virtualDevice(
        'videoinput',
        'e2e-webcam-video',
        'e2e-webcam-group',
        'E2E Webcam',
      ),
      virtualDevice(
        'videoinput',
        'e2e-console-video',
        'e2e-console-group',
        'Yuan SC400N2 Video',
      ),
      virtualDevice(
        'audioinput',
        'e2e-microphone-audio',
        'e2e-microphone-group',
        'E2E Microphone',
      ),
      virtualDevice(
        'audioinput',
        'e2e-game-audio',
        'e2e-console-group',
        'Yuan SC400N2 Audio',
      ),
    ];
  },
  addEventListener: (
    type: string,
    listener: EventListenerOrEventListenerObject,
  ) => nativeMediaDevices.addEventListener(type, listener),
  removeEventListener: (
    type: string,
    listener: EventListenerOrEventListenerObject,
  ) => nativeMediaDevices.removeEventListener(type, listener),
} as MediaDevices;

const e2eMediaEnvironment: MediaInputEnvironment = {
  mediaDevices: e2eMediaDevices,
  storage: localStorage,
  createMediaStream: (tracks) => new MediaStream(tracks),
  createAudioContext: () => new AudioContext(),
};

bootstrapApplication(AppComponent, {
  ...appConfig,
  providers: [
    ...(appConfig.providers ?? []),
    { provide: RTC_STREAM_AGORA, useValue: e2eAgora },
    { provide: MEDIA_INPUT_ENVIRONMENT, useValue: e2eMediaEnvironment },
  ],
}).catch((error) => console.error(error));
