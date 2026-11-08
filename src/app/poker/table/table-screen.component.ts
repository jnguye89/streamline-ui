import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Card, PlayerView, PreAction, SeatView } from '../core/api';
import { chips } from '../core/cards';
import { GAME_TYPE_LABEL, ScreenFlags, SeatSlot } from '../poker.types';
import { ActionBarState, ActionButtonId, PRESET_LABEL, PRE_LABEL, buttons, presetIndex } from '../session/action-bar.logic';
import { seatName, statusLine, winnerSeats, winningCards } from '../session/status';
import { QrComponent } from '../overlays/qr.component';
import { CardComponent } from './card.component';
import { SeatComponent } from './seat.component';

/** Seat card top-left per screen slot (clockwise from you at the bottom). */
const SLOT_POS: Record<SeatSlot, { x: number; y: number }> = {
  0: { x: 820, y: 744 },
  1: { x: 96, y: 548 },
  2: { x: 96, y: 232 },
  3: { x: 820, y: 28 },
  4: { x: 1544, y: 232 },
  5: { x: 1544, y: 548 },
};

/** Bet pill center per slot (between the seat and the board). */
const BET_POS: Record<SeatSlot, { x: number; y: number }> = {
  0: { x: 960, y: 690 },
  1: { x: 470, y: 620 },
  2: { x: 470, y: 380 },
  3: { x: 960, y: 290 },
  4: { x: 1450, y: 380 },
  5: { x: 1450, y: 620 },
};

interface SlotSeat {
  readonly seat: SeatView;
  readonly slot: SeatSlot;
  readonly pos: { x: number; y: number };
  readonly name: string;
  readonly isMe: boolean;
  readonly isTurn: boolean;
  readonly markers: readonly string[];
  readonly winner: boolean;
}

/**
 * The whole 1920×1080 table picture for one viewer. Pure view: everything comes in as inputs,
 * so the same component draws your TV, the public TV in couch / streamer mode, and the previews.
 */
@Component({
  selector: 'pk-table-screen',
  standalone: true,
  imports: [SeatComponent, CardComponent, QrComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './table-screen.component.html',
  styleUrl: './table-screen.component.css',
  host: { class: 'pk-table-screen', '[class.no-anim]': '!flags().animations' },
})
export class TableScreenComponent {
  readonly view = input.required<PlayerView>();
  readonly flags = input.required<ScreenFlags>();
  readonly bar = input<ActionBarState | null>(null);
  readonly preFocus = input(0);
  /** Wall clock for my action timer text (ticks only while a clock runs). */
  readonly now = input(0);
  readonly previewLabel = input<string | null>(null);
  readonly levelUp = input<string | null>(null);

  readonly barPick = output<ActionButtonId>();
  readonly presetPick = output<number>();
  readonly prePick = output<number>();
  /** The top-right controller hints double as mouse/touch buttons: same action as X / Y / Menu. */
  readonly legendPick = output<'undo' | 'hint' | 'menu'>();
  /** Leave poker for the watch feed. */
  readonly backToWatch = output<void>();

  protected readonly me = computed(() => this.view().me);
  protected readonly mySeat = computed(() => this.view().me?.seat ?? null);

  protected readonly slots = computed<SlotSeat[]>(() => {
    const v = this.view();
    const n = v.seats.length;
    const base = v.me?.seat ?? 0;
    const winners = winnerSeats(v);
    const out: SlotSeat[] = [];
    for (const s of v.seats) {
      if (!s) continue;
      const slot = (((s.seat - base) % n) + n) % n;
      if (slot > 5) continue;
      const markers: string[] = [];
      if (v.buttonSeat === s.seat) markers.push('D');
      if (v.smallBlindSeat === s.seat) markers.push('SB');
      if (v.bigBlindSeat === s.seat) markers.push('BB');
      out.push({
        seat: s,
        slot: slot as SeatSlot,
        pos: SLOT_POS[slot as SeatSlot],
        name: seatName(s, this.mySeat()),
        isMe: s.seat === this.mySeat(),
        isTurn: v.turn?.seat === s.seat,
        markers: v.phase === 'betweenHands' ? [] : markers,
        winner: winners.has(s.seat),
      });
    }
    return out;
  });

  protected readonly bets = computed(() =>
    this.slots()
      .filter((s) => s.seat.committed > 0)
      .map((s) => ({ key: s.seat.seat, pos: BET_POS[s.slot], amount: chips(s.seat.committed) })),
  );

  protected readonly winning = computed(() => winningCards(this.view()));
  protected readonly showdown = computed(() => this.view().phase === 'showdown');

  protected readonly boardSlots = computed(() => {
    const board = this.view().board;
    const win = this.winning();
    const sd = this.showdown();
    return [0, 1, 2, 3, 4].map((i) => {
      const card = board[i] ?? null;
      return { i, card, state: card && sd ? (win.has(card) ? 'win' : 'dim') : '' };
    });
  });

  protected readonly pots = computed(() => this.view().pots.map((p) => ({ label: p.label, amount: chips(p.amount) })));

  protected readonly moment = computed(() => {
    const v = this.view();
    if (v.allInRunout) return 'All-in';
    if (v.phase === 'showdown' && v.result?.splitPot) return 'Split pot';
    return null;
  });

  protected readonly status = computed(() => statusLine(this.view(), this.flags().cardsOnPhone));

  protected readonly title = computed(() => {
    const v = this.view();
    const b = v.level.blinds;
    const parts = [GAME_TYPE_LABEL[v.config.gameType]];
    if (v.config.gameType === 'sitAndGo') parts.push(`Level ${v.level.index + 1}`);
    parts.push(`Blinds ${chips(b.small)}/${chips(b.big)}`);
    if (v.handNumber > 0) parts.push(`Hand ${v.handNumber}`);
    return parts.join(' · ');
  });

  protected readonly levelLine = computed(() => {
    const v = this.view();
    const n = v.level.handsUntilNext;
    if (v.config.gameType !== 'sitAndGo' || n === null) return null;
    return n === 1 ? 'Blinds go up after this hand' : `Blinds go up in ${n} hands`;
  });

  /** What sits in the bottom-left: my cards, card backs, the phone panel, or the public note. */
  protected readonly hand = computed(() => {
    const me = this.me();
    const f = this.flags();
    if (!me) return this.view().seats.some((s) => s) ? { kind: 'public' as const } : { kind: 'none' as const };
    if (!me.holeCards) return { kind: 'none' as const };
    if (f.cardsOnPhone) return { kind: 'phone' as const };
    if (f.cardsHidden) return { kind: 'hidden' as const };
    const mine = this.view().seats[me.seat];
    return { kind: 'cards' as const, cards: me.holeCards, folded: mine?.status === 'folded' };
  });

  protected readonly myCards = computed(() => {
    const h = this.hand();
    return h.kind === 'cards' ? h : null;
  });

  protected readonly handLabel = computed(() => {
    const h = this.hand();
    const me = this.me();
    return h.kind === 'cards' && !h.folded && this.flags().handLabel ? (me?.handLabel ?? null) : null;
  });

  protected myCardState(c: Card): string {
    const h = this.hand();
    if (h.kind === 'cards' && h.folded) return 'ghost';
    if (!this.showdown()) return '';
    return this.winning().has(c) ? 'win' : '';
  }

  protected readonly legal = computed(() => this.me()?.legal ?? null);
  protected readonly buttons = computed(() => {
    const legal = this.legal();
    const bar = this.bar();
    return legal && bar ? buttons(legal, bar) : [];
  });

  protected readonly sizing = computed(() => {
    const legal = this.legal();
    const bar = this.bar();
    if (!legal || !bar || bar.sizingTo === null || (bar.focus !== 'raise' && bar.focus !== 'bet')) return null;
    const active = presetIndex(legal, bar.sizingTo);
    return {
      verb: bar.focus === 'bet' ? 'Bet' : 'Raise to',
      amount: chips(bar.sizingTo),
      step: chips(legal.step),
      presets: legal.presets.map((p, i) => ({ label: PRESET_LABEL[p.id], amount: chips(p.to), on: i === active })),
    };
  });

  protected readonly pre = computed(() => {
    const me = this.me();
    if (!me || me.legal || !me.preActionsAvailable.length) return null;
    return me.preActionsAvailable.map((p: PreAction, i) => ({ i, label: PRE_LABEL[p], on: me.preAction === p, focus: i === this.preFocus() }));
  });

  protected readonly clockText = computed(() => {
    const v = this.view();
    const t = v.turn;
    if (!t || !v.me || t.seat !== v.me.seat || !v.config.actionTimeMs || !t.turnEndsAt) return null;
    const end = t.usingTimeBank ? t.timeBankEndsAt : t.turnEndsAt;
    const left = Math.max(0, Math.ceil((end - this.now()) / 1000));
    return `${t.usingTimeBank ? 'Time bank ' : ''}${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  });

  protected readonly legendCards = computed(() => (this.flags().cardsHidden ? 'Show cards' : 'Hide cards'));
}
