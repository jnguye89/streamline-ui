export type MediaInputPermissionState =
  | 'idle'
  | 'requesting'
  | 'granted'
  | 'denied'
  | 'unavailable';

export type MediaInputStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'error'
  | 'unavailable';

export type MediaInputErrorCode =
  | 'permission-denied'
  | 'devices-unavailable'
  | 'enumeration-failed'
  | 'missing-video-input'
  | 'device-busy'
  | 'device-removed'
  | 'unsupported-constraints'
  | 'preview-failed';

export interface MediaInputDevice {
  deviceId: string;
  groupId: string;
  kind: 'videoinput' | 'audioinput';
  displayLabel: string;
}

export interface MediaInputSelection {
  videoDeviceId: string | null;
}

export interface ConsoleInputSelection {
  overlayVideoDeviceId: string | null;
  gameAudioDeviceId: string | null;
  microphoneDeviceId: string | null;
}

export type VideoCaptureFallbackTier = 'exact' | 'bounded';

export interface NegotiatedVideoSettings {
  width?: number;
  height?: number;
  frameRate?: number;
  fallbackTier: VideoCaptureFallbackTier;
  belowTarget: boolean;
}

export interface AudioMixState {
  gameLevel: number;
  gameMuted: boolean;
  microphoneLevel: number;
  microphoneMuted: boolean;
}

export interface AudioMeterState {
  game: number;
  microphone: number;
  output: number;
}

export interface MediaInputError {
  code: MediaInputErrorCode;
  message: string;
  recoverable: true;
}

export interface MediaInputState {
  status: MediaInputStatus;
  permission: MediaInputPermissionState;
  videoInputs: readonly MediaInputDevice[];
  audioInputs: readonly MediaInputDevice[];
  selection: MediaInputSelection;
  consoleSelection: ConsoleInputSelection;
  error: MediaInputError | null;
}

export type MediaPreviewStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface MediaPreviewState {
  status: MediaPreviewStatus;
  stream: MediaStream | null;
  error: MediaInputError | null;
  overlayStream?: MediaStream | null;
  videoSettings?: NegotiatedVideoSettings | null;
  overlayVideoSettings?: NegotiatedVideoSettings | null;
}

export interface VideoCaptureAttempt {
  tier: VideoCaptureFallbackTier;
  constraints: MediaTrackConstraints;
}

export interface VideoCaptureResult {
  stream: MediaStream;
  settings: NegotiatedVideoSettings;
}

export type AudioChannel = 'game' | 'microphone';

export interface MediaInputEnvironment {
  mediaDevices?: MediaDevices;
  storage?: Storage;
  createMediaStream?: (tracks: MediaStreamTrack[]) => MediaStream;
  createAudioContext?: () => AudioContext;
  createVideoElement?: () => HTMLVideoElement;
  createCanvasElement?: () => HTMLCanvasElement;
  requestAnimationFrame?: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame?: (handle: number) => void;
}
