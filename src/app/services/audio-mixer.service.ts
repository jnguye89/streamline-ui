import { AudioMixState } from '../models/media-input.models';

export interface AudioMixerSources {
  game: AudioNode | null;
  microphone: AudioNode | null;
}

export interface AudioMixerGains {
  game: GainNode | null;
  microphone: GainNode | null;
}

export function connectAudioMixer(
  context: BaseAudioContext,
  destination: AudioNode,
  sources: AudioMixerSources,
  state: AudioMixState,
): AudioMixerGains {
  const gains: AudioMixerGains = {
    game: connectSource(context, destination, sources.game),
    microphone: connectSource(context, destination, sources.microphone),
  };
  applyAudioMixState(context, gains, state, false);
  return gains;
}

export function applyAudioMixState(
  context: BaseAudioContext,
  gains: AudioMixerGains,
  state: AudioMixState,
  ramp: boolean,
): void {
  setGain(context, gains.game, state.gameMuted ? 0 : state.gameLevel, ramp);
  setGain(
    context,
    gains.microphone,
    state.microphoneMuted ? 0 : state.microphoneLevel,
    ramp,
  );
}

function connectSource(
  context: BaseAudioContext,
  destination: AudioNode,
  source: AudioNode | null,
): GainNode | null {
  if (!source) return null;
  const gain = context.createGain();
  source.connect(gain);
  gain.connect(destination);
  return gain;
}

function setGain(
  context: BaseAudioContext,
  node: GainNode | null,
  value: number,
  ramp: boolean,
): void {
  if (!node) return;
  if (!ramp) {
    node.gain.value = value;
    return;
  }
  node.gain.cancelScheduledValues(context.currentTime);
  node.gain.setTargetAtTime(value, context.currentTime, 0.02);
}
