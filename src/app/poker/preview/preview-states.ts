import {
  BlindLevel,
  Card,
  HandRank,
  LegalActions,
  PlayerInfo,
  PlayerView,
  PotView,
  SeatIndex,
  SeatView,
  SizePreset,
  SizePresetId,
  TableConfig,
} from '../core/api';
import { SIT_AND_GO_SCHEDULE, tableConfig } from '../placeholder/local-table';
import { PlaceholderEvaluator } from '../placeholder/placeholder-eval';
import { ScreenFlags } from '../poker.types';
import { ActionBarState } from '../session/action-bar.logic';
import { joinUrl } from '../session/ports';

/**
 * Review-only states (P cycles them). Each is a fixed PlayerView drawn by the same components
 * as real play, so what you approve here is what the game shows.
 */

export type PreviewKind = 'table' | 'couch' | 'age' | 'topUp' | 'finished' | 'checkInstead';

export interface PreviewState {
  readonly id: string;
  readonly title: string;
  readonly kind: PreviewKind;
  readonly view: PlayerView;
  readonly phoneView?: PlayerView;
  readonly phoneRaiseTo?: number;
  readonly bar?: ActionBarState;
  readonly flags?: Partial<ScreenFlags>;
  readonly levelUp?: string;
}

const evaluator = new PlaceholderEvaluator();
const CODE = 'BKTR';

const human = (id: string, name: string): PlayerInfo => ({ id, name, kind: 'human', botLevel: null });
const bot = (name: string): PlayerInfo => ({ id: `bot-${name.toLowerCase()}`, name, kind: 'bot', botLevel: 'medium' });

const YOU = human('you', 'You');
const MAYA = human('maya', 'Maya');
const THEO = human('theo', 'Theo');
const PRIYA = human('priya', 'Priya');
const NOVA = bot('Nova');
const PIXEL = bot('Pixel');
const JUNIPER = bot('Juniper');
const ORBIT = bot('Orbit');
const MAPLE = bot('Maple');

function seat(i: SeatIndex, player: PlayerInfo, stack: number, o: Partial<SeatView> = {}): SeatView {
  return {
    seat: i,
    player,
    stack,
    committed: 0,
    status: 'inHand',
    dealtIn: true,
    shownCards: null,
    lastAction: null,
    timeBankLeftMs: 60_000,
    connected: true,
    ...o,
  };
}

function presets(o: { base: number; toCall: number; inMiddle: number; minTo: number; maxTo: number; small: number }): SizePreset[] {
  const potRaise = o.inMiddle + o.toCall;
  const round = (v: number) => Math.round(v / o.small) * o.small;
  const clamp = (v: number) => Math.min(o.maxTo, Math.max(o.minTo, v));
  const list: [SizePresetId, number][] = [
    ['min', o.minTo],
    ['halfPot', clamp(round(o.base + potRaise / 2))],
    ['threeQuarterPot', clamp(round(o.base + (potRaise * 3) / 4))],
    ['pot', clamp(round(o.base + potRaise))],
    ['allIn', o.maxTo],
  ];
  const out: SizePreset[] = [];
  for (const [id, to] of list) {
    const dup = out.findIndex((p) => p.to === to);
    if (dup === -1) out.push({ id, to });
    else if (id === 'allIn') out[dup] = { id, to };
  }
  return out;
}

/** Legal actions facing a bet (or a free check when toCall = 0), same math as the engine. */
function facing(o: { currentBet: number; committed: number; stack: number; lastFullRaise: number; inMiddle: number; big: number; small: number }): LegalActions {
  const toCall = o.currentBet - o.committed;
  const maxTo = o.committed + o.stack;
  const bet = o.currentBet === 0 ? { minTo: Math.min(o.big, maxTo), maxTo } : null;
  const raise = o.currentBet > 0 ? { minTo: o.currentBet + o.lastFullRaise, maxTo } : null;
  const range = bet ?? raise!;
  return {
    fold: true,
    check: toCall === 0,
    call: toCall > 0 ? { amount: Math.min(toCall, o.stack), allIn: o.stack <= toCall } : null,
    bet,
    raise,
    allIn: { to: maxTo },
    step: o.big,
    presets: presets({ base: bet ? 0 : o.currentBet, toCall, inMiddle: o.inMiddle, minTo: range.minTo, maxTo, small: o.small }),
    defaultFocus: toCall === 0 ? 'check' : 'call',
  };
}

function pot(index: number, label: string, amount: number, eligible: SeatIndex[]): PotView {
  return { index, label, amount, eligibleSeats: eligible };
}

function seats6(list: SeatView[]): (SeatView | null)[] {
  const out: (SeatView | null)[] = [null, null, null, null, null, null];
  for (const s of list) out[s.seat] = s;
  return out;
}

interface ViewInput {
  readonly config?: Partial<TableConfig>;
  readonly seats: SeatView[];
  readonly viewer?: SeatIndex | null;
  readonly hole?: [Card, Card];
  readonly board?: Card[];
  readonly legal?: LegalActions | null;
  readonly phase: PlayerView['phase'];
  readonly hand: number;
  readonly button: SeatIndex;
  readonly sb: SeatIndex | null;
  readonly bb: SeatIndex;
  readonly pots?: PotView[];
  readonly currentBet?: number;
  readonly turnSeat?: SeatIndex | null;
  readonly turnElapsedMs?: number;
  readonly levelIndex?: number;
  readonly handsUntilNext?: number | null;
  readonly blinds?: BlindLevel;
  readonly allInRunout?: boolean;
  readonly result?: PlayerView['result'];
  readonly standings?: PlayerView['standings'];
  readonly status?: PlayerView['status'];
  readonly topUp?: number | null;
}

function view(now: number, o: ViewInput): PlayerView {
  const config: TableConfig = { ...tableConfig('home', false), ...o.config };
  const viewer = o.viewer === undefined ? 0 : o.viewer;
  const board = o.board ?? [];
  const turnSeat = o.turnSeat ?? null;
  const started = now - (o.turnElapsedMs ?? 6000);
  const meSeat = viewer === null ? null : o.seats.find((s) => s.seat === viewer);
  return {
    schema: 1,
    tableId: 'preview',
    viewer: viewer === null ? { kind: 'public' } : { kind: 'seat', seat: viewer },
    engineNow: now,
    config,
    status: o.status ?? 'open',
    handNumber: o.hand,
    phase: o.phase,
    level: { index: o.levelIndex ?? 0, blinds: o.blinds ?? config.blinds, handsUntilNext: o.handsUntilNext ?? null },
    buttonSeat: o.button,
    smallBlindSeat: o.sb,
    bigBlindSeat: o.bb,
    seats: seats6(o.seats),
    board,
    pots: o.pots ?? [],
    currentBet: o.currentBet ?? 0,
    turn:
      turnSeat === null
        ? null
        : {
            seat: turnSeat,
            startedAt: started,
            turnEndsAt: config.actionTimeMs ? started + config.actionTimeMs : 0,
            timeBankEndsAt: config.actionTimeMs ? started + config.actionTimeMs + 60_000 : 0,
            usingTimeBank: false,
          },
    allInRunout: o.allInRunout ?? false,
    result: o.result ?? null,
    shuffle: null,
    standings: o.standings ?? [],
    me:
      viewer === null || !meSeat
        ? null
        : {
            seat: viewer,
            holeCards: o.hole ?? null,
            handLabel: o.hole ? evaluator.describe([...o.hole, ...board]) : null,
            legal: o.legal ?? null,
            preAction: null,
            preActionsAvailable: [],
            canShow: false,
            canMuck: false,
            topUp: o.topUp ? { to: o.topUp } : null,
            timeoutsInARow: 0,
            myShuffleOpenings: null,
          },
  };
}

const ONLINE: Partial<TableConfig> = { actionTimeMs: 30_000 };

function rank(cards: Card[]): HandRank {
  return evaluator.rankBest(cards);
}

export function buildPreviewStates(now: number): PreviewState[] {
  // 1 · Your turn before the flop (friends table, 30 s clock).
  const p1 = view(now, { ...p1Inputs(), turnElapsedMs: 6000 });

  // 2 · Facing a raise on the flop, sizing open (RT pressed once → ½ pot).
  const p2Legal = facing({ currentBet: 120, committed: 0, stack: 880, lastFullRaise: 80, inMiddle: 280, big: 10, small: 5 });
  const p2 = view(now, {
    config: ONLINE,
    hand: 13,
    phase: 'flop',
    button: 5,
    sb: 0,
    bb: 1,
    board: ['Ks', '7h', '2d'],
    pots: [pot(0, 'Pot', 120, [0, 1, 3])],
    currentBet: 120,
    turnSeat: 0,
    turnElapsedMs: 9000,
    hole: ['Kh', 'Qc'],
    seats: [
      seat(0, YOU, 880, { lastAction: { type: 'check', to: null, auto: null } }),
      seat(1, MAYA, 1100, { committed: 40, lastAction: { type: 'bet', to: 40, auto: null } }),
      seat(2, NOVA, 905, { status: 'folded', dealtIn: false, lastAction: { type: 'fold', to: null, auto: null } }),
      seat(3, THEO, 1290, { committed: 120, lastAction: { type: 'raise', to: 120, auto: null } }),
      seat(4, PIXEL, 760, { status: 'folded', dealtIn: false, lastAction: { type: 'fold', to: null, auto: null } }),
      seat(5, PRIYA, 960, { status: 'folded', dealtIn: false, lastAction: { type: 'fold', to: null, auto: null } }),
    ],
    legal: p2Legal,
  });
  const p2Half = p2Legal.presets.find((p) => p.id === 'halfPot')!.to;

  // 3 · Three players all-in + one covering caller → main pot + 2 side pots, all hands up.
  const p3 = view(now, {
    hand: 14,
    phase: 'turn',
    button: 1,
    sb: 2,
    bb: 3,
    board: ['9c', '9h', '4s', 'Jd'],
    allInRunout: true,
    pots: [pot(0, 'Main pot', 805, [0, 1, 3, 5]), pot(1, 'Side pot 1', 900, [0, 1, 5]), pot(2, 'Side pot 2', 800, [0, 5])],
    hole: ['As', 'Ad'],
    seats: [
      seat(0, YOU, 0, { status: 'allIn', shownCards: ['As', 'Ad'], lastAction: { type: 'allIn', to: 900, auto: null } }),
      seat(1, MAYA, 0, { status: 'allIn', shownCards: ['Jc', 'Jh'], lastAction: { type: 'allIn', to: 500, auto: null } }),
      seat(2, NOVA, 895, { status: 'folded', dealtIn: false, lastAction: { type: 'fold', to: null, auto: null } }),
      seat(3, THEO, 0, { status: 'allIn', shownCards: ['9d', '8d'], lastAction: { type: 'allIn', to: 200, auto: null } }),
      seat(4, PIXEL, 760, { status: 'folded', dealtIn: false, lastAction: { type: 'fold', to: null, auto: null } }),
      seat(5, PRIYA, 640, { shownCards: ['Ks', 'Qs'], lastAction: { type: 'call', to: 900, auto: null } }),
    ],
  });

  // 4 · Showdown, split pot: both play kings and eights with an ace.
  const p4Board: Card[] = ['8s', '8h', 'Kd', 'Kc', '4h'];
  const youRank = rank(['Ah', '3c', ...p4Board]);
  const mayaRank = rank(['Ad', '6s', ...p4Board]);
  const p4 = view(now, {
    hand: 15,
    phase: 'showdown',
    button: 3,
    sb: 4,
    bb: 5,
    board: p4Board,
    pots: [pot(0, 'Pot', 480, [0, 1])],
    hole: ['Ah', '3c'],
    seats: [
      seat(0, YOU, 1140, { shownCards: ['Ah', '3c'], lastAction: { type: 'call', to: 120, auto: null } }),
      seat(1, MAYA, 1380, { shownCards: ['Ad', '6s'], lastAction: { type: 'bet', to: 120, auto: null } }),
      seat(2, NOVA, 905, { status: 'folded', dealtIn: false, lastAction: { type: 'fold', to: null, auto: null } }),
      seat(3, THEO, 1290, { status: 'folded', dealtIn: false, lastAction: { type: 'fold', to: null, auto: null } }),
      seat(4, PIXEL, 755, { status: 'folded', dealtIn: false, lastAction: { type: 'fold', to: null, auto: null } }),
      seat(5, PRIYA, 950, { status: 'folded', dealtIn: false, lastAction: { type: 'fold', to: null, auto: null } }),
    ],
    result: {
      handNumber: 15,
      uncalledReturned: null,
      pots: [{ potIndex: 0, amount: 480, winners: [{ seat: 0, amount: 240 }, { seat: 1, amount: 240 }], winningHand: youRank }],
      shown: [
        { seat: 1, cards: ['Ad', '6s'], hand: mayaRank },
        { seat: 0, cards: ['Ah', '3c'], hand: youRank },
      ],
      mucked: [],
      splitPot: true,
    },
  });

  // 5 · Heads-up: the button posts the small blind and acts first before the flop.
  const p5 = view(now, {
    hand: 3,
    phase: 'preflop',
    button: 0,
    sb: 0,
    bb: 3,
    currentBet: 10,
    turnSeat: 0,
    hole: ['Ac', 'Jd'],
    seats: [
      seat(0, YOU, 1045, { committed: 5, lastAction: { type: 'smallBlind', to: 5, auto: null } }),
      seat(3, NOVA, 935, { committed: 10, lastAction: { type: 'bigBlind', to: 10, auto: null } }),
    ],
    legal: facing({ currentBet: 10, committed: 5, stack: 1045, lastFullRaise: 10, inMiddle: 15, big: 10, small: 5 }),
  });

  // 6 · Couch play: public TV view + Maya's phone.
  const couchSeats = (): SeatView[] => [
    seat(0, YOU, 940, { committed: 40, lastAction: { type: 'bet', to: 40, auto: null } }),
    seat(1, MAYA, 1210),
    seat(2, NOVA, 880, { status: 'folded', dealtIn: false, lastAction: { type: 'fold', to: null, auto: null } }),
    seat(3, THEO, 1100),
    seat(4, PRIYA, 1015, { status: 'folded', dealtIn: false, lastAction: { type: 'fold', to: null, auto: null } }),
    seat(5, PIXEL, 835, { lastAction: { type: 'check', to: null, auto: null } }),
  ];
  const couchBase = {
    config: ONLINE,
    hand: 21,
    phase: 'flop' as const,
    button: 4,
    sb: 5,
    bb: 0,
    board: ['Qd', '9c', '3h'] as Card[],
    pots: [pot(0, 'Pot', 80, [0, 1, 3, 5])],
    currentBet: 40,
    turnSeat: 1,
    turnElapsedMs: 11_000,
  };
  const p6tv = view(now, { ...couchBase, viewer: null, seats: couchSeats() });
  const mayaLegal = facing({ currentBet: 40, committed: 0, stack: 1210, lastFullRaise: 40, inMiddle: 120, big: 10, small: 5 });
  const p6phone = view(now, { ...couchBase, viewer: 1, seats: couchSeats(), hole: ['Qs', 'Jc'], legal: mayaLegal });

  // 7 · Streamer mode: the TV is live and there are people at the table → cards on the phone.
  const p7 = view(now, p1Inputs());

  // 8 · Sit & Go: blinds go up (level 4, 25/50).
  const lvl = SIT_AND_GO_SCHEDULE.levels[3]!;
  const p8 = view(now, {
    config: { gameType: 'sitAndGo', blindSchedule: SIT_AND_GO_SCHEDULE },
    hand: 25,
    phase: 'preflop',
    button: 2,
    sb: 3,
    bb: 4,
    blinds: lvl,
    levelIndex: 3,
    handsUntilNext: 8,
    currentBet: 50,
    turnSeat: 0,
    hole: ['Td', 'Tc'],
    seats: [
      seat(0, YOU, 1640),
      seat(1, NOVA, 1210),
      seat(2, JUNIPER, 880),
      seat(3, PIXEL, 1995, { committed: 25, lastAction: { type: 'smallBlind', to: 25, auto: null } }),
      seat(4, ORBIT, 200, { committed: 50, lastAction: { type: 'bigBlind', to: 50, auto: null } }),
      seat(5, MAPLE, 0, { status: 'busted', dealtIn: false }),
    ],
    standings: [{ playerId: MAPLE.id, name: MAPLE.name, place: 6 }],
    legal: facing({ currentBet: 50, committed: 0, stack: 1640, lastFullRaise: 50, inMiddle: 75, big: 50, small: 25 }),
  });

  // 9 · "Check instead?" — you pressed Fold with a free check.
  const p9Legal = facing({ currentBet: 0, committed: 0, stack: 1130, lastFullRaise: 10, inMiddle: 60, big: 10, small: 5 });
  const p9 = view(now, {
    hand: 16,
    phase: 'turn',
    button: 1,
    sb: 2,
    bb: 3,
    board: ['6c', '6d', 'Ts', '2h'],
    pots: [pot(0, 'Pot', 60, [0, 2, 3])],
    turnSeat: 0,
    hole: ['7s', '4s'],
    seats: [
      seat(0, YOU, 1130),
      seat(1, NOVA, 905, { status: 'folded', dealtIn: false, lastAction: { type: 'fold', to: null, auto: null } }),
      seat(2, JUNIPER, 980, { lastAction: { type: 'check', to: null, auto: null } }),
      seat(3, PIXEL, 1040, { lastAction: { type: 'check', to: null, auto: null } }),
      seat(4, ORBIT, 970, { status: 'folded', dealtIn: false, lastAction: { type: 'fold', to: null, auto: null } }),
      seat(5, MAPLE, 935, { status: 'folded', dealtIn: false, lastAction: { type: 'fold', to: null, auto: null } }),
    ],
    legal: p9Legal,
  });

  // 10 · 18+ check (first time at a poker table).
  const p10 = view(now, { hand: 0, phase: 'betweenHands', button: 0, sb: null, bb: 0, seats: [seat(0, YOU, 1000, { dealtIn: false })], viewer: 0 });

  // 11 · Bust in a home game → "Top up to 1,000?"
  const p11 = view(now, {
    hand: 31,
    phase: 'handComplete',
    button: 2,
    sb: 3,
    bb: 4,
    hole: ['Qh', 'Jh'],
    board: ['Ah', '5h', '9c', 'Kd', '2s'],
    topUp: 1000,
    seats: [
      seat(0, YOU, 0, { status: 'busted', lastAction: { type: 'allIn', to: 420, auto: null } }),
      seat(1, NOVA, 1385, { lastAction: { type: 'call', to: 420, auto: null } }),
      seat(2, JUNIPER, 1010, { status: 'folded', dealtIn: false }),
      seat(3, PIXEL, 870, { status: 'folded', dealtIn: false }),
      seat(4, ORBIT, 1205, { status: 'folded', dealtIn: false }),
      seat(5, MAPLE, 950, { status: 'folded', dealtIn: false }),
    ],
  });

  // 12 · Sit & Go over: trophy (no prize beyond the trophy).
  const p12 = view(now, {
    config: { gameType: 'sitAndGo', blindSchedule: SIT_AND_GO_SCHEDULE },
    status: 'finished',
    hand: 58,
    phase: 'showdown',
    button: 0,
    sb: 0,
    bb: 1,
    levelIndex: 7,
    blinds: SIT_AND_GO_SCHEDULE.levels[7]!,
    seats: [seat(0, YOU, 6000, { dealtIn: false }), seat(1, NOVA, 0, { status: 'busted', dealtIn: false })],
    standings: [
      { playerId: 'you', name: 'You', place: 1 },
      { playerId: NOVA.id, name: NOVA.name, place: 2 },
      { playerId: PIXEL.id, name: PIXEL.name, place: 3 },
      { playerId: JUNIPER.id, name: JUNIPER.name, place: 4 },
      { playerId: ORBIT.id, name: ORBIT.name, place: 5 },
      { playerId: MAPLE.id, name: MAPLE.name, place: 6 },
    ],
  });

  return [
    { id: 'turn-preflop', title: 'Your turn, before the flop', kind: 'table', view: p1, flags: { modeLine: 'Friends table · BKTR' } },
    {
      id: 'facing-raise',
      title: 'Facing a raise, sizing open',
      kind: 'table',
      view: p2,
      bar: { focus: 'raise', sizingTo: p2Half, confirm: null },
      flags: { modeLine: 'Friends table · BKTR' },
    },
    { id: 'all-in-3way', title: '3-way all-in, 2 side pots', kind: 'table', view: p3, flags: { modeLine: 'Friends table · BKTR' } },
    { id: 'split-pot', title: 'Showdown, split pot', kind: 'table', view: p4, flags: { modeLine: 'Friends table · BKTR' } },
    { id: 'heads-up', title: 'Heads-up blinds', kind: 'table', view: p5, flags: { modeLine: 'vs bots · Medium' } },
    {
      id: 'couch',
      title: 'Couch mode',
      kind: 'couch',
      view: p6tv,
      phoneView: p6phone,
      phoneRaiseTo: mayaLegal.presets.find((p) => p.id === 'halfPot')?.to,
      flags: { joinUrl: joinUrl(CODE), modeLine: 'Couch play · BKTR' },
    },
    {
      id: 'streamer',
      title: 'Streamer mode',
      kind: 'table',
      view: p7,
      flags: { live: true, cardsOnPhone: true, joinUrl: joinUrl(CODE), modeLine: 'Friends table · BKTR' },
    },
    { id: 'sng-level', title: 'Sit & Go blinds go up', kind: 'table', view: p8, levelUp: 'Blinds up · 25/50', flags: { modeLine: 'vs bots · Medium' } },
    {
      id: 'check-instead',
      title: 'Check instead?',
      kind: 'checkInstead',
      view: p9,
      bar: { focus: 'fold', sizingTo: null, confirm: 'checkInstead' },
      flags: { modeLine: 'vs bots · Medium' },
    },
    { id: 'age', title: '18+ check', kind: 'age', view: p10, flags: { modeLine: 'vs bots · Medium' } },
    { id: 'top-up', title: 'Bust → top up', kind: 'topUp', view: p11, flags: { modeLine: 'vs bots · Medium' } },
    { id: 'sng-win', title: 'Sit & Go trophy', kind: 'finished', view: p12, flags: { modeLine: 'vs bots · Medium' } },
  ];
}

/** Streamer mode uses the same moment as state 1, with the clock running. */
function p1Inputs(): ViewInput {
  return {
    config: ONLINE,
    hand: 12,
    phase: 'preflop',
    button: 0,
    sb: 1,
    bb: 2,
    currentBet: 10,
    turnSeat: 0,
    turnElapsedMs: 4000,
    hole: ['9s', '9d'],
    seats: [
      seat(0, YOU, 1000),
      seat(1, MAYA, 1180, { committed: 5, lastAction: { type: 'smallBlind', to: 5, auto: null } }),
      seat(2, NOVA, 905, { committed: 10, lastAction: { type: 'bigBlind', to: 10, auto: null } }),
      seat(3, THEO, 1420, { committed: 10, lastAction: { type: 'call', to: 10, auto: null } }),
      seat(4, PIXEL, 760, { status: 'folded', dealtIn: false, lastAction: { type: 'fold', to: null, auto: null } }),
      seat(5, PRIYA, 990, { committed: 10, lastAction: { type: 'call', to: 10, auto: null } }),
    ],
    legal: facing({ currentBet: 10, committed: 0, stack: 1000, lastFullRaise: 10, inMiddle: 35, big: 10, small: 5 }),
  };
}

/** Empty table behind the start screen and the join screen. */
export function backdropView(now: number): PlayerView {
  return view(now, { hand: 0, phase: 'betweenHands', button: 0, sb: null, bb: 0, seats: [], viewer: null });
}
