import { InjectionToken, Signal } from '@angular/core';
import { JoinResult, PrivateView, PublicState, Settings, SubmitResult, VoteResult } from '../core/types';

/** Host tools. The TV owner has them; a phone gets them when hosting. */
export interface HostActions {
  start(): void;
  /** End the current timer now (answering, reveal, voting, results). */
  skip(): void;
  /** Menu open → timers wait. */
  pause(): void;
  resume(): void;
  hideCard(cardId: string): void;
  removePlayer(playerId: string): void;
  updateSettings(next: Partial<Settings>): void;
  playAgain(): void;
  toLobby(): void;
}

/**
 * What the TV needs. Phase 1: MockHostClient (no server).
 * Phase 2: a Colyseus client with the same shape, so no screen changes.
 */
export interface HostGameClient extends HostActions {
  readonly state: Signal<PublicState>;
  /** Server-synced clock, for timer rings. */
  readonly now: Signal<number>;
}

/** What a phone needs (web controller now, React Native in Phase 3). */
export interface PhoneGameClient extends HostActions {
  /** null until joined. */
  readonly state: Signal<PublicState | null>;
  readonly me: Signal<PrivateView | null>;
  readonly now: Signal<number>;
  /** Room code the phone opened with (from skriin.com/play/CODE). */
  readonly roomCode: Signal<string>;
  /** The host TV is live, so the join screen can say so before anyone joins. */
  readonly tvLive: Signal<boolean>;
  join(code: string, name: string): Promise<JoinResult>;
  submitAnswer(text: string): Promise<SubmitResult>;
  vote(cardId: string): Promise<VoteResult>;
}

export const HOST_GAME_CLIENT = new InjectionToken<HostGameClient>('HOST_GAME_CLIENT');
export const PHONE_GAME_CLIENT = new InjectionToken<PhoneGameClient>('PHONE_GAME_CLIENT');

/** Switches for things that are designed but not live yet. */
export interface BotOrNotFeatures {
  /** "Show your face on the TV?" on the phone join screen. Off until a video stack exists. */
  readonly phoneCamera: boolean;
}
export const BOT_OR_NOT_FEATURES = new InjectionToken<BotOrNotFeatures>('BOT_OR_NOT_FEATURES', {
  providedIn: 'root',
  factory: () => ({ phoneCamera: false }),
});
