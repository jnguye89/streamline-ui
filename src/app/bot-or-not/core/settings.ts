import { Settings } from './types';

export const MIN_HUMANS = 3;
export const MAX_HUMANS = 8;
export const MAX_ANSWER_CHARS = 80;
/** The phone shows the character count from here on. */
export const SHOW_COUNT_FROM = 60;
export const MAX_NAME_CHARS = 12;
export const CARD_LETTERS = 'ABCDEFGHIJ';

/** Phase lengths (ms). Answer length comes from settings. */
export const PROMPT_MS = 3_000;
export const VOTE_MS = 20_000;
export const RESULTS_MS = 12_000;
export const VOID_MS = 3_500;
export const REVEAL_STEP_MS = 1_400;
export const REVEAL_HOLD_MS = 1_600;
/** Once everyone is in, the phase ends after this short beat (so the last ✓ is seen). */
export const ALL_IN_GRACE_MS = 900;

/** Room codes: 4 consonants, no vowels (no accidental words). */
export const CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ';

export const DEFAULT_SETTINGS: Settings = {
  rounds: 6,
  answerSeconds: 45,
  mode: 'classic',
  secondBot: true,
  familyMode: true,
  showNames: true,
};

export const ROUND_OPTIONS: readonly Settings['rounds'][] = [4, 6, 8];
export const ANSWER_OPTIONS: readonly Settings['answerSeconds'][] = [30, 45, 60];

/** How many bots play this round. */
export function botCount(settings: Settings, humans: number): 1 | 2 {
  return settings.secondBot && humans >= 7 ? 2 : 1;
}

/** Clamp anything a client sends to a valid Settings object. Live rooms keep family mode on. */
export function validateSettings(next: Partial<Settings>, current: Settings, live: boolean): Settings {
  const pick = <T>(value: T | undefined, allowed: readonly T[], fallback: T): T =>
    value !== undefined && allowed.includes(value) ? value : fallback;
  return {
    rounds: pick(next.rounds, ROUND_OPTIONS, current.rounds),
    answerSeconds: pick(next.answerSeconds, ANSWER_OPTIONS, current.answerSeconds),
    mode: pick(next.mode, ['classic', 'bluff'] as const, current.mode),
    secondBot: typeof next.secondBot === 'boolean' ? next.secondBot : current.secondBot,
    familyMode: live ? true : typeof next.familyMode === 'boolean' ? next.familyMode : current.familyMode,
    showNames: typeof next.showNames === 'boolean' ? next.showNames : current.showNames,
  };
}
