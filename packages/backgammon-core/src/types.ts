/**
 * skriin ai TV · Backgammon — shared types and the engine contract.
 *
 * Board model (one absolute index scheme for every client and the server):
 *  - Two seats: side 0 and side 1 (seats, not colors). On a local TV, side 0 sits at the bottom.
 *  - pts[1..24] holds a signed count per absolute point: +n = n checkers of side 0, −n = n of side 1.
 *    pts[0] is unused.
 *  - Absolute point a is side 0's own point a and side 1's own point 25 − a.
 *  - Side 0 moves a → a − d and bears off below 1; side 1 moves a → a + d and bears off above 24.
 *  - bar[side] and off[side] count checkers on the bar and borne off.
 *  - In each player's own numbering the bar is 25 and off is 0 (used by notation).
 *  - Home boards: side 0 = absolute 1–6, side 1 = absolute 19–24.
 */

export type Side = 0 | 1;
export type Die = 1 | 2 | 3 | 4 | 5 | 6;
/** Where a checker starts a step: an absolute point 1–24, or the mover's own bar. */
export type Origin = number | 'bar';
/** Where a checker lands: an absolute point 1–24, or off the board. */
export type Target = number | 'off';
export type ResultKind = 'single' | 'gammon' | 'backgammon';
export type Level = 'easy' | 'medium' | 'hard';
export type Mode = 'bot' | 'couch' | 'online';
/** 0 = single game (points only, no match target). */
export type MatchLength = 0 | 1 | 3 | 5 | 7;
export type CubeValue = 1 | 2 | 4 | 8 | 16 | 32 | 64;

export interface Board {
  readonly pts: readonly number[];
  readonly bar: readonly [number, number];
  readonly off: readonly [number, number];
}

/** One die played by one checker. */
export interface Step {
  readonly from: Origin;
  readonly to: Target;
  readonly die: Die;
  readonly hit: boolean;
}

/** A spot the selected checker can go to. More than one step = a combined spot (one checker, several dice). */
export interface Destination {
  readonly to: Target;
  readonly steps: readonly Step[];
}

/** A full play for the rest of the turn. `key` identifies the final position. */
export interface Play {
  readonly steps: readonly Step[];
  readonly key: string;
  readonly notation: string;
}

/** owner null = cube in the middle (its face shows 64 while the value is 1). */
export interface Cube {
  readonly value: CubeValue;
  readonly owner: Side | null;
}

export type Phase =
  | 'opening' // each side rolls one die; higher die moves first with both dice
  | 'pre-roll' // side to move may double, or rolls
  | 'double-offered'
  | 'moving'
  | 'turn-done' // dice used or no legal move; the turn ends on commit()
  | 'resign-offered'
  | 'game-over'
  | 'match-over';

export interface MatchConfig {
  readonly length: MatchLength;
  readonly cube: boolean;
  /** Jacoby rule, single games only: gammons and backgammons count only after the cube was turned. */
  readonly jacoby: boolean;
  readonly mode: Mode;
  readonly level: Level;
}

export interface MatchInfo {
  readonly length: MatchLength;
  /** Game number in this match (or session of single games), from 1. */
  readonly game: number;
  /** This game is the Crawford game: nobody may double. */
  readonly crawford: boolean;
  /** The Crawford game has been played; doubling is allowed again. */
  readonly postCrawford: boolean;
}

export type Offer =
  | { readonly kind: 'double'; readonly by: Side; readonly to: CubeValue }
  | { readonly kind: 'resign'; readonly by: Side; readonly result: ResultKind; readonly points: number };

export interface GameResult {
  readonly winner: Side;
  readonly kind: ResultKind;
  readonly points: number;
  /** The loser dropped a double. */
  readonly byDrop: boolean;
  /** The loser resigned and the winner accepted. */
  readonly byResign: boolean;
}

export interface LogEntry {
  readonly game: number;
  readonly side: Side;
  readonly kind: 'move' | 'cube' | 'result';
  readonly dice: readonly Die[] | null;
  readonly text: string;
}

/** What just happened. The UI animates one event per snapshot, in order. */
export type GameEvent =
  | { readonly type: 'load' }
  | { readonly type: 'new-game'; readonly game: number }
  | { readonly type: 'opening'; readonly dice: readonly [Die, Die]; readonly tie: boolean }
  | { readonly type: 'roll'; readonly side: Side; readonly dice: readonly [Die, Die] }
  | { readonly type: 'step'; readonly side: Side; readonly step: Step; readonly auto: boolean }
  | { readonly type: 'undo'; readonly side: Side; readonly steps: readonly Step[] }
  | { readonly type: 'no-moves'; readonly side: Side }
  | { readonly type: 'commit'; readonly side: Side }
  | { readonly type: 'thinking'; readonly side: Side }
  | { readonly type: 'double'; readonly by: Side; readonly to: CubeValue }
  | { readonly type: 'take'; readonly by: Side; readonly value: CubeValue }
  | { readonly type: 'drop'; readonly by: Side }
  | { readonly type: 'resign-offer'; readonly by: Side; readonly result: ResultKind }
  | { readonly type: 'resign-declined'; readonly by: Side }
  | { readonly type: 'game-over'; readonly result: GameResult };

export interface Snapshot {
  /** Increases by one on every change. */
  readonly seq: number;
  readonly event: GameEvent | null;
  readonly config: MatchConfig;
  readonly board: Board;
  readonly turn: Side;
  readonly phase: Phase;
  /** Sides this screen plays: bot [0] · couch [0, 1] · online [mine]. */
  readonly localSides: readonly Side[];
  /** Last opening roll: [side 0's die, side 1's die]. */
  readonly opening: readonly [Die, Die] | null;
  readonly dice: readonly [Die, Die] | null;
  /** Dice not played yet this turn (four entries for doubles). */
  readonly diceLeft: readonly Die[];
  /** Steps played this turn, in order. */
  readonly turnSteps: readonly Step[];
  readonly canUndo: boolean;
  readonly noMoves: boolean;
  readonly thinking: boolean;
  readonly cube: Cube;
  readonly canDouble: boolean;
  readonly pips: readonly [number, number];
  readonly score: readonly [number, number];
  readonly match: MatchInfo;
  readonly offer: Offer | null;
  readonly result: GameResult | null;
  readonly matchWinner: Side | null;
  readonly log: readonly LogEntry[];
}

export interface DiceRoll {
  readonly k: number;
  readonly dice: readonly [Die, Die];
}

/** Everything needed to prove the dice: commitment first, seeds revealed after the match. */
export interface DiceLedger {
  /** SHA-256(serverSeed), published before the first roll (hex). */
  readonly commitment: string;
  /** Hex; null until revealed after the match. */
  readonly serverSeed: string | null;
  readonly clientSeeds: readonly string[];
  readonly rolls: readonly DiceRoll[];
}

/**
 * The only way the UI talks to the game. Implemented by the local engine (computer / couch),
 * the Phase 1 placeholder, and later the online room client (the server stays the authority).
 * Commands that don't apply to the current state are ignored.
 */
export interface BackgammonEngine {
  snapshot(): Snapshot;
  subscribe(listener: (s: Snapshot) => void): () => void;

  newMatch(config: MatchConfig): void;
  nextGame(): void;

  roll(): void;
  double(): void;
  answerDouble(take: boolean): void;

  /** Origins holding a checker that starts a legal play (bar first when entering). */
  movable(): readonly Origin[];
  /** Legal spots for the checker at `from`, single dice and combined spots. */
  destinations(from: Origin): readonly Destination[];
  /** Plays a destination; a forced remainder plays itself. */
  move(d: Destination): void;
  /** Takes back the last checker move of this turn (with any forced remainder it caused). */
  undo(): void;
  /** Ends the turn (Done, or the end of the grace time). */
  commit(): void;

  /** Best play for the rest of the turn, or null. */
  hint(): Promise<Play | null>;
  offerResign(result: ResultKind): void;
  answerResign(accept: boolean): void;

  diceLedger(): DiceLedger;
  /** Match log as text (.mat format). */
  exportMatch(): string;
}
