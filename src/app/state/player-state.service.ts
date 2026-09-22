// src/app/services/player-state.service.ts
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { PlayItem } from '../models/play-item.model';
import { LiveStream } from '../models/live-stream.model';

export type PlayerTab = 'watch' | 'profile';
// export interface VideoState {
//     id: string;
//     title?: string;
//     positionSec?: number; // playback position
//     tab?: PlayerTab;
//     updatedAt: number;
// }

@Injectable({ providedIn: 'root' })
export class PlayerStateService {
    private readonly STORAGE_KEY = 'player:current';
    private readonly subject = new BehaviorSubject<PlayItem | LiveStream | null>(this.load());
    readonly current$ = this.subject.asObservable();

    // Volume is stored separately from `current` (its own sessionStorage
    // key, own subject) since it's a player-wide preference, not tied to
    // whatever item happens to be playing - it needs to survive not just
    // page reloads but also switching what's on screen. Default is 100 to
    // match every playback surface's own out-of-the-box default (native
    // <video>.volume, a fresh YT.Player) so a viewer who's never touched
    // volume sees the same starting point either way.
    private readonly VOLUME_STORAGE_KEY = 'player:volume';
    private readonly volumeSubject = new BehaviorSubject<number>(this.loadVolume());
    readonly volume$ = this.volumeSubject.asObservable();

    /** Quick sync read without subscribing */
    get snapshot(): PlayItem | LiveStream | null {
        return this.subject.value;
    }

    /** Quick sync read of the current 0-100 volume, without subscribing. */
    get volume(): number {
        return this.volumeSubject.value;
    }

    /**
     * Persists a 0-100 volume level (sessionStorage, same lifetime as
     * `current` above) so it survives navigating away from and back to a
     * player page - e.g. Watch's D-pad up/down volume control (see
     * WatchComponent.adjustVolume) would otherwise reset to its field
     * initializer's default every time the component is torn down and
     * recreated by a route change.
     */
    setVolume(value: number): void {
        const clamped = Math.min(100, Math.max(0, value));
        this.volumeSubject.next(clamped);
        this.saveVolume(clamped);
    }

    /** Set entire state */
    set(state: PlayItem | LiveStream) {
        const next = { ...state, updatedAt: new Date().toISOString() };
        this.subject.next(next);
        this.save(next);
    }

    /** Partial update */
    patch(partial: Partial<PlayItem | LiveStream>) {
        const curr = this.snapshot as PlayItem | LiveStream;
        const next = { ...curr, ...partial, updatedAt: new Date().toISOString() } as PlayItem | LiveStream;
        this.subject.next(next);
        this.save(next);
    }

    clear() {
        this.subject.next(null);
        sessionStorage.removeItem(this.STORAGE_KEY);
    }

    private save(value: PlayItem | LiveStream) {
        try { sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify(value)); } catch { }
    }

    private load(): PlayItem | LiveStream | null {
        try {
            const raw = sessionStorage.getItem(this.STORAGE_KEY);
            return raw ? JSON.parse(raw) as PlayItem : null;
        } catch {
            return null;
        }
    }

    private saveVolume(value: number) {
        try { sessionStorage.setItem(this.VOLUME_STORAGE_KEY, String(value)); } catch { }
    }

    private loadVolume(): number {
        try {
            const raw = sessionStorage.getItem(this.VOLUME_STORAGE_KEY);
            const parsed = raw !== null ? Number(raw) : NaN;
            return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 100;
        } catch {
            return 100;
        }
    }
}
