import { connectAudioMixer } from './audio-mixer.service';

describe('audio mixer', () => {
  it('mixes the recorded A and B fixtures sample-for-sample', async () => {
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
        gameLevel: 0.625,
        gameMuted: false,
        microphoneLevel: 1,
        microphoneMuted: false,
      },
    );
    game.start();
    microphone.start();

    const rendered = (await context.startRendering()).getChannelData(0);
    const gameSamples = gameBuffer.getChannelData(0);
    const microphoneSamples = microphoneBuffer.getChannelData(0);
    let maximumError = 0;
    let expectedEnergy = 0;
    for (let frame = 0; frame < frameCount; frame += 1) {
      const expected =
        (gameSamples[frame] ?? 0) * 0.625 +
        (microphoneSamples[frame] ?? 0);
      maximumError = Math.max(maximumError, Math.abs(rendered[frame] - expected));
      expectedEnergy += expected * expected;
    }

    expect(expectedEnergy)
      .withContext('fixtures must contain audible samples')
      .toBeGreaterThan(0);
    expect(maximumError)
      .withContext('maximum error across the entire rendered fixture mix')
      .toBeLessThan(0.000001);
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
