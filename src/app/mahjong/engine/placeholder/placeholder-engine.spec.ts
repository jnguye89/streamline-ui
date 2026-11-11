import { Clock, GameConfig, PlayerAction, PlayerView, kindOf } from '@skriin/mahjong-core';
import { PlaceholderEngine } from './placeholder-engine';

/** Smoke tests for the Phase 1 placeholder only (the real rule tests come with mahjong-core in Phase 2). */

class FakeClock implements Clock {
  t = 0;
  private q: { at: number; fn: () => void; id: number }[] = [];
  private seq = 0;
  now(): number {
    return this.t;
  }
  setTimeout(fn: () => void, ms: number): unknown {
    const id = ++this.seq;
    this.q.push({ at: this.t + ms, fn, id });
    return id;
  }
  clearTimeout(h: unknown): void {
    this.q = this.q.filter((x) => x.id !== h);
  }
  run(max = 500_000): number {
    let n = 0;
    while (this.q.length && n++ < max) {
      this.q.sort((a, b) => a.at - b.at || a.id - b.id);
      const x = this.q.shift()!;
      this.t = x.at;
      x.fn();
    }
    return n;
  }
}

const config = (seed: number, human: boolean, length: 'quick' | 'full' = 'quick'): GameConfig => ({
  variant: 'hong-kong',
  length,
  botLevel: 'medium',
  minFaan: 3,
  faanCap: 10,
  claimWindowMs: 5000,
  discardTimerMs: null,
  pace: 'fast',
  seed,
  seats: [
    { name: 'You', kind: human ? 'human' : 'bot' },
    { name: 'B1', kind: 'bot' },
    { name: 'B2', kind: 'bot' },
    { name: 'B3', kind: 'bot' },
  ],
});

describe('placeholder engine (phase 1 smoke)', () => {
  it('all-bot quick games: 144 tiles conserved at every step and the game ends', () => {
    let hands = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const clock = new FakeClock();
      const eng = new PlaceholderEngine(clock);
      let last: PlayerView | null = null;
      eng.subscribe(0, (v, events) => {
        expect(eng.audit()).toBe(144);
        last = v;
        hands += events.filter((e) => e.type === 'hand-start').length;
      });
      eng.start(config(seed, false));
      clock.run();
      expect(last!.phase).toBe('game-over');
      expect(last!.standings!.map((s) => s.score).reduce((a, b) => a + b, 0)).toBe(0);
      eng.dispose();
    }
    expect(hands).toBeGreaterThan(25 * 4 - 1);
  });

  it('a human seat gets only legal options, claim windows close, and every hand can finish', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const clock = new FakeClock();
      const eng = new PlaceholderEngine(clock);
      let view: PlayerView | null = null;
      eng.subscribe(0, (v) => {
        view = v;
        expect(eng.audit()).toBe(144);
        // Only your own concealed tiles are in your view.
        expect(v.hand.length + (v.drawn === null ? 0 : 1)).toBe(v.seats[0].concealedCount);
        if (v.claim) expect(v.options.some((o) => o.action.type === 'pass')).toBe(true);
        for (const o of v.options) if (o.action.type === 'chow') expect(v.claim?.from).toBe(3);
        if (!v.options.length) return;
        const pick = (): PlayerAction => {
          const win = v.options.find((o) => o.action.type === 'win');
          if (win) return win.action;
          const next = v.options.find((o) => o.action.type === 'next');
          if (next) return next.action;
          const pung = v.options.find((o) => o.action.type === 'pung');
          if (pung && seed % 2) return pung.action;
          if (v.claim) return { type: 'pass' };
          const discards = v.options.filter((o) => o.action.type === 'discard');
          const honor = discards.find(
            (o) => o.action.type === 'discard' && kindOf(o.action.tile) >= 27,
          );
          return (honor ?? discards[discards.length - 1]).action;
        };
        // Some claims are left to time out (auto-pass after the 5 s window).
        if (v.claim && seed % 3 === 0) return;
        const action = pick();
        clock.setTimeout(() => eng.act(0, action), 40);
      });
      eng.start(config(seed, true));
      clock.run();
      expect(view!.phase).toBe('game-over');
      eng.dispose();
    }
  });

  it('ignores actions that are not in the options', () => {
    const clock = new FakeClock();
    const eng = new PlaceholderEngine(clock);
    eng.start(config(3, true));
    const before = JSON.stringify(eng.view(0));
    eng.act(0, { type: 'discard', tile: 143 });
    eng.act(1, { type: 'win' });
    expect(JSON.stringify(eng.view(0))).toBe(before);
    eng.dispose();
  });
});
