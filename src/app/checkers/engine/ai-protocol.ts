import { Side } from './core/board';
import { EVAL_CONFIG, EngineLevel, HINT_CONFIG, LEVEL_CONFIG } from './core/levels';
import { Searcher } from './core/search';

/** Messages between the app and the AI worker. */
export interface AiRequest {
  readonly id: number;
  /** move = computer's move, hint = best move for the player, eval = score for the side to move. */
  readonly kind: 'move' | 'hint' | 'eval';
  readonly level: EngineLevel;
  /** Positions since the last capture or man move, oldest first; last = position to search. */
  readonly history: ReadonlyArray<{ readonly cells: readonly number[]; readonly side: Side }>;
}

export interface AiResponse {
  readonly id: number;
  /** −1 when the side to move has no move. */
  readonly from: number;
  readonly to: number;
  readonly capMask: number;
  readonly score: number;
  readonly depth: number;
  readonly nodes: number;
  readonly ms: number;
}

export function runAiRequest(searcher: Searcher, req: AiRequest): AiResponse {
  const config = req.kind === 'move' ? LEVEL_CONFIG[req.level] : req.kind === 'hint' ? HINT_CONFIG : EVAL_CONFIG;
  const r = searcher.think({
    ...config,
    history: req.history.map((h) => ({ board: Int8Array.from(h.cells), side: h.side })),
  });
  return {
    id: req.id,
    from: r.move ? r.move.from : -1,
    to: r.move ? r.move.to : -1,
    capMask: r.move ? r.move.capMask : 0,
    score: r.score,
    depth: r.depth,
    nodes: r.nodes,
    ms: r.ms,
  };
}
