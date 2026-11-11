import { DestroyRef, Injectable, inject } from '@angular/core';
import { Cell, Level, Move, Outcome, Position, PieceColor } from '../checkers.types';
import { AiRequest, AiResponse, runAiRequest } from './ai-protocol';
import { CheckersEngine } from './checkers-engine';
import { Board, Side, initialBoard } from './core/board';
import { CMove, generateMoves, makeMove } from './core/movegen';
import { GameState, gameEnd, pliesWithoutProgress } from './core/rules';
import { Searcher } from './core/search';

/**
 * American checkers (ACF rules) for the UI. Rules run on the main thread (instant);
 * the computer player runs in a Web Worker, or on the main thread if workers are unavailable.
 */
@Injectable()
export class AmericanCheckersEngine implements CheckersEngine {
  readonly name = 'american-checkers';

  private worker: Worker | null = null;
  private fallback: Searcher | null = null;
  private seq = 0;
  private readonly pending = new Map<number, { req: AiRequest; done: (r: AiResponse | null) => void }>();

  constructor() {
    this.spawn();
    inject(DestroyRef, { optional: true })?.onDestroy(() => this.dispose());
  }

  initial(): Position {
    return toPosition(initialBoard(), 1);
  }

  legalMoves(pos: Position): Move[] {
    return generateMoves(toBoard(pos), sideOf(pos.turn)).map(toMove);
  }

  apply(pos: Position, move: Move): Position {
    const b = toBoard(pos);
    const side = sideOf(pos.turn);
    const m = generateMoves(b, side).find((x) => x.from === move.from && samePath(x.path, move.path));
    if (!m) throw new Error(`Illegal move ${move.from + 1}→${move.path.map((s) => s + 1).join('→')}`);
    makeMove(b, m);
    return toPosition(b, -side as Side);
  }

  outcome(history: readonly Position[]): Outcome | null {
    const end = gameEnd(history.map(toState));
    if (!end) return null;
    return { winner: end.winner === 0 ? null : colorOf(end.winner), reason: end.reason };
  }

  async chooseMove(history: readonly Position[], level: Level): Promise<Move | null> {
    return this.moveFrom(history, await this.ask('move', history, level));
  }

  async hint(history: readonly Position[]): Promise<Move | null> {
    return this.moveFrom(history, await this.ask('hint', history, 'hard'));
  }

  async evaluate(history: readonly Position[]): Promise<number | null> {
    const r = await this.ask('eval', history, 'hard');
    return r ? r.score : null;
  }

  cancel(): void {
    if (!this.pending.size) return;
    for (const p of this.pending.values()) p.done(null);
    this.pending.clear();
    if (this.worker) {
      // A search can't be interrupted from outside: replace the worker.
      this.worker.terminate();
      this.worker = null;
      this.spawn();
    }
  }

  private moveFrom(history: readonly Position[], r: AiResponse | null): Move | null {
    if (!r || r.from < 0) return null;
    const pos = history[history.length - 1];
    const m = generateMoves(toBoard(pos), sideOf(pos.turn)).find(
      (x) => x.from === r.from && x.to === r.to && x.capMask === r.capMask,
    );
    if (!m) {
      console.error('[checkers] computer move not found among legal moves', r);
      return null;
    }
    return toMove(m);
  }

  private ask(kind: AiRequest['kind'], history: readonly Position[], level: Level): Promise<AiResponse | null> {
    const states = history.map(toState);
    const tail = states.slice(-pliesWithoutProgress(states) - 1);
    const req: AiRequest = {
      id: ++this.seq,
      kind,
      level,
      history: tail.map((s) => ({ cells: Array.from(s.board), side: s.side })),
    };
    return new Promise((resolve) => {
      this.pending.set(req.id, { req, done: resolve });
      if (this.worker) {
        this.worker.postMessage(req);
      } else {
        // No worker: think on the main thread after the current frame paints.
        setTimeout(() => this.runLocally(req), 30);
      }
    });
  }

  private runLocally(req: AiRequest): void {
    if (!this.pending.has(req.id)) return; // cancelled
    this.fallback ??= new Searcher();
    this.resolve(runAiRequest(this.fallback, req));
  }

  private resolve(r: AiResponse): void {
    const p = this.pending.get(r.id);
    if (!p) return;
    this.pending.delete(r.id);
    p.done(r);
  }

  private spawn(): void {
    if (typeof Worker === 'undefined') return;
    try {
      const w = new Worker(new URL('./ai.worker', import.meta.url), { type: 'module' });
      w.onmessage = ({ data }: MessageEvent<AiResponse>) => this.resolve(data);
      w.onerror = (e) => {
        // Worker failed to load or crashed: finish the open requests on the main thread.
        e.preventDefault();
        console.warn('[checkers] AI worker unavailable, thinking on the main thread', e.message);
        w.terminate();
        if (this.worker === w) this.worker = null;
        for (const p of [...this.pending.values()]) setTimeout(() => this.runLocally(p.req), 30);
      };
      this.worker = w;
    } catch {
      this.worker = null;
    }
  }

  private dispose(): void {
    for (const p of this.pending.values()) p.done(null);
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
  }
}

// ── Conversions between the UI's Position and the core board ─────────────────
function sideOf(c: PieceColor): Side {
  return c === 'dark' ? 1 : -1;
}

function colorOf(s: Side): PieceColor {
  return s === 1 ? 'dark' : 'light';
}

function toBoard(pos: Position): Board {
  const b = new Int8Array(32);
  pos.cells.forEach((c, i) => {
    if (c) b[i] = (c.color === 'dark' ? 1 : -1) * (c.king ? 2 : 1);
  });
  return b;
}

function toPosition(b: Board, side: Side): Position {
  const cells: (Cell | null)[] = Array.from(b, (v) =>
    v === 0 ? null : { color: v > 0 ? 'dark' : 'light', king: v === 2 || v === -2 },
  );
  return { cells, turn: colorOf(side) };
}

function toState(pos: Position): GameState {
  return { board: toBoard(pos), side: sideOf(pos.turn) };
}

function toMove(m: CMove): Move {
  return { from: m.from, path: [...m.path], captures: [...m.caps], promotes: m.promote };
}

function samePath(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
