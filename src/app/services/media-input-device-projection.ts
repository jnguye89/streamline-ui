import type { MediaInputDevice } from '../models/media-input.models';

// Keep model recognition separate from label rules so newly verified hardware
// names can be added without changing the user-facing projection behavior.
export const SUPPORTED_CONSOLE_DEVICE_MODELS = [
  'SC0710 PCI', // Actual model shipped with test unit
  'SC400' // Planned model to support
] as const;

const CHROMIUM_AUDIO_ALIAS_DEVICE_IDS = new Set([
  'default',
  'communications',
]);

export function projectMediaInputDevice(
  device: MediaDeviceInfo,
): MediaInputDevice | null {
  const words = normalizeLabel(device.label);

  if (
    (device.kind === 'audioinput' &&
      CHROMIUM_AUDIO_ALIAS_DEVICE_IDS.has(device.deviceId)) ||
    words[0] === 'default' ||
    words[0] === 'communications'
  ) {
    return null;
  }

  return {
    deviceId: device.deviceId,
    groupId: device.groupId,
    kind: device.kind as MediaInputDevice['kind'],
    displayLabel: projectedLabel(device.kind, device.label, words),
    isCaptureDevice: isRecognizedCaptureVideoDevice(device.kind, words),
  };
}

// Positively identifies a video input as recognized console/HDMI capture
// hardware (an SC0710/SC400-family capture card), independent of display
// naming. This is intentionally the same "supported model + video N
// capture" pattern used by projectedLabel()'s "Console Video N" rename,
// not just isSupportedConsoleModel() alone - that check is a loose,
// order-preserving subsequence match (see includesWords()) and by itself
// is too eager: a label like "YUAN SC400N2 Video" satisfies
// isSupportedConsoleModel() (it contains "sc" then "400" in order) without
// actually being the console capture card. Requiring the same "video N
// capture" wording that already gates the rename keeps this consistent
// with what the app treats as a verified capture device elsewhere, and
// keeps callers (e.g. screen/webcam role assignment) from misidentifying
// an unrelated webcam that merely has a similar-looking model number.
function isRecognizedCaptureVideoDevice(
  kind: MediaDeviceKind,
  words: readonly string[],
): boolean {
  return (
    kind === 'videoinput' &&
    isSupportedConsoleModel(words) &&
    (includesWords(words, ['video', '1', 'capture']) ||
      includesWords(words, ['video', '2', 'capture']))
  );
}

function projectedLabel(
  kind: MediaDeviceKind,
  originalLabel: string,
  words: readonly string[],
): string {
  if (
    kind === 'audioinput' &&
    includesWords(words, ['microphone', 'realtek', 'r', 'audio'])
  ) {
    return 'Skriin Microphone';
  }

  if (!isSupportedConsoleModel(words)) {
    return originalLabel;
  }

  if (
    kind === 'videoinput' &&
    includesWords(words, ['video', '1', 'capture'])
  ) {
    return 'Console Video 1';
  }
  if (
    kind === 'videoinput' &&
    includesWords(words, ['video', '2', 'capture'])
  ) {
    return 'Console Video 2';
  }
  if (
    kind === 'audioinput' &&
    includesWords(words, ['analog', '1', 'audio'])
  ) {
    return 'Console Audio 1';
  }
  if (
    kind === 'audioinput' &&
    includesWords(words, ['analog', '2', 'audio'])
  ) {
    return 'Console Audio 2';
  }

  return originalLabel;
}

function normalizeLabel(label: string): string[] {
  return (label.toLowerCase().match(/[a-z]+|\d+/g) ?? []).map((word) =>
    /^\d+$/.test(word) ? String(Number(word)) : word,
  );
}

function isSupportedConsoleModel(words: readonly string[]): boolean {
  return SUPPORTED_CONSOLE_DEVICE_MODELS.some((model) =>
    includesWords(words, normalizeLabel(model)),
  );
}

function includesWords(
  words: readonly string[],
  expected: readonly string[],
): boolean {
  let expectedIndex = 0;
  for (const word of words) {
    if (word === expected[expectedIndex]) {
      expectedIndex += 1;
      if (expectedIndex === expected.length) return true;
    }
  }
  return false;
}
