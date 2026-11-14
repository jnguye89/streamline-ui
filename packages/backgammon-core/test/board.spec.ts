import {
  allHome,
  boardFromOwn,
  boardKey,
  countAt,
  inWinnersHome,
  own,
  pipCount,
  startBoard,
  validateBoard,
} from '../src';

describe('board model', () => {
  it('start position: 15 checkers each, 167 pips each', () => {
    const b = startBoard();
    expect(validateBoard(b)).toBeNull();
    expect(pipCount(b, 0)).toBe(167);
    expect(pipCount(b, 1)).toBe(167);
  });

  it('start position uses each side own numbering (2 on 24, 5 on 13, 3 on 8, 5 on 6)', () => {
    const b = startBoard();
    for (const side of [0, 1] as const) {
      expect(countAt(b, side, own(side, 24))).toBe(2);
      expect(countAt(b, side, own(side, 13))).toBe(5);
      expect(countAt(b, side, own(side, 8))).toBe(3);
      expect(countAt(b, side, own(side, 6))).toBe(5);
    }
    // Absolute layout: side 0 positive, side 1 negative.
    expect(b.pts[24]).toBe(2);
    expect(b.pts[1]).toBe(-2);
    expect(b.pts[19]).toBe(-5);
  });

  it('own() is its own inverse', () => {
    for (let a = 1; a <= 24; a++) {
      expect(own(0, own(0, a))).toBe(a);
      expect(own(1, own(1, a))).toBe(a);
    }
  });

  it('rejects impossible layouts', () => {
    expect(() => boardFromOwn({ points: { 6: 14 } }, { points: { 6: 15 } })).toThrow();
    expect(() => boardFromOwn({ points: { 6: 15 } }, { points: { 19: 15 } })).toThrow(); // both on absolute 6
  });

  it('bar counts 25 pips; home and backgammon checks', () => {
    const b = boardFromOwn({ points: { 3: 10, 2: 4 }, bar: 1 }, { points: { 24: 1 }, off: 14 });
    expect(pipCount(b, 0)).toBe(30 + 8 + 25);
    expect(allHome(b, 0)).toBe(false);
    expect(allHome(b, 1)).toBe(false);
    // side 1's checker on its own 24 = absolute 1 = inside side 0's home board
    expect(inWinnersHome(b, 1, 0)).toBe(true);
    expect(boardKey(b)).toBe(boardKey(boardFromOwn({ points: { 2: 4, 3: 10 }, bar: 1 }, { points: { 24: 1 }, off: 14 })));
  });
});
