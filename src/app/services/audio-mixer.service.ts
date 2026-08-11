import { AudioMixState } from '../models/media-input.models';

export interface AudioMixerSources {
  game: AudioNode | null;
  microphone: AudioNode | null;
}

export interface AudioMixerChannelNodes {
  level: GainNode;
  analyser: AnalyserNode;
  mute: GainNode;
}

export interface AudioMixerChannels {
  game: AudioMixerChannelNodes | null;
  microphone: AudioMixerChannelNodes | null;
}

export function connectAudioMixer(
  context: BaseAudioContext,
  destination: AudioNode,
  sources: AudioMixerSources,
  state: AudioMixState,
): AudioMixerChannels {
  const channels: AudioMixerChannels = {
    game: connectSource(context, destination, sources.game),
    microphone: connectSource(context, destination, sources.microphone),
  };
  applyAudioMixState(context, channels, state, false);
  return channels;
}

export function applyAudioMixState(
  context: BaseAudioContext,
  channels: AudioMixerChannels,
  state: AudioMixState,
  ramp: boolean,
): void {
  setGain(context, channels.game?.level ?? null, state.gameLevel, ramp);
  setGain(context, channels.game?.mute ?? null, state.gameMuted ? 0 : 1, ramp);
  setGain(
    context,
    channels.microphone?.level ?? null,
    state.microphoneLevel,
    ramp,
  );
  setGain(
    context,
    channels.microphone?.mute ?? null,
    state.microphoneMuted ? 0 : 1,
    ramp,
  );
}

function connectSource(
  context: BaseAudioContext,
  destination: AudioNode,
  source: AudioNode | null,
): AudioMixerChannelNodes | null {
  if (!source) return null;
  const level = context.createGain();
  const analyser = context.createAnalyser();
  const mute = context.createGain();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.75;
  source.connect(level);
  level.connect(analyser);
  analyser.connect(mute);
  mute.connect(destination);
  return { level, analyser, mute };
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
