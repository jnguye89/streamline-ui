/**
 * skriin ai TV · Poker — poker-core public API (v1, approved in Phase 0)
 *
 * In Phase 1 this file lives in the TV app; in Phase 2 it moves to packages/poker-core/src/api.ts
 * unchanged. The TV UI and the bots only use the types below.
 *
 * Pure TypeScript: no Angular, React, DOM or Node imports. Deterministic: randomness,
 * time and hashing are injected. Shared by the Angular TV app, the React Native app
 * and the NestJS/Colyseus server.
 *
 * Privacy rule: the engine's internal state (deck, every player's hole cards, salts)
 * never leaves the engine. State only leaves through viewFor(viewer) → PlayerView and
 * through PokerEvent, which carries public information only.
 *
 * Chips rule: chips are whole numbers (smallest unit = 1). No method can set a stack.
 * Stacks change only through game actions and free top-ups (home game). The engine
 * checks after every step: sum(stacks) + sum(pots) + sum(bets in front)
 *   = sum(starting stacks handed out) + sum(top-ups).
 *
 * Seat numbers are 0-based and increase clockwise, so "left of the button" = next seat number.
 */

// ─────────────────────────────── Cards ───────────────────────────────

export type RankChar = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';
export type SuitChar = 'c' | 'd' | 'h' | 's';

/** 'As' = ace of spades, 'Td' = ten of diamonds, '9h' = nine of hearts. */
export type Card = `${RankChar}${SuitChar}`;

export type HoleCards = readonly [Card, Card];

export type HandCategory =
  | 'highCard'
  | 'onePair'
  | 'twoPair'
  | 'threeOfAKind'
  | 'straight'
  | 'flush'
  | 'fullHouse'
  | 'fourOfAKind'
  | 'straightFlush';

/** Best 5-card hand. Higher `value` wins; equal `value` = split. Suits never break ties. */
export interface HandRank {
  readonly value: number;
  readonly category: HandCategory;
  /** e.g. "Two pair, kings and sevens", "Royal flush", "Straight, five high". */
  readonly label: string;
  /** The 5 cards that make the hand (highlighted on screen). */
  readonly best5: readonly [Card, Card, Card, Card, Card];
}

export interface HandEvaluator {
  /** Exactly 5 distinct cards. */
  rank5(cards: readonly Card[]): HandRank;
  /** 5 to 7 distinct cards; best 5 of them (2 hole + board in any mix; the board can play). */
  rankBest(cards: readonly Card[]): HandRank;
  /** Fast path for Monte Carlo and the 133,784,560-hand test: value only. Card ids 0–51. */
  value7(cardIds: ArrayLike<number>): number;
  /** Short label for 2–7 cards, for the beginner hint: "Pair of nines", "Ace high". */
  describe(cards: readonly Card[]): string;
}

// ─────────────────────── Injected dependencies ───────────────────────

/** Uniform unsigned 32-bit integers. Server: node:crypto. Tests: seeded. */
export interface RandomSource {
  nextUint32(): number;
}

/** Milliseconds since epoch. The engine never reads the system clock itself. */
export interface Clock {
  now(): number;
}

/** SHA-256 as lowercase hex. Server: node:crypto. poker-core ships a pure-TS fallback. */
export type Sha256 = (data: Uint8Array) => string;

export interface PokerEngineDeps {
  readonly rng: RandomSource;
  readonly clock: Clock;
  readonly sha256: Sha256;
  readonly evaluator: HandEvaluator;
}

// ─────────────────────────── Table setup ─────────────────────────────

/** 0-based seat number, increasing clockwise. */
export type SeatIndex = number;
export type PlayerId = string;
export type BotLevel = 'easy' | 'medium' | 'hard';

export interface PlayerInfo {
  readonly id: PlayerId;
  /** Shown on the seat. Bots get generic names, never real people. */
  readonly name: string;
  readonly kind: 'human' | 'bot';
  readonly botLevel: BotLevel | null;
}

export type GameType = 'home' | 'sitAndGo';

export interface BlindLevel {
  readonly small: number;
  readonly big: number;
  /** 0 unless TableConfig.anteMode = 'bigBlindAnte'. */
  readonly bigBlindAnte: number;
}

export interface BlindSchedule {
  readonly handsPerLevel: number;
  readonly levels: readonly BlindLevel[];
}

export interface TableConfig {
  readonly gameType: GameType;
  /** 2–9. TV layout v1 shows up to 6. */
  readonly maxSeats: number;
  /** Default 1,000. */
  readonly startingStack: number;
  /** Home game: fixed for the whole table. Sit & Go: level 1 of blindSchedule. */
  readonly blinds: BlindLevel;
  /** Sit & Go only; null for home games. */
  readonly blindSchedule: BlindSchedule | null;
  /** Off in v1. */
  readonly anteMode: 'off' | 'bigBlindAnte';
  /** Default 30,000. 0 = no action clock (offline vs bots). */
  readonly actionTimeMs: number;
  /** Default 60,000 per player per session. Starts by itself when the action clock runs out. */
  readonly timeBankMs: number;
  /** Default 2: two timeouts in a row → sit out. */
  readonly timeoutsBeforeSitOut: number;
  /** Default true. */
  readonly autoShowAtShowdown: boolean;
}

// ───────────────────────────── Actions ───────────────────────────────

/** `to` = your total bet in front of you this round ("Raise to 120"). */
export type PlayerAction =
  | { readonly type: 'fold' }
  | { readonly type: 'check' }
  | { readonly type: 'call' }
  | { readonly type: 'bet'; readonly to: number }
  | { readonly type: 'raise'; readonly to: number }
  | { readonly type: 'allIn' };

/** Set while waiting. 'check' is cleared if a bet comes in; 'checkFold' folds if one does. */
export type PreAction = 'checkFold' | 'check' | 'callAny';

export type SizePresetId = 'min' | 'halfPot' | 'threeQuarterPot' | 'pot' | 'allIn';

export interface SizePreset {
  readonly id: SizePresetId;
  /** Raise-to / bet-to total, already clamped to [minimum, all-in]. */
  readonly to: number;
}

/** Only legal actions are present. Computed in poker-core so the TV and the phone always agree. */
export interface LegalActions {
  /** Always true on your turn. UI asks "Check instead?" when `check` is also true. */
  readonly fold: boolean;
  readonly check: boolean;
  /** Chips you add to call. allIn = calling puts you all-in. */
  readonly call: { readonly amount: number; readonly allIn: boolean } | null;
  /** Only when nobody has bet this round. */
  readonly bet: { readonly minTo: number; readonly maxTo: number } | null;
  /** Null when a short all-in didn't reopen betting for you, or you can only call all-in. */
  readonly raise: { readonly minTo: number; readonly maxTo: number } | null;
  /** Null when you can't put in more than a call (betting not reopened, or calling is already all-in). */
  readonly allIn: { readonly to: number } | null;
  /** D-pad ▲▼ step while sizing (= big blind). */
  readonly step: number;
  /** min · ½ pot · ¾ pot · pot · all-in for LT/RT. Duplicates removed. Empty when you can't bet or raise. */
  readonly presets: readonly SizePreset[];
  /** Where focus lands: check when free, otherwise call. Never fold. */
  readonly defaultFocus: 'check' | 'call';
}

// ─────────────────────────── Table state ─────────────────────────────

export type Street = 'preflop' | 'flop' | 'turn' | 'river';
export type HandPhase = 'betweenHands' | Street | 'showdown' | 'handComplete';
export type TableStatus = 'open' | 'finished';

export type SeatStatus =
  | 'waitingForBigBlind'
  | 'sittingOut'
  | 'inHand'
  | 'folded'
  | 'allIn'
  | 'busted'
  | 'leaving';

export interface LastAction {
  readonly type: PlayerAction['type'] | 'smallBlind' | 'bigBlind' | 'ante';
  /** Bet-to total where it applies ("Raise to 120"), else null. */
  readonly to: number | null;
  readonly auto: 'timeout' | 'preAction' | null;
}

export interface SeatView {
  readonly seat: SeatIndex;
  readonly player: PlayerInfo;
  /** Chips behind. */
  readonly stack: number;
  /** Chips in front of the seat this betting round. */
  readonly committed: number;
  readonly status: SeatStatus;
  /** True = draw card backs for this seat. */
  readonly dealtIn: boolean;
  /**
   * Face-up only after this seat's cards are shown (showdown, all-in run-out, voluntary show).
   * Null otherwise, also for the viewer's own seat: own cards live in PlayerView.me only.
   */
  readonly shownCards: HoleCards | null;
  readonly lastAction: LastAction | null;
  readonly timeBankLeftMs: number;
  readonly connected: boolean;
}

export interface PotView {
  /** 0 = main pot. */
  readonly index: number;
  /** "Main pot", "Side pot 1", … */
  readonly label: string;
  readonly amount: number;
  readonly eligibleSeats: readonly SeatIndex[];
}

export interface TurnView {
  readonly seat: SeatIndex;
  readonly startedAt: number;
  /** End of the 30 s action clock (engine clock). */
  readonly turnEndsAt: number;
  /** End of the time bank if it gets used. */
  readonly timeBankEndsAt: number;
  readonly usingTimeBank: boolean;
}

export interface ShownHand {
  readonly seat: SeatIndex;
  readonly cards: HoleCards;
  /** Null when shown before the board is complete (e.g. a show after everyone folds preflop). */
  readonly hand: HandRank | null;
}

export interface PotResult {
  readonly potIndex: number;
  readonly amount: number;
  /** Odd chips go to the first winner left of the button, per pot. */
  readonly winners: readonly { readonly seat: SeatIndex; readonly amount: number }[];
  /** Null when the pot was won without a showdown. */
  readonly winningHand: HandRank | null;
}

export interface HandResult {
  readonly handNumber: number;
  readonly uncalledReturned: { readonly seat: SeatIndex; readonly amount: number } | null;
  readonly pots: readonly PotResult[];
  readonly shown: readonly ShownHand[];
  readonly mucked: readonly SeatIndex[];
  readonly splitPot: boolean;
}

/**
 * Verifiable shuffle (approved rule 12): each deck position is committed on its own as
 * SHA-256(position + card + salt). Folded hands and burn cards are never opened.
 */
export interface ShuffleProof {
  readonly scheme: 'sha256-position-card-salt-v1';
  /** 52 position hashes, published at hand start. */
  readonly positionHashes: readonly string[];
  /** SHA-256 of the 52 position hashes joined in order; the short value shown in the hand log. */
  readonly commitment: string;
  /** After the hand: openings for the board and shown hands only. */
  readonly reveal: ShuffleReveal | null;
}

export interface ShuffleReveal {
  readonly openings: readonly {
    readonly position: number;
    readonly card: Card;
    readonly salt: string;
  }[];
}

export interface Standing {
  readonly playerId: PlayerId;
  readonly name: string;
  /** 1 = winner. Equal places allowed (two busts in one hand with equal starting stacks). */
  readonly place: number;
}

// ──────────────────────────── PlayerView ─────────────────────────────

/** 'public' = the TV in couch mode or streamer mode, and spectators. */
export type Viewer =
  | { readonly kind: 'seat'; readonly seat: SeatIndex }
  | { readonly kind: 'public' };

/** Private part of the view. Present only when the viewer is that seat. */
export interface MeView {
  readonly seat: SeatIndex;
  readonly holeCards: HoleCards | null;
  /** "Pair of nines". UI shows it only if the player's beginner setting is on. */
  readonly handLabel: string | null;
  /** Null unless it is your turn. */
  readonly legal: LegalActions | null;
  readonly preAction: PreAction | null;
  /** Pre-actions that make sense right now (e.g. no 'check' while facing a bet). */
  readonly preActionsAvailable: readonly PreAction[];
  /** You won without a showdown, or it's your turn to show at showdown. */
  readonly canShow: boolean;
  /** Your turn at showdown and your hand can't win, or auto-show is off. */
  readonly canMuck: boolean;
  /** Home game, between hands, stack under the starting stack. */
  readonly topUp: { readonly to: number } | null;
  readonly timeoutsInARow: number;
  /** After the hand: openings for your own two cards (verify privately). */
  readonly myShuffleOpenings: ShuffleReveal | null;
}

/**
 * Everything one viewer may see. Never contains the deck, burn cards, or another
 * player's hole cards before they are shown.
 */
export interface PlayerView {
  readonly schema: 1;
  readonly tableId: string;
  readonly viewer: Viewer;
  /** Engine clock when this view was made, so clients draw timer rings without clock drift. */
  readonly engineNow: number;
  readonly config: TableConfig;
  readonly status: TableStatus;
  /** 0 before the first hand. */
  readonly handNumber: number;
  readonly phase: HandPhase;
  readonly level: {
    readonly index: number;
    readonly blinds: BlindLevel;
    /** Sit & Go: hands until blinds go up. Null in a home game. */
    readonly handsUntilNext: number | null;
  };
  readonly buttonSeat: SeatIndex | null;
  /** Null when there is no small blind this hand (dead-button rule). */
  readonly smallBlindSeat: SeatIndex | null;
  readonly bigBlindSeat: SeatIndex | null;
  /** Length = maxSeats. Null = empty seat. */
  readonly seats: readonly (SeatView | null)[];
  /** 0, 3, 4 or 5 cards. */
  readonly board: readonly Card[];
  /** Pots collected so far (this round's bets are still in SeatView.committed). */
  readonly pots: readonly PotView[];
  /** Highest bet in front of anyone this round. */
  readonly currentBet: number;
  readonly turn: TurnView | null;
  /** No more betting possible: all live hands face up, board runs out. */
  readonly allInRunout: boolean;
  /** Set during showdown and handComplete. */
  readonly result: HandResult | null;
  readonly shuffle: ShuffleProof | null;
  /** Sit & Go finishes so far; empty in a home game. */
  readonly standings: readonly Standing[];
  /** Null for the public viewer. */
  readonly me: MeView | null;
}

// ──────────────────────────── Events ─────────────────────────────────

/**
 * For animations and the hand log. Public information only, so every viewer gets the
 * same events. Private cards travel only in PlayerView.me.
 */
export type PokerEvent =
  | { readonly type: 'handStarted'; readonly handNumber: number; readonly buttonSeat: SeatIndex; readonly commitment: string }
  | { readonly type: 'blindPosted'; readonly seat: SeatIndex; readonly kind: 'small' | 'big' | 'ante'; readonly amount: number }
  | { readonly type: 'cardsDealt'; readonly seats: readonly SeatIndex[] }
  | { readonly type: 'action'; readonly seat: SeatIndex; readonly action: PlayerAction; readonly to: number; readonly auto: 'timeout' | 'preAction' | null }
  | { readonly type: 'streetDealt'; readonly street: Exclude<Street, 'preflop'>; readonly cards: readonly Card[] }
  | { readonly type: 'uncalledReturned'; readonly seat: SeatIndex; readonly amount: number }
  | { readonly type: 'potsCollected'; readonly pots: readonly PotView[] }
  | { readonly type: 'allInRunout'; readonly shown: readonly ShownHand[] }
  | { readonly type: 'cardsShown'; readonly hand: ShownHand }
  | { readonly type: 'mucked'; readonly seat: SeatIndex }
  | { readonly type: 'potAwarded'; readonly result: PotResult }
  | { readonly type: 'handEnded'; readonly handNumber: number }
  | { readonly type: 'timedOut'; readonly seat: SeatIndex; readonly satOut: boolean }
  | { readonly type: 'levelUp'; readonly index: number; readonly blinds: BlindLevel }
  | { readonly type: 'seatChanged'; readonly seat: SeatIndex; readonly change: 'joined' | 'left' | 'satOut' | 'returned' | 'toppedUp' | 'busted' }
  | { readonly type: 'tableFinished'; readonly standings: readonly Standing[] };

// ────────────────────────── Results & log ────────────────────────────

export type PokerErrorCode =
  | 'NOT_YOUR_TURN'
  | 'ILLEGAL_ACTION'
  | 'BAD_AMOUNT'
  | 'HAND_IN_PROGRESS'
  | 'SEAT_TAKEN'
  | 'SEAT_EMPTY'
  | 'NOT_ENOUGH_PLAYERS'
  | 'NOT_ALLOWED'
  | 'TABLE_FINISHED';

export type Result =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: PokerErrorCode; readonly message: string };

export interface HandLogLine {
  readonly street: Street | 'showdown';
  readonly seat: SeatIndex;
  readonly name: string;
  readonly text: string;
}

/** One hand for the X log, already redacted for the viewer. */
export interface HandSummary {
  readonly handNumber: number;
  readonly buttonSeat: SeatIndex;
  readonly blinds: BlindLevel;
  /** The viewer's own hole cards for that hand, if they were dealt in. */
  readonly myHoleCards: HoleCards | null;
  readonly board: readonly Card[];
  readonly lines: readonly HandLogLine[];
  readonly result: HandResult;
  readonly shuffle: ShuffleProof | null;
}

// ───────────────────────────── Engine ────────────────────────────────

/** Opaque full state including the deck. Offline resume and server recovery only; never sent to a client. */
export interface EngineSnapshot {
  readonly format: 'poker-core/1';
  readonly data: string;
}

/**
 * Authoritative rules engine. Runs on the server for online tables and inside the TV app
 * for offline play vs bots. UI and bots never hold it directly; they get a SeatHandle.
 */
export interface PokerEngine {
  readonly config: TableConfig;

  // Seating. Between hands, except stand / setSittingOut, which are safe mid-hand.
  sit(seat: SeatIndex, player: PlayerInfo, options?: { readonly postBigBlindNow?: boolean }): Result;
  /** Mid-hand: folds now; the seat frees at hand end. */
  stand(seat: SeatIndex): Result;
  setSittingOut(seat: SeatIndex, sittingOut: boolean): Result;
  /** Home game only, between hands, stack under the starting stack → back to the starting stack. */
  topUp(seat: SeatIndex): Result;
  /** Host ends a home game after the current hand. */
  endTable(): Result;

  // Play.
  startHand(): Result;
  act(seat: SeatIndex, action: PlayerAction): Result;
  setPreAction(seat: SeatIndex, preAction: PreAction | null): Result;
  show(seat: SeatIndex): Result;
  muck(seat: SeatIndex): Result;

  // Time. The engine sets no timers: the host calls advance() at nextWakeAt().
  advance(): void;
  nextWakeAt(): number | null;

  // Output: the only ways state leaves the engine.
  viewFor(viewer: Viewer): PlayerView;
  history(viewer: Viewer, limit: number): readonly HandSummary[];
  onEvents(listener: (events: readonly PokerEvent[]) => void): () => void;
  /** In-process handle (offline). Online clients get a Colyseus-backed SeatHandle instead. */
  handle(viewer: Viewer): SeatHandle;

  snapshot(): EngineSnapshot;
}

/** Restoring checks the chip ledger and rejects a snapshot that doesn't add up. */
export type CreatePokerEngine = (
  tableId: string,
  config: TableConfig,
  deps: PokerEngineDeps,
  restore?: EngineSnapshot,
) => PokerEngine;

/**
 * What the TV UI, the phone UI and bots hold. Same shape offline (in-process engine) and
 * online (Colyseus room). It only ever carries this viewer's PlayerView.
 * A public handle can watch but every action returns NOT_ALLOWED.
 */
export interface SeatHandle {
  readonly viewer: Viewer;
  view(): PlayerView;
  subscribe(listener: (view: PlayerView, events: readonly PokerEvent[]) => void): () => void;
  act(action: PlayerAction): Promise<Result>;
  setPreAction(preAction: PreAction | null): Promise<Result>;
  show(): Promise<Result>;
  muck(): Promise<Result>;
  topUp(): Promise<Result>;
  setSittingOut(sittingOut: boolean): Promise<Result>;
  leave(): Promise<Result>;
  history(limit: number): Promise<readonly HandSummary[]>;
}

// ────────────────────────────── Bots ─────────────────────────────────

/** Built only from public events at this table (how often each opponent plays and raises). */
export interface OpponentStats {
  readonly handsSeen: number;
  /** Share of hands where they put chips in voluntarily before the flop (0–1). */
  readonly playRate: number;
  /** Share of hands where they raised before the flop (0–1). */
  readonly raiseRate: number;
  /** (bets + raises) / calls after the flop. */
  readonly aggression: number;
}

export interface EquityEstimator {
  /** Monte Carlo win share (0–1) vs `opponents` random hands. Web Worker on the TV, worker_threads on the server. */
  estimate(hole: HoleCards, board: readonly Card[], opponents: number, iterations: number): Promise<number>;
}

export interface CancelToken {
  readonly cancelled: boolean;
}

export interface BotContext {
  readonly rng: RandomSource;
  readonly equity: EquityEstimator;
  readonly opponents: (playerId: PlayerId) => OpponentStats;
  readonly cancel: CancelToken;
}

export interface PokerBot {
  readonly level: BotLevel;
  /**
   * Gets only this bot's PlayerView: never the deck, never others' hole cards.
   * Think time (0.8–2.5 s) is added by the host, so bots stay deterministic in tests.
   */
  decide(view: PlayerView, context: BotContext): Promise<PlayerAction>;
}
