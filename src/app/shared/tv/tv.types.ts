/**
 * Everything the controller, short remote, keyboard or mouse can ask for.
 * Same union as checkers v2 (checkers.types.ts), so TvInputService is shared unchanged.
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
  | 'menu';

/** Fixed TV stage. Everything on the TV is laid out at 1920×1080 and scaled to the screen. */
export const STAGE_W = 1920;
export const STAGE_H = 1080;
