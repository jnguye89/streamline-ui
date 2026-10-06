import { FrameScheduler, FrameTicker } from '../models/media-input.models';

/**
 * The browser globals the scheduler relies on, overridable for tests and
 * absent where a global doesn't exist (SSR, old browsers).
 */
export interface FrameSchedulerGlobals {
  Worker?: typeof Worker;
  Blob?: typeof Blob;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
  setInterval: (callback: () => void, intervalMs: number) => unknown;
  clearInterval: (handle: unknown) => void;
}

// Runs inside a dedicated worker: one message carrying an interval (ms)
// starts ticking; 0 stops. Timers in a dedicated worker are not throttled
// when the owning tab is hidden, which is the whole point of this file.
const TICKER_WORKER_SOURCE = `
  let timer = null;
  self.onmessage = (event) => {
    if (timer !== null) clearInterval(timer);
    timer = null;
    const interval = Number(event.data);
    if (interval > 0) timer = setInterval(() => self.postMessage(0), interval);
  };
`;

/**
 * Builds a FrameScheduler that keeps ticking while the tab is in the
 * background. The published video is a canvas repainted on every tick; with
 * requestAnimationFrame that repaint stopped as soon as the streamer switched
 * tabs (to check Twitch, say), so every viewer saw a frozen frame. Hidden
 * documents get zero animation frames and window timers throttled to ~1 Hz,
 * but a dedicated worker's timers run at full rate, so the worker ticks and
 * the main thread paints on each message. Falls back to a plain interval
 * when workers are unavailable or fail to start.
 */
export function createBackgroundFrameScheduler(
  globals: FrameSchedulerGlobals | undefined = defaultGlobals(),
): FrameScheduler | undefined {
  if (!globals) return undefined;

  return (callback, intervalMs): FrameTicker => {
    const interval = Math.max(1, Math.round(intervalMs));
    let stopped = false;
    let intervalHandle: unknown;
    const tick = (): void => {
      if (!stopped) callback();
    };
    const useInterval = (): void => {
      if (stopped || intervalHandle !== undefined) return;
      intervalHandle = globals.setInterval(tick, interval);
    };

    const worker = createTickerWorker(globals);
    if (worker) {
      worker.instance.onmessage = tick;
      worker.instance.onerror = () => {
        // e.g. a CSP that forbids blob: workers. Keep the stream moving.
        worker.dispose();
        useInterval();
      };
      worker.instance.postMessage(interval);
    } else {
      useInterval();
    }

    return {
      stop: () => {
        stopped = true;
        worker?.dispose();
        if (intervalHandle !== undefined) {
          globals.clearInterval(intervalHandle);
          intervalHandle = undefined;
        }
      },
    };
  };
}

function createTickerWorker(
  globals: FrameSchedulerGlobals,
): { instance: Worker; dispose: () => void } | null {
  const { Worker: WorkerCtor, Blob: BlobCtor, createObjectURL, revokeObjectURL } =
    globals;
  if (!WorkerCtor || !BlobCtor || !createObjectURL) return null;

  let url: string | null = null;
  try {
    url = createObjectURL(
      new BlobCtor([TICKER_WORKER_SOURCE], { type: 'text/javascript' }),
    );
    const instance = new WorkerCtor(url);
    let disposed = false;
    return {
      instance,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        instance.onmessage = null;
        instance.onerror = null;
        instance.terminate();
        if (url) revokeObjectURL?.(url);
      },
    };
  } catch {
    if (url) revokeObjectURL?.(url);
    return null;
  }
}

function defaultGlobals(): FrameSchedulerGlobals | undefined {
  if (typeof setInterval === 'undefined') return undefined;
  const hasBlobUrls =
    typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';
  return {
    Worker: typeof Worker === 'undefined' ? undefined : Worker,
    Blob: typeof Blob === 'undefined' ? undefined : Blob,
    createObjectURL: hasBlobUrls ? (blob) => URL.createObjectURL(blob) : undefined,
    revokeObjectURL: hasBlobUrls ? (url) => URL.revokeObjectURL(url) : undefined,
    setInterval: (callback, intervalMs) => setInterval(callback, intervalMs),
    clearInterval: (handle) => clearInterval(handle as number),
  };
}
