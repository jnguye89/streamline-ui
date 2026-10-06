import {
  createBackgroundFrameScheduler,
  FrameSchedulerGlobals,
} from './frame-scheduler';

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  posted: unknown[] = [];
  terminated = false;

  constructor(readonly url: string) {
    FakeWorker.instances.push(this);
  }

  postMessage(message: unknown): void {
    this.posted.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  tick(): void {
    this.onmessage?.({ data: 0 } as MessageEvent);
  }
}

function fakeGlobals(withWorker: boolean): FrameSchedulerGlobals & {
  setInterval: jasmine.Spy;
  clearInterval: jasmine.Spy;
  revokeObjectURL: jasmine.Spy;
} {
  return {
    Worker: withWorker ? (FakeWorker as unknown as typeof Worker) : undefined,
    Blob: withWorker ? Blob : undefined,
    createObjectURL: withWorker ? () => 'blob:ticker' : undefined,
    revokeObjectURL: jasmine.createSpy('revokeObjectURL'),
    setInterval: jasmine.createSpy('setInterval').and.returnValue(99),
    clearInterval: jasmine.createSpy('clearInterval'),
  };
}

describe('createBackgroundFrameScheduler', () => {
  beforeEach(() => {
    FakeWorker.instances = [];
  });

  it('ticks from a dedicated worker at the requested interval', () => {
    const globals = fakeGlobals(true);
    const callback = jasmine.createSpy('callback');

    const ticker = createBackgroundFrameScheduler(globals)!(callback, 1000 / 30);
    const worker = FakeWorker.instances[0];

    expect(worker.url).toBe('blob:ticker');
    expect(worker.posted).toEqual([33]);
    expect(globals.setInterval).not.toHaveBeenCalled();

    worker.tick();
    worker.tick();
    expect(callback).toHaveBeenCalledTimes(2);

    ticker.stop();
    worker.tick();
    expect(callback).toHaveBeenCalledTimes(2);
    expect(worker.terminated).toBeTrue();
    expect(globals.revokeObjectURL).toHaveBeenCalledWith('blob:ticker');
  });

  it('falls back to a plain interval when workers are unavailable', () => {
    const globals = fakeGlobals(false);
    const callback = jasmine.createSpy('callback');

    const ticker = createBackgroundFrameScheduler(globals)!(callback, 16.67);

    expect(globals.setInterval).toHaveBeenCalledOnceWith(
      jasmine.any(Function),
      17,
    );
    (globals.setInterval.calls.mostRecent().args[0] as () => void)();
    expect(callback).toHaveBeenCalledTimes(1);

    ticker.stop();
    expect(globals.clearInterval).toHaveBeenCalledWith(99);
  });

  it('falls back to a plain interval when the worker fails to start', () => {
    const globals = fakeGlobals(true);
    const callback = jasmine.createSpy('callback');

    createBackgroundFrameScheduler(globals)!(callback, 20);
    const worker = FakeWorker.instances[0];
    worker.onerror?.({} as ErrorEvent);

    expect(worker.terminated).toBeTrue();
    expect(globals.setInterval).toHaveBeenCalledOnceWith(
      jasmine.any(Function),
      20,
    );
  });

  it('keeps ticking in this browser and stops cleanly', async () => {
    const schedule = createBackgroundFrameScheduler()!;
    let ticks = 0;
    const ticker = schedule(() => ticks++, 10);

    await new Promise((resolve) => setTimeout(resolve, 250));
    ticker.stop();
    const seen = ticks;
    expect(seen).toBeGreaterThan(5);

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(ticks).toBe(seen);
  });
});
