import { createVideoCompositor } from './video-compositor.service';

describe('video compositor', () => {
  it('contains the main source and crops the facecam into the lower right', () => {
    const primary = fakeVideo(1920, 1080);
    const overlay = fakeVideo(640, 480);
    const videos = [primary, overlay];
    const context = jasmine.createSpyObj<CanvasRenderingContext2D>(
      'context',
      ['fillRect', 'drawImage', 'strokeRect'],
    );
    const outputTrack = jasmine.createSpyObj<MediaStreamTrack>('track', ['stop']);
    const captureStream = jasmine
      .createSpy('captureStream')
      .and.returnValue({ getVideoTracks: () => [outputTrack] });
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => context,
      captureStream,
    } as unknown as HTMLCanvasElement;
    const requestAnimationFrame = jasmine
      .createSpy('requestAnimationFrame')
      .and.returnValue(7);

    const session = createVideoCompositor(
      {
        createVideoElement: () => videos.shift()!,
        createCanvasElement: () => canvas,
        requestAnimationFrame,
        cancelAnimationFrame: jasmine.createSpy('cancelAnimationFrame'),
      },
      mediaStream(),
      mediaStream(),
      { width: 1920, height: 1080, frameRate: 60 },
    );

    expect(session?.track).toBe(outputTrack);
    expect(captureStream).toHaveBeenCalledOnceWith(60);
    expect(context.drawImage as jasmine.Spy).toHaveBeenCalledWith(
      primary,
      0,
      0,
      1920,
      1080,
    );
    expect(context.drawImage as jasmine.Spy).toHaveBeenCalledWith(
      overlay,
      0,
      60,
      640,
      360,
      1497.6,
      825.6,
      384,
      216,
    );
  });

  it('repaints from the frame scheduler instead of requestAnimationFrame when one is provided', () => {
    const primary = fakeVideo(1280, 720);
    const context = jasmine.createSpyObj<CanvasRenderingContext2D>(
      'context',
      ['fillRect', 'drawImage', 'strokeRect'],
    );
    const outputTrack = jasmine.createSpyObj<MediaStreamTrack>('track', ['stop']);
    const ticker = { stop: jasmine.createSpy('stop') };
    const scheduleFrames = jasmine
      .createSpy('scheduleFrames')
      .and.returnValue(ticker);
    const requestAnimationFrame = jasmine.createSpy('requestAnimationFrame');
    const cancelAnimationFrame = jasmine.createSpy('cancelAnimationFrame');

    const session = createVideoCompositor(
      {
        createVideoElement: () => primary,
        createCanvasElement: () =>
          ({
            width: 0,
            height: 0,
            getContext: () => context,
            captureStream: () => ({ getVideoTracks: () => [outputTrack] }),
          }) as unknown as HTMLCanvasElement,
        requestAnimationFrame,
        cancelAnimationFrame,
        scheduleFrames,
      },
      mediaStream(),
      null,
      { width: 1280, height: 720, frameRate: 30 },
    )!;

    // First frame is painted immediately, then the scheduler owns the cadence.
    expect(context.drawImage).toHaveBeenCalledTimes(1);
    expect(scheduleFrames).toHaveBeenCalledOnceWith(
      jasmine.any(Function),
      1000 / 30,
    );
    expect(requestAnimationFrame).not.toHaveBeenCalled();

    const repaint = scheduleFrames.calls.mostRecent().args[0] as () => void;
    repaint();
    expect(context.drawImage).toHaveBeenCalledTimes(2);

    session.dispose();
    expect(ticker.stop).toHaveBeenCalled();
    expect(cancelAnimationFrame).not.toHaveBeenCalled();
    // A worker tick that lands after dispose must not paint a torn-down canvas.
    repaint();
    expect(context.drawImage).toHaveBeenCalledTimes(2);
  });

  it('keeps its output track while replacing sources and cleans up', () => {
    const primary = fakeVideo(1280, 720);
    const overlay = fakeVideo(1280, 720);
    const outputTrack = jasmine.createSpyObj<MediaStreamTrack>('track', ['stop']);
    const cancel = jasmine.createSpy('cancelAnimationFrame');
    const session = createVideoCompositor(
      {
        createVideoElement: () => (primary.srcObject ? overlay : primary),
        createCanvasElement: () =>
          ({
            width: 0,
            height: 0,
            getContext: () =>
              jasmine.createSpyObj('context', [
                'fillRect',
                'drawImage',
                'strokeRect',
              ]),
            captureStream: () => ({ getVideoTracks: () => [outputTrack] }),
          }) as unknown as HTMLCanvasElement,
        requestAnimationFrame: () => 11,
        cancelAnimationFrame: cancel,
      },
      mediaStream(),
      null,
    )!;
    const replacement = mediaStream();

    session.setOverlay(replacement);
    expect(session.track).toBe(outputTrack);
    expect(overlay.srcObject).toBe(replacement);
    session.dispose();

    expect(cancel).toHaveBeenCalledWith(11);
    expect(outputTrack.stop).toHaveBeenCalled();
    expect(primary.srcObject).toBeNull();
    expect(overlay.srcObject).toBeNull();
  });
});

function fakeVideo(width: number, height: number): HTMLVideoElement {
  return {
    muted: false,
    playsInline: false,
    srcObject: null,
    readyState: HTMLMediaElement.HAVE_CURRENT_DATA,
    videoWidth: width,
    videoHeight: height,
    play: () => Promise.resolve(),
    pause: jasmine.createSpy('pause'),
  } as unknown as HTMLVideoElement;
}

function mediaStream(): MediaStream {
  return {} as MediaStream;
}
