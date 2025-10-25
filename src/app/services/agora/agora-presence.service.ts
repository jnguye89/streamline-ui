// presence.service.ts (standalone Angular service sketch)
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import Signaling from 'signaling'; // or Signaling 2.x client
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AgoraPresenceService {
    private client!: any;
    onlineMap$ = new BehaviorSubject<Map<string, 'online' | 'offline' | 'busy'>>(new Map());

    async login(uid: string, rtmToken: string) {
        this.client = await Signaling.createInstance(environment.AgoraAppId);
        await this.client.login({ uid, token: rtmToken });
        await this.client.setPresenceStatus('online');               // API varies by SDK version
        await this.subscribeLobbyPresence('skriin-lobby');           // channel for availability
    }

    private async subscribeLobbyPresence(channel: string) {
        const ch = await this.client.presence.join(channel);         // join presence channel
        ch.on('member_joined', (uid: string) => this.set(uid, 'online'));
        ch.on('member_left', (uid: string) => this.set(uid, 'offline'));
        ch.on('status_changed', (uid: string, status: string) => this.set(uid, status as any));
        const snapshot = await ch.getMembers();
        // this.hydrate(snapshot);                                      // initial roster
    }

    private set(uid: string, status: 'online' | 'offline' | 'busy') {
        const map = new Map(this.onlineMap$.value);
        map.set(uid, status);
        this.onlineMap$.next(map);
    }
}
