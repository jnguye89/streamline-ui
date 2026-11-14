import { Rng, between, pickOne, randomId, shuffle } from '../core/rng';
import { scoreRound, standings, verdictFor } from '../core/scoring';
import {
  ALL_IN_GRACE_MS,
  CARD_LETTERS,
  CODE_ALPHABET,
  DEFAULT_SETTINGS,
  MAX_HUMANS,
  MIN_HUMANS,
  PROMPT_MS,
  RESULTS_MS,
  REVEAL_HOLD_MS,
  REVEAL_STEP_MS,
  VOID_MS,
  VOTE_MS,
  botCount,
  validateSettings,
} from '../core/settings';
import { normalizeAnswer, normalizeName } from '../core/text';
import {
  JoinResult,
  Phase,
  PlayerKind,
  PrivateView,
  PublicCard,
  PublicPlayer,
  PublicState,
  RoundResults,
  Settings,
  SubmitResult,
  VoteResult,
} from '../core/types';
import { MockModerator, Moderator } from './mock-moderation';
import { MOCK_PROMPTS, MockPrompt, SIM_PLAYERS } from './mock-prompts';

export interface MockRoomOptions {
  /** Room clock (ms). The Angular host passes a virtual clock so the preview can run fast. */
  readonly now: () => number;
  readonly rng?: Rng;
  readonly code?: string;
  readonly prompts?: readonly MockPrompt[];
  readonly moderator?: Moderator;
  /** Chance a simulated player skips answering / voting in a round. */
  readonly simSkipAnswer?: number;
  readonly simSkipVote?: number;
  /** Chance a simulated voter picks a bot card (otherwise a random other card). */
  readonly simBotSense?: number;
}

interface PlayerRec {
  id: string;
  name: string;
  kind: PlayerKind;
  hue: number;
  connected: boolean;
  isHost: boolean;
  score: number;
  /** Index into SIM_PLAYERS / prompt.sim for simulated players. */
  sim: number | null;
  waiting: boolean;
}

interface CardRec {
  id: string;
  letter: string;
  text: string;
  authorId: string;
  isBot: boolean;
  hidden: boolean;
}

interface Job {
  at: number;
  run: () => void;
}

const IN_ROUND: readonly Phase[] = ['prompt', 'answering', 'reveal', 'voting', 'results', 'void'];
const WITH_CARDS: readonly Phase[] = ['reveal', 'voting', 'results'];
const BOT_IDS = ['bot-1', 'bot-2'] as const;

/**
 * Offline stand-in for the Phase 2 Colyseus room, used by the preview and the UI tests.
 * It behaves like the server: it owns the timers, the shuffle, who wrote what and which card is
 * the bot, and hands clients only PublicState + each phone's own PrivateView.
 *
 * Time only moves when tick() is called, so tests can drive it with a fake clock.
 */
export class MockRoom {
  readonly code: string;

  private now: () => number;
  private readonly rng: Rng;
  private readonly prompts: readonly MockPrompt[];
  private readonly moderator: Moderator;
  private readonly simSkipAnswer: number;
  private readonly simSkipVote: number;
  private readonly simBotSense: number;
  private readonly listeners = new Set<() => void>();

  private phase: Phase = 'lobby';
  private players: PlayerRec[] = [];
  private readonly removed = new Set<string>();
  private settings: Settings = DEFAULT_SETTINGS;
  private live = false;
  private hostPaused = false;
  private frozen = false;
  private stoppedAt: number | null = null;
  private round = 0;
  private retried = false;
  private roundKey = 0;
  private promptOrder: MockPrompt[] = [];
  private prompt: MockPrompt | null = null;
  private roundHumans: string[] = [];
  private roundBots: string[] = [];
  private readonly answers = new Map<string, string>();
  private readonly blocked = new Set<string>();
  private firstHumanAt: number | null = null;
  private cards: CardRec[] = [];
  private revealed = 0;
  private readonly votes = new Map<string, string>();
  private results: RoundResults | null = null;
  private timer: { totalMs: number; endsAt: number } | null = null;
  private jobs: Job[] = [];
  private voidRetry = true;
  private seq = 0;

  constructor(opts: MockRoomOptions) {
    this.now = opts.now;
    this.rng = opts.rng ?? Math.random;
    this.prompts = opts.prompts ?? MOCK_PROMPTS;
    this.moderator = opts.moderator ?? new MockModerator();
    this.simSkipAnswer = opts.simSkipAnswer ?? 0.1;
    this.simSkipVote = opts.simSkipVote ?? 0.08;
    this.simBotSense = opts.simBotSense ?? 0.4;
    this.code = opts.code ?? Array.from({ length: 4 }, () => pickOne(this.rng, [...CODE_ALPHABET])).join('');
    this.players.push(this.botRec(BOT_IDS[0], 'Bot'));
  }

  // ── Subscriptions ──────────────────────────────────────────────────────────

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of [...this.listeners]) fn();
  }

  // ── Players ────────────────────────────────────────────────────────────────

  /** Seat simulated players (by SIM_PLAYERS index). */
  addSimPlayers(count: number): void {
    for (let i = 0; i < Math.min(count, SIM_PLAYERS.length); i++) this.join(SIM_PLAYERS[i], i);
  }

  join(rawName: string, sim: number | null = null): JoinResult {
    const name = normalizeName(rawName);
    if (!name) return { ok: false, error: 'name-empty' };
    if (!this.moderator.allows(name, true)) return { ok: false, error: 'name-blocked' };
    const same = this.humans().find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (same && !same.connected) {
      same.connected = true; // rejoin with the same name keeps the score
      this.emit();
      return { ok: true, playerId: same.id };
    }
    if (same) return { ok: false, error: 'name-taken' };
    if (this.humans().length >= MAX_HUMANS) return { ok: false, error: 'room-full' };
    const usedHues = new Set(this.humans().map((p) => p.hue));
    const hue = sim ?? [0, 1, 2, 3, 4, 5, 6, 7].find((h) => !usedHues.has(h)) ?? 0;
    const rec: PlayerRec = {
      id: `p${++this.seq}`,
      name,
      kind: 'human',
      hue,
      connected: true,
      isHost: false,
      score: 0,
      sim,
      // Late join: between rounds only. Anyone who arrives mid-round plays from the next one.
      waiting: IN_ROUND.includes(this.phase),
    };
    // Humans sit before the bots on every screen.
    const firstBot = this.players.findIndex((p) => p.kind === 'bot');
    this.players.splice(firstBot === -1 ? this.players.length : firstBot, 0, rec);
    if (this.phase === 'lobby' || this.phase === 'final') this.syncBots();
    this.emit();
    return { ok: true, playerId: rec.id };
  }

  /** Phone closed or lost signal. A submitted answer stays; a missing vote is no vote. */
  disconnect(playerId: string): void {
    const p = this.find(playerId);
    if (!p || p.kind !== 'human') return;
    p.connected = false;
    this.checkAllIn();
    this.emit();
  }

  /** Host tool. The card they already wrote stays (the host can hide it); their vote is dropped. */
  removePlayer(playerId: string): void {
    const p = this.find(playerId);
    if (!p || p.kind !== 'human') return;
    this.players = this.players.filter((q) => q.id !== playerId);
    this.removed.add(playerId);
    this.votes.delete(playerId);
    if (!WITH_CARDS.includes(this.phase)) this.answers.delete(playerId);
    this.roundHumans = this.roundHumans.filter((id) => id !== playerId);
    if (this.phase === 'lobby') this.syncBots();
    this.checkAllIn();
    this.emit();
  }

  /** Hand host tools to a phone (null = the TV hosts). */
  setHost(playerId: string | null): void {
    if (this.players.every((p) => p.isHost === (p.id === playerId))) return;
    for (const p of this.players) p.isHost = p.id === playerId;
    this.emit();
  }

  // ── Settings ───────────────────────────────────────────────────────────────

  updateSettings(next: Partial<Settings>): void {
    const allowed: Partial<Settings> =
      this.phase === 'lobby' ? next : { familyMode: next.familyMode, showNames: next.showNames };
    this.settings = validateSettings(allowed, this.settings, this.live);
    if (this.phase === 'lobby') this.syncBots();
    this.emit();
  }

  /** Host TV went live: streamer mode. Family mode is forced on until it stops. */
  setLive(on: boolean): void {
    this.live = on;
    if (on) this.settings = { ...this.settings, familyMode: true };
    this.emit();
  }

  // ── Flow ───────────────────────────────────────────────────────────────────

  canStart(): boolean {
    return this.phase === 'lobby' && this.connectedHumans().length >= MIN_HUMANS;
  }

  start(): boolean {
    if (!this.canStart()) return false;
    this.resetScores();
    this.round = 0;
    this.beginRound(false);
    this.emit();
    return true;
  }

  /** Final → round 1 with the same people, scores reset. */
  playAgain(): boolean {
    if (this.connectedHumans().length < MIN_HUMANS) {
      this.toLobby();
      return false;
    }
    this.resetScores();
    this.round = 0;
    this.beginRound(false);
    this.emit();
    return true;
  }

  toLobby(): void {
    this.phase = 'lobby';
    this.timer = null;
    this.jobs = [];
    this.round = 0;
    this.cards = [];
    this.results = null;
    this.answers.clear();
    this.votes.clear();
    for (const p of this.players) p.waiting = false;
    this.resetScores();
    this.resumeIfStopped();
    this.syncBots();
    this.emit();
  }

  /** Host "skip ahead": ends the current timer now. */
  skip(): void {
    if (!this.timer) return;
    this.onTimerEnd();
    this.emit();
  }

  /** Host menu open: every timer and simulated player waits. */
  pause(): void {
    if (this.hostPaused) return;
    this.stop();
    this.hostPaused = true;
    this.emit();
  }

  resume(): void {
    if (!this.hostPaused) return;
    this.hostPaused = false;
    this.restartIfFree();
    this.emit();
  }

  /** Review only: hold the current state still (no "Paused" label). */
  freeze(): void {
    if (this.frozen) return;
    this.stop();
    this.frozen = true;
    this.emit();
  }

  /** Advance the room to the current time: run due simulated actions and end expired phases. */
  tick(): void {
    if (this.hostPaused || this.frozen) return;
    const now = this.now();
    let changed = false;
    for (;;) {
      const due = this.jobs.filter((j) => j.at <= now).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      this.jobs = this.jobs.filter((j) => j !== due);
      due.run();
      changed = true;
    }
    if (this.timer && now >= this.timer.endsAt) {
      this.onTimerEnd();
      changed = true;
    }
    if (changed) this.emit();
  }

  // ── Player actions ─────────────────────────────────────────────────────────

  /** Phone Send. Can be called again to edit until time is up. */
  submitAnswer(playerId: string, raw: string): SubmitResult {
    if (this.phase !== 'prompt' && this.phase !== 'answering') return 'too-late';
    if (!this.roundHumans.includes(playerId)) return 'too-late';
    const text = normalizeAnswer(raw);
    if (!text) return 'empty';
    if (!this.moderator.allows(text, this.settings.familyMode)) {
      this.blocked.add(playerId);
      this.emit();
      return 'blocked';
    }
    this.blocked.delete(playerId);
    this.answers.set(playerId, text);
    this.firstHumanAt ??= this.now();
    // Everyone human is in: the bot follows a moment later, never instantly.
    if (this.expectedHumans().every((id) => this.answers.has(id))) {
      for (const bot of this.roundBots) {
        if (!this.answers.has(bot)) this.later(between(this.rng, 1500, 3500), () => this.tryBotSubmit(bot));
      }
    }
    this.checkAllIn();
    this.emit();
    return 'sent';
  }

  vote(playerId: string, cardId: string): VoteResult {
    if (this.phase !== 'voting') return 'too-late';
    if (!this.roundHumans.includes(playerId)) return 'too-late';
    const card = this.cards.find((c) => c.id === cardId);
    if (!card) return 'no-card';
    if (card.authorId === playerId) return 'own-card';
    this.votes.set(playerId, cardId);
    this.checkAllIn();
    this.emit();
    return 'ok';
  }

  /** Host tool: hide (or show again) a card. It stays votable; votes on it score normally. */
  hideCard(cardId: string): void {
    if (!WITH_CARDS.includes(this.phase)) return;
    const card = this.cards.find((c) => c.id === cardId);
    if (!card) return;
    card.hidden = !card.hidden;
    this.emit();
  }

  // ── What clients get ───────────────────────────────────────────────────────

  publicState(): PublicState {
    const stopped = this.hostPaused || this.frozen;
    const now = stopped ? (this.stoppedAt ?? this.now()) : this.now();
    const expected = this.expectedHumans();
    const withCards = WITH_CARDS.includes(this.phase);
    return {
      code: this.code,
      phase: this.phase,
      round: this.round,
      totalRounds: this.settings.rounds,
      lastRound: this.round === this.settings.rounds,
      prompt: this.prompt && this.phase !== 'lobby' && this.phase !== 'final' ? this.prompt.text : null,
      timer: this.timer
        ? {
            totalMs: this.timer.totalMs,
            endsAt: stopped ? null : this.timer.endsAt,
            remainingMs: Math.max(0, this.timer.endsAt - now),
            running: !stopped,
          }
        : null,
      paused: this.hostPaused,
      live: this.live,
      settings: this.settings,
      players: this.visiblePlayers().map((p) => this.toPublicPlayer(p)),
      answersIn: expected.filter((id) => this.answers.has(id)).length,
      answersExpected: expected.length,
      cards: withCards ? this.cards.map((c) => this.toPublicCard(c)) : [],
      revealed: withCards ? this.revealed : 0,
      votesIn: [...this.votes.keys()].filter((id) => expected.includes(id)).length,
      votesExpected: expected.length,
      results: this.phase === 'results' ? this.results : null,
      standings: standings(this.visiblePlayers()),
      voidRetry: this.voidRetry,
      roundKey: this.roundKey,
    };
  }

  privateFor(playerId: string): PrivateView {
    const own = WITH_CARDS.includes(this.phase) ? this.cards.find((c) => c.authorId === playerId) : undefined;
    return {
      playerId,
      removed: this.removed.has(playerId),
      answer: this.answers.get(playerId) ?? '',
      submitted: this.answers.has(playerId),
      blocked: this.blocked.has(playerId),
      cardId: own?.id ?? null,
      vote: this.votes.get(playerId) ?? null,
    };
  }

  // ── Review and test helpers (not part of the client API) ──────────────────

  /** Server-side card list, including authors. Tests and preview builders only. */
  inspectCards(): ReadonlyArray<Readonly<CardRec>> {
    return this.cards;
  }

  /** Drop pending simulated actions (preview builders script the votes themselves). */
  clearSimJobs(): void {
    this.jobs = [];
  }

  /** Move every stored time onto a new clock (preview states are built on their own clock). */
  rebaseClock(now: () => number): void {
    const delta = now() - this.now();
    if (this.timer) this.timer = { ...this.timer, endsAt: this.timer.endsAt + delta };
    if (this.stoppedAt !== null) this.stoppedAt += delta;
    if (this.firstHumanAt !== null) this.firstHumanAt += delta;
    for (const j of this.jobs) j.at += delta;
    this.now = now;
  }

  phaseNow(): Phase {
    return this.phase;
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private beginRound(retry: boolean): void {
    if (retry) {
      this.retried = true;
    } else {
      this.round++;
      this.retried = false;
    }
    this.roundKey++;
    for (const p of this.players) p.waiting = false; // late joiners come in here
    this.roundHumans = this.humans().map((p) => p.id);
    this.syncBots();
    this.roundBots = this.players.filter((p) => p.kind === 'bot').map((p) => p.id);
    this.prompt = this.nextPrompt();
    this.answers.clear();
    this.blocked.clear();
    this.votes.clear();
    this.cards = [];
    this.revealed = 0;
    this.results = null;
    this.firstHumanAt = null;
    this.jobs = [];
    this.phase = 'prompt';
    this.setTimer(PROMPT_MS);

    const answerMs = this.settings.answerSeconds * 1000;
    const prompt = this.prompt;
    for (const id of this.roundHumans) {
      const p = this.find(id);
      if (!p || p.sim === null || !p.connected || this.rng() < this.simSkipAnswer) continue;
      const text = prompt.sim[p.sim] ?? prompt.sim[0];
      this.later(PROMPT_MS + between(this.rng, 0.18, 0.85) * answerMs, () => this.submitAnswer(id, text));
    }
    // The bot's moment is drawn from when people usually answer, and re-checked so it's never first.
    for (const bot of this.roundBots) {
      this.later(PROMPT_MS + between(this.rng, 0.3, 0.8) * answerMs, () => this.tryBotSubmit(bot));
    }
  }

  private tryBotSubmit(botId: string): void {
    if (this.answers.has(botId)) return;
    if (this.phase !== 'prompt' && this.phase !== 'answering') return;
    if (this.firstHumanAt === null) {
      this.later(between(this.rng, 1500, 4000), () => this.tryBotSubmit(botId));
      return;
    }
    this.answers.set(botId, this.botAnswer(botId));
    this.checkAllIn();
  }

  private botAnswer(botId: string): string {
    const text = normalizeAnswer(this.prompt?.bot[botId === BOT_IDS[1] ? 1 : 0] ?? '');
    // A blocked bot answer is swapped for its fallback without a word (Phase 2: the bank's fallbacks).
    return this.moderator.allows(text, this.settings.familyMode) ? text : normalizeAnswer(this.prompt?.bot[0] ?? 'ok');
  }

  private onTimerEnd(): void {
    switch (this.phase) {
      case 'prompt':
        this.phase = 'answering';
        this.setTimer(this.settings.answerSeconds * 1000);
        this.checkAllIn();
        break;
      case 'answering':
        this.endAnswering();
        break;
      case 'reveal':
        this.toVoting();
        break;
      case 'voting':
        this.endVoting();
        break;
      case 'results':
        this.advance();
        break;
      case 'void':
        if (this.voidRetry) this.beginRound(true);
        else this.advance();
        break;
      default:
        this.timer = null;
    }
  }

  private endAnswering(): void {
    this.jobs = [];
    // The real server always has a bot answer by now (fallback after 8 s).
    for (const bot of this.roundBots) if (!this.answers.has(bot)) this.answers.set(bot, this.botAnswer(bot));
    const humanAnswers = this.roundHumans.filter((id) => this.answers.has(id));
    if (humanAnswers.length < 2) {
      this.phase = 'void';
      this.voidRetry = !this.retried;
      this.setTimer(VOID_MS);
      return;
    }
    const authors = shuffle(this.rng, [...humanAnswers, ...this.roundBots]);
    this.cards = authors.map((authorId, i) => ({
      id: randomId(this.rng),
      letter: CARD_LETTERS[i],
      text: this.answers.get(authorId) ?? '',
      authorId,
      isBot: this.roundBots.includes(authorId),
      hidden: false,
    }));
    this.phase = 'reveal';
    this.revealed = 0;
    const n = this.cards.length;
    for (let i = 0; i < n; i++) this.later(300 + i * REVEAL_STEP_MS, () => (this.revealed = Math.max(this.revealed, i + 1)));
    this.setTimer(300 + (n - 1) * REVEAL_STEP_MS + REVEAL_HOLD_MS);
  }

  private toVoting(): void {
    this.jobs = [];
    this.revealed = this.cards.length;
    this.phase = 'voting';
    this.setTimer(VOTE_MS);
    for (const id of this.roundHumans) {
      const p = this.find(id);
      if (!p || p.sim === null || !p.connected || this.rng() < this.simSkipVote) continue;
      this.later(between(this.rng, 0.12, 0.75) * VOTE_MS, () => {
        const options = this.cards.filter((c) => c.authorId !== id);
        if (!options.length) return;
        const bots = options.filter((c) => c.isBot);
        const pick = bots.length && this.rng() < this.simBotSense ? pickOne(this.rng, bots) : pickOne(this.rng, options);
        this.vote(id, pick.id);
      });
    }
    this.checkAllIn();
  }

  private endVoting(): void {
    this.jobs = [];
    const cards = this.cards.map((c) => ({ cardId: c.id, authorId: c.authorId, isBot: c.isBot }));
    const votes = new Map([...this.votes].filter(([voter]) => this.roundHumans.includes(voter)));
    const double = this.round === this.settings.rounds;
    const points = scoreRound({
      mode: this.settings.mode,
      double,
      cards,
      votes,
      humanIds: this.roundHumans,
      botIds: this.roundBots,
    });
    for (const line of points) {
      const p = this.find(line.playerId);
      if (p) p.score += line.points;
    }
    this.results = {
      cards: this.cards.map((c) => ({
        cardId: c.id,
        authorId: c.authorId,
        isBot: c.isBot,
        voterIds: [...votes].filter(([, cardId]) => cardId === c.id).map(([voter]) => voter),
      })),
      points,
      verdict: verdictFor(cards, votes),
      double,
    };
    this.phase = 'results';
    this.setTimer(RESULTS_MS);
  }

  private advance(): void {
    if (this.round >= this.settings.rounds) {
      this.phase = 'final';
      this.timer = null;
      this.jobs = [];
      this.cards = [];
      this.results = null;
      for (const p of this.players) p.waiting = false;
      return;
    }
    this.beginRound(false);
  }

  /** Answering and voting end early (after a short beat) once everyone is in. */
  private checkAllIn(): void {
    if (!this.timer) return;
    const expected = this.expectedHumans();
    const allIn =
      this.phase === 'answering'
        ? expected.every((id) => this.answers.has(id)) && this.roundBots.every((id) => this.answers.has(id))
        : this.phase === 'voting'
          ? expected.length > 0 && expected.every((id) => this.votes.has(id))
          : false;
    if (!allIn) return;
    const now = this.stoppedAt ?? this.now();
    if (this.timer.endsAt - now > ALL_IN_GRACE_MS) this.timer = { ...this.timer, endsAt: now + ALL_IN_GRACE_MS };
  }

  private setTimer(ms: number): void {
    this.timer = { totalMs: ms, endsAt: (this.stoppedAt ?? this.now()) + ms };
  }

  private later(ms: number, run: () => void): void {
    this.jobs.push({ at: (this.stoppedAt ?? this.now()) + ms, run });
  }

  private stop(): void {
    if (this.stoppedAt === null) this.stoppedAt = this.now();
  }

  /** Timers and pending actions slide forward by however long the room was stopped. */
  private restartIfFree(): void {
    if (this.hostPaused || this.frozen || this.stoppedAt === null) return;
    const delta = this.now() - this.stoppedAt;
    if (this.timer) this.timer = { ...this.timer, endsAt: this.timer.endsAt + delta };
    for (const j of this.jobs) j.at += delta;
    this.stoppedAt = null;
  }

  private resumeIfStopped(): void {
    this.hostPaused = false;
    this.restartIfFree();
  }

  private nextPrompt(): MockPrompt {
    if (!this.promptOrder.length) this.promptOrder = shuffle(this.rng, this.prompts);
    return this.promptOrder.shift() ?? this.prompts[0];
  }

  private resetScores(): void {
    for (const p of this.players) p.score = 0;
  }

  /** Bot 2 sits in only when the second-bot setting is on and 7–8 humans are in. */
  private syncBots(): void {
    const want = botCount(this.settings, this.humans().length);
    const has2 = this.players.some((p) => p.id === BOT_IDS[1]);
    if (want === 2 && !has2) this.players.push(this.botRec(BOT_IDS[1], 'Bot 2'));
    if (want === 1 && has2) this.players = this.players.filter((p) => p.id !== BOT_IDS[1]);
  }

  private botRec(id: string, name: string): PlayerRec {
    return { id, name, kind: 'bot', hue: -1, connected: true, isHost: false, score: 0, sim: null, waiting: false };
  }

  private find(id: string): PlayerRec | undefined {
    return this.players.find((p) => p.id === id);
  }

  private humans(): PlayerRec[] {
    return this.players.filter((p) => p.kind === 'human');
  }

  private connectedHumans(): PlayerRec[] {
    return this.humans().filter((p) => p.connected);
  }

  /** Humans whose answer/vote the round waits for. */
  private expectedHumans(): string[] {
    return this.roundHumans.filter((id) => this.find(id)?.connected);
  }

  private visiblePlayers(): PlayerRec[] {
    return this.players;
  }

  private toPublicPlayer(p: PlayerRec): PublicPlayer {
    const inAnswerPhase = this.phase === 'prompt' || this.phase === 'answering';
    return {
      id: p.id,
      name: p.name,
      kind: p.kind,
      hue: p.hue,
      connected: p.connected,
      isHost: p.isHost,
      score: p.score,
      answered: inAnswerPhase ? this.answers.has(p.id) : false,
      waiting: p.waiting,
    };
  }

  /** Texts aren't secret (only authors are), so every card's text goes out at Reveal; screens use revealed to pace them. */
  private toPublicCard(c: CardRec): PublicCard {
    return { id: c.id, letter: c.letter, text: c.hidden ? '' : c.text, hidden: c.hidden };
  }
}
