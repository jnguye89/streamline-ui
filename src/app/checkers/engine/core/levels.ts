import { ThinkRequest } from './search';

export type EngineLevel = 'easy' | 'medium' | 'hard';
export type SearchConfig = Omit<ThinkRequest, 'history' | 'random'>;

/**
 * Easy   – looks 2 moves ahead and plays loosely (scores ± up to 1.2 men of noise): misses shots.
 * Medium – looks 6 moves ahead with light noise: solid, beatable.
 * Hard   – full strength: deepest search that fits in ~1.6 s, no noise, avoids draws when ahead.
 * Every level takes forced jumps correctly and never walks into an immediate forced loss when a safe move exists.
 */
export const LEVEL_CONFIG: Record<EngineLevel, SearchConfig> = {
  easy: { mode: 'noisy', maxDepth: 2, timeMs: 1500, noise: 120 },
  medium: { mode: 'noisy', maxDepth: 6, timeMs: 2500, noise: 25 },
  hard: { mode: 'best', maxDepth: 64, timeMs: 1600, contempt: 15 },
};

/** Hint (Y) and draw offers use a short full-strength search. */
export const HINT_CONFIG: SearchConfig = { mode: 'best', maxDepth: 64, timeMs: 800 };
export const EVAL_CONFIG: SearchConfig = { mode: 'best', maxDepth: 64, timeMs: 700 };
