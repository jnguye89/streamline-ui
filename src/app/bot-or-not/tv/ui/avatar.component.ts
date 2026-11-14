import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { initial } from '../../core/text';
import { PlayerKind } from '../../core/types';
import { avatarColor } from './palette';

/**
 * A player's placeholder face: a colored circle with their initial, or the indigo bot.
 * Shared by the TV and the phone web controller.
 */
@Component({
  selector: 'bon-avatar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="av" [class.bot]="kind() === 'bot'" [style.width.px]="size()" [style.height.px]="size()" [style.background]="color()">
      @if (kind() === 'bot') {
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <circle cx="24" cy="6" r="3" />
          <path d="M24 9v4" />
          <rect x="9" y="13" width="30" height="24" rx="8" />
          <circle class="eye" cx="18" cy="24" r="3" />
          <circle class="eye" cx="30" cy="24" r="3" />
          <path d="M19 31h10" />
        </svg>
      } @else {
        <span class="ini" [style.font-size.px]="size() * 0.44">{{ letter() }}</span>
      }
    </span>
  `,
  styles: `
    :host { display: inline-block; line-height: 0; }
    .av { display: inline-grid; place-items: center; border-radius: 50%; color: #0b0b10; overflow: hidden; }
    .av.bot { color: #fff; }
    .ini { font-family: 'Space Grotesk', 'Inter', system-ui, sans-serif; font-weight: 600; line-height: 1; letter-spacing: -0.02em; }
    svg { width: 62%; height: 62%; fill: none; stroke: currentColor; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
    svg circle:first-child, svg .eye { fill: currentColor; stroke: none; }
  `,
})
export class AvatarComponent {
  readonly name = input('');
  readonly kind = input<PlayerKind>('human');
  readonly hue = input(0);
  readonly size = input(96);

  protected readonly color = computed(() => avatarColor(this.kind() === 'bot' ? -1 : this.hue()));
  protected readonly letter = computed(() => initial(this.name()));
}
