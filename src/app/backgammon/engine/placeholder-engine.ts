import { Injectable, OnDestroy } from '@angular/core';
import {
  BackgammonEngine,
  Board,
  Cube,
  CubeValue,
  DiceLedger,
  Destination,
  Die,
  FairDice,
  GameEvent,
  GameResult,
  LogEntry,
  MatchConfig,
  Offer,
  Origin,
  Phase,
  Play,
  ResultKind,
  Side,
  Snapshot,
  Step,
  boardKey,
  diceText,
  inWinnersHome,
  opponent,
  pipCount,
  pipCounts,
  playNotation,
  randomHex,
  startBoard,
} from '@skriin/backgammon-core';
import { PreviewControl } from './engine.tokens';
import { TurnRules, applySteps, diceList, placeholderScore, without } from './placeholder-rules';
import { Scenario } from './preview-states';

const MULT: Record<ResultKind, number> = { single: 1, gammon: 2, backgammon: 3 };

const DEFAULT_CONFIG: MatchConfig = { length: 3, cube: true, jacoby: true, mode: 'bot', level: 'medium' };

/** Computer pacing, so its moves are watchable. */
const BOT_ROLL_MS = 650;
const BOT_THINK_MIN_MS = 500;
const BOT_THINK_SPREAD_MS = 400;
const BOT_STEP_MS = 430;
const BOT_COMMIT_MS = 520;
const NO_MOVES_MS = 1500;
const BOT_CUBE_MS = 1700;

/**
 * PHASE 1 PLACEHOLDER engine behind BackgammonEngine: makes the TV preview playable
 * (vs computer and couch), with fair dice from @skriin/backgammon-core.
 * The rules and the computer here are stand-ins; Phase 2 swaps in the tested core and real bots.
 */
@Injectable()
export class PlaceholderEngine implements BackgammonEngine, PreviewControl, OnDestroy {
  private readonly listeners = new Set<(s: Snapshot) => void>();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private seq = 0;

  private cfg: MatchConfig = DEFAULT_CONFIG;
  private board: Board = startBoard();
  private turn: Side = 0;
  private phase: Phase = 'opening';
  private opening: readonly [Die, Die] | null = null;
  private dice: readonly [Die, Die] | null = null;
  private left: Die[] = [];
  private made: Step[] = [];
  private marks: number[] = [];
  private rules: TurnRules | null = null;
  private noMoves = false;
  private thinking = false;
  private cube: Cube = { value: 1, owner: null };
  private score: [number, number] = [0, 0];
  private game = 1;
  private crawford = false;
  private crawfordNext = false;
  private postCrawford = false;
  private offer: Offer | null = null;
  private beforeResign: Phase = 'pre-roll';
  private result: GameResult | null = null;
  private matchWinner: Side | null = null;
  private log: LogEntry[] = [];
  private dicer = new FairDice(randomHex(), [randomHex(16)]);
  private queued: (readonly [Die, Die])[] = [];
  /** Score at the start of each game (for the match export). */
  private readonly gameStartScore = new Map<number, readonly [number, number]>();
  private last: Snapshot;

  constructor() {
    this.last = this.build(null);
  }

  ngOnDestroy(): void {
    this.clearTimers();
    this.listeners.clear();
  }

  // ── Contract ───────────────────────────────────────────────────────────────
  snapshot(): Snapshot {
    return this.last;
  }

  subscribe(listener: (s: Snapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  newMatch(config: MatchConfig): void {
    this.clearTimers();
    this.cfg = config;
    this.score = [0, 0];
    this.game = 1;
    this.crawford = false;
    this.crawfordNext = false;
    this.postCrawford = false;
    this.matchWinner = null;
    this.log = [];
    this.queued = [];
    this.dicer = new FairDice(randomHex(), [randomHex(16)]);
    this.startGame();
  }

  nextGame(): void {
    if (this.phase !== 'game-over') return;
    this.clearTimers();
    this.game++;
    this.crawford = this.crawfordNext;
    this.crawfordNext = false;
    this.startGame();
  }

  roll(): void {
    if (this.phase === 'opening' && this.localSides().length) this.doRoll();
    else if (this.phase === 'pre-roll' && this.isLocal(this.turn)) this.doRoll();
  }

  double(): void {
    if (this.isLocal(this.turn) && this.canDouble()) this.doDouble();
  }

  answerDouble(take: boolean): void {
    if (this.offer?.kind === 'double' && this.isLocal(opponent(this.offer.by))) this.doAnswerDouble(take);
  }

  movable(): readonly Origin[] {
    if (this.phase !== 'moving' || !this.rules) return [];
    const out: Origin[] = [];
    for (const st of this.rules.next(this.board, this.left, this.made.length)) {
      if (!out.includes(st.from)) out.push(st.from);
    }
    return out;
  }

  destinations(from: Origin): readonly Destination[] {
    if (this.phase !== 'moving' || !this.rules) return [];
    return this.rules.destinations(this.board, this.left, this.made.length, from);
  }

  move(d: Destination): void {
    if (this.phase !== 'moving' || !this.isLocal(this.turn) || !this.rules) return;
    if (!this.isLegalContinuation(d.steps)) return;
    this.marks.push(this.made.length);
    if (!this.applyAll(d.steps, false)) return;
    this.autoForced();
  }

  undo(): void {
    if ((this.phase !== 'moving' && this.phase !== 'turn-done') || !this.isLocal(this.turn) || !this.marks.length) return;
    if (this.noMoves || !this.dice) return;
    const m = this.marks.pop() ?? 0;
    const undone = this.made.slice(m).reverse();
    this.made = this.made.slice(0, m);
    this.board = applySteps(this.rules?.start ?? this.board, this.turn, this.made);
    let left = diceList(this.dice);
    for (const st of this.made) left = without(left, st.die);
    this.left = left;
    this.phase = 'moving';
    this.emit({ type: 'undo', side: this.turn, steps: undone });
  }

  commit(): void {
    if (this.phase === 'turn-done' && this.isLocal(this.turn)) this.doCommit();
  }

  hint(): Promise<Play | null> {
    if (this.phase !== 'moving' || !this.rules) return Promise.resolve(null);
    const side = this.turn;
    const best = this.bestPlay(0);
    const play: Play | null = best
      ? { steps: best.steps, key: best.key, notation: playNotation(side, best.steps) }
      : null;
    return new Promise((resolve) => this.later(260, () => resolve(play)));
  }

  offerResign(result: ResultKind): void {
    if (!['pre-roll', 'moving', 'turn-done'].includes(this.phase)) return;
    const by: Side = this.cfg.mode === 'couch' ? this.turn : (this.localSides()[0] ?? 0);
    if (!this.isLocal(by)) return;
    this.clearTimers();
    this.thinking = false;
    this.beforeResign = this.phase;
    this.offer = { kind: 'resign', by, result, points: this.resultPoints(result) };
    this.phase = 'resign-offered';
    this.emit({ type: 'resign-offer', by, result });
    this.drive();
  }

  answerResign(accept: boolean): void {
    if (this.offer?.kind === 'resign' && this.isLocal(opponent(this.offer.by))) this.doAnswerResign(accept);
  }

  diceLedger(): DiceLedger {
    return this.dicer.ledger();
  }

  exportMatch(): string {
    const lines: string[] = [` ${this.cfg.length} point match`];
    const names = this.cfg.mode === 'bot' ? ['You', 'Computer'] : ['Player 1', 'Player 2'];
    let game = 0;
    let turnNo = 0;
    let row: string[] = [];
    const flush = () => {
      if (row.length) lines.push(`${String(turnNo).padStart(3)}) ${row.join('')}`);
      row = [];
    };
    for (const e of this.log) {
      if (e.game !== game) {
        flush();
        game = e.game;
        turnNo = 0;
        const [s0, s1] = this.gameStartScore.get(game) ?? [0, 0];
        lines.push('', ` Game ${game}`, ` ${`${names[0]} : ${s0}`.padEnd(32)}${names[1]} : ${s1}`);
      }
      const cell = e.dice ? `${diceText(e.dice)}: ${e.text}` : e.text;
      if (e.side === 0) {
        flush();
        turnNo++;
        row = [cell.padEnd(28)];
      } else {
        if (!row.length) {
          turnNo++;
          row = [''.padEnd(28)];
        }
        row.push(cell);
        flush();
      }
    }
    flush();
    return lines.join('\n');
  }

  // ── Preview (review only) ─────────────────────────────────────────────────
  loadScenario(s: Scenario): void {
    this.clearTimers();
    this.cfg = { ...this.cfg, length: s.length, mode: 'bot', cube: true };
    this.board = s.board;
    this.turn = s.turn;
    this.phase = s.phase;
    this.opening = null;
    this.dice = s.dice ?? null;
    this.cube = s.cube ?? { value: 1, owner: null };
    this.score = s.score ? [s.score[0], s.score[1]] : [0, 0];
    this.game = s.game ?? 1;
    this.crawford = s.crawford ?? false;
    this.crawfordNext = false;
    this.postCrawford = s.postCrawford ?? false;
    this.offer = s.offer ?? null;
    this.result = s.result ?? null;
    this.matchWinner = s.matchWinner ?? null;
    this.log = [...(s.log ?? [])];
    this.queued = [...(s.nextRolls ?? [])];
    this.thinking = false;
    this.made = [];
    this.marks = [];
    this.noMoves = s.noMoves ?? false;
    this.gameStartScore.clear();
    this.gameStartScore.set(this.game, [this.score[0], this.score[1]]);
    if (this.dice) {
      this.rules = new TurnRules(this.board, this.turn, this.dice);
      this.left = diceList(this.dice);
    } else {
      this.rules = null;
      this.left = [];
    }
    this.emit({ type: 'load' });
    this.drive();
  }

  // ── Turn flow ──────────────────────────────────────────────────────────────
  private startGame(): void {
    if (this.game === 1) this.gameStartScore.clear();
    this.gameStartScore.set(this.game, [this.score[0], this.score[1]]);
    this.board = startBoard();
    this.turn = 0;
    this.phase = 'opening';
    this.opening = null;
    this.dice = null;
    this.left = [];
    this.made = [];
    this.marks = [];
    this.rules = null;
    this.noMoves = false;
    this.thinking = false;
    this.cube = { value: 1, owner: null };
    this.offer = null;
    this.result = null;
    this.emit({ type: 'new-game', game: this.game });
  }

  private nextRoll(): readonly [Die, Die] {
    return this.queued.shift() ?? this.dicer.roll();
  }

  private doRoll(): void {
    if (this.phase === 'opening') {
      const d = this.nextRoll();
      this.opening = d;
      if (d[0] === d[1]) {
        this.emit({ type: 'opening', dice: d, tie: true });
        return;
      }
      this.turn = d[0] > d[1] ? 0 : 1;
      this.beginTurn(d);
      this.emit({ type: 'opening', dice: d, tie: false });
    } else {
      const d = this.nextRoll();
      this.beginTurn(d);
      this.emit({ type: 'roll', side: this.turn, dice: d });
    }
    this.afterRoll();
  }

  private beginTurn(d: readonly [Die, Die]): void {
    this.dice = d;
    this.left = diceList(d);
    this.made = [];
    this.marks = [];
    this.rules = new TurnRules(this.board, this.turn, d);
    this.noMoves = this.rules.maxLen === 0;
    this.phase = this.noMoves ? 'turn-done' : 'moving';
  }

  private afterRoll(): void {
    if (this.noMoves) {
      this.emit({ type: 'no-moves', side: this.turn });
      if (!this.isLocal(this.turn)) this.later(NO_MOVES_MS, () => this.doCommit());
      return;
    }
    if (this.isLocal(this.turn)) {
      this.autoForced();
    } else {
      this.botPlay();
    }
  }

  /** Plays the rest of the turn when every way to finish it ends in the same position. */
  private autoForced(): void {
    if (this.phase !== 'moving' || !this.rules) return;
    const finals = this.rules.finals(this.board, this.left, this.made.length, 2);
    if (finals.size !== 1) return;
    const [steps] = finals.values();
    if (steps.length) this.applyAll(steps, true);
  }

  /** Applies steps one at a time (one event each). Returns false when the game ended. */
  private applyAll(steps: readonly Step[], auto: boolean): boolean {
    for (const st of steps) {
      if (!this.applyOne(st, auto)) return false;
    }
    return true;
  }

  private applyOne(st: Step, auto: boolean): boolean {
    const side = this.turn;
    this.board = applySteps(this.board, side, [st]);
    this.made.push(st);
    this.left = without(this.left, st.die);
    if (this.board.off[side] === 15) {
      this.emitStep(side, st, auto);
      this.finishGame(this.winResult(side));
      return false;
    }
    this.phase = this.rules && this.made.length >= this.rules.maxLen ? 'turn-done' : 'moving';
    this.emitStep(side, st, auto);
    return true;
  }

  private emitStep(side: Side, step: Step, auto: boolean): void {
    this.emit({ type: 'step', side, step, auto });
  }

  private doCommit(): void {
    if (this.phase !== 'turn-done') return;
    const side = this.turn;
    this.log.push({
      game: this.game,
      side,
      kind: 'move',
      dice: this.dice ? [...this.dice] : null,
      text: this.made.length ? playNotation(side, this.made) : 'No move',
    });
    this.turn = opponent(side);
    this.phase = 'pre-roll';
    this.dice = null;
    this.left = [];
    this.made = [];
    this.marks = [];
    this.rules = null;
    this.noMoves = false;
    this.emit({ type: 'commit', side });
    this.drive();
  }

  private doDouble(): void {
    const by = this.turn;
    const to = (this.cube.value * 2) as CubeValue;
    this.offer = { kind: 'double', by, to };
    this.phase = 'double-offered';
    this.log.push({ game: this.game, side: by, kind: 'cube', dice: null, text: `Doubles → ${to}` });
    this.emit({ type: 'double', by, to });
    this.drive();
  }

  private doAnswerDouble(take: boolean): void {
    const offer = this.offer;
    if (offer?.kind !== 'double') return;
    const answerer = opponent(offer.by);
    this.thinking = false;
    if (take) {
      this.cube = { value: offer.to, owner: answerer };
      this.offer = null;
      this.phase = 'pre-roll';
      this.log.push({ game: this.game, side: answerer, kind: 'cube', dice: null, text: 'Takes' });
      this.emit({ type: 'take', by: answerer, value: offer.to });
      this.drive();
    } else {
      this.log.push({ game: this.game, side: answerer, kind: 'cube', dice: null, text: 'Drops' });
      this.emit({ type: 'drop', by: answerer });
      this.finishGame({ winner: offer.by, kind: 'single', points: this.cube.value, byDrop: true, byResign: false });
    }
  }

  private doAnswerResign(accept: boolean): void {
    const offer = this.offer;
    if (offer?.kind !== 'resign') return;
    this.thinking = false;
    if (accept) {
      this.finishGame({
        winner: opponent(offer.by),
        kind: offer.result,
        points: offer.points,
        byDrop: false,
        byResign: true,
      });
    } else {
      this.offer = null;
      this.phase = this.beforeResign;
      this.emit({ type: 'resign-declined', by: opponent(offer.by) });
      this.drive();
    }
  }

  private finishGame(result: GameResult): void {
    this.clearTimers();
    const w = result.winner;
    this.result = result;
    this.offer = null;
    this.thinking = false;
    this.score[w] += result.points;
    const kindText = result.kind === 'single' ? '' : ` · ${result.kind}`;
    this.log.push({
      game: this.game,
      side: w,
      kind: 'result',
      dice: null,
      text: `Wins ${result.points}${kindText}`,
    });
    const len = this.cfg.length;
    if (len > 0 && this.score[w] >= len) {
      this.matchWinner = w;
      this.phase = 'match-over';
      this.dicer.reveal();
    } else {
      this.phase = 'game-over';
      if (len > 0) {
        if (this.crawford) {
          this.postCrawford = true;
        } else if (!this.postCrawford && !this.crawfordNext && this.score[w] === len - 1) {
          this.crawfordNext = true;
        }
      }
    }
    this.emit({ type: 'game-over', result });
  }

  private winResult(winner: Side): GameResult {
    const loser = opponent(winner);
    const kind: ResultKind =
      this.board.off[loser] > 0 ? 'single' : inWinnersHome(this.board, loser, winner) ? 'backgammon' : 'gammon';
    return { winner, kind, points: this.resultPoints(kind), byDrop: false, byResign: false };
  }

  /** Points for a result at the current cube. Jacoby: single games, cube never turned → gammons count 1. */
  private resultPoints(kind: ResultKind): number {
    const jacobyBlocks = this.cfg.length === 0 && this.cfg.cube && this.cfg.jacoby && this.cube.value === 1;
    return (jacobyBlocks ? 1 : MULT[kind]) * this.cube.value;
  }

  private canDouble(): boolean {
    return (
      this.cfg.cube &&
      this.phase === 'pre-roll' &&
      !this.crawford &&
      this.cube.value < 64 &&
      (this.cube.owner === null || this.cube.owner === this.turn)
    );
  }

  private isLegalContinuation(steps: readonly Step[]): boolean {
    if (!this.rules || !steps.length) return false;
    let b = this.board;
    let left = this.left;
    let depth = this.made.length;
    for (const st of steps) {
      const ok = this.rules
        .next(b, left, depth)
        .some((n) => n.from === st.from && n.to === st.to && n.die === st.die && n.hit === st.hit);
      if (!ok) return false;
      b = applySteps(b, this.turn, [st]);
      left = without(left, st.die);
      depth++;
    }
    return true;
  }

  // ── Computer (placeholder) ─────────────────────────────────────────────────
  /** Schedules whatever the computer has to do next. */
  private drive(): void {
    const bot = this.botSide();
    if (bot === null) return;
    if (this.phase === 'pre-roll' && this.turn === bot) {
      this.later(BOT_ROLL_MS, () => {
        if (this.phase !== 'pre-roll' || this.turn !== bot) return;
        if (this.canDouble() && this.botWantsDouble(bot)) this.doDouble();
        else this.doRoll();
      });
    } else if (this.phase === 'moving' && this.turn === bot) {
      this.botPlay();
    } else if (this.phase === 'turn-done' && this.turn === bot) {
      this.later(this.noMoves ? NO_MOVES_MS : BOT_COMMIT_MS, () => this.doCommit());
    } else if (this.phase === 'double-offered' && this.offer?.kind === 'double' && this.offer.by !== bot) {
      this.setThinking(true);
      this.later(BOT_CUBE_MS, () => this.doAnswerDouble(this.botTakes(bot)));
    } else if (this.phase === 'resign-offered' && this.offer?.kind === 'resign' && this.offer.by !== bot) {
      const offer = this.offer;
      this.setThinking(true);
      this.later(BOT_CUBE_MS, () => this.doAnswerResign(this.botAcceptsResign(bot, offer.result)));
    }
  }

  private botPlay(): void {
    const side = this.turn;
    this.setThinking(true);
    const think = BOT_THINK_MIN_MS + Math.random() * BOT_THINK_SPREAD_MS;
    this.later(think, () => {
      const level = this.cfg.level;
      const best = this.bestPlay(level === 'easy' ? 14 : level === 'medium' ? 4 : 0);
      this.thinking = false;
      const steps = best?.steps ?? [];
      const playNext = (i: number) => {
        if (this.turn !== side || this.phase !== 'moving') return;
        if (i >= steps.length) return;
        if (!this.applyOne(steps[i], false)) return;
        if (i + 1 < steps.length) this.later(BOT_STEP_MS, () => playNext(i + 1));
        else this.later(BOT_COMMIT_MS, () => this.doCommit());
      };
      playNext(0);
    });
  }

  /** Best finish for the side to move by the placeholder judgement (+ noise for weaker levels). */
  private bestPlay(noise: number): { steps: Step[]; key: string } | null {
    if (!this.rules) return null;
    const finals = this.rules.finals(this.board, this.left, this.made.length);
    let best: { steps: Step[]; key: string } | null = null;
    let bestScore = -Infinity;
    for (const [key, steps] of finals) {
      const end = applySteps(this.board, this.turn, steps);
      const score = placeholderScore(end, this.turn) + (noise ? Math.random() * noise : 0);
      if (score > bestScore) {
        bestScore = score;
        best = { steps, key: key || boardKey(end) };
      }
    }
    return best;
  }

  private botWantsDouble(bot: Side): boolean {
    const mine = pipCount(this.board, bot);
    const theirs = pipCount(this.board, opponent(bot));
    return mine < 100 && (theirs - mine) / theirs >= 0.1;
  }

  private botTakes(bot: Side): boolean {
    const mine = pipCount(this.board, bot);
    const theirs = pipCount(this.board, opponent(bot));
    return (mine - theirs) / Math.max(theirs, 1) <= 0.12;
  }

  private botAcceptsResign(bot: Side, kind: ResultKind): boolean {
    const lead = pipCount(this.board, opponent(bot)) - pipCount(this.board, bot);
    if (kind === 'backgammon') return true;
    if (kind === 'gammon') return this.board.off[opponent(bot)] > 0 || lead < 60;
    return lead < 25;
  }

  private setThinking(v: boolean): void {
    if (this.thinking === v) return;
    this.thinking = v;
    this.emit(v ? { type: 'thinking', side: this.turn } : null);
  }

  // ── Plumbing ───────────────────────────────────────────────────────────────
  private localSides(): Side[] {
    return this.cfg.mode === 'couch' ? [0, 1] : [0];
  }

  private isLocal(side: Side): boolean {
    return this.localSides().includes(side);
  }

  private botSide(): Side | null {
    return this.cfg.mode === 'bot' ? 1 : null;
  }

  private emit(event: GameEvent | null): void {
    this.last = this.build(event);
    for (const fn of [...this.listeners]) fn(this.last);
  }

  private build(event: GameEvent | null): Snapshot {
    return {
      seq: ++this.seq,
      event,
      config: this.cfg,
      board: this.board,
      turn: this.turn,
      phase: this.phase,
      localSides: this.localSides(),
      opening: this.opening,
      dice: this.dice,
      diceLeft: [...this.left],
      turnSteps: [...this.made],
      canUndo: this.marks.length > 0 && this.isLocal(this.turn),
      noMoves: this.noMoves,
      thinking: this.thinking,
      cube: this.cube,
      canDouble: this.canDouble(),
      pips: pipCounts(this.board),
      score: [this.score[0], this.score[1]],
      match: {
        length: this.cfg.length,
        game: this.game,
        crawford: this.crawford,
        postCrawford: this.postCrawford,
      },
      offer: this.offer,
      result: this.result,
      matchWinner: this.matchWinner,
      log: [...this.log],
    };
  }

  private later(ms: number, fn: () => void): void {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }
}
