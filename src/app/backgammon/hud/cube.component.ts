import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** The doubling cube. In the middle at value 1 it shows 64, like a real cube. */
@Component({
  selector: 'bg-cube',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[style.--cube]': 'size() + "px"', '[class.off]': 'off()', 'aria-hidden': 'true' },
  template: `<div class="face">{{ off() ? '–' : value() === 1 ? 64 : value() }}</div>`,
  styles: `
    :host { display: block; width: var(--cube); height: var(--cube); }
    .face {
      width: 100%; height: 100%; border-radius: 22%;
      display: grid; place-items: center;
      background: #fff; color: var(--indigo);
      font: 600 calc(var(--cube) * 0.46)/1 var(--font-display); letter-spacing: -0.03em;
      box-shadow: inset 0 calc(var(--cube) * -0.07) 0 #c7cbe0, 0 10px 24px rgba(0,0,0,0.45);
    }
    :host(.off) .face { background: rgba(255,255,255,0.08); color: var(--text-3); box-shadow: none; }
  `,
})
export class CubeComponent {
  readonly value = input.required<number>();
  readonly size = input(96);
  readonly off = input(false);
}
