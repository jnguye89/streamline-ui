export interface VideoCompositorSession {
  readonly track: MediaStreamTrack;
  setPrimary(stream: MediaStream): void;
  setOverlay(stream: MediaStream | null): void;
  dispose(): void;
}

export interface VideoCompositorEnvironment {
  createVideoElement: () => HTMLVideoElement;
  createCanvasElement: () => HTMLCanvasElement;
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame: (handle: number) => void;
}

const DEFAULT_FRAME_RATE = 30;
const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;
const OVERLAY_WIDTH_RATIO = 0.2;
const OVERLAY_MARGIN_RATIO = 0.02;
const OVERLAY_ASPECT_RATIO = 16 / 9;

export function createVideoCompositor(
  environment: VideoCompositorEnvironment,
  primary: MediaStream,
  overlay: MediaStream | null,
  outputSize: { width?: number; height?: number; frameRate?: number } = {},
): VideoCompositorSession | null {
  const canvas = environment.createCanvasElement();
  const context = canvas.getContext('2d');
  if (!context || typeof canvas.captureStream !== 'function') return null;

  canvas.width = outputSize.width || DEFAULT_WIDTH;
  canvas.height = outputSize.height || DEFAULT_HEIGHT;
  const primaryVideo = createSourceVideo(environment, primary);
  const overlayVideo = createSourceVideo(environment, overlay);
  let frameHandle = 0;
  let disposed = false;

  const render = (): void => {
    if (disposed) return;
    context.fillStyle = '#000';
    context.fillRect(0, 0, canvas.width, canvas.height);
    drawContained(context, primaryVideo, canvas.width, canvas.height);
    drawOverlay(context, overlayVideo, canvas.width, canvas.height);
    frameHandle = environment.requestAnimationFrame(render);
  };
  render();

  const outputFrameRate =
    outputSize.frameRate && outputSize.frameRate > 0
      ? outputSize.frameRate
      : DEFAULT_FRAME_RATE;
  const output = canvas.captureStream(outputFrameRate);
  const track = output.getVideoTracks()[0];
  if (!track) {
    disposed = true;
    environment.cancelAnimationFrame(frameHandle);
    detachVideo(primaryVideo);
    detachVideo(overlayVideo);
    return null;
  }

  return {
    track,
    setPrimary: (stream) => attachVideo(primaryVideo, stream),
    setOverlay: (stream) => attachVideo(overlayVideo, stream),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      environment.cancelAnimationFrame(frameHandle);
      detachVideo(primaryVideo);
      detachVideo(overlayVideo);
      track.stop();
    },
  };
}

function createSourceVideo(
  environment: VideoCompositorEnvironment,
  stream: MediaStream | null,
): HTMLVideoElement {
  const video = environment.createVideoElement();
  video.muted = true;
  video.playsInline = true;
  attachVideo(video, stream);
  return video;
}

function attachVideo(video: HTMLVideoElement, stream: MediaStream | null): void {
  if (video.srcObject === stream) return;
  video.srcObject = stream;
  if (stream) void video.play().catch(() => undefined);
}

function detachVideo(video: HTMLVideoElement): void {
  video.pause();
  video.srcObject = null;
}

function drawContained(
  context: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  width: number,
  height: number,
): void {
  if (!isDrawable(video)) return;
  const scale = Math.min(width / video.videoWidth, height / video.videoHeight);
  const drawWidth = video.videoWidth * scale;
  const drawHeight = video.videoHeight * scale;
  context.drawImage(
    video,
    (width - drawWidth) / 2,
    (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

function drawOverlay(
  context: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  width: number,
  height: number,
): void {
  if (!isDrawable(video) || !video.srcObject) return;
  const overlayWidth = width * OVERLAY_WIDTH_RATIO;
  const overlayHeight = overlayWidth / OVERLAY_ASPECT_RATIO;
  const margin = width * OVERLAY_MARGIN_RATIO;
  const x = width - overlayWidth - margin;
  const y = height - overlayHeight - margin;
  const sourceRatio = video.videoWidth / video.videoHeight;
  const targetRatio = overlayWidth / overlayHeight;
  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = video.videoWidth;
  let sourceHeight = video.videoHeight;
  if (sourceRatio > targetRatio) {
    sourceWidth = video.videoHeight * targetRatio;
    sourceX = (video.videoWidth - sourceWidth) / 2;
  } else {
    sourceHeight = video.videoWidth / targetRatio;
    sourceY = (video.videoHeight - sourceHeight) / 2;
  }
  context.drawImage(
    video,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    x,
    y,
    overlayWidth,
    overlayHeight,
  );
  context.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  context.lineWidth = Math.max(2, width / 960);
  context.strokeRect(x, y, overlayWidth, overlayHeight);
}

function isDrawable(video: HTMLVideoElement): boolean {
  return video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
    video.videoWidth > 0 && video.videoHeight > 0;
}
