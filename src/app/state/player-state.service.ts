// src/app/services/player-state.service.ts
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { PlayItem } from '../models/play-item.model';

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
    private readonly subject = new BehaviorSubject<PlayItem | null>(this.load());
    readonly current$ = this.subject.asObservable();

    /** Quick sync read without subscribing */
    get snapshot(): PlayItem | null {
        return this.subject.value;
    }

    /** Set entire state */
    set(state: PlayItem) {
        const next = { ...state, updatedAt: Date.now() };
        this.subject.next(next);
        this.save(next);
    }

    /** Partial update */
    patch(partial: Partial<PlayItem>) {
        const curr = this.snapshot as PlayItem;
        const next = { ...curr, ...partial } as PlayItem;
        this.subject.next(next);
        this.save(next);
    }

    clear() {
        this.subject.next(null);
        sessionStorage.removeItem(this.STORAGE_KEY);
    }

    private save(value: PlayItem) {
        try { sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify(value)); } catch { }
    }

    private load(): PlayItem | null {
        try {
            const raw = sessionStorage.getItem(this.STORAGE_KEY);
            return raw ? JSON.parse(raw) as PlayItem : null;
        } catch {
            return null;
        }
    }
}
