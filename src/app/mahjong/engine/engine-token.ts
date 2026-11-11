import { DestroyRef, InjectionToken, Provider, inject } from '@angular/core';
import { MahjongEngine } from '@skriin/mahjong-core';
import { PlaceholderEngine } from './placeholder/placeholder-engine';

/** The UI only ever sees this interface. Phase 2: local core engine + worker bots. Phase 3: online room. */
export const MAHJONG_ENGINE = new InjectionToken<MahjongEngine>('MAHJONG_ENGINE');

/** Phase 1: the placeholder engine (simplified rules, main-thread bots). */
export function providePlaceholderEngine(): Provider {
  return {
    provide: MAHJONG_ENGINE,
    useFactory: () => {
      const engine = new PlaceholderEngine();
      inject(DestroyRef).onDestroy(() => engine.dispose());
      return engine;
    },
  };
}
