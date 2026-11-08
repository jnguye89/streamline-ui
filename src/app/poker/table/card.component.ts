import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Card } from '../core/api';
import { cardName, isRed, rankFace, suitOf } from '../core/cards';

/** Simple original suit shapes (24×24). */
export const SUIT_PATH: Record<string, string> = {
  h: 'M12 21.2s-7.6-4.7-9.7-9.4C.8 8.5 2.8 4.4 6.6 4.4c2.2 0 3.8 1.3 5.4 3.3 1.6-2 3.2-3.3 5.4-3.3 3.8 0 5.8 4.1 4.3 7.4-2.1 4.7-9.7 9.4-9.7 9.4z',
  d: 'M12 2.2l8.2 9.8L12 21.8 3.8 12z',
  s: 'M12 2.4S3.8 8.9 3.8 13.7c0 2.6 2 4.5 4.4 4.5 1.4 0 2.5-.6 3.1-1.6-.2 1.9-1 3.4-2.4 4.6h6.2c-1.4-1.2-2.2-2.7-2.4-4.6.6 1 1.7 1.6 3.1 1.6 2.4 0 4.4-1.9 4.4-4.5C20.2 8.9 12 2.4 12 2.4z',
  c: 'M12 2.6a4.1 4.1 0 0 0-3.7 5.9 4.1 4.1 0 1 0 2.4 7.6c-.3 1.9-1.1 3.4-2.5 4.6h7.6c-1.4-1.2-2.2-2.7-2.5-4.6a4.1 4.1 0 1 0 2.4-7.6A4.1 4.1 0 0 0 12 2.6z',
};

export type CardSize = 'board' | 'hole' | 'seat' | 'phone' | 'back';

/**
 * One playing card. Face: rank (Space Grotesk) + suit, readable from 10 ft.
 * Rank sizes: hole 104 px · phone 100 px · board 84 px · seat 72 px (brief: ≥72 px).
 * `card = null` draws the back (indigo with the skriin dot pattern, same tokens as the rest of the app).
 */
@Component({
  selector: 'pk-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'pk-card',
    '[class]': "'pk-card size-' + size() + (state() ? ' ' + state() : '')",
    '[attr.aria-label]': 'label()',
    role: 'img',
  },
  template: `
    @if (card(); as c) {
      <div class="face" [class.red]="red()">
        <span class="rank">{{ rank() }}</span>
        <svg class="pip" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="path()" /></svg>
        <svg class="big" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="path()" /></svg>
      </div>
    } @else {
      <div class="back"><i></i></div>
    }
  `,
  styles: `
    :host { display: block; flex: none; position: relative; border-radius: var(--r); transition: transform 160ms var(--ease), opacity 160ms ease, box-shadow 160ms ease; }
    :host(.size-hole) { width: 184px; height: 258px; --r: 18px; --rank: 104px; --pip: 46px; --big: 92px; --pad: 12px; }
    :host(.size-phone) { width: 176px; height: 246px; --r: 18px; --rank: 100px; --pip: 44px; --big: 86px; --pad: 12px; }
    :host(.size-board) { width: 150px; height: 210px; --r: 16px; --rank: 84px; --pip: 38px; --big: 74px; --pad: 10px; }
    :host(.size-seat) { width: 112px; height: 160px; --r: 13px; --rank: 72px; --pip: 30px; --big: 0px; --pad: 6px; }
    :host(.size-back) { width: 54px; height: 76px; --r: 9px; }
    .face { position: absolute; inset: 0; border-radius: var(--r); background: #f8f8fc; color: #15151c; box-shadow: 0 2px 0 rgba(0,0,0,0.35), inset 0 0 0 1px rgba(30,27,75,0.12); overflow: hidden; }
    .face.red { color: #dc2626; }
    .rank { position: absolute; left: var(--pad); top: calc(var(--pad) - 4px); font: 600 var(--rank)/1 var(--font-display); letter-spacing: -0.06em; }
    .pip { position: absolute; left: calc(var(--pad) + 2px); top: calc(var(--pad) + var(--rank) * 0.92); width: var(--pip); height: var(--pip); fill: currentColor; }
    .big { position: absolute; right: calc(var(--pad) - 2px); bottom: calc(var(--pad) - 2px); width: var(--big); height: var(--big); fill: currentColor; opacity: 0.95; }
    :host(.size-seat) .pip { left: auto; right: var(--pad); top: auto; bottom: var(--pad); width: 40px; height: 40px; }
    .back { position: absolute; inset: 0; border-radius: var(--r); background: #4f46e5; box-shadow: 0 2px 0 rgba(0,0,0,0.35), inset 0 0 0 3px #c7d2fe; overflow: hidden; }
    .back i { position: absolute; inset: 7px; border-radius: calc(var(--r) - 5px); background-image: radial-gradient(rgba(255,255,255,0.32) 1.6px, transparent 1.8px); background-size: 12px 12px; }
    :host(.win) { transform: translateY(-10px); box-shadow: 0 0 0 5px #fff; }
    :host(.dim) { opacity: 0.38; }
    :host(.ghost) { opacity: 0.55; }
  `,
})
export class CardComponent {
  readonly card = input<Card | null>(null);
  readonly size = input<CardSize>('board');
  /** '' | 'win' | 'dim' | 'ghost' */
  readonly state = input<string>('');

  protected readonly rank = computed(() => {
    const c = this.card();
    return c ? rankFace(c) : '';
  });
  protected readonly red = computed(() => {
    const c = this.card();
    return c ? isRed(c) : false;
  });
  protected readonly path = computed(() => {
    const c = this.card();
    return c ? (SUIT_PATH[suitOf(c)] ?? '') : '';
  });
  protected readonly label = computed(() => {
    const c = this.card();
    return c ? cardName(c) : 'Card, face down';
  });
}
