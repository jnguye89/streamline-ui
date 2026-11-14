import { Injectable, InjectionToken } from '@angular/core';

/**
 * Read-aloud (Phase 4). The TV can't use Yap's voice as a TTS endpoint, so a TTS service will be
 * picked in Phase 4 and called from the server; the TV only plays what it gets back.
 * v1 ships the no-op below.
 */
export interface TtsProvider {
  readonly enabled: boolean;
  /** Speak a prompt or a card. Resolves when done (or at once when off). */
  speak(text: string, opts?: { readonly kind: 'prompt' | 'card' | 'verdict' }): Promise<void>;
  /** Stop anything playing (skip, menu, leaving the game). */
  stop(): void;
}

export const TTS_PROVIDER = new InjectionToken<TtsProvider>('TTS_PROVIDER');

@Injectable()
export class NoopTtsProvider implements TtsProvider {
  readonly enabled = false;
  speak(): Promise<void> {
    return Promise.resolve();
  }
  stop(): void {}
}
