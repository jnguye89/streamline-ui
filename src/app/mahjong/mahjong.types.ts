import { BotLevel, GameLength, Pace, TileId, TileKind } from '@skriin/mahjong-core';

/** Everything the controller, short remote, keyboard or mouse can ask for. */
export type TvAction =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'select'
  | 'back'
  /** X: sorted ⇄ as-drawn hand (no undo after a discard in mahjong). */
  | 'sort'
  | 'hint'
  | 'menu'
  /** P key: cycle the review states (preview build only). */
  | 'preview';

export type Screen = 'start' | 'table';

/** Where the D-pad is working right now. */
export type Zone = 'hand' | 'actions' | 'claim' | 'chow';

export interface Settings {
  readonly length: GameLength;
  readonly botLevel: BotLevel;
  readonly pace: Pace;
  /** Western corner marks ("5", "E", "R"). On by default. */
  readonly marks: boolean;
  readonly sound: boolean;
  /** Ask for a second A before a discard. Off by default (approved). */
  readonly confirmDiscard: boolean;
  /** Beginner setting: running "faan so far" line. */
  readonly faanSoFar: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  length: 'quick',
  botLevel: 'medium',
  pace: 'normal',
  marks: true,
  sound: true,
  confirmDiscard: false,
  faanSoFar: false,
};

export const LEVEL_LABEL: Record<BotLevel, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};
export const LENGTH_LABEL: Record<GameLength, string> = {
  quick: 'Quick · East round',
  full: 'Full · 4 rounds',
};

/** Screen position of a seat relative to you. */
export type Spot = 'bottom' | 'right' | 'top' | 'left';
export const SPOTS: readonly Spot[] = ['bottom', 'right', 'top', 'left'];

export interface Hint {
  readonly discard: TileId | null;
  readonly waits: readonly TileKind[];
}

export interface Callout {
  readonly id: number;
  readonly spot: Spot;
  readonly text: string;
  readonly name: string;
  readonly bot: boolean;
}

export type ClaimButtonId = 'win' | 'kong' | 'pung' | 'chow' | 'pass';
