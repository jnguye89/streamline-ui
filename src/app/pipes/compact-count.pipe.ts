import { Pipe, PipeTransform } from '@angular/core';

const UNITS = [
  { value: 1e9, suffix: 'B' },
  { value: 1e6, suffix: 'M' },
  { value: 1e3, suffix: 'k' },
];

// Short counts for views and likes: 999, 1k, 1.1k, 100k, 2.5M. One decimal
// below 100 of a unit, none from there up. Rounds down, so a count never
// shows more than it has actually reached. Matches streamline-mobile.
@Pipe({
  name: 'compactCount',
  standalone: true,
})
export class CompactCountPipe implements PipeTransform {
  transform(count: number | null | undefined): string {
    const n = count ?? 0;
    for (const { value, suffix } of UNITS) {
      if (n < value) continue;
      // Divide by tenths of the unit, not tenths of the result, to keep
      // float error out of the floor.
      const tenths = Math.floor(n / (value / 10));
      const shown = tenths >= 1000 ? Math.floor(tenths / 10) : tenths / 10;
      return `${shown}${suffix}`;
    }
    return String(n);
  }
}
