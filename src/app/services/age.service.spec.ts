import { AgeService } from './age.service';

describe('AgeService.ageOf', () => {
  const age = new AgeService({} as never);
  const today = new Date(2026, 10, 3); // 3 Nov 2026

  it('counts whole years, turning over on the birthday', () => {
    expect(age.ageOf('2008-11-03', today)).toBe(18);
    expect(age.ageOf('2008-11-04', today)).toBe(17);
    expect(age.ageOf('2013-11-02', today)).toBe(13);
    expect(age.ageOf('2013-12-01', today)).toBe(12);
  });
});
