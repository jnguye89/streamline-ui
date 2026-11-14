import { Level, MatchLength, Side } from '@skriin/backgammon-core';

/** Everything the controller, short remote, keyboard or mouse can ask for. */
export type TvAction =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'select'
  | 'back'
  | 'undo'
  | 'hint'
  | 'menu'
  /** Review only (keyboard P / Shift+P): cycle the preview states. */
  | 'preview-next'
  | 'preview-prev';

export type ThemeName = 'indigo' | 'midnight' | 'graphite';
export type PlayMode = 'bot' | 'couch';

export interface Settings {
  readonly mode: PlayMode;
  readonly level: Level;
  readonly matchLength: MatchLength;
  readonly cube: boolean;
  readonly jacoby: boolean;
  readonly theme: ThemeName;
  /** Board direction: false = home board bottom-right (default), true = bottom-left. */
  readonly homeLeft: boolean;
  /** true = the turn ends 1.5 s after the last die (X to undo); false = press Done. */
  readonly autoFinish: boolean;
  readonly pips: boolean;
  readonly sound: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  mode: 'bot',
  level: 'medium',
  matchLength: 3,
  cube: true,
  jacoby: true,
  theme: 'indigo',
  homeLeft: false,
  autoFinish: true,
  pips: true,
  sound: true,
};

export const LEVELS: readonly Level[] = ['easy', 'medium', 'hard'];
export const THEMES: readonly ThemeName[] = ['indigo', 'midnight', 'graphite'];
export const MATCH_LENGTHS: readonly MatchLength[] = [0, 1, 3, 5, 7];

export const LEVEL_LABEL: Record<Level, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
export const THEME_LABEL: Record<ThemeName, string> = { indigo: 'Indigo', midnight: 'Midnight', graphite: 'Graphite' };

export function matchLabel(n: MatchLength): string {
  return n === 0 ? 'Single game' : n === 1 ? '1 point' : `First to ${n}`;
}

/** Who sits where on this screen. Side 0 is always at the bottom on a local TV. */
export interface Seat {
  readonly side: Side;
  readonly name: string;
  /** "Your" / "Computer’s" / "Player 2’s" */
  readonly possessive: string;
  readonly isBot: boolean;
}
