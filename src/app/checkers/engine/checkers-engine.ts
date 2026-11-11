import { InjectionToken } from '@angular/core';
import { Level, Move, Outcome, Position } from '../checkers.types';

/** The contract between the UI and the rules + computer player. */
export interface CheckersEngine {
  readonly name: string;
  /** Start position, dark to move. */
  initial(): Position;
  /** Every legal move for the side to move (complete multi-jump paths; forced jumps only when a jump exists). */
  legalMoves(pos: Position): Move[];
  /** Plays a legal move. Throws if the move is not legal. */
  apply(pos: Position, move: Move): Position;
  /** history[0] = start, last = current position. null while the game goes on. */
  outcome(history: readonly Position[]): Outcome | null;
  /** The computer's move for the side to move. null if cancelled. */
  chooseMove(history: readonly Position[], level: Level): Promise<Move | null>;
  /** Best move for the side to move (Y = hint). null if none or cancelled. */
  hint(history: readonly Position[]): Promise<Move | null>;
  /** Score for the side to move in centi-men (+100 ≈ a man up). null if cancelled. */
  evaluate(history: readonly Position[]): Promise<number | null>;
  /** Abandons any computer thinking in progress. */
  cancel(): void;
}

export const CHECKERS_ENGINE = new InjectionToken<CheckersEngine>('CHECKERS_ENGINE');
