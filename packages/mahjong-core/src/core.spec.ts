import { seededRng, shuffle } from './engine';
import { faanToPoints, settleWin } from './points';
import {
  HONG_KONG_TILES,
  PLAYABLE_KINDS,
  buildTileSet,
  idsOfKind,
  isRedFive,
  kindCounts,
  kindOf,
  sortTiles,
  tileMark,
  tileName,
} from './tiles';

describe('tiles', () => {
  it('Hong Kong set has 144 unique tiles: 4 of each of 34 kinds + 8 bonus tiles', () => {
    const ids = buildTileSet(HONG_KONG_TILES);
    expect(ids.length).toBe(144);
    expect(new Set(ids).size).toBe(144);
    const perKind = new Map<number, number>();
    for (const id of ids) perKind.set(kindOf(id), (perKind.get(kindOf(id)) ?? 0) + 1);
    for (let k = 0; k < PLAYABLE_KINDS; k++) expect(perKind.get(k)).toBe(4);
    for (let k = 34; k < 42; k++) expect(perKind.get(k)).toBe(1);
  });

  it('Riichi-ready: 136 tiles without bonus tiles, red fives as a flag on one id', () => {
    const spec = { bonusTiles: false, redFivesPerSuit: 1 as const };
    const ids = buildTileSet(spec);
    expect(ids.length).toBe(136);
    expect(ids.filter((id) => isRedFive(id, spec)).map(kindOf)).toEqual([4, 13, 22]);
    expect(buildTileSet(HONG_KONG_TILES).some((id) => isRedFive(id, HONG_KONG_TILES))).toBe(false);
  });

  it('ids and kinds round-trip', () => {
    for (let k = 0; k < 42; k++) for (const id of idsOfKind(k)) expect(kindOf(id)).toBe(k);
    expect(() => kindOf(144)).toThrow();
  });

  it('names and Western marks', () => {
    expect([tileName(4), tileMark(4)]).toEqual(['5 Dots', '5']);
    expect([tileName(17), tileName(18)]).toEqual(['9 Bamboo', '1 Characters']);
    expect([tileName(27), tileMark(30)]).toEqual(['East wind', 'N']);
    expect([tileMark(31), tileMark(32), tileMark(33)]).toEqual(['R', 'G', 'Wh']);
    expect([tileName(34), tileName(41), tileMark(41)]).toEqual(['Flower 1', 'Season 4', '4']);
  });

  it('sorts Dots, Bamboo, Characters, Winds, Dragons', () => {
    const order = sortTiles([132, 108, 72, 36, 0]).map(kindOf);
    expect(order).toEqual([0, 9, 18, 27, 33]);
  });

  it('kindCounts ignores bonus tiles', () => {
    expect(kindCounts([0, 1, 136]).slice(0, 2)).toEqual([2, 0]);
  });
});

describe('rng', () => {
  it('seeded shuffle is deterministic and a permutation', () => {
    const a = shuffle(buildTileSet(HONG_KONG_TILES), seededRng(7));
    const b = shuffle(buildTileSet(HONG_KONG_TILES), seededRng(7));
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual(buildTileSet(HONG_KONG_TILES));
  });
});

describe('points (approved sheet)', () => {
  it('half-spicy table with a 10-faan cap', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((f) => faanToPoints(f))).toEqual([
      1, 2, 4, 8, 16, 24, 32, 48, 64, 96, 128,
    ]);
    expect(faanToPoints(13)).toBe(128);
  });

  it('discard win: discarder 2P, others 1P, winner +4P', () => {
    expect(settleWin(8, 0, 1)).toEqual([32, -16, -8, -8]);
  });

  it('self-drawn: each other player 2P, winner +6P', () => {
    expect(settleWin(16, 2, null)).toEqual([-32, -32, 96, -32]);
  });

  it('always sums to zero', () => {
    for (const from of [null, 0, 1, 2, 3] as const)
      for (const w of [0, 1, 2, 3] as const) {
        if (from === w) continue;
        expect(settleWin(24, w, from).reduce((a, b) => a + b, 0)).toBe(0);
      }
  });
});
