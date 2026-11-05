import { BirthdayDialog } from './birthday.dialog';

describe('BirthdayDialog', () => {
  const make = () => new BirthdayDialog({ close: () => undefined } as never, {} as never);

  it('offers the right number of days for the month and year', () => {
    const dialog = make();
    dialog.month = 2;
    dialog.year = 2024;
    expect(dialog.days.length).toBe(29);
    dialog.year = 2023;
    expect(dialog.days.length).toBe(28);
    dialog.month = 4;
    expect(dialog.days.length).toBe(30);
  });

  it('pulls the day back when the month gets shorter', () => {
    const dialog = make();
    dialog.year = 2023;
    dialog.month = 1;
    dialog.day = 31;
    dialog.month = 2;
    dialog.clampDay();
    expect(dialog.day).toBe(28);
  });

  it('only gives a date once all three are chosen, and never a future one', () => {
    const dialog = make();
    expect(dialog.birthDate).toBeNull();
    dialog.year = 2001;
    dialog.month = 3;
    expect(dialog.birthDate).toBeNull();
    dialog.day = 9;
    expect(dialog.birthDate).toBe('2001-03-09');
    dialog.year = new Date().getFullYear() + 1;
    expect(dialog.birthDate).toBeNull();
  });

  it('lists years from this one back to 1900', () => {
    const dialog = make();
    expect(dialog.years[0]).toBe(new Date().getFullYear());
    expect(dialog.years[dialog.years.length - 1]).toBe(1900);
  });
});
