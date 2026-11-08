import { InjectionToken } from '@angular/core';
import { PlayerId } from '../core/api';

/**
 * Swappable pieces that skriin.com provides later. Each has a working default for the preview.
 */

/**
 * Faces on seats. No video stack exists yet (approved answer 8), so the default returns null and
 * every seat shows its avatar initial. When a stack is chosen, provide SEAT_VIDEO and the seat
 * tiles play the stream without other UI changes.
 */
export interface SeatVideo {
  stream(playerId: PlayerId): MediaStream | null;
}

export const SEAT_VIDEO = new InjectionToken<SeatVideo>('SEAT_VIDEO', {
  providedIn: 'root',
  factory: () => ({ stream: () => null }),
});

/**
 * 18+ confirmation (approved answer 6): store only the yes and its date, never a birth date.
 * Preview default: this browser. skriin.com: the account on the server (Phase 3), same interface.
 */
export interface AgeCheckStore {
  /** ISO date of the yes, or null if never confirmed. */
  confirmedAt(): string | null;
  confirm(): void;
}

const AGE_KEY = 'skriin.poker.age18';

export const AGE_CHECK_STORE = new InjectionToken<AgeCheckStore>('AGE_CHECK_STORE', {
  providedIn: 'root',
  factory: () => {
    let memory: string | null = null;
    return {
      confirmedAt: () => {
        try {
          return globalThis.localStorage?.getItem(AGE_KEY) ?? memory;
        } catch {
          return memory;
        }
      },
      confirm: () => {
        memory = new Date().toISOString().slice(0, 10);
        try {
          globalThis.localStorage?.setItem(AGE_KEY, memory);
        } catch {
          /* storage blocked: the yes lasts for this visit */
        }
      },
    };
  },
});

/** Join link format shared by every game on /play/ (approved answer 9): 4 consonants. */
export function joinUrl(code: string): string {
  return `skriin.com/play/${code}`;
}
