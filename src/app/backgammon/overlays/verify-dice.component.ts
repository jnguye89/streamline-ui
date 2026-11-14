import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { deriveRoll, verifyLedger } from '@skriin/backgammon-core';
import { TvAction } from '../backgammon.types';
import { GameStore } from '../game-store.service';

const SHOW_ROLLS = 12;

/** "Verify dice": shows the commitment and seeds, and recomputes every roll once the seed is revealed. */
@Component({
  selector: 'bg-verify-dice',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bg-scrim">
      <div class="bg-modal modal">
        <h2 class="bg-title sm">Verify dice</h2>
        <p class="bg-lead sm">{{ summary() }}</p>

        @if (ledger(); as l) {
          <dl>
            <dt>Commitment · SHA-256 of the server seed</dt>
            <dd>{{ short(l.commitment) }}</dd>
            <dt>Server seed</dt>
            <dd [class.plain]="!l.serverSeed">{{ l.serverSeed ? short(l.serverSeed) : 'Revealed when the match ends' }}</dd>
            <dt>Client seed</dt>
            <dd>{{ l.clientSeeds.join(' · ') }}</dd>
          </dl>

          @if (rows().length) {
            <div class="rolls">
              @for (r of rows(); track r.k) {
                <span class="roll" [class.ok]="r.ok === true" [class.bad]="r.ok === false">
                  <b>{{ r.k }}</b>{{ r.dice }}
                  @if (r.ok === true) {
                    <i>✓</i>
                  } @else if (r.ok === false) {
                    <i>✗</i>
                  }
                </span>
              }
            </div>
          }
        }

        <div class="actions">
          <button type="button" class="bg-btn primary focus" (click)="store.closeOverlay()">
            Close <span class="bg-glyph sm">A</span>
          </button>
        </div>
      </div>
    </div>
  `,
  styles: `
    .modal { width: 1080px; padding: 44px 52px; }
    dl { margin: 28px 0 0; display: grid; grid-template-columns: 1fr; gap: 6px; }
    dt { font: 500 20px/1.2 var(--font-ui); color: var(--text-3); margin-top: 10px; }
    dd { margin: 0; font: 500 24px/1.3 var(--font-mono); color: #fff; word-break: break-all; }
    dd.plain { font-family: var(--font-ui); color: var(--text-2); }
    .rolls { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin-top: 26px; }
    .roll { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 12px; background: rgba(255,255,255,0.05); font: 500 22px/1 var(--font-mono); }
    .roll b { font-weight: 500; color: var(--text-3); font-size: 16px; }
    .roll i { margin-left: auto; font-style: normal; }
    .roll.ok i { color: var(--lav-soft); }
    .roll.bad { background: rgba(239,68,68,0.18); }
    .actions { display: flex; justify-content: center; margin-top: 34px; }
    .actions .bg-btn { gap: 16px; }
  `,
})
export class VerifyDiceComponent {
  protected readonly store = inject(GameStore);
  protected readonly ledger = this.store.ledger;

  private readonly check = computed(() => {
    const l = this.ledger();
    return l ? verifyLedger(l) : null;
  });

  protected readonly summary = computed(() => {
    const l = this.ledger();
    const c = this.check();
    if (!l || !c) return '';
    const n = l.rolls.length;
    if (!c.revealed) return `${n} ${n === 1 ? 'roll' : 'rolls'} so far. The seed is shown, and every roll checked, when the match ends.`;
    if (c.commitmentOk && c.rollsOk) return `All ${n} rolls match the published commitment.`;
    if (!c.commitmentOk) return 'The revealed seed does not match the commitment.';
    return `Roll ${c.firstMismatch} does not match.`;
  });

  protected readonly rows = computed(() => {
    const l = this.ledger();
    if (!l) return [];
    const seed = l.serverSeed;
    return l.rolls.slice(-SHOW_ROLLS).map((r) => {
      let ok: boolean | null = null;
      if (seed) {
        const d = deriveRoll(seed, l.clientSeeds, r.k);
        ok = d[0] === r.dice[0] && d[1] === r.dice[1];
      }
      return { k: r.k, dice: `${r.dice[0]}${r.dice[1]}`, ok };
    });
  });

  protected short(hex: string): string {
    return hex.length > 40 ? `${hex.slice(0, 20)}…${hex.slice(-16)}` : hex;
  }

  handle(a: TvAction): void {
    if (a === 'select' || a === 'back' || a === 'menu') this.store.closeOverlay();
  }
}
