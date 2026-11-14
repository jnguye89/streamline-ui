import { Directive, ElementRef, OnInit, inject, input } from '@angular/core';
import { XY } from '../board-geometry';

const EASE = 'cubic-bezier(0.2, 0.75, 0.25, 1)';

/**
 * Slides a newly drawn checker in from where it was (one move, a hit to the bar, a bear-off).
 * Elements are keyed by location, so a checker that moved is a new element: it animates once on creation.
 */
@Directive({
  selector: '[bgArrive]',
  standalone: true,
})
export class ArriveDirective implements OnInit {
  /** Center it flies in from; undefined = no animation. */
  readonly bgArrive = input<XY | undefined>(undefined);
  /** Center it ends at. */
  readonly bgAt = input.required<XY>();
  readonly bgW = input(62);
  readonly bgH = input(62);
  readonly bgMs = input(300);

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);

  ngOnInit(): void {
    const from = this.bgArrive();
    const el = this.el.nativeElement;
    if (!from || typeof el.animate !== 'function') return;
    if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const to = this.bgAt();
    const w = this.bgW() / 2;
    const h = this.bgH() / 2;
    el.animate(
      [
        { transform: `translate(${from.x - w}px, ${from.y - h}px) scale(1.06)`, zIndex: 6 },
        { transform: `translate(${to.x - w}px, ${to.y - h}px) scale(1)`, zIndex: 6 },
      ],
      { duration: this.bgMs(), easing: EASE },
    );
  }
}
