import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { PublicPlayer } from '../../core/types';
import { PLAYER_VIDEO } from '../../media/player-video';
import { AvatarComponent } from './avatar.component';
import { FaceAnchorDirective } from './face-anchors';

const STRIP_W = 1792;
const GAP = 12;

/**
 * One tile per player along the bottom of the TV. Shows ✓ when someone's answer is in (never what),
 * scores, and the round's points during Results. Tiles draw the avatar until a PlayerVideo source
 * has a live picture.
 */
@Component({
  selector: 'bon-face-strip',
  standalone: true,
  imports: [AvatarComponent, FaceAnchorDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="strip" [style.gap.px]="gap">
      @for (p of players(); track p.id) {
        <div class="tile" [style.width.px]="tileW()" [class.away]="!p.connected || p.waiting" [class.bot]="p.kind === 'bot'">
          <div class="face" [bonFaceAnchor]="p.id">
            @if (video.forPlayer(p.id).stream(); as stream) {
              <video [srcObject]="stream" autoplay muted playsinline></video>
            } @else {
              <bon-avatar [name]="p.name" [kind]="p.kind" [hue]="p.hue" [size]="faceSize()" />
            }
            @if (showChecks() && p.answered) {
              <span class="check" aria-label="Answer in">
                <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
              </span>
            }
            @if (deltaFor(p.id); as d) {
              <span class="delta">+{{ d }}</span>
            }
          </div>
          <div class="name">
            @if (showNames() || p.kind === 'bot') {
              {{ p.kind === 'bot' ? (botCount() > 1 ? p.name : botLabel()) : p.name }}
            }
          </div>
          <div class="meta">
            @if (p.waiting) {
              Next round
            } @else if (!p.connected) {
              Away
            } @else {
              {{ p.score }}
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    :host { position: absolute; left: 64px; right: 64px; bottom: 34px; height: 206px; display: block; }
    .strip { display: flex; justify-content: center; align-items: flex-end; height: 100%; }
    .tile { display: flex; flex-direction: column; align-items: center; min-width: 0; transition: opacity 200ms ease; }
    .tile.away { opacity: 0.42; }
    .face { position: relative; line-height: 0; }
    video { width: 104px; height: 104px; border-radius: 50%; object-fit: cover; }
    .check {
      position: absolute; right: -6px; bottom: -2px; width: 44px; height: 44px; border-radius: 50%;
      display: grid; place-items: center; background: #fff; color: var(--indigo); box-shadow: 0 0 0 4px #000;
      animation: pop 260ms var(--ease);
    }
    .check svg { width: 28px; height: 28px; fill: none; stroke: currentColor; stroke-width: 3.2; stroke-linecap: round; stroke-linejoin: round; }
    .delta {
      position: absolute; left: 50%; top: -18px; transform: translateX(-50%); padding: 6px 14px; border-radius: 999px;
      background: #fff; color: #0b0b10; font: 600 28px/1 var(--font-display); white-space: nowrap; animation: rise 380ms var(--ease);
    }
    .name {
      margin-top: 12px; min-height: 32px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      font: 600 28px/1.15 var(--font-ui); letter-spacing: -0.01em;
    }
    .bot .name { color: var(--lav-soft); }
    .meta { margin-top: 6px; font: 500 28px/1 var(--font-mono); color: var(--text-2); white-space: nowrap; }
    @keyframes pop { from { transform: scale(0.4); opacity: 0; } to { transform: scale(1); opacity: 1; } }
    @keyframes rise { from { transform: translate(-50%, 16px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
    @media (prefers-reduced-motion: reduce) { .check, .delta { animation: none; } }
  `,
})
export class FaceStripComponent {
  readonly players = input.required<readonly PublicPlayer[]>();
  readonly showNames = input(true);
  readonly showChecks = input(false);
  /** Points this round, shown during Results. */
  readonly deltas = input<ReadonlyMap<string, number> | null>(null);

  protected readonly video = inject(PLAYER_VIDEO);
  protected readonly gap = GAP;
  protected readonly botLabel = computed(() => 'the bot');
  protected readonly botCount = computed(() => this.players().filter((p) => p.kind === 'bot').length);
  protected readonly tileW = computed(() => {
    const n = Math.max(1, this.players().length);
    return Math.min(196, Math.floor((STRIP_W - GAP * (n - 1)) / n));
  });
  protected readonly faceSize = computed(() => (this.players().length > 8 ? 96 : 104));

  protected deltaFor(id: string): number | null {
    const d = this.deltas()?.get(id);
    return d ? d : null;
  }
}
