import {
  Board,
  Cube,
  Die,
  GameResult,
  LogEntry,
  MatchLength,
  Offer,
  Origin,
  Phase,
  Side,
  boardFromOwn,
  startBoard,
} from '@skriin/backgammon-core';

/**
 * Preview states for design review (keyboard P cycles forward, Shift+P back).
 * Side 0 = you (bottom), side 1 = the computer. Positions are written in each side's own numbering.
 */
export interface Scenario {
  readonly id: string;
  readonly label: string;
  readonly length: MatchLength;
  readonly board: Board;
  readonly turn: Side;
  readonly phase: Phase;
  readonly dice?: readonly [Die, Die];
  readonly cube?: Cube;
  readonly score?: readonly [number, number];
  readonly game?: number;
  readonly crawford?: boolean;
  readonly postCrawford?: boolean;
  readonly offer?: Offer;
  readonly result?: GameResult;
  readonly matchWinner?: Side;
  readonly noMoves?: boolean;
  readonly log?: readonly LogEntry[];
  /** Rolls to use next (preview only, not part of the fair-dice ledger). */
  readonly nextRolls?: readonly (readonly [Die, Die])[];
  /** Checker already picked when the state loads. */
  readonly select?: Origin;
}

const mid = () =>
  boardFromOwn(
    { points: { 24: 1, 13: 4, 8: 3, 6: 5, 5: 2 } },
    { points: { 24: 2, 13: 3, 8: 2, 6: 4, 4: 2, 3: 2 } },
  );

const midLog = (game = 1): LogEntry[] => [
  { game, side: 0, kind: 'move', dice: [3, 1], text: '8/5 6/5' },
  { game, side: 1, kind: 'move', dice: [6, 4], text: '13/7 13/9' },
  { game, side: 0, kind: 'move', dice: [6, 2], text: '24/18 13/11' },
  { game, side: 1, kind: 'move', dice: [5, 5], text: '9/4(2) 7/2*(2)' },
  { game, side: 0, kind: 'move', dice: [4, 3], text: 'bar/21 18/11' },
  { game, side: 1, kind: 'move', dice: [3, 2], text: '6/3 5/3' },
];

export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'opening',
    label: 'Opening roll',
    length: 3,
    board: startBoard(),
    turn: 0,
    phase: 'opening',
    nextRolls: [[5, 3]],
  },
  {
    id: 'roll-double',
    label: 'Your roll · Double available',
    length: 3,
    board: mid(),
    turn: 0,
    phase: 'pre-roll',
    log: midLog(),
    nextRolls: [[6, 4]],
  },
  {
    id: 'moving',
    label: 'Moving · destinations shown',
    length: 3,
    board: boardFromOwn(
      { points: { 24: 2, 13: 5, 8: 3, 6: 5 } },
      { points: { 24: 2, 13: 4, 8: 3, 6: 5, 4: 1 } },
    ),
    turn: 0,
    phase: 'moving',
    dice: [6, 4],
    select: 24,
    log: [
      { game: 1, side: 1, kind: 'move', dice: [2, 1], text: '13/11 6/5' },
      { game: 1, side: 0, kind: 'move', dice: [5, 4], text: '13/8 13/9' },
      { game: 1, side: 1, kind: 'move', dice: [6, 1], text: '11/5 5/4' },
    ],
  },
  {
    id: 'hit-bar',
    label: 'Hit · checker on the bar',
    length: 3,
    board: boardFromOwn(
      { points: { 13: 4, 8: 3, 6: 5, 24: 1, 5: 1 }, bar: 1 },
      { points: { 24: 2, 13: 3, 8: 2, 7: 2, 6: 4, 4: 1, 3: 1 } },
    ),
    turn: 0,
    phase: 'moving',
    dice: [4, 2],
    log: [...midLog().slice(0, 4), { game: 1, side: 1, kind: 'move', dice: [6, 1], text: '13/7* 8/7' }],
  },
  {
    id: 'closed',
    label: 'Closed board · no move',
    length: 3,
    board: boardFromOwn(
      { points: { 13: 5, 8: 4, 6: 5 }, bar: 1 },
      { points: { 6: 2, 5: 2, 4: 2, 3: 2, 2: 2, 1: 2, 13: 3 } },
    ),
    turn: 0,
    phase: 'turn-done',
    dice: [6, 3],
    noMoves: true,
    log: midLog(),
  },
  {
    id: 'bearoff',
    label: 'Bearing off · higher die',
    length: 3,
    board: boardFromOwn(
      { points: { 4: 3, 3: 4, 2: 4, 1: 2 }, off: 2 },
      { points: { 13: 5, 8: 5, 6: 5 } },
    ),
    turn: 0,
    phase: 'moving',
    dice: [6, 1],
    select: 4,
    log: [
      { game: 1, side: 0, kind: 'move', dice: [5, 5], text: '5/off(2)' },
      { game: 1, side: 1, kind: 'move', dice: [4, 2], text: '17/13 10/8' },
    ],
  },
  {
    id: 'double-offer',
    label: 'Double · you offer',
    length: 3,
    board: mid(),
    turn: 0,
    phase: 'double-offered',
    offer: { kind: 'double', by: 0, to: 2 },
    log: [...midLog(), { game: 1, side: 0, kind: 'cube', dice: null, text: 'Doubles → 2' }],
    nextRolls: [[5, 2]],
  },
  {
    id: 'double-answer',
    label: 'Double · you answer',
    length: 3,
    board: boardFromOwn(
      { points: { 24: 2, 13: 3, 8: 2, 6: 4, 4: 2, 3: 2 } },
      { points: { 24: 1, 13: 4, 8: 3, 6: 5, 5: 2 } },
    ),
    turn: 1,
    phase: 'double-offered',
    offer: { kind: 'double', by: 1, to: 2 },
    log: [
      ...midLog().slice(0, 5),
      { game: 1, side: 0, kind: 'move', dice: [2, 1], text: '6/4 4/3' },
      { game: 1, side: 1, kind: 'cube', dice: null, text: 'Doubles → 2' },
    ],
    nextRolls: [[4, 1]],
  },
  {
    id: 'crawford',
    label: 'Crawford game',
    length: 3,
    board: mid(),
    turn: 0,
    phase: 'pre-roll',
    score: [2, 0],
    game: 2,
    crawford: true,
    log: midLog(2),
    nextRolls: [[3, 1]],
  },
  {
    id: 'gammon',
    label: 'Gammon win',
    length: 5,
    board: boardFromOwn({ points: {}, off: 15 }, { points: { 13: 5, 8: 5, 6: 5 } }),
    turn: 0,
    phase: 'game-over',
    cube: { value: 2, owner: 1 },
    score: [4, 0],
    result: { winner: 0, kind: 'gammon', points: 4, byDrop: false, byResign: false },
    log: [
      { game: 1, side: 0, kind: 'cube', dice: null, text: 'Doubles → 2' },
      { game: 1, side: 1, kind: 'cube', dice: null, text: 'Takes' },
      { game: 1, side: 0, kind: 'move', dice: [6, 3], text: '6/off 3/off' },
      { game: 1, side: 1, kind: 'move', dice: [2, 1], text: '8/6 7/6' },
      { game: 1, side: 0, kind: 'move', dice: [4, 4], text: '4/off(2)' },
      { game: 1, side: 0, kind: 'result', dice: null, text: 'Wins 4 · gammon' },
    ],
  },
  {
    id: 'match',
    label: 'Match won',
    length: 3,
    board: boardFromOwn({ points: {}, off: 15 }, { points: { 6: 5, 5: 4, 4: 2 }, off: 4 }),
    turn: 0,
    phase: 'match-over',
    score: [3, 1],
    game: 3,
    postCrawford: true,
    result: { winner: 0, kind: 'single', points: 1, byDrop: false, byResign: false },
    matchWinner: 0,
    log: [
      { game: 3, side: 0, kind: 'move', dice: [5, 2], text: '5/off 2/off' },
      { game: 3, side: 0, kind: 'result', dice: null, text: 'Wins 1' },
    ],
  },
  {
    id: 'backgammon',
    label: 'Backgammon (extra)',
    length: 7,
    board: boardFromOwn({ points: { 22: 2, 13: 5, 8: 4, 6: 3 }, bar: 1 }, { points: {}, off: 15 }),
    turn: 1,
    phase: 'game-over',
    score: [1, 3],
    game: 2,
    result: { winner: 1, kind: 'backgammon', points: 3, byDrop: false, byResign: false },
    log: [
      { game: 2, side: 1, kind: 'move', dice: [6, 6], text: '6/off(4)' },
      { game: 2, side: 1, kind: 'result', dice: null, text: 'Wins 3 · backgammon' },
    ],
  },
];
