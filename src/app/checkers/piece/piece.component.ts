import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { PieceColor } from '../checkers.types';

/** One checker, drawn flat with a visible edge. Kings are two stacked discs with a crown. */
@Component({
  selector: 'ck-piece',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'color()', 'aria-hidden': 'true' },
  template: `
    <svg viewBox="0 0 100 100">
      @if (king()) {
        <circle class="edge" cx="50" cy="60" r="40" />
        <circle class="top" cx="50" cy="54.5" r="40" />
        <circle class="edge" cx="50" cy="52" r="40" />
        <circle class="top" cx="50" cy="46" r="40" />
        <circle class="ring" cx="50" cy="46" r="31" />
        <path
          class="crown"
          d="M33.5 56 L30.5 38.5 L40.8 47 L50 34 L59.2 47 L69.5 38.5 L66.5 56 Z"
        />
      } @else {
        <circle class="edge" cx="50" cy="56" r="42" />
        <circle class="top" cx="50" cy="50" r="42" />
        <circle class="ring" cx="50" cy="50" r="31" />
        <circle class="ring thin" cx="50" cy="50" r="19" />
      }
    </svg>
  `,
  styles: `
    :host { display: block; width: 100%; height: 100%; }
    svg { display: block; width: 100%; height: 100%; overflow: visible; }
    :host(.light) { --top: var(--p-light-top); --edge: var(--p-light-edge); --ring: var(--p-light-ring); --crown: var(--p-light-crown); }
    :host(.dark) { --top: var(--p-dark-top); --edge: var(--p-dark-edge); --ring: var(--p-dark-ring); --crown: var(--p-dark-crown); }
    .top { fill: var(--top); }
    .edge { fill: var(--edge); }
    .ring { fill: none; stroke: var(--ring); stroke-width: 3; }
    .ring.thin { stroke-width: 2; }
    .crown { fill: var(--crown); stroke: var(--crown); stroke-width: 3.5; stroke-linejoin: round; }
  `,
})
export class PieceComponent {
  readonly color = input.required<PieceColor>();
  readonly king = input(false);
}
