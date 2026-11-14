import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { COPY } from '../core/copy';
import { PublicCard } from '../core/types';

/** Card list on the phone: read-only during Reveal, tap to vote during Voting. Your own card is greyed out. */
@Component({
  selector: 'bon-phone-cards',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="list">
      @for (c of visible(); track c.id) {
        <li>
          <button
            type="button"
            class="card"
            [class.mine]="c.id === ownCardId()"
            [class.picked]="c.id === vote()"
            [disabled]="!voting() || c.id === ownCardId()"
            (click)="pick.emit(c.id)"
          >
            <span class="letter">{{ c.letter }}</span>
            <span class="txt" [class.muted]="c.hidden">{{ c.hidden ? hiddenLabel : c.text }}</span>
            @if (c.id === ownCardId()) {
              <span class="tag">Your card</span>
            } @else if (c.id === vote()) {
              <span class="tag pick">Your vote</span>
            }
          </button>
        </li>
      }
    </ul>
  `,
  styles: `
    .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
    .card {
      width: 100%; min-height: 64px; display: grid; grid-template-columns: 40px 1fr auto; align-items: center; gap: 14px;
      padding: 12px 14px 12px 12px; border-radius: 16px; border: 2px solid #e4e4ec; background: #fff; color: #0b0b10;
      text-align: left; cursor: pointer; font: inherit; transition: border-color 120ms ease, background 120ms ease, transform 120ms ease;
    }
    .card:disabled { cursor: default; }
    .card:not(:disabled):active { transform: scale(0.98); }
    .letter { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; background: #4f46e5; color: #fff; font: 600 19px/1 var(--ph-display); }
    .txt { font: 600 18px/1.3 var(--ph-ui); overflow-wrap: anywhere; }
    .txt.muted { color: #8a8a99; font-weight: 500; }
    .tag { font: 700 12px/1 var(--ph-ui); letter-spacing: 0.05em; text-transform: uppercase; color: #6b6b7b; white-space: nowrap; }
    .tag.pick { color: #4f46e5; }
    .card.mine { background: #f4f4f7; border-color: #f4f4f7; opacity: 0.6; }
    .card.mine .letter { background: #b9b9c6; }
    .card.picked { border-color: #4f46e5; background: #eef0fe; }
  `,
})
export class PhoneCardsComponent {
  readonly cards = input<readonly PublicCard[]>([]);
  /** Reveal paces the cards; Voting shows all. */
  readonly revealed = input(0);
  readonly voting = input(false);
  readonly ownCardId = input<string | null>(null);
  readonly vote = input<string | null>(null);
  readonly pick = output<string>();

  protected readonly hiddenLabel = COPY.hiddenByHost;
  protected readonly visible = computed(() => (this.voting() ? this.cards() : this.cards().slice(0, this.revealed())));
}
