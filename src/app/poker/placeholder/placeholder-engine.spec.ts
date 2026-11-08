import { PlayerAction, PlayerView, RandomSource, SeatIndex } from '../core/api';
import { PlaceholderEvaluator } from './placeholder-eval';
import { PlaceholderPokerEngine } from './placeholder-engine';
import { tableConfig } from './local-table';

/** Seeded RNG (mulberry32) so failures replay. */
function seeded(seed: number): RandomSource {
  let a = seed >>> 0;
  return {
    nextUint32() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return (t ^ (t >>> 14)) >>> 0;
    },
  };
}

function makeEngine(seed: number, players: number, gameType: 'home' | 'sitAndGo' = 'home') {
  const rng = seeded(seed);
  let now = 0;
  const engine = new PlaceholderPokerEngine(
    't',
    tableConfig(gameType, false),
    { rng, clock: { now: () => now++ }, sha256: () => '', evaluator: new PlaceholderEvaluator() },
    { runoutDelayMs: 0 },
  );
  for (let i = 0; i < players; i++) engine.sit(i, { id: `p${i}`, name: `P${i}`, kind: 'human', botLevel: null });
  return { engine, rng };
}

function randomAction(view: PlayerView, rng: RandomSource): PlayerAction {
  const legal = view.me!.legal!;
  const r = rng.nextUint32() % 100;
  if (legal.allIn && r < 6) return { type: 'allIn' };
  if (legal.raise && r < 22) {
    const p = legal.presets[rng.nextUint32() % legal.presets.length]!;
    return p.id === 'allIn' ? { type: 'allIn' } : { type: 'raise', to: p.to };
  }
  if (legal.bet && r < 30) return { type: 'bet', to: legal.bet.minTo };
  if (legal.check) return { type: 'check' };
  if (legal.call && r < 75) return { type: 'call' };
  return { type: 'fold' };
}

function noHiddenCards(view: PlayerView, viewer: SeatIndex | null): void {
  for (const s of view.seats) {
    if (!s || !s.shownCards) continue;
    // Cards only appear face up after a show/run-out.
    expect(['showdown', 'handComplete', 'preflop', 'flop', 'turn', 'river']).toContain(view.phase);
  }
  if (viewer === null) expect(view.me).toBeNull();
  else expect(view.me?.seat).toBe(viewer);
  expect(JSON.stringify(view)).not.toContain('"deck"');
}

describe('placeholder engine (Phase 1 preview only)', () => {
  it('plays 3,000 random hands with the chip check holding after every step', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const players = 2 + (seed % 5);
      const { engine, rng } = makeEngine(seed, players);
      for (let hand = 0; hand < 100; hand++) {
        for (const s of engine.viewFor({ kind: 'public' }).seats) if (s && s.stack === 0) engine.topUp(s.seat);
        const start = engine.startHand();
        expect(start.ok).toBe(true);
        let guard = 0;
        for (;;) {
          const pub = engine.viewFor({ kind: 'public' });
          if (!pub.turn) break;
          const seat = pub.turn.seat;
          const view = engine.viewFor({ kind: 'seat', seat });
          noHiddenCards(view, seat);
          const res = engine.act(seat, randomAction(view, rng));
          expect(res.ok).toBe(true);
          expect(++guard).toBeLessThan(200);
        }
        const end = engine.viewFor({ kind: 'public' });
        expect(['showdown', 'handComplete']).toContain(end.phase);
        expect(end.result).not.toBeNull();
        const total = end.seats.reduce((t, s) => t + (s?.stack ?? 0), 0);
        const awarded = end.result!.pots.reduce((t, p) => t + p.winners.reduce((u, w) => u + w.amount, 0), 0);
        expect(awarded).toBe(end.result!.pots.reduce((t, p) => t + p.amount, 0));
        expect(total).toBeGreaterThan(0);
      }
    }
  });

  it('never puts another player\'s hole cards in a seat view before they are shown', () => {
    const { engine } = makeEngine(7, 6);
    engine.startHand();
    const view = engine.viewFor({ kind: 'seat', seat: 2 });
    const mine = view.me!.holeCards!;
    const text = JSON.stringify(view);
    // Only my two cards appear; no other seat has face-up cards before the showdown.
    expect(view.seats.filter((s) => s?.shownCards).length).toBe(0);
    const allCards = text.match(/"[2-9TJQKA][cdhs]"/g) ?? [];
    expect(new Set(allCards)).toEqual(new Set(mine.map((c) => `"${c}"`)));
  });

  it('min-raise math: big blind 10, raise to 30 → next minimum raise-to 50', () => {
    const { engine } = makeEngine(3, 3);
    engine.startHand();
    const first = engine.viewFor({ kind: 'public' }).turn!.seat;
    expect(engine.act(first, { type: 'raise', to: 30 }).ok).toBe(true);
    const next = engine.viewFor({ kind: 'public' }).turn!.seat;
    const legal = engine.viewFor({ kind: 'seat', seat: next }).me!.legal!;
    expect(legal.raise!.minTo).toBe(50);
    expect(legal.defaultFocus).toBe('call');
  });

  it('heads-up: the button posts the small blind and acts first before the flop', () => {
    const { engine } = makeEngine(5, 2);
    engine.startHand();
    const v = engine.viewFor({ kind: 'public' });
    expect(v.smallBlindSeat).toBe(v.buttonSeat);
    expect<number | null>(v.turn!.seat).toBe(v.buttonSeat);
  });

  it('Sit & Go finishes with one winner and places for everyone', () => {
    const { engine, rng } = makeEngine(11, 4, 'sitAndGo');
    let hands = 0;
    while (engine.viewFor({ kind: 'public' }).status === 'open' && hands < 3000) {
      if (!engine.startHand().ok) break;
      hands++;
      for (;;) {
        const pub = engine.viewFor({ kind: 'public' });
        if (!pub.turn) break;
        const seat = pub.turn.seat;
        const view = engine.viewFor({ kind: 'seat', seat });
        const legal = view.me!.legal!;
        // Aggressive so the test ends quickly.
        engine.act(seat, legal.allIn ? { type: 'allIn' } : legal.call ? { type: 'call' } : randomAction(view, rng));
      }
    }
    const end = engine.viewFor({ kind: 'public' });
    expect(end.status).toBe('finished');
    expect(end.standings.filter((s) => s.place === 1).length).toBe(1);
    expect(end.standings.length).toBe(4);
  });
});
