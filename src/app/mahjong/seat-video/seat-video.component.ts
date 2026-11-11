import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { SeatPublic } from '@skriin/mahjong-core';
import { LEVEL_LABEL } from '../mahjong.types';
import { SEAT_VIDEO } from './seat-video';

/** A seat's camera tile. Bots get a bot face; people without a stream get their initial. */
@Component({
  selector: 'mj-seat-video',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cam" [class.bot]="seat().kind === 'bot'" [class.you]="self()">
      @if (stream(); as s) {
        <video autoplay muted playsinline [srcObject]="s"></video>
      } @else if (seat().kind === 'bot') {
        <svg class="bot-face" viewBox="0 0 64 64" aria-hidden="true">
          <line x1="32" y1="6" x2="32" y2="14" />
          <circle cx="32" cy="5" r="3" class="fill" />
          <rect x="10" y="14" width="44" height="38" rx="12" />
          <circle cx="24" cy="32" r="4.5" class="fill" />
          <circle cx="40" cy="32" r="4.5" class="fill" />
          <path d="M24 42 q8 6 16 0" />
        </svg>
      } @else if (self()) {
        <svg class="cam-icon" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="2.5" y="6.5" width="13" height="11" rx="2.5" />
          <path d="M15.5 10.5 21 7.5v9l-5.5-3" />
        </svg>
      } @else {
        <span class="initial">{{ initial() }}</span>
      }
      <span class="tag">
        @if (seat().kind === 'bot') {
          Bot · {{ level() }}
        } @else {
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="2.5" y="6.5" width="13" height="11" rx="2.5" />
            <path d="M15.5 10.5 21 7.5v9l-5.5-3" />
          </svg>
          {{ self() ? 'Your camera' : 'Camera' }}
        }
      </span>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .cam {
      position: relative;
      width: 100%;
      aspect-ratio: 16 / 9;
      border-radius: 20px;
      overflow: hidden;
      background: linear-gradient(150deg, #4f46e5 0%, #312e81 62%, #1e1b4b 100%);
      display: grid;
      place-items: center;
    }
    .cam.bot {
      background: linear-gradient(150deg, #1d1d27 0%, #121218 100%);
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
    }
    .cam.you {
      background: linear-gradient(150deg, #312e81 0%, #1e1b4b 100%);
    }
    video {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .initial {
      font: 600 calc(var(--cam-h, 150px) * 0.42) / 1 var(--font-display);
      color: rgba(255, 255, 255, 0.92);
      letter-spacing: -0.03em;
    }
    .cam-icon {
      width: 40%;
      height: auto;
      fill: none;
      stroke: #c7d2fe;
      stroke-width: 1.6;
      stroke-linejoin: round;
    }
    .bot-face {
      width: 38%;
      height: auto;
      fill: none;
      stroke: #c7d2fe;
      stroke-width: 3;
      stroke-linecap: round;
    }
    .bot-face .fill {
      fill: #c7d2fe;
      stroke: none;
    }
    .tag {
      position: absolute;
      left: 10px;
      bottom: 10px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      border-radius: 999px;
      background: rgba(0, 0, 0, 0.45);
      font: 600 18px/1 var(--font-ui);
      color: rgba(255, 255, 255, 0.85);
      white-space: nowrap;
    }
    .tag svg {
      width: 18px;
      height: 18px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linejoin: round;
    }
  `,
})
export class SeatVideoComponent {
  readonly seat = input.required<SeatPublic>();
  readonly self = input(false);
  private readonly video = inject(SEAT_VIDEO);

  protected readonly stream = computed(() => this.video.stream(this.seat().seat)());
  protected readonly initial = computed(() => this.seat().name.trim().charAt(0).toUpperCase());
  protected readonly level = computed(() => LEVEL_LABEL[this.seat().botLevel ?? 'medium']);
}
