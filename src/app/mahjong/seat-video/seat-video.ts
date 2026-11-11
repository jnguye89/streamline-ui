import { InjectionToken, Provider, Signal, signal } from '@angular/core';
import { Seat } from '@skriin/mahjong-core';

/**
 * Camera tiles at the table. Phase 1: placeholders only (no stream).
 * Phase 3 plugs in the real-time stack (WebRTC) behind this interface; nothing else in the UI changes.
 * Always "camera" in UI text, never "webcam".
 */
export interface SeatVideo {
  /** Live camera for a seat, or null (bot, camera off, shutter closed, not connected yet). */
  stream(seat: Seat): Signal<MediaStream | null>;
}

export const SEAT_VIDEO = new InjectionToken<SeatVideo>('SEAT_VIDEO');

export class PlaceholderSeatVideo implements SeatVideo {
  private readonly none = signal<MediaStream | null>(null).asReadonly();
  stream(): Signal<MediaStream | null> {
    return this.none;
  }
}

export function providePlaceholderSeatVideo(): Provider {
  return { provide: SEAT_VIDEO, useClass: PlaceholderSeatVideo };
}
