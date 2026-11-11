/**
 * Shared types for skriin ai TV checkers.
 *
 * Squares use standard checkers numbering (1–32) stored 0-based (0–31).
 * "dark" is the side that moves first (called Black in American checkers rules);
 * dark starts on squares 1–12, light on 21–32.
 */

export type PieceColor = 'dark' | 'light';

export const opposite = (c: PieceColor): PieceColor => (c === 'dark' ? 'light' : 'dark');

/** What the rules engine sees on a square. */
export interface Cell {
  readonly color: PieceColor;
  readonly king: boolean;
}

export interface Position {
  /** 32 entries, index = square number − 1. */
  readonly cells: ReadonlyArray<Cell | null>;
  /** Side to move. */
  readonly turn: PieceColor;
}

/**
 * One complete move. A simple move has path = [to].
 * A jump has one landing square per hop and the jumped squares in `captures`.
 */
export interface Move {
  readonly from: number;
  readonly path: readonly number[];
  readonly captures: readonly number[];
  readonly promotes: boolean;
}

/**
 * no-pieces / no-moves: the loser has no piece or no legal move.
 * repetition: same position, same side to move, three times.
 * no-progress: 40 moves each with no capture and no man move (ACF 40-move rule).
 * agreement: the computer accepted the player's draw offer. resign: the player resigned.
 */
export type OutcomeReason = 'no-pieces' | 'no-moves' | 'repetition' | 'no-progress' | 'agreement' | 'resign';

export interface Outcome {
  /** null = draw */
  readonly winner: PieceColor | null;
  readonly reason: OutcomeReason;
}

/** A piece as the UI tracks it (stable id so moves animate). */
export interface Piece {
  readonly id: number;
  readonly color: PieceColor;
  readonly king: boolean;
  readonly sq: number;
}

export interface DisplayPiece extends Piece {
  /** Captured during the move being shown; fades out. */
  readonly gone: boolean;
}

export type Level = 'easy' | 'medium' | 'hard';
export type ThemeName = 'indigo' | 'midnight' | 'graphite';
export type Screen = 'start' | 'playing' | 'over';

export interface Settings {
  readonly level: Level;
  readonly playerColor: PieceColor;
  readonly theme: ThemeName;
  readonly sound: boolean;
  readonly numbers: boolean;
}

export interface MoveRecord {
  readonly color: PieceColor;
  readonly text: string;
}

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
  | 'menu';

export const LEVELS: readonly Level[] = ['easy', 'medium', 'hard'];
export const THEMES: readonly ThemeName[] = ['indigo', 'midnight', 'graphite'];

export const LEVEL_LABEL: Record<Level, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
export const THEME_LABEL: Record<ThemeName, string> = {
  indigo: 'Indigo',
  midnight: 'Midnight',
  graphite: 'Graphite',
};
