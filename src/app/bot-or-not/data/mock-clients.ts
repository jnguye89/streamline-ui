import { DestroyRef, Injectable, Signal, computed, inject, signal } from '@angular/core';
import { JoinResult, PrivateView, PublicState, Settings, SubmitResult, VoteResult } from '../core/types';
import { HostGameClient, PhoneGameClient } from './game-client';
import { MockRoom } from './mock-room';

const TICK_MS = 100;

/**
 * Runs one MockRoom in the browser for the preview: a virtual clock (1× or fast), a tick loop,
 * and signals for the TV and the phone. Phase 2 swaps the two clients below for Colyseus ones.
 */
@Injectable({ providedIn: 'root' })
export class MockRoomHost {
  /** Review only: run timers faster to see a whole game quickly. */
  readonly speed = signal(1);
  readonly now = signal(Date.now());
  /** The phone in the preview: the player who joined, or the player a review state shows. */
  readonly phonePlayerId = signal<string | null>(null);

  private readonly version = signal(0);
  /** Changes only when a different room is swapped in. */
  readonly roomSerial = signal(0);
  private readonly roomRef = signal<MockRoom>(this.createRoom());
  private virtual = Date.now();
  private lastReal = performance.now();
  private unsubscribe: () => void = () => undefined;

  readonly state: Signal<PublicState> = computed(() => {
    this.version();
    return this.roomRef().publicState();
  });

  readonly me: Signal<PrivateView | null> = computed(() => {
    this.version();
    const id = this.phonePlayerId();
    return id ? this.roomRef().privateFor(id) : null;
  });

  constructor() {
    this.watch(this.roomRef());
    const timer = setInterval(() => this.loop(), TICK_MS);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      this.unsubscribe();
    });
  }

  get room(): MockRoom {
    return this.roomRef();
  }

  /** The room clock (virtual). */
  readonly clock = (): number => this.virtual;

  /** A fresh live game: simulated players in the lobby, the phone not joined yet. */
  newGame(simPlayers: number, code?: string, opts: { simSkipAnswer?: number } = {}): void {
    const room = this.createRoom(code, opts.simSkipAnswer);
    room.addSimPlayers(simPlayers);
    this.setRoom(room, null);
  }

  /** Swap in a room (review states). */
  setRoom(room: MockRoom, phonePlayerId: string | null): void {
    room.rebaseClock(this.clock);
    this.roomRef.set(room);
    this.phonePlayerId.set(phonePlayerId);
    this.watch(room);
    this.roomSerial.update((v) => v + 1);
    this.version.update((v) => v + 1);
  }

  private createRoom(code?: string, simSkipAnswer?: number): MockRoom {
    return new MockRoom({ now: () => this.virtual, code, simSkipAnswer });
  }

  private watch(room: MockRoom): void {
    this.unsubscribe();
    this.unsubscribe = room.onChange(() => this.version.update((v) => v + 1));
  }

  private loop(): void {
    const real = performance.now();
    this.virtual += (real - this.lastReal) * this.speed();
    this.lastReal = real;
    this.now.set(this.virtual);
    this.roomRef().tick();
  }
}

function hostActions(host: MockRoomHost) {
  return {
    start: () => void host.room.start(),
    skip: () => host.room.skip(),
    pause: () => host.room.pause(),
    resume: () => host.room.resume(),
    hideCard: (id: string) => host.room.hideCard(id),
    removePlayer: (id: string) => host.room.removePlayer(id),
    updateSettings: (next: Partial<Settings>) => host.room.updateSettings(next),
    playAgain: () => void host.room.playAgain(),
    toLobby: () => host.room.toLobby(),
  };
}

/** The TV's client in the preview. */
@Injectable({ providedIn: 'root' })
export class MockHostClient implements HostGameClient {
  private readonly host = inject(MockRoomHost);
  readonly state = this.host.state;
  readonly now = this.host.now.asReadonly();
  private readonly actions = hostActions(this.host);
  readonly start = this.actions.start;
  readonly skip = this.actions.skip;
  readonly pause = this.actions.pause;
  readonly resume = this.actions.resume;
  readonly hideCard = this.actions.hideCard;
  readonly removePlayer = this.actions.removePlayer;
  readonly updateSettings = this.actions.updateSettings;
  readonly playAgain = this.actions.playAgain;
  readonly toLobby = this.actions.toLobby;
}

/** The phone's client in the preview (same room, in the same page). */
@Injectable({ providedIn: 'root' })
export class MockPhoneClient implements PhoneGameClient {
  private readonly host = inject(MockRoomHost);
  readonly roomCode = computed(() => this.host.state().code);
  readonly tvLive = computed(() => this.host.state().live);
  readonly state = computed(() => (this.host.phonePlayerId() ? this.host.state() : null));
  readonly me = this.host.me;
  readonly now = this.host.now.asReadonly();
  private readonly actions = hostActions(this.host);
  readonly start = this.actions.start;
  readonly skip = this.actions.skip;
  readonly pause = this.actions.pause;
  readonly resume = this.actions.resume;
  readonly hideCard = this.actions.hideCard;
  readonly removePlayer = this.actions.removePlayer;
  readonly updateSettings = this.actions.updateSettings;
  readonly playAgain = this.actions.playAgain;
  readonly toLobby = this.actions.toLobby;

  join(code: string, name: string): Promise<JoinResult> {
    if (code.trim().toUpperCase() !== this.host.room.code) return Promise.resolve({ ok: false, error: 'no-room' });
    const res = this.host.room.join(name);
    if (res.ok) this.host.phonePlayerId.set(res.playerId);
    return Promise.resolve(res);
  }

  submitAnswer(text: string): Promise<SubmitResult> {
    const id = this.host.phonePlayerId();
    return Promise.resolve(id ? this.host.room.submitAnswer(id, text) : 'too-late');
  }

  vote(cardId: string): Promise<VoteResult> {
    const id = this.host.phonePlayerId();
    return Promise.resolve(id ? this.host.room.vote(id, cardId) : 'too-late');
  }
}
