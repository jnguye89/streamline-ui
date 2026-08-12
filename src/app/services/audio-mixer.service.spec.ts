import { connectAudioMixer } from './audio-mixer.service';

describe('audio mixer', () => {
  it('mixes the recorded fixtures through the final limiter', async () => {
    const decodingContext = new AudioContext();
    const [gameBuffer, microphoneBuffer] = await Promise.all([
      loadAudioFixture(decodingContext, 'a-sample.webm'),
      loadAudioFixture(decodingContext, 'b-sample.webm'),
    ]);
    await decodingContext.close();

    expect(gameBuffer.numberOfChannels).toBe(1);
    expect(microphoneBuffer.numberOfChannels).toBe(1);
    expect(microphoneBuffer.sampleRate).toBe(gameBuffer.sampleRate);

    const frameCount = Math.max(gameBuffer.length, microphoneBuffer.length);
    const context = new OfflineAudioContext(
      1,
      frameCount,
      gameBuffer.sampleRate,
    );
    const game = context.createBufferSource();
    const microphone = context.createBufferSource();
    game.buffer = gameBuffer;
    microphone.buffer = microphoneBuffer;

    connectAudioMixer(
      context,
      context.destination,
      { game, microphone },
      {
        gameLevel: 0.1,
        gameMuted: false,
        microphoneLevel: 0.1,
        microphoneMuted: false,
      },
    );
    game.start();
    microphone.start();

    const rendered = (await context.startRendering()).getChannelData(0);
    let renderedEnergy = 0;
    let peak = 0;
    for (let frame = 0; frame < frameCount; frame += 1) {
      renderedEnergy += rendered[frame] * rendered[frame];
      peak = Math.max(peak, Math.abs(rendered[frame]));
    }

    expect(renderedEnergy)
      .withContext('fixtures must contain audible samples')
      .toBeGreaterThan(0);
    expect(peak).withContext('limiter must prevent digital clipping').toBeLessThanOrEqual(1);
  });
});

async function loadAudioFixture(
  context: BaseAudioContext,
  filename: string,
): Promise<AudioBuffer> {
  const response = await fetch(`/test-data/${filename}`);
  if (!response.ok) {
    throw new Error(`Could not load ${filename}: HTTP ${response.status}`);
  }
  return context.decodeAudioData(await response.arrayBuffer());
}
