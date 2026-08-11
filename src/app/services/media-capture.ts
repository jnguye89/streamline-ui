import {
  VideoCaptureAttempt,
  VideoCaptureResult,
} from '../models/media-input.models';

const CONSTRAINT_FAILURE_ERRORS = new Set([
  'OverconstrainedError',
  'ConstraintNotSatisfiedError',
]);

const SUPPORTED_EXACT_MODES = [
  { width: 1920, height: 1080, frameRate: 60 },
  { width: 1920, height: 1080, frameRate: 50 },
  { width: 1920, height: 1080, frameRate: 30 },
  { width: 1920, height: 1080, frameRate: 25 },
  { width: 1920, height: 1080, frameRate: 24 },
  { width: 1280, height: 720, frameRate: 60 },
  { width: 1280, height: 720, frameRate: 50 },
] as const;

const BOUNDED_BEST_CONSTRAINTS = {
  width: { min: 1280, ideal: 1920, max: 1920 },
  height: { min: 720, ideal: 1080, max: 1080 },
  frameRate: { ideal: 60, max: 60 },
  resizeMode: { ideal: 'none' },
} as MediaTrackConstraints;

export function isConstraintFailure(error: unknown): boolean {
  return CONSTRAINT_FAILURE_ERRORS.has(errorName(error));
}

export function acquirePrimaryVideo(
  mediaDevices: MediaDevices,
  deviceId: string,
): Promise<VideoCaptureResult> {
  return acquireVideoWithFallback(
    mediaDevices,
    videoAttempts(deviceId),
    true,
  );
}

export async function acquireOverlayVideo(
  mediaDevices: MediaDevices,
  deviceId: string | null,
  excludedDeviceId: string | null = null,
): Promise<VideoCaptureResult | null> {
  if (!deviceId || deviceId === excludedDeviceId) return null;
  return acquireVideoWithFallback(
    mediaDevices,
    videoAttempts(deviceId),
    false,
  );
}

function videoAttempts(deviceId: string): VideoCaptureAttempt[] {
  return [
    ...SUPPORTED_EXACT_MODES.map(({ width, height, frameRate }) =>
      videoAttempt('exact', deviceId, {
        width: { exact: width },
        height: { exact: height },
        frameRate: { exact: frameRate },
        resizeMode: { exact: 'none' },
      } as MediaTrackConstraints),
    ),
    videoAttempt('bounded', deviceId, BOUNDED_BEST_CONSTRAINTS),
  ];
}

async function acquireVideoWithFallback(
  mediaDevices: MediaDevices,
  attempts: readonly VideoCaptureAttempt[],
  compareToPrimaryTarget: boolean,
): Promise<VideoCaptureResult> {
  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];
    try {
      const stream = await mediaDevices.getUserMedia({
        video: attempt.constraints,
        audio: false,
      });
      const settings = stream.getVideoTracks()[0]?.getSettings?.() ?? {};
      const { width, height, frameRate } = settings;
      return {
        stream,
        settings: {
          width,
          height,
          frameRate,
          fallbackTier: attempt.tier,
          belowTarget:
            compareToPrimaryTarget &&
            (width === undefined ||
              height === undefined ||
              frameRate === undefined ||
              width < 1920 ||
              height < 1080 ||
              frameRate < 60),
        },
      };
    } catch (error: unknown) {
      if (!isConstraintFailure(error) || index === attempts.length - 1) {
        throw error;
      }
    }
  }
  throw new Error('Video capture negotiation exhausted.');
}

function videoAttempt(
  tier: VideoCaptureAttempt['tier'],
  deviceId: string,
  constraints: MediaTrackConstraints = {},
): VideoCaptureAttempt {
  return {
    tier,
    constraints: { deviceId: { exact: deviceId }, ...constraints },
  };
}

function errorName(error: unknown): string {
  return typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    typeof error.name === 'string'
    ? error.name
    : '';
}
