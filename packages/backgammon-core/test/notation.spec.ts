import { Die, Side, Step, own, playNotation } from '../src';

/** Builds a step from the mover's own numbering (25 = bar, 0 = off). */
function st(side: Side, from: number, to: number, die: number, hit = false): Step {
  return {
    from: from === 25 ? 'bar' : own(side, from),
    to: to === 0 ? 'off' : own(side, to),
    die: die as Die,
    hit,
  };
}

describe('notation', () => {
  it('two checkers', () => {
    expect(playNotation(0, [st(0, 13, 11, 2), st(0, 24, 18, 6)])).toBe('24/18 13/11');
  });
  it('enter with a hit (side 1 uses its own numbering)', () => {
    expect(playNotation(1, [st(1, 25, 22, 3, true), st(1, 13, 8, 5)])).toBe('bar/22* 13/8');
  });
  it('bear off', () => {
    expect(playNotation(0, [st(0, 6, 0, 6), st(0, 2, 0, 2)])).toBe('6/off 2/off');
  });
  it('repeated moves', () => {
    expect(playNotation(0, [st(0, 8, 5, 3), st(0, 8, 5, 3), st(0, 6, 3, 3), st(0, 6, 3, 3)])).toBe('8/5(2) 6/3(2)');
  });
  it('one checker, both dice; a hit on the way is shown', () => {
    expect(playNotation(0, [st(0, 13, 10, 3), st(0, 10, 7, 3)])).toBe('13/7');
    expect(playNotation(0, [st(0, 13, 10, 3, true), st(0, 10, 7, 3)])).toBe('13/10*/7');
    expect(playNotation(0, [st(0, 13, 10, 3), st(0, 10, 7, 3, true)])).toBe('13/7*');
  });
});
