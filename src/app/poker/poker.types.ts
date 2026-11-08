import { BotLevel, GameType } from './core/api';

/**
 * Everything the controller, short remote, keyboard or mouse can ask for.
 * Same names as checkers v2, plus LT/RT (bet-size presets) and P (preview states, review only).
 * In poker: undo (X) opens the last-hand log, hint (Y) shows/hides my cards.
 */
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
  | 'lt'
  | 'rt'
  | 'preview';

export type PokerMode = 'bots' | 'friends' | 'couch';

export interface PokerSettings {
  readonly gameType: GameType;
  readonly botLevel: BotLevel;
  /** Players at the table including you (2–6). */
  readonly players: number;
  /** "Pair of nines" under your cards (only you see it). */
  readonly handLabel: boolean;
  /** Host setting; on = every hand still in at showdown flips by itself. */
  readonly autoShow: boolean;
  readonly sound: boolean;
  readonly animations: boolean;
}

export const DEFAULT_SETTINGS: PokerSettings = {
  gameType: 'home',
  botLevel: 'medium',
  players: 6,
  handLabel: true,
  autoShow: true,
  sound: true,
  animations: true,
};

export const BOT_LEVEL_LABEL: Record<BotLevel, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
export const GAME_TYPE_LABEL: Record<GameType, string> = { home: 'Home game', sitAndGo: 'Sit & Go' };

/** Screen positions around the oval, clockwise from you at the bottom. */
export type SeatSlot = 0 | 1 | 2 | 3 | 4 | 5;

/** Flags that change what the TV shows without changing the game. */
export interface ScreenFlags {
  /** The TV is live: anything on screen can end up on a stream. */
  readonly live: boolean;
  /** Your hole cards are on your phone, not on the TV (streamer mode with people at the table). */
  readonly cardsOnPhone: boolean;
  /** Y toggled your cards off. */
  readonly cardsHidden: boolean;
  /** Link the QR on the TV opens (streamer mode / couch join). */
  readonly joinUrl: string | null;
  readonly handLabel: boolean;
  readonly animations: boolean;
  /** Small mode line in the corner, e.g. "vs bots · Medium". */
  readonly modeLine: string;
}
