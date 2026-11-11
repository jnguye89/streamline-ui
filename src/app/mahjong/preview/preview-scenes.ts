import {
  ActionOption,
  Discard,
  HandResult,
  Meld,
  PlayerView,
  RoundInfo,
  Seat,
  SeatPublic,
  Standing,
  TileId,
  TileKind,
  Wind,
  idsOfKind,
} from '@skriin/mahjong-core';
import { Hint, Zone } from '../mahjong.types';

/**
 * The 8 review states the brief asks for (P cycles them; review only).
 * Each scene is a complete PlayerView, so the real UI renders it exactly as it would a live game.
 * Table: you (East, dealer) · Maya on your right (camera) · Mochi across (bot) · Sam on your left (camera).
 */

export interface PreviewScene {
  readonly id: string;
  readonly label: string;
  readonly view: PlayerView;
  readonly ui: {
    readonly zone: Zone;
    readonly focus: TileId | null;
    readonly claimIndex: number;
    readonly chowIndex: number;
    readonly hint: Hint | null;
    readonly bonusNote: { tile: TileId; replacement: TileId | null } | null;
    readonly callouts: readonly { seat: Seat; text: string }[];
  };
}

// Kinds
const D = (n: number): TileKind => n - 1;
const B = (n: number): TileKind => 8 + n;
const C = (n: number): TileKind => 17 + n;
const EAST = 27;
const SOUTH = 28;
const WEST = 29;
const NORTH = 30;
const RED = 31;
const GREEN = 32;
const WHITE = 33;
const FLOWER = (n: number): TileKind => 33 + n;
const SEASON = (n: number): TileKind => 37 + n;

/** Hands out physical ids; throws if a scene would use a 5th copy of a tile. */
class Bag {
  private readonly used = new Set<TileId>();
  t(kind: TileKind): TileId {
    const id = idsOfKind(kind).find((x) => !this.used.has(x));
    if (id === undefined) throw new Error(`Preview scene uses too many of kind ${kind}`);
    this.used.add(id);
    return id;
  }
  all(kinds: readonly TileKind[]): TileId[] {
    return kinds.map((k) => this.t(k));
  }
}

const ROUND: RoundInfo = {
  prevailing: 'E',
  dealerNo: 3,
  repeat: 0,
  handsPlayed: 2,
  length: 'quick',
};
const NAMES = ['You', 'Maya', 'Mochi', 'Sam'] as const;
const KINDS = ['human', 'human', 'bot', 'human'] as const;
const WINDS_HERE: readonly Wind[] = ['E', 'S', 'W', 'N'];

interface SeatSpec {
  readonly score: number;
  readonly concealed: number;
  readonly drawn?: boolean;
  readonly melds?: Meld[];
  readonly bonus?: TileId[];
  readonly discards: TileId[];
  readonly claimedLast?: boolean;
}

function seatPublic(seat: Seat, spec: SeatSpec): SeatPublic {
  const discards: Discard[] = spec.discards.map((tile, i) => ({
    tile,
    claimed: !!spec.claimedLast && i === spec.discards.length - 1,
  }));
  return {
    seat,
    name: NAMES[seat],
    kind: KINDS[seat],
    botLevel: KINDS[seat] === 'bot' ? 'medium' : null,
    wind: WINDS_HERE[seat],
    dealer: seat === 0,
    score: spec.score,
    concealedCount: spec.concealed,
    hasDrawn: !!spec.drawn,
    melds: spec.melds ?? [],
    bonus: spec.bonus ?? [],
    discards,
    connected: true,
  };
}

const exposed = (type: Meld['type'], tiles: TileId[], from: Seat): Meld => ({
  type,
  tiles,
  concealed: false,
  claimed: { tile: tiles[tiles.length - 1], from },
  promoted: false,
});

/** Opponents and ponds shared by scenes 1–5 (mid-hand, wall at 58). */
function midHand(bag: Bag, youDiscards: TileKind[], samDiscards: TileKind[]) {
  const maya = seatPublic(1, {
    score: 32,
    concealed: 10,
    melds: [exposed('pung', bag.all([D(8), D(8), D(8)]), 2)],
    bonus: [bag.t(SEASON(2))],
    discards: bag.all([NORTH, D(9), B(1), C(2), WHITE, D(1)]),
  });
  const mochi = seatPublic(2, {
    score: -40,
    concealed: 10,
    melds: [exposed('chow', bag.all([C(4), C(5), C(6)]), 1)],
    bonus: [bag.t(FLOWER(4))],
    discards: bag.all([WEST, C(9), B(2), GREEN, D(5), SOUTH, B(9)]),
  });
  const sam = seatPublic(3, { score: -56, concealed: 13, discards: bag.all(samDiscards) });
  const you = bag.all(youDiscards);
  return { maya, mochi, sam, you };
}

function discardOptions(tiles: readonly TileId[]): ActionOption[] {
  return tiles.map((tile) => ({ action: { type: 'discard', tile } }));
}

function view(
  p: Partial<PlayerView> & Pick<PlayerView, 'seats' | 'hand' | 'phase' | 'turn'>,
): PlayerView {
  return {
    you: 0,
    variant: 'hong-kong',
    round: ROUND,
    minFaan: 3,
    wallLeft: 58,
    drawn: null,
    lastDiscard: null,
    options: [],
    claim: null,
    result: null,
    standings: null,
    ...p,
  };
}

const noUi = { claimIndex: 0, chowIndex: 0, hint: null, bonusNote: null, callouts: [] } as const;

// ── 1 · Your turn with a drawn tile ─────────────────────────────────────────
function sceneYourTurn(): PreviewScene {
  const bag = new Bag();
  const t = midHand(
    bag,
    [NORTH, C(1), B(8), WHITE, D(9)],
    [SOUTH, C(1), B(1), WHITE, D(7), GREEN, C(9)],
  );
  const hand = bag.all([
    D(1),
    D(2),
    D(3),
    B(5),
    B(6),
    C(7),
    C(7),
    C(3),
    EAST,
    EAST,
    RED,
    RED,
    NORTH,
  ]);
  const drawn = bag.t(B(7));
  const me = seatPublic(0, {
    score: 64,
    concealed: 14,
    drawn: true,
    bonus: [bag.t(FLOWER(1))],
    discards: t.you,
  });
  const samLast = t.sam.discards[t.sam.discards.length - 1].tile;
  return {
    id: 'your-turn',
    label: 'Your turn with a drawn tile',
    view: view({
      phase: 'turn',
      turn: 0,
      seats: [me, t.maya, t.mochi, t.sam],
      hand,
      drawn,
      lastDiscard: { tile: samLast, from: 3 },
      options: discardOptions([...hand, drawn]),
    }),
    ui: { ...noUi, zone: 'hand', focus: drawn },
  };
}

// ── 2 · Claim bar: Pung / Chow / Pass ───────────────────────────────────────
function sceneClaimBar(): PreviewScene {
  const bag = new Bag();
  const t = midHand(
    bag,
    [NORTH, C(1), B(8), WHITE, D(9), C(3)],
    [SOUTH, C(1), B(1), WHITE, D(7), GREEN, B(4)],
  );
  const hand = bag.all([
    D(1),
    D(2),
    D(3),
    B(4),
    B(4),
    B(5),
    B(6),
    C(7),
    C(7),
    EAST,
    EAST,
    RED,
    RED,
  ]);
  const me = seatPublic(0, {
    score: 64,
    concealed: 13,
    bonus: [bag.t(FLOWER(1))],
    discards: t.you,
  });
  const tile = t.sam.discards[t.sam.discards.length - 1].tile;
  const [b4a, b4b, b5, b6] = [hand[3], hand[4], hand[5], hand[6]];
  const options: ActionOption[] = [
    { action: { type: 'pung', tiles: [b4a, b4b] }, meld: [b4a, b4b, tile] },
    { action: { type: 'chow', tiles: [b5, b6] }, meld: [tile, b5, b6] },
    { action: { type: 'pass' } },
  ];
  return {
    id: 'claim-bar',
    label: 'Claim bar: Pung / Chow / Pass',
    view: view({
      phase: 'claim',
      turn: 3,
      seats: [me, t.maya, t.mochi, t.sam],
      hand,
      lastDiscard: { tile, from: 3 },
      options,
      claim: { tile, from: 3, robbing: false, endsAt: 0, windowMs: 5000 },
    }),
    ui: { ...noUi, zone: 'claim', focus: null, claimIndex: 2 },
  };
}

// ── 3 · Two chow options ────────────────────────────────────────────────────
function sceneTwoChows(): PreviewScene {
  const bag = new Bag();
  const t = midHand(
    bag,
    [NORTH, C(1), B(8), WHITE, D(9), C(3)],
    [SOUTH, C(1), B(1), WHITE, D(7), GREEN, D(5)],
  );
  const hand = bag.all([
    D(3),
    D(4),
    D(6),
    B(2),
    B(3),
    B(4),
    C(7),
    C(8),
    C(9),
    EAST,
    EAST,
    RED,
    RED,
  ]);
  const me = seatPublic(0, {
    score: 64,
    concealed: 13,
    bonus: [bag.t(FLOWER(1))],
    discards: t.you,
  });
  const tile = t.sam.discards[t.sam.discards.length - 1].tile;
  const [d3, d4, d6] = hand;
  const options: ActionOption[] = [
    { action: { type: 'chow', tiles: [d3, d4] }, meld: [d3, d4, tile] },
    { action: { type: 'chow', tiles: [d4, d6] }, meld: [d4, tile, d6] },
    { action: { type: 'pass' } },
  ];
  return {
    id: 'two-chows',
    label: 'Two chow options',
    view: view({
      phase: 'claim',
      turn: 3,
      seats: [me, t.maya, t.mochi, t.sam],
      hand,
      lastDiscard: { tile, from: 3 },
      options,
      claim: { tile, from: 3, robbing: false, endsAt: 0, windowMs: 5000 },
    }),
    ui: { ...noUi, zone: 'chow', focus: null, claimIndex: 0, chowIndex: 0 },
  };
}

// ── 4 · Self-drawn win available ────────────────────────────────────────────
function sceneSelfWin(): PreviewScene {
  const bag = new Bag();
  const t = midHand(
    bag,
    [NORTH, C(1), B(8), WHITE, D(9), C(3)],
    [SOUTH, C(1), B(1), WHITE, D(6), GREEN, C(9)],
  );
  const hand = bag.all([D(1), D(2), D(3), D(7), D(8), D(9), B(2), B(3), B(4), RED, RED, RED, EAST]);
  const drawn = bag.t(EAST);
  const me = seatPublic(0, {
    score: 64,
    concealed: 14,
    drawn: true,
    bonus: [bag.t(FLOWER(1))],
    discards: t.you,
  });
  const samLast = t.sam.discards[t.sam.discards.length - 1].tile;
  return {
    id: 'self-win',
    label: 'Self-drawn win available',
    view: view({
      phase: 'turn',
      turn: 0,
      seats: [me, t.maya, t.mochi, t.sam],
      hand,
      drawn,
      wallLeft: 41,
      lastDiscard: { tile: samLast, from: 3 },
      options: [{ action: { type: 'win' } }, ...discardOptions([...hand, drawn])],
    }),
    ui: { ...noUi, zone: 'actions', focus: drawn },
  };
}

// ── 5 · Bonus tile replacement ──────────────────────────────────────────────
function sceneBonus(): PreviewScene {
  const bag = new Bag();
  const t = midHand(
    bag,
    [NORTH, C(1), B(8), WHITE, D(9)],
    [SOUTH, C(1), B(1), WHITE, D(7), GREEN, C(2)],
  );
  const hand = bag.all([
    D(1),
    D(2),
    D(3),
    B(5),
    B(6),
    C(7),
    C(7),
    C(3),
    EAST,
    EAST,
    RED,
    RED,
    NORTH,
  ]);
  const season = bag.t(SEASON(1));
  const drawn = bag.t(C(9));
  const me = seatPublic(0, {
    score: 64,
    concealed: 14,
    drawn: true,
    bonus: [bag.t(FLOWER(1)), season],
    discards: t.you,
  });
  const samLast = t.sam.discards[t.sam.discards.length - 1].tile;
  return {
    id: 'bonus',
    label: 'Bonus tile replacement',
    view: view({
      phase: 'turn',
      turn: 0,
      seats: [me, t.maya, t.mochi, t.sam],
      hand,
      drawn,
      wallLeft: 57,
      lastDiscard: { tile: samLast, from: 3 },
      options: discardOptions([...hand, drawn]),
    }),
    ui: {
      ...noUi,
      zone: 'hand',
      focus: drawn,
      bonusNote: { tile: season, replacement: drawn },
      callouts: [{ seat: 0, text: 'Season!' }],
    },
  };
}

// ── 6 · Win screen with the faan breakdown ──────────────────────────────────
function sceneWin(): PreviewScene {
  const bag = new Bag();
  const t = midHand(
    bag,
    [NORTH, C(1), B(8), WHITE, D(9), C(3), B(1)],
    [SOUTH, C(1), B(1), WHITE, D(7), GREEN, C(9), B(3)],
  );
  const groups = [
    bag.all([D(2), D(3), D(4)]),
    bag.all([D(6), D(6), D(6)]),
    bag.all([D(7), D(8), D(9)]),
    bag.all([RED, RED, RED]),
    bag.all([EAST, EAST]),
  ];
  const flower = bag.t(FLOWER(1));
  const winningTile = groups[4][1];
  const result: HandResult = {
    kind: 'win',
    winner: 0,
    from: null,
    selfDrawn: true,
    hand: { melds: [], groups, bonus: [flower], winningTile },
    faan: [
      { id: 'self-drawn', label: 'Self-drawn', faan: 1 },
      { id: 'concealed', label: 'Concealed hand', faan: 1 },
      { id: 'mixed-one-suit', label: 'Mixed one suit', faan: 3 },
      { id: 'dragon-31', label: 'Red dragon', faan: 1 },
      { id: 'own-flower', label: 'Own flower', faan: 1 },
    ],
    totalFaan: 7,
    capped: false,
    points: 48,
    deltas: [288, -96, -96, -96],
    scores: [352, -64, -136, -152],
    dealerStays: true,
    nextLabel: 'East round, hand 3',
    gameOver: false,
  };
  const me = seatPublic(0, { score: 352, concealed: 14, bonus: [flower], discards: t.you });
  const seats = [
    me,
    { ...t.maya, score: -64 },
    { ...t.mochi, score: -136 },
    { ...t.sam, score: -152 },
  ] as const;
  return {
    id: 'win',
    label: 'Win screen with the faan breakdown',
    view: view({
      phase: 'hand-over',
      turn: 0,
      seats,
      hand: groups.flat().filter((x) => x !== winningTile),
      drawn: winningTile,
      wallLeft: 33,
      options: [{ action: { type: 'next' } }],
      result,
    }),
    ui: { ...noUi, zone: 'hand', focus: null },
  };
}

// ── 7 · Exhaustive draw ─────────────────────────────────────────────────────
function sceneDraw(): PreviewScene {
  const bag = new Bag();
  const t = midHand(
    bag,
    [
      NORTH,
      C(1),
      B(8),
      WHITE,
      D(9),
      C(3),
      B(1),
      D(4),
      C(8),
      SOUTH,
      B(7),
      D(2),
      C(5),
      B(3),
      WEST,
      D(6),
    ],
    [
      SOUTH,
      C(1),
      B(1),
      WHITE,
      D(7),
      GREEN,
      C(9),
      B(3),
      D(3),
      C(4),
      WEST,
      B(6),
      D(2),
      C(8),
      B(7),
      NORTH,
      D(4),
    ],
  );
  const extraMaya = bag.all([B(5), C(6), D(6), B(2), WEST, C(3), B(8), D(5), C(2)]);
  const extraMochi = bag.all([EAST, B(6), C(1), D(3), B(9), C(5), D(1), B(5), C(4)]);
  const hand = bag.all([
    D(1),
    D(2),
    D(3),
    B(4),
    B(4),
    B(5),
    C(7),
    C(7),
    C(7),
    EAST,
    EAST,
    RED,
    RED,
  ]);
  const me = seatPublic(0, {
    score: 64,
    concealed: 13,
    bonus: [bag.t(FLOWER(1))],
    discards: t.you,
  });
  const result: HandResult = {
    kind: 'draw',
    winner: null,
    from: null,
    selfDrawn: false,
    hand: null,
    faan: [],
    totalFaan: 0,
    capped: false,
    points: 0,
    deltas: [0, 0, 0, 0],
    scores: [64, 32, -40, -56],
    dealerStays: true,
    nextLabel: 'East round, hand 3',
    gameOver: false,
  };
  const maya = {
    ...t.maya,
    discards: [...t.maya.discards, ...extraMaya.map((tile) => ({ tile, claimed: false }))],
  };
  const mochi = {
    ...t.mochi,
    discards: [...t.mochi.discards, ...extraMochi.map((tile) => ({ tile, claimed: false }))],
  };
  return {
    id: 'draw',
    label: 'Exhaustive draw',
    view: view({
      phase: 'hand-over',
      turn: 3,
      seats: [me, maya, mochi, t.sam],
      hand,
      wallLeft: 0,
      options: [{ action: { type: 'next' } }],
      result,
    }),
    ui: { ...noUi, zone: 'hand', focus: null },
  };
}

// ── 8 · End of the East round scores ────────────────────────────────────────
function sceneRoundEnd(): PreviewScene {
  const bag = new Bag();
  const t = midHand(bag, [NORTH, C(1), B(8)], [SOUTH, C(1), B(1)]);
  const hand = bag.all([
    D(1),
    D(2),
    D(3),
    B(4),
    B(4),
    B(5),
    C(7),
    C(7),
    C(7),
    EAST,
    EAST,
    RED,
    RED,
  ]);
  const standings: Standing[] = [
    { seat: 0, place: 1, score: 216, wins: 3, selfDrawn: 1 },
    { seat: 1, place: 2, score: 48, wins: 2, selfDrawn: 1 },
    { seat: 3, place: 3, score: -88, wins: 1, selfDrawn: 0 },
    { seat: 2, place: 4, score: -176, wins: 0, selfDrawn: 0 },
  ];
  const me = seatPublic(0, { score: 216, concealed: 13, discards: t.you });
  const seats = [
    me,
    { ...t.maya, score: 48 },
    { ...t.mochi, score: -176 },
    { ...t.sam, score: -88 },
  ] as const;
  return {
    id: 'round-end',
    label: 'End of the East round scores',
    view: view({
      phase: 'game-over',
      turn: 0,
      seats,
      hand,
      round: { ...ROUND, dealerNo: 4, handsPlayed: 7 },
      wallLeft: 12,
      standings,
    }),
    ui: { ...noUi, zone: 'hand', focus: null },
  };
}

export const PREVIEW_SCENES: readonly PreviewScene[] = [
  sceneYourTurn(),
  sceneClaimBar(),
  sceneTwoChows(),
  sceneSelfWin(),
  sceneBonus(),
  sceneWin(),
  sceneDraw(),
  sceneRoundEnd(),
];
