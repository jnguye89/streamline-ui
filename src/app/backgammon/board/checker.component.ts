import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type Tone = 'light' | 'dark';

/** One checker, drawn flat with a visible edge (same drawing as skriin checkers). */
@Component({
  selector: 'bg-checker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'tone()', 'aria-hidden': 'true' },
  template: `
    <svg viewBox="0 0 100 100">
      <circle class="edge" cx="50" cy="54" r="45" />
      <circle class="top" cx="50" cy="49" r="45" />
      <circle class="ring" cx="50" cy="49" r="33" />
      <circle class="ring thin" cx="50" cy="49" r="20" />
    </svg>
  `,
  styles: `
    :host { display: block; width: 100%; height: 100%; }
    svg { display: block; width: 100%; height: 100%; overflow: visible; }
    :host(.light) { --top: var(--ck-light-top); --edge: var(--ck-light-edge); --ring: var(--ck-light-ring); --line: var(--ck-light-line); }
    :host(.dark) { --top: var(--ck-dark-top); --edge: var(--ck-dark-edge); --ring: var(--ck-dark-ring); --line: var(--ck-dark-line); }
    .top { fill: var(--top); stroke: var(--line); stroke-width: 2.5; }
    .edge { fill: var(--edge); stroke: var(--line); stroke-width: 2.5; }
    .ring { fill: none; stroke: var(--ring); stroke-width: 3; }
    .ring.thin { stroke-width: 2; }
  `,
})
export class CheckerComponent {
  readonly tone = input.required<Tone>();
}
