import { seededRng } from '../core/rng';
import { POINTS, scoreRound, standings, verdictFor } from '../core/scoring';
import { PublicState } from '../core/types';
import { MockRoom } from './mock-room';

/** A room on a fake clock. */
function makeRoom(seed = 7, opts: { simSkipAnswer?: number; simSkipVote?: number } = {}) {
  const clock = { t: 1_000_000 };
  const room = new MockRoom({ now: () => clock.t, rng: seededRng(seed), code: 'BXKM', ...opts });
  const advance = (ms: number, step = 100) => {
    for (let done = 0; done < ms; done += step) {
      clock.t += step;
      room.tick();
    }
  };
  const runUntil = (pred: (s: PublicState) => boolean, maxMs = 30 * 60_000) => {
    for (let done = 0; done < maxMs && !pred(room.publicState()); done += 100) {
      clock.t += 100;
      room.tick();
    }
    return room.publicState();
  };
  return { room, clock, advance, runUntil };
}

describe('MockRoom: a full game with 5 simulated players + the bot, no server', () => {
  it('plays 6 rounds to the final leaderboard', () => {
    const { room, runUntil } = makeRoom();
    room.addSimPlayers(5);
    expect(room.start()).toBe(true);
    const seenRounds = new Set<number>();
    const phases = new Set<string>();
    const s = runUntil((st) => {
      seenRounds.add(st.round);
      phases.add(st.phase);
      return st.phase === 'final';
    });
    expect(s.phase).toBe('final');
    expect([...seenRounds].filter((r) => r > 0).sort()).toEqual([1, 2, 3, 4, 5, 6]);
    for (const p of ['prompt', 'answering', 'reveal', 'voting', 'results']) expect(phases.has(p)).toBe(true);
    expect(s.standings.length).toBe(6); // 5 humans + the bot
    expect(s.standings.some((x) => x.score > 0)).toBe(true);
  });

  it('play again keeps the room and the people, scores reset', () => {
    const { room, runUntil } = makeRoom(3);
    room.addSimPlayers(5);
    room.start();
    runUntil((s) => s.phase === 'final');
    const ids = room.publicState().players.map((p) => p.id);
    expect(room.playAgain()).toBe(true);
    const s = room.publicState();
    expect(s.code).toBe('BXKM');
    expect(s.round).toBe(1);
    expect(s.players.map((p) => p.id)).toEqual(ids);
    expect(s.players.every((p) => p.score === 0)).toBe(true);
  });
});

describe('MockRoom: rules the UI depends on', () => {
  it("can't start with fewer than 3 humans", () => {
    const { room } = makeRoom();
    room.addSimPlayers(2);
    expect(room.start()).toBe(false);
    room.join('Kim');
    expect(room.start()).toBe(true);
  });

  it('late join waits for the next round', () => {
    const { room, runUntil } = makeRoom();
    room.addSimPlayers(4);
    room.start();
    runUntil((s) => s.phase === 'answering');
    const res = room.join('Late');
    expect(res.ok).toBe(true);
    const id = res.ok ? res.playerId : '';
    expect(room.publicState().players.find((p) => p.id === id)?.waiting).toBe(true);
    expect(room.submitAnswer(id, 'hi')).toBe('too-late');
    runUntil((s) => s.round === 2);
    expect(room.publicState().players.find((p) => p.id === id)?.waiting).toBe(false);
  });

  it("can't vote for your own card; late votes are rejected", () => {
    const { room, runUntil } = makeRoom(11, { simSkipAnswer: 0, simSkipVote: 1 });
    room.addSimPlayers(4);
    const me = room.join('Tester');
    const id = me.ok ? me.playerId : '';
    room.start();
    runUntil((s) => s.phase === 'answering');
    expect(room.submitAnswer(id, '  my   answer  ')).toBe('sent');
    expect(room.privateFor(id).answer).toBe('my answer');
    runUntil((s) => s.phase === 'voting');
    const own = room.privateFor(id).cardId;
    expect(own).not.toBeNull();
    expect(room.vote(id, own ?? '')).toBe('own-card');
    const other = room.publicState().cards.find((c) => c.id !== own);
    expect(room.vote(id, other?.id ?? '')).toBe('ok');
    runUntil((s) => s.phase === 'results');
    expect(room.vote(id, other?.id ?? '')).toBe('too-late');
  });

  it('blocked answers bounce back to the phone', () => {
    const { room, runUntil } = makeRoom();
    room.addSimPlayers(3);
    const me = room.join('Tester');
    const id = me.ok ? me.playerId : '';
    room.start();
    runUntil((s) => s.phase === 'answering');
    expect(room.submitAnswer(id, 'oh damn')).toBe('blocked');
    expect(room.privateFor(id).blocked).toBe(true);
    expect(room.submitAnswer(id, 'oh dang')).toBe('sent');
    expect(room.privateFor(id).blocked).toBe(false);
  });

  it('under 2 human answers: new prompt once, then the round is skipped', () => {
    const { room, runUntil } = makeRoom(5, { simSkipAnswer: 1 });
    room.addSimPlayers(3);
    room.start();
    let s = runUntil((st) => st.phase === 'void');
    expect(s.voidRetry).toBe(true);
    expect(s.round).toBe(1);
    s = runUntil((st) => st.phase === 'void' && !st.voidRetry);
    expect(s.round).toBe(1);
    s = runUntil((st) => st.phase === 'prompt' && st.round === 2);
    expect(s.round).toBe(2);
  });

  it('the bot is never the first answer in, and never instant', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const { room, clock, runUntil } = makeRoom(seed);
      room.addSimPlayers(5);
      room.start();
      const answeringFrom = runUntil((s) => s.phase === 'answering') && clock.t;
      let firstIn: string | null = null;
      let botAt = 0;
      runUntil((s) => {
        const inNow = s.players.filter((p) => p.answered);
        if (!firstIn && inNow.length) firstIn = inNow[0].kind;
        if (!botAt && s.players.some((p) => p.kind === 'bot' && p.answered)) botAt = clock.t;
        return s.phase !== 'answering' && s.phase !== 'prompt';
      });
      expect<string | null>(firstIn).toBe('human');
      expect(botAt - answeringFrom).toBeGreaterThan(1000);
    }
  });

  it('host can hide a card mid-reveal; it stays votable', () => {
    const { room, runUntil } = makeRoom(2, { simSkipAnswer: 0 });
    room.addSimPlayers(5);
    room.start();
    runUntil((s) => s.phase === 'reveal' && s.revealed >= 2);
    const card = room.publicState().cards[0];
    room.hideCard(card.id);
    const hidden = room.publicState().cards[0];
    expect(hidden.hidden).toBe(true);
    expect(hidden.text).toBe('');
    runUntil((s) => s.phase === 'voting');
    expect(room.publicState().cards.find((c) => c.id === card.id)).toBeTruthy();
  });

  it('second bot joins at 7 humans when the setting is on', () => {
    const { room } = makeRoom();
    room.addSimPlayers(6);
    expect(room.publicState().players.filter((p) => p.kind === 'bot').length).toBe(1);
    room.addSimPlayers(7);
    expect(room.publicState().players.filter((p) => p.kind === 'bot').length).toBe(2);
    room.updateSettings({ secondBot: false });
    expect(room.publicState().players.filter((p) => p.kind === 'bot').length).toBe(1);
  });

  it('family mode is locked on while live', () => {
    const { room } = makeRoom();
    room.setLive(true);
    room.updateSettings({ familyMode: false });
    expect(room.publicState().settings.familyMode).toBe(true);
    room.setLive(false);
    room.updateSettings({ familyMode: false });
    expect(room.publicState().settings.familyMode).toBe(false);
  });
});

describe('MockRoom: no leaks before Results', () => {
  it('no payload names an author or a bot card until Results', () => {
    const { room, runUntil } = makeRoom(9, { simSkipAnswer: 0 });
    room.addSimPlayers(5);
    room.start();
    const authorIds = new Set(room.publicState().players.map((p) => p.id));
    let checked = 0;
    runUntil((s) => {
      if (s.phase === 'reveal' || s.phase === 'voting') {
        const json = JSON.stringify(s);
        expect(json).not.toMatch(/authorId|isBot|voterIds/);
        for (const c of s.cards) {
          expect(Object.keys(c).sort()).toEqual(['hidden', 'id', 'letter', 'text']);
          expect(authorIds.has(c.id)).toBe(false);
        }
        expect(s.results).toBeNull();
        checked++;
      }
      return s.phase === 'results';
    });
    expect(checked).toBeGreaterThan(10);
    expect(JSON.stringify(room.publicState())).toMatch(/authorId/);
  });

  it("a phone's private view only names its own card", () => {
    const { room, runUntil } = makeRoom(4, { simSkipAnswer: 0 });
    room.addSimPlayers(5);
    room.start();
    runUntil((s) => s.phase === 'voting');
    const ids = room.publicState().players.filter((p) => p.kind === 'human').map((p) => p.id);
    const own = room.inspectCards();
    for (const id of ids) {
      const view = room.privateFor(id);
      expect(view.cardId).toBe(own.find((c) => c.authorId === id)?.id ?? null);
      expect(Object.keys(view).sort()).toEqual(['answer', 'blocked', 'cardId', 'playerId', 'removed', 'submitted', 'vote']);
    }
  });
});

describe('Scoring', () => {
  const cards = [
    { cardId: 'a', authorId: 'h1', isBot: false },
    { cardId: 'b', authorId: 'h2', isBot: false },
    { cardId: 'c', authorId: 'bot', isBot: true },
    { cardId: 'd', authorId: 'h3', isBot: false },
  ];
  const humans = ['h1', 'h2', 'h3', 'h4'];
  const votes = new Map([
    ['h1', 'c'],
    ['h2', 'a'],
    ['h3', 'a'],
  ]); // h4 didn't vote
  const pts = (lines: ReturnType<typeof scoreRound>, id: string) => lines.find((l) => l.playerId === id)?.points;

  it('classic', () => {
    const lines = scoreRound({ mode: 'classic', double: false, cards, votes, humanIds: humans, botIds: ['bot'] });
    expect(pts(lines, 'h1')).toBe(POINTS.caught); // caught; own card got 2 votes
    expect(pts(lines, 'h2')).toBe(POINTS.clearlyHuman); // nobody voted for b
    expect(pts(lines, 'h3')).toBe(POINTS.clearlyHuman);
    expect(pts(lines, 'h4')).toBe(0); // no card, no vote
    expect(pts(lines, 'bot')).toBe(2 * POINTS.botPerHuman); // h2 + h3 voted elsewhere; h4 didn't vote
  });

  it('bluff + double last round', () => {
    const lines = scoreRound({ mode: 'bluff', double: true, cards, votes, humanIds: humans, botIds: ['bot'] });
    expect(pts(lines, 'h1')).toBe((POINTS.caught + 2 * POINTS.fooledPerVote) * 2);
    expect(pts(lines, 'h2')).toBe(0);
    expect(pts(lines, 'bot')).toBe(2 * POINTS.botPerHuman * 2);
  });

  it('2 bots: either counts, each scored on its own', () => {
    const two = [...cards, { cardId: 'e', authorId: 'bot2', isBot: true }];
    const v = new Map([
      ['h1', 'c'],
      ['h2', 'e'],
      ['h3', 'a'],
    ]);
    const lines = scoreRound({ mode: 'classic', double: false, cards: two, votes: v, humanIds: humans, botIds: ['bot', 'bot2'] });
    expect(pts(lines, 'h1')).toBe(POINTS.caught);
    expect(pts(lines, 'h2')).toBe(POINTS.caught + POINTS.clearlyHuman);
    expect(pts(lines, 'bot')).toBe(2 * POINTS.botPerHuman); // h2, h3
    expect(pts(lines, 'bot2')).toBe(2 * POINTS.botPerHuman); // h1, h3
  });

  it('verdicts, ties at the top count as busted', () => {
    expect(verdictFor(cards, new Map([['h1', 'c'], ['h2', 'a']]))).toBe('busted');
    expect(verdictFor(cards, new Map([['h1', 'b'], ['h2', 'a'], ['h3', 'a']]))).toBe('got-away');
    expect(verdictFor(cards, new Map())).toBe('got-away');
  });

  it('ties share the place', () => {
    const s = standings([
      { id: 'a', score: 300, name: 'A' },
      { id: 'b', score: 300, name: 'B' },
      { id: 'c', score: 100, name: 'C' },
    ]);
    expect(s.map((x) => x.place)).toEqual([1, 1, 3]);
  });
});

describe('MockRoom: every host action is published at once', () => {
  it('start and play again notify listeners immediately', () => {
    const { room, runUntil } = makeRoom(12);
    room.addSimPlayers(4);
    let calls = 0;
    room.onChange(() => calls++);
    room.start();
    expect(calls).toBe(1);
    expect(room.publicState().phase).toBe('prompt');
    runUntil((s) => s.phase === 'final');
    calls = 0;
    room.freeze();
    calls = 0;
    room.playAgain();
    expect(calls).toBe(1);
    expect(room.publicState().phase).toBe('prompt');
  });
});
