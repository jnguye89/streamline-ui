import { TileId, Wind } from './tiles';

/**
 * Fixed physical seats around the table. Turn order is 0 → 1 → 2 → 3 → 0 (counter-clockwise):
 * the next seat sits on your right, the previous seat on your left. Seat winds move as the dealer moves.
 */
export type Seat = 0 | 1 | 2 | 3;
export const SEATS: readonly Seat[] = [0, 1, 2, 3];
export const nextSeat = (s: Seat): Seat => ((s + 1) % 4) as Seat;
export const prevSeat = (s: Seat): Seat => ((s + 3) % 4) as Seat;

export type VariantId = 'hong-kong' | 'riichi';
export type GameLength = 'quick' | 'full';
export type BotLevel = 'easy' | 'medium' | 'hard';
export type Pace = 'normal' | 'fast';

export interface SeatConfig {
  readonly name: string;
  /** 'human' seats are driven through act(); 'bot' seats are played by the engine. */
  readonly kind: 'human' | 'bot';
}

export interface GameConfig {
  readonly variant: VariantId;
  readonly length: GameLength;
  readonly botLevel: BotLevel;
  /** Hong Kong: 0, 1 or 3 (default 3). */
  readonly minFaan: 0 | 1 | 3;
  /** Faan cap ("Limit"). Hong Kong default 10. */
  readonly faanCap: number;
  /** Claim window for everyone who can claim a discard. Default 5000. */
  readonly claimWindowMs: number;
  /** Online only: discard timer (auto-discard). null = no timer (offline). */
  readonly discardTimerMs: number | null;
  readonly pace: Pace;
  readonly seats: readonly [SeatConfig, SeatConfig, SeatConfig, SeatConfig];
  /** Fixed seed for tests and replays; omitted = random. */
  readonly seed?: number;
}

export type MeldType = 'chow' | 'pung' | 'kong';

export interface Meld {
  readonly type: MeldType;
  /** Tiles in display order. */
  readonly tiles: readonly TileId[];
  /** Concealed kong: shown with both end tiles face down; still counts as concealed. */
  readonly concealed: boolean;
  /** The discard taken to make it (null for concealed kongs). */
  readonly claimed: { readonly tile: TileId; readonly from: Seat } | null;
  /** A pung that became a kong with a 4th tile from the hand. */
  readonly promoted: boolean;
}

export interface Discard {
  readonly tile: TileId;
  /** Taken by another player (it then shows in their meld, not in the pond). */
  readonly claimed: boolean;
}

/** What everyone at the table may see about a seat. Concealed tiles are never included. */
export interface SeatPublic {
  readonly seat: Seat;
  readonly name: string;
  readonly kind: 'human' | 'bot';
  readonly botLevel: BotLevel | null;
  readonly wind: Wind;
  readonly dealer: boolean;
  readonly score: number;
  readonly concealedCount: number;
  /** Holding a 14th tile right now (drawn or about to discard). */
  readonly hasDrawn: boolean;
  readonly melds: readonly Meld[];
  readonly bonus: readonly TileId[];
  readonly discards: readonly Discard[];
  readonly connected: boolean;
}

export type Phase = 'turn' | 'claim' | 'hand-over' | 'game-over';

export interface RoundInfo {
  readonly prevailing: Wind;
  /** 1–4: which player in the round is dealing. */
  readonly dealerNo: number;
  /** Times the current dealer has dealt again (dealer win or draw). */
  readonly repeat: number;
  /** Hands played so far in the game (all rounds). */
  readonly handsPlayed: number;
  readonly length: GameLength;
}

export type PlayerAction =
  | { readonly type: 'discard'; readonly tile: TileId }
  /** Self-drawn win on your turn, or a win on the current discard / robbed kong. */
  | { readonly type: 'win' }
  /** Concealed: the 4 tiles. Promoted: [the 4th tile]. Exposed (on a discard): the 3 hand tiles. */
  | { readonly type: 'kong'; readonly tiles: readonly TileId[] }
  | { readonly type: 'pung'; readonly tiles: readonly [TileId, TileId] }
  | { readonly type: 'chow'; readonly tiles: readonly [TileId, TileId] }
  | { readonly type: 'pass' }
  /** Continue after the hand result. */
  | { readonly type: 'next' };

export type KongKind = 'concealed' | 'promoted' | 'exposed';

/** A legal choice for the viewing player right now. The UI only ever offers these. */
export interface ActionOption {
  readonly action: PlayerAction;
  /** For kongs. */
  readonly kongKind?: KongKind;
  /** The meld this choice would make, in display order (claims and kongs). */
  readonly meld?: readonly TileId[];
}

export interface ClaimWindow {
  readonly tile: TileId;
  readonly from: Seat;
  /** Robbing a kong (the tile is being added to a pung), not a discard. */
  readonly robbing: boolean;
  /** Engine clock time (ms) when the window closes; passing is automatic after that. */
  readonly endsAt: number;
  readonly windowMs: number;
}

export interface FaanLine {
  readonly id: string;
  readonly label: string;
  readonly faan: number;
  /** A limit hand (scores the cap). */
  readonly limit?: boolean;
}

export interface WinningHand {
  readonly melds: readonly Meld[];
  /** Concealed tiles grouped into sets and the pair (or one group for special hands). */
  readonly groups: readonly (readonly TileId[])[];
  readonly bonus: readonly TileId[];
  readonly winningTile: TileId;
}

export interface HandResult {
  readonly kind: 'win' | 'draw';
  readonly winner: Seat | null;
  /** Who discarded the winning tile; null = self-drawn (or a draw). */
  readonly from: Seat | null;
  readonly selfDrawn: boolean;
  readonly hand: WinningHand | null;
  readonly faan: readonly FaanLine[];
  readonly totalFaan: number;
  /** Total was cut to the cap. */
  readonly capped: boolean;
  /** Base points (P) from the faan table. */
  readonly points: number;
  /** Change per seat this hand (sums to zero). */
  readonly deltas: readonly [number, number, number, number];
  readonly scores: readonly [number, number, number, number];
  readonly dealerStays: boolean;
  /** Label of the next hand, e.g. "East round, hand 2". null when the game is over. */
  readonly nextLabel: string | null;
  readonly gameOver: boolean;
}

export interface Standing {
  readonly seat: Seat;
  readonly place: 1 | 2 | 3 | 4;
  readonly score: number;
  readonly wins: number;
  readonly selfDrawn: number;
}

/** Everything one player may see. Never contains another player's concealed tiles or the wall order. */
export interface PlayerView {
  readonly you: Seat;
  readonly variant: VariantId;
  readonly phase: Phase;
  readonly round: RoundInfo;
  readonly minFaan: number;
  readonly wallLeft: number;
  /** Whose turn it is (during a claim window: the discarder). */
  readonly turn: Seat;
  readonly seats: readonly [SeatPublic, SeatPublic, SeatPublic, SeatPublic];
  /** Your concealed tiles in the order they came in (sort in the UI), without the drawn tile. */
  readonly hand: readonly TileId[];
  /** Your 14th tile, kept apart until you discard. */
  readonly drawn: TileId | null;
  readonly lastDiscard: { readonly tile: TileId; readonly from: Seat } | null;
  /** Legal choices for you right now. Empty = nothing to do. */
  readonly options: readonly ActionOption[];
  /** Set only while you have a claim to decide. */
  readonly claim: ClaimWindow | null;
  readonly result: HandResult | null;
  readonly standings: readonly Standing[] | null;
}

/** Something that just happened (for callouts, sounds and animation). */
export type TableEvent =
  | { readonly type: 'hand-start'; readonly label: string }
  | { readonly type: 'draw'; readonly seat: Seat }
  | { readonly type: 'bonus'; readonly seat: Seat; readonly tile: TileId }
  | { readonly type: 'discard'; readonly seat: Seat; readonly tile: TileId }
  | { readonly type: 'claim'; readonly seat: Seat; readonly meld: MeldType; readonly from: Seat }
  | { readonly type: 'kong'; readonly seat: Seat; readonly kind: KongKind }
  | { readonly type: 'win'; readonly seat: Seat; readonly selfDrawn: boolean }
  | { readonly type: 'exhaustive-draw' }
  | { readonly type: 'game-over' };
