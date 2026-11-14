import { DestroyRef, Injectable, inject } from '@angular/core';
import { TvInputService } from './tv-input.service';
import { TvAction } from './tv.types';

/** A press that arrives from both the Gamepad API and the Windows helper's key events lands within this window. */
const SAME_PRESS_MS = 150;

type Listener = (a: TvAction) => void;

/**
 * Wraps the checkers TvInputService (unchanged) so one physical press never fires twice.
 *
 * On the box, Bryan's Windows helper may turn controller presses into key presses while the browser
 * also reads the controller through the Gamepad API. Both arrive here: the same action from a
 * different source within 150 ms is dropped. Repeats from the same source (a held D-pad) still pass.
 */
@Injectable()
export class TvInput {
  private readonly raw = inject(TvInputService);
  private readonly listeners = new Set<Listener>();
  private last: { action: TvAction; source: string; at: number } | null = null;

  constructor() {
    const off = this.raw.on((a) => this.onRaw(a));
    inject(DestroyRef).onDestroy(() => {
      off();
      this.listeners.clear();
    });
  }

  /** Subscribe; returns an unsubscribe function. */
  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** For on-screen buttons clicked with a mouse. */
  emit(a: TvAction): void {
    this.raw.emit(a, 'pointer');
  }

  private onRaw(action: TvAction): void {
    const source = this.raw.lastSource();
    const at = performance.now();
    const prev = this.last;
    this.last = { action, source, at };
    if (prev && prev.action === action && prev.source !== source && at - prev.at < SAME_PRESS_MS) return;
    for (const fn of [...this.listeners]) fn(action);
  }
}
