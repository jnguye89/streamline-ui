import { Board, Side, flipBoard, initialBoard, positionKey } from './board';
import { evaluate } from './evaluate';
import { generateMoves, makeMove, unmakeMove } from './movegen';
import { GameState, gameEnd, isReversibleStep, pliesWithoutProgress } from './rules';
import { MATE, Searcher, mulberry32 } from './search';

/** Board from square-number lists, e.g. board('9,K14', '22,23'). K = king. */
function board(dark: string, light: string): Board {
  const b = new Int8Array(32);
  for (const [list, sign] of [
    [dark, 1],
    [light, -1],
  ] as const) {
    for (const t of list.split(',').map((x) => x.trim()).filter(Boolean)) {
      const king = t.startsWith('K');
      b[Number(king ? t.slice(1) : t) - 1] = sign * (king ? 2 : 1);
    }
  }
  return b;
}

/** Legal moves in standard notation, all jump paths listed. */
function moves(b: Board, side: Side): string[] {
  return generateMoves(b, side)
    .map((m) => [m.from, ...m.path].map((s) => s + 1).join(m.caps.length ? 'x' : '-'))
    .sort();
}

describe('movement', () => {
  it('dark (Black) has the 7 standard opening moves', () => {
    expect(moves(initialBoard(), 1)).toEqual(['10-14', '10-15', '11-15', '11-16', '12-16', '9-13', '9-14']);
  });

  it('light (White) answers with 7 moves after 11-15', () => {
    const b = initialBoard();
    makeMove(b, generateMoves(b, 1).find((m) => m.from === 10 && m.to === 14)!);
    expect(moves(b, -1)).toEqual(['21-17', '22-17', '22-18', '23-18', '23-19', '24-19', '24-20']);
  });

  it('men move forward only; kings move one square in every direction', () => {
    expect(moves(board('18', ''), 1)).toEqual(['18-22', '18-23']);
    expect(moves(board('', '18'), -1)).toEqual(['18-14', '18-15']);
    expect(moves(board('K18', ''), 1)).toEqual(['18-14', '18-15', '18-22', '18-23']);
  });

  it('a man reaching the far row is crowned', () => {
    const b = board('26', '');
    const m = generateMoves(b, 1);
    expect(m.every((x) => x.promote)).toBe(true);
    makeMove(b, m[0]);
    expect(b[m[0].to]).toBe(2);
  });
});

describe('captures', () => {
  it('jumping is mandatory: only the jump is legal', () => {
    expect(moves(board('9,11', '14'), 1)).toEqual(['9x18']);
  });

  it('the player may choose any jump, not the longest', () => {
    expect(moves(board('9,12', '14,16,22'), 1)).toEqual(['12x19', '9x18x25']);
  });

  it('a multi-jump must be completed (no partial jumps are legal)', () => {
    const list = moves(board('9', '14,22'), 1);
    expect(list).toEqual(['9x18x25']);
    expect(list).not.toContain('9x18');
  });

  it('men cannot jump backwards; kings can', () => {
    expect(moves(board('18', '14'), 1)).toEqual(['18-22', '18-23']);
    expect(moves(board('K18', '14'), 1)).toEqual(['18x9']);
  });

  it('a man crowned by a jump stops there, even if it could jump on as a king', () => {
    const list = generateMoves(board('22', '26,27'), 1);
    expect(list.map((m) => m.path.map((s) => s + 1))).toEqual([[31]]);
    expect(list[0].promote).toBe(true);
  });

  it('a king already crowned may jump into and out of the far row', () => {
    expect(moves(board('K22', '26,27'), 1)).toEqual(['22x31x24']);
  });

  it('a king can jump round a ring back to its start square, never jumping a piece twice', () => {
    const b = board('K17', '14,15,22,23');
    expect(moves(b, 1)).toEqual(['17x10x19x26x17', '17x26x19x10x17']);
    expect(generateMoves(b, 1, true).length).toBe(1);
    makeMove(b, generateMoves(b, 1)[0]);
    expect(Array.from(b).filter((v) => v !== 0)).toEqual([2]);
    expect(b[16]).toBe(2);
  });

  it('cannot jump own pieces or two pieces in a row', () => {
    expect(moves(board('9,14', ''), 1)).toEqual(['14-17', '14-18', '9-13']);
    expect(moves(board('9', '14,18'), 1)).toEqual(['9-13']);
  });

  it('make + unmake restores the board for every move of many random positions', () => {
    const rnd = mulberry32(3);
    for (let i = 0; i < 3000; i++) {
      const b = randomBoard(rnd);
      const side: Side = rnd() < 0.5 ? 1 : -1;
      const before = positionKey(b, side);
      for (const m of generateMoves(b, side)) {
        makeMove(b, m);
        unmakeMove(b, m);
        expect(positionKey(b, side)).toBe(before);
      }
    }
  });
});

describe('end of game', () => {
  const S = (b: Board, side: Side): GameState => ({ board: b, side });

  it('no pieces = loss', () => {
    expect(gameEnd([S(board('', '22'), 1)])).toEqual({ winner: -1, reason: 'no-pieces' });
  });

  it('no legal move = loss', () => {
    expect(gameEnd([S(board('25', '29,30'), 1)])).toEqual({ winner: -1, reason: 'no-moves' });
  });

  it('game goes on from the start position', () => {
    expect(gameEnd([S(initialBoard(), 1)])).toBeNull();
  });

  it('threefold repetition (same position, same side to move) is a draw', () => {
    const cycle: Array<[string, string, Side]> = [
      ['K1', 'K32', 1],
      ['K6', 'K32', -1],
      ['K6', 'K27', 1],
      ['K1', 'K27', -1],
    ];
    const history: GameState[] = [];
    for (let i = 0; i <= 8; i++) {
      const [d, l, side] = cycle[i % 4];
      history.push(S(board(d, l), side));
      const end = gameEnd(history);
      if (i < 8) expect(end).toBeNull();
      else expect(end).toEqual({ winner: 0, reason: 'repetition' });
    }
  });

  it('40 moves each with no capture or man move is a draw', () => {
    const history: GameState[] = [];
    for (let i = 0; i <= 80; i++) {
      const b = new Int8Array(32);
      b[i % 31] = 2;
      b[31] = -2;
      history.push(S(b, i % 2 === 0 ? 1 : -1));
    }
    expect(pliesWithoutProgress(history)).toBe(80);
    expect(gameEnd(history)).toEqual({ winner: 0, reason: 'no-progress' });
    expect(gameEnd(history.slice(0, 80))).toBeNull();
  });

  it('a capture or a man move restarts the 40-move count', () => {
    expect(isReversibleStep(board('K1', 'K32'), board('K6', 'K32'))).toBe(true);
    expect(isReversibleStep(board('9', 'K32'), board('13', 'K32'))).toBe(false); // man moved
    expect(isReversibleStep(board('K18', '14,K32'), board('K9', 'K32'))).toBe(false); // capture
    expect(isReversibleStep(board('26', 'K1'), board('K30', 'K1'))).toBe(false); // crowned
  });

  it('a loss is reported before a draw when the side to move has no move', () => {
    expect(gameEnd([S(board('25', '29,30'), 1)])?.winner).toBe(-1);
  });
});

describe('computer player', () => {
  it('evaluation is colour-symmetric', () => {
    const rnd = mulberry32(11);
    for (let i = 0; i < 2000; i++) {
      const b = randomBoard(rnd);
      expect(evaluate(flipBoard(b)) + evaluate(b)).toBe(0);
    }
  });

  it('finds a quiet move that leaves the opponent with no move (win in 1)', () => {
    const s = new Searcher();
    const r = s.think({ history: [{ board: board('13,14', '21'), side: 1 }], mode: 'best', maxDepth: 20, timeMs: 2000 });
    expect([r.move!.from + 1, r.move!.to + 1]).toEqual([13, 17]);
    expect(r.score).toBeGreaterThan(MATE - 100);
  });

  it('always returns a legal move, on every level setting', () => {
    const s = new Searcher();
    const rnd = mulberry32(5);
    for (let i = 0; i < 150; i++) {
      const b = randomBoard(rnd);
      const side: Side = rnd() < 0.5 ? 1 : -1;
      const legal = generateMoves(b, side, true);
      const mode = (['best', 'noisy'] as const)[i % 2];
      const r = s.think({ history: [{ board: b, side }], mode, maxDepth: mode === 'best' ? 30 : 3, timeMs: 60, noise: 80 });
      if (!legal.length) expect(r.move).toBeNull();
      else expect(legal.some((m) => m.from === r.move!.from && m.to === r.move!.to && m.capMask === r.move!.capMask)).toBe(true);
    }
  });

  it('never chooses a forced loss when a safe move exists, even with huge noise', () => {
    // Light's only man on 18: 18-14 is jumped at once (10x17, no pieces left); 18-15 is safe.
    const s = new Searcher();
    for (let i = 0; i < 30; i++) {
      const r = s.think({
        history: [{ board: board('10,19', '18'), side: -1 }],
        mode: 'noisy',
        maxDepth: 2,
        timeMs: 1000,
        noise: 1_000_000,
        random: mulberry32(i),
      });
      expect(r.move!.to + 1).toBe(15);
    }
  });
});

function randomBoard(rnd: () => number): Board {
  const b = new Int8Array(32);
  for (const sign of [1, -1]) {
    const n = 1 + Math.floor(rnd() * 12);
    for (let k = 0, t = 0; k < n && t < 300; t++) {
      const s = Math.floor(rnd() * 32);
      if (b[s]) continue;
      const row = s >> 2;
      const mustKing = (sign === 1 && row === 7) || (sign === -1 && row === 0);
      b[s] = sign * (mustKing || rnd() < 0.3 ? 2 : 1);
      k++;
    }
  }
  return b;
}
