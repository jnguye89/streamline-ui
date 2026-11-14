/**
 * Bot or Not: shared game types. Pure TypeScript (no Angular, React or DOM), so the TV app,
 * the phone web controller, the React Native app and the NestJS/Colyseus server can all import it.
 * Phase 2 moves this folder to packages/botornot-core.
 */

export type Phase = 'lobby' | 'prompt' | 'answering' | 'reveal' | 'voting' | 'results' | 'void' | 'final';
export type ScoringMode = 'classic' | 'bluff';
export type PlayerKind = 'human' | 'bot';

export interface Settings {
  readonly rounds: 4 | 6 | 8;
  readonly answerSeconds: 30 | 45 | 60;
  readonly mode: ScoringMode;
  /** A second bot joins when 7–8 humans are in. */
  readonly secondBot: boolean;
  /** Locked on while the host TV is live. */
  readonly familyMode: boolean;
  /** Streamer mode can hide player names on the TV. */
  readonly showNames: boolean;
}

export interface PublicPlayer {
  readonly id: string;
  readonly name: string;
  readonly kind: PlayerKind;
  /** Avatar color index (humans). */
  readonly hue: number;
  readonly connected: boolean;
  readonly isHost: boolean;
  readonly score: number;
  /** Has an answer in for the current round. For a bot this flips at its drawn submit time. */
  readonly answered: boolean;
  /** Joined mid-game; plays from the next round. */
  readonly waiting: boolean;
}

/** A card as every client sees it. Never says who wrote it or whether it is a bot. */
export interface PublicCard {
  readonly id: string;
  readonly letter: string;
  /** Empty when hidden by the host. */
  readonly text: string;
  readonly hidden: boolean;
}

export interface Timer {
  readonly totalMs: number;
  /** Server time the phase ends, while running. */
  readonly endsAt: number | null;
  /** Time left, used while not running (paused). */
  readonly remainingMs: number;
  readonly running: boolean;
}

export type PointReason = 'caught' | 'clearly-human' | 'fooled' | 'bot-fooled';

export interface PointLine {
  readonly playerId: string;
  /** Total for the round, after doubling. */
  readonly points: number;
  readonly reasons: readonly PointReason[];
  /** Bluff: votes your card got. Bot: humans it fooled. */
  readonly fooledCount: number;
}

export type Verdict = 'busted' | 'got-away' | 'both-busted' | 'one-got-away' | 'both-got-away';

/** Only exists in Results and Final: this is where authors and bots are revealed. */
export interface CardResult {
  readonly cardId: string;
  readonly authorId: string;
  readonly isBot: boolean;
  readonly voterIds: readonly string[];
}

export interface RoundResults {
  readonly cards: readonly CardResult[];
  readonly points: readonly PointLine[];
  readonly verdict: Verdict;
  readonly double: boolean;
}

export interface Standing {
  readonly playerId: string;
  /** Ties share the place: 1, 1, 3. */
  readonly place: number;
  readonly score: number;
}

/** Everything a TV or phone may see. Built server-side; contains no author or bot mapping before Results. */
export interface PublicState {
  readonly code: string;
  readonly phase: Phase;
  readonly round: number;
  readonly totalRounds: number;
  readonly lastRound: boolean;
  readonly prompt: string | null;
  readonly timer: Timer | null;
  readonly paused: boolean;
  /** Host TV is live (streamer mode). */
  readonly live: boolean;
  readonly settings: Settings;
  readonly players: readonly PublicPlayer[];
  readonly answersIn: number;
  readonly answersExpected: number;
  readonly cards: readonly PublicCard[];
  /** Cards shown so far during Reveal (server-driven, so every screen is in sync). */
  readonly revealed: number;
  readonly votesIn: number;
  readonly votesExpected: number;
  readonly results: RoundResults | null;
  readonly standings: readonly Standing[];
  /** Void: true = a new prompt is coming, false = this round is skipped. */
  readonly voidRetry: boolean;
  /** Bumps on every new round or retry; screens restart their animations on change. */
  readonly roundKey: number;
}

/** What one phone may see about itself. Sent only to that player. */
export interface PrivateView {
  readonly playerId: string;
  readonly removed: boolean;
  readonly answer: string;
  readonly submitted: boolean;
  /** The last thing they tried to send was blocked by the filter. */
  readonly blocked: boolean;
  /** Their own card this round (from Reveal on), so the phone can grey it out. */
  readonly cardId: string | null;
  readonly vote: string | null;
}

export type JoinError = 'no-room' | 'name-empty' | 'name-taken' | 'name-blocked' | 'room-full';
export type JoinResult = { readonly ok: true; readonly playerId: string } | { readonly ok: false; readonly error: JoinError };
export type SubmitResult = 'sent' | 'blocked' | 'empty' | 'too-late';
export type VoteResult = 'ok' | 'own-card' | 'too-late' | 'no-card';
