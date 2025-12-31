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

    /** Quick sync read without subscribing */
    get snapshot(): PlayItem | LiveStream | null {
        return this.subject.value;
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
}
