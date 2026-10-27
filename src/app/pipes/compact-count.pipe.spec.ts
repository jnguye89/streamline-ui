import { CompactCountPipe } from './compact-count.pipe';

describe('CompactCountPipe', () => {
  const pipe = new CompactCountPipe();

  it('shows counts under 1,000 in full', () => {
    expect(pipe.transform(0)).toBe('0');
    expect(pipe.transform(999)).toBe('999');
  });

  it('treats a missing count as 0', () => {
    expect(pipe.transform(null)).toBe('0');
    expect(pipe.transform(undefined)).toBe('0');
  });

  it('shortens thousands with one decimal, dropping .0', () => {
    expect(pipe.transform(1000)).toBe('1k');
    expect(pipe.transform(1100)).toBe('1.1k');
    expect(pipe.transform(4100)).toBe('4.1k');
    expect(pipe.transform(45619)).toBe('45.6k');
  });

  it('rounds down rather than up', () => {
    expect(pipe.transform(1099)).toBe('1k');
    expect(pipe.transform(1950)).toBe('1.9k');
    expect(pipe.transform(99999)).toBe('99.9k');
    expect(pipe.transform(999999)).toBe('999k');
  });

  it('drops the decimal from 100 of a unit up', () => {
    expect(pipe.transform(100000)).toBe('100k');
    expect(pipe.transform(123456)).toBe('123k');
  });

  it('moves up to millions and billions', () => {
    expect(pipe.transform(1000000)).toBe('1M');
    expect(pipe.transform(2500000)).toBe('2.5M');
    expect(pipe.transform(1000000000)).toBe('1B');
  });
});
