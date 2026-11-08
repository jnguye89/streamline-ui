import { Card, PlayerView, SeatIndex, SeatView } from '../core/api';
import { chips } from '../core/cards';

/** Seat name as shown on the table. Bots always say so (approved answer 18). */
export function seatName(s: SeatView | null | undefined, mySeat: SeatIndex | null): string {
  if (!s) return '';
  if (mySeat !== null && s.seat === mySeat) return 'You';
  return s.player.kind === 'bot' ? `Bot · ${s.player.name}` : s.player.name;
}

/** Short name for sentences ("Nova wins with a flush"). */
export function shortName(s: SeatView | null | undefined, mySeat: SeatIndex | null): string {
  if (!s) return '';
  if (mySeat !== null && s.seat === mySeat) return 'You';
  return s.player.name;
}

export interface StatusLine {
  readonly hero: string;
  readonly sub: string;
  readonly tone: '' | 'turn' | 'win' | 'allin' | 'muted';
}

const CATEGORY_WORD: Record<string, string> = {
  highCard: 'high card',
  onePair: 'a pair',
  twoPair: 'two pair',
  threeOfAKind: 'three of a kind',
  straight: 'a straight',
  flush: 'a flush',
  fullHouse: 'a full house',
  fourOfAKind: 'four of a kind',
  straightFlush: 'a straight flush',
};

export function statusLine(view: PlayerView, cardsOnPhone: boolean): StatusLine {
  const mySeat = view.me?.seat ?? null;
  const me = mySeat !== null ? view.seats[mySeat] : null;

  if (view.status === 'finished') return { hero: 'Table over.', sub: 'Thanks for playing.', tone: 'muted' };

  const result = view.result;
  if (result && (view.phase === 'showdown' || view.phase === 'handComplete')) {
    const main = result.pots[0];
    if (main) {
      const names = main.winners.map((w) => shortName(view.seats[w.seat], mySeat));
      const hand = main.winningHand;
      if (main.winners.length > 1) {
        return {
          hero: 'Split pot',
          sub: `${hand ? hand.label : 'Same hand'} · ${chips(main.winners[0]!.amount)} each`,
          tone: 'win',
        };
      }
      const total = result.pots.filter((p) => p.winners.some((w) => w.seat === main.winners[0]!.seat)).reduce((t, p) => t + p.amount, 0);
      const who = names[0]!;
      if (!hand) {
        return { hero: who === 'You' ? `You win ${chips(total)}` : `${who} wins ${chips(total)}`, sub: 'Everyone else folded.', tone: who === 'You' ? 'win' : '' };
      }
      const what = CATEGORY_WORD[hand.category] ?? 'the best hand';
      return {
        hero: who === 'You' ? `You win with ${what}` : `${who} wins with ${what}`,
        sub: `${hand.label} · ${chips(total)}`,
        tone: who === 'You' ? 'win' : '',
      };
    }
  }

  if (view.allInRunout) return { hero: 'All-in', sub: 'Hands up. Dealing the rest.', tone: 'allin' };

  if (view.me?.legal) {
    const legal = view.me.legal;
    const sub = legal.call ? `Call ${chips(legal.call.amount)} to stay in.` : 'Check, or bet.';
    return { hero: 'Your turn.', sub, tone: 'turn' };
  }

  if (view.turn) {
    const s = view.seats[view.turn.seat];
    const name = shortName(s, mySeat);
    const sub = me && me.status === 'folded' ? 'You folded.' : cardsOnPhone && me?.dealtIn ? 'Your cards are on your phone.' : pot(view);
    return { hero: `${name} is thinking…`, sub, tone: 'muted' };
  }

  if (me && me.status === 'busted') {
    if (view.config.gameType === 'sitAndGo') {
      const place = view.standings.find((x) => x.playerId === me.player.id)?.place;
      return { hero: place ? `You finished ${ordinal(place)}.` : 'You’re out.', sub: 'Watching the rest.', tone: 'muted' };
    }
    return { hero: 'Out of chips.', sub: 'Top-ups are free. Menu → Top up.', tone: 'muted' };
  }
  if (me && me.status === 'sittingOut') return { hero: 'Sitting out.', sub: 'Menu → I’m back.', tone: 'muted' };
  return { hero: 'Next hand…', sub: 'A to deal now.', tone: 'muted' };
}

function pot(view: PlayerView): string {
  const total = view.pots.reduce((t, p) => t + p.amount, 0) + view.seats.reduce((t, s) => t + (s?.committed ?? 0), 0);
  return total ? `Pot ${chips(total)}` : '';
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** Cards to highlight at showdown: the winning five of every main-pot winner. */
export function winningCards(view: PlayerView): Set<Card> {
  const out = new Set<Card>();
  const result = view.result;
  if (!result || view.phase !== 'showdown') return out;
  const main = result.pots[0];
  if (!main) return out;
  for (const w of main.winners) {
    const shown = result.shown.find((h) => h.seat === w.seat);
    for (const c of shown?.hand?.best5 ?? []) out.add(c);
  }
  return out;
}

export function winnerSeats(view: PlayerView): Set<SeatIndex> {
  const out = new Set<SeatIndex>();
  if (!view.result || (view.phase !== 'showdown' && view.phase !== 'handComplete')) return out;
  for (const p of view.result.pots) for (const w of p.winners) out.add(w.seat);
  return out;
}

/** Last action as a short label on the seat ("Raise 120", "Check", "SB 5"). */
export function actionLabel(s: SeatView): string {
  const a = s.lastAction;
  if (!a) return '';
  const to = a.to !== null ? ` ${chips(a.to)}` : '';
  switch (a.type) {
    case 'fold':
      return a.auto === 'timeout' ? 'Folded · time' : 'Folded';
    case 'check':
      return a.auto === 'timeout' ? 'Check · time' : 'Check';
    case 'call':
      return 'Call';
    case 'bet':
      return `Bet${to}`;
    case 'raise':
      return `Raise${to}`;
    case 'allIn':
      return 'All-in';
    case 'smallBlind':
      return 'Small blind';
    case 'bigBlind':
      return 'Big blind';
    case 'ante':
      return 'Ante';
  }
}
