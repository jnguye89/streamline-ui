import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TileId, isBonus, kindOf, tileLongName, tileMark } from '@skriin/mahjong-core';
import { Art, MARK_LAYOUT, TileSize, artFor } from './tile-art';

/**
 * One tile, face up or face down. Width comes from the CSS variable --tw on the host;
 * the height follows the 100 × 134 viewBox.
 */
@Component({
  selector: 'mj-tile',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'mj-tile',
    '[class.back]': 'down()',
    '[attr.data-size]': 'size()',
    role: 'img',
    '[attr.aria-label]': 'label()',
  },
  template: `
    <svg viewBox="0 0 100 134" aria-hidden="true">
      @if (down()) {
        <rect x="2" y="10" width="96" height="122" rx="12" fill="#312E81" />
        <rect x="2" y="2" width="96" height="122" rx="12" fill="#4F46E5" />
        <rect
          x="13"
          y="13"
          width="74"
          height="100"
          rx="9"
          fill="none"
          stroke="rgba(255,255,255,0.22)"
          stroke-width="3"
        />
        <circle cx="50" cy="63" r="9" fill="rgba(255,255,255,0.18)" />
      } @else {
        <rect x="2" y="10" width="96" height="122" rx="12" fill="#C7D2FE" />
        <rect
          x="2"
          y="2"
          width="96"
          height="122"
          rx="12"
          fill="#FBFBFE"
          stroke="rgba(30,27,75,0.14)"
          stroke-width="1.5"
        />
        <g [attr.transform]="artTransform()">
          @switch (art().type) {
            @case ('dots') {
              @for (d of dots(); track $index) {
                <circle [attr.cx]="d.x" [attr.cy]="d.y" [attr.r]="d.r" [attr.fill]="d.c" />
                <circle [attr.cx]="d.x" [attr.cy]="d.y" [attr.r]="d.r * 0.56" fill="#FBFBFE" />
                <circle [attr.cx]="d.x" [attr.cy]="d.y" [attr.r]="d.r * 0.28" [attr.fill]="d.c" />
              }
            }
            @case ('sticks') {
              @for (s of sticks(); track $index) {
                <rect
                  [attr.x]="s.x - 5.5"
                  [attr.y]="s.y - s.h / 2"
                  width="11"
                  [attr.height]="s.h"
                  rx="5.5"
                  [attr.fill]="s.c"
                />
                <rect
                  [attr.x]="s.x - 7"
                  [attr.y]="s.y - 1.75"
                  width="14"
                  height="3.5"
                  rx="1.75"
                  [attr.fill]="s.c"
                />
                <rect
                  [attr.x]="s.x - 1.5"
                  [attr.y]="s.y - s.h / 2 + 4"
                  width="3"
                  [attr.height]="s.h / 2 - 7"
                  rx="1.5"
                  fill="rgba(255,255,255,0.55)"
                />
              }
            }
            @case ('one-bamboo') {
              <rect x="44" y="22" width="12" height="94" rx="6" fill="#047857" />
              <rect x="41" y="46" width="18" height="4" rx="2" fill="#047857" />
              <rect x="41" y="76" width="18" height="4" rx="2" fill="#047857" />
              <path d="M56 50 C 74 40, 84 46, 88 58 C 76 60, 64 58, 56 50 Z" fill="#4F46E5" />
              <path d="M44 80 C 26 70, 16 76, 12 88 C 24 90, 36 88, 44 80 Z" fill="#4F46E5" />
              <circle cx="50" cy="20" r="8" fill="#DC2626" />
            }
            @case ('glyphs') {
              @for (g of glyphs(); track $index) {
                <text
                  class="glyph"
                  [attr.x]="g.x"
                  [attr.y]="g.y"
                  [attr.font-size]="g.size"
                  [attr.fill]="g.c"
                  text-anchor="middle"
                >
                  {{ g.ch }}
                </text>
              }
            }
            @case ('white') {
              <rect
                x="22"
                y="22"
                width="56"
                height="84"
                rx="6"
                fill="none"
                stroke="#4F46E5"
                stroke-width="7"
              />
              <rect
                x="33"
                y="33"
                width="34"
                height="62"
                rx="3"
                fill="none"
                stroke="#4F46E5"
                stroke-width="3"
              />
            }
          }
        </g>
        @if (showMark()) {
          <text
            class="mark"
            [attr.x]="layout().x"
            [attr.y]="layout().y"
            [attr.font-size]="layout().size"
          >
            {{ mark() }}
          </text>
        }
      }
    </svg>
  `,
  styles: `
    :host {
      display: block;
      width: var(--tw, 104px);
      flex: none;
      position: relative;
      border-radius: calc(var(--tw, 104px) * 0.12);
    }
    svg {
      display: block;
      width: 100%;
      height: auto;
      overflow: visible;
    }
    .glyph {
      font-family:
        'skriin tiles', 'Noto Serif CJK HK', 'Noto Serif TC', 'Microsoft JhengHei', serif;
      font-weight: 900;
    }
    .mark {
      font-family: 'Inter', system-ui, sans-serif;
      font-weight: 700;
      fill: #1e1b4b;
      letter-spacing: -0.02em;
    }
  `,
})
export class TileComponent {
  /** Physical tile id; null = a face-down tile with unknown identity. */
  readonly tile = input<TileId | null>(null);
  /** Face down even when the id is known (concealed kong ends). */
  readonly faceDown = input(false);
  readonly size = input<TileSize>('hand');
  readonly marks = input(true);

  protected readonly down = computed(() => this.faceDown() || this.tile() === null);
  protected readonly kind = computed(() => {
    const t = this.tile();
    return t === null ? -1 : kindOf(t);
  });
  protected readonly art = computed<Art>(() =>
    this.kind() < 0 ? { type: 'white' } : artFor(this.kind()),
  );
  protected readonly dots = computed(() => {
    const a = this.art();
    return a.type === 'dots' ? a.dots : [];
  });
  protected readonly sticks = computed(() => {
    const a = this.art();
    return a.type === 'sticks' ? a.sticks : [];
  });
  protected readonly glyphs = computed(() => {
    const a = this.art();
    return a.type === 'glyphs' ? a.glyphs : [];
  });
  /** Bonus tiles always show their number (it decides "own flower"). */
  protected readonly showMark = computed(
    () => this.kind() >= 0 && (this.marks() || isBonus(this.kind())),
  );
  protected readonly layout = computed(() => MARK_LAYOUT[this.size()]);
  protected readonly artTransform = computed(() => (this.showMark() ? this.layout().art : null));
  protected readonly mark = computed(() => (this.kind() >= 0 ? tileMark(this.kind()) : ''));
  protected readonly label = computed(() =>
    this.down() ? 'Face-down tile' : tileLongName(this.kind()),
  );
}
