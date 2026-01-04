import { Injectable } from '@angular/core';
import AgoraRTC, { IAgoraRTCClient, IAgoraRTCRemoteUser } from 'agora-rtc-sdk-ng';
import { HttpClient } from '@angular/common/http';
import { AgoraTokenResponse } from '../../models/agora/agora.model';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AgoraWatchService {
    private client: IAgoraRTCClient | null = null;
    private containerEl: HTMLElement | null = null;

    constructor(private http: HttpClient) { }

    /** Call your backend to get an audience token for this stream */
    getWatchToken(streamName: string, uid: number) {
        return this.http.post<AgoraTokenResponse>(`${environment.baseUrl}/call/agora/token`, { channel: streamName, uid });
    }

    async watch(channelName: string, containerEl: HTMLElement) {
        this.clearContainer();
        // Always leave any previous channel before joining a new one
        var random = Math.floor(Math.random() * 100000);
        await this.stop();

        this.containerEl = containerEl;
        this.client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });

        // bind events
        this.client.on('user-published', this.onUserPublished);
        this.client.on('user-unpublished', this.onUserUnpublished);
        this.client.on('user-left', this.onUserLeft);

        // get token for viewer
        const joinInfo = await this.getWatchToken(channelName, random).toPromise();
        if (!joinInfo) throw new Error('Missing joinInfo');

        await this.client.setClientRole('audience');
        await this.client.join(joinInfo.appId, channelName, joinInfo.rtcToken, random);

        // In case the host was already publishing before we attached listeners:
        await this.subscribeExistingRemoteUsers();
    }

    async stop() {
        if (!this.client) {
            this.clearContainer();
            return;
        }

        try {
            this.client.off('user-published', this.onUserPublished);
            this.client.off('user-unpublished', this.onUserUnpublished);
            this.client.off('user-left', this.onUserLeft);
        } catch { }

        try {
            await this.client.leave();
        } catch { }

        this.client = null;
        this.clearContainer();
    }

    // ---------- Internals ----------

    private onUserPublished = async (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video') => {
        if (!this.client) return;

        await this.client.subscribe(user, mediaType);

        if (mediaType === 'video') {
            // render into container; if multiple broadcasters, each gets a tile
            const el = this.ensureRemoteTile(user.uid);
            user.videoTrack?.play(el);
        }

        if (mediaType === 'audio') {
            user.audioTrack?.play(); // no element needed
        }
    };

    private onUserUnpublished = (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video') => {
        if (mediaType === 'video') {
            this.removeRemoteTile(user.uid);
        }
    };

    private onUserLeft = (user: IAgoraRTCRemoteUser) => {
        this.removeRemoteTile(user.uid);
    };

    private async subscribeExistingRemoteUsers() {
        if (!this.client) return;

        for (const user of this.client.remoteUsers) {
            if (user.hasVideo) {
                await this.client.subscribe(user, 'video');
                const el = this.ensureRemoteTile(user.uid);
                user.videoTrack?.play(el);
            }
            if (user.hasAudio) {
                await this.client.subscribe(user, 'audio');
                user.audioTrack?.play();
            }
        }
    }

    private ensureRemoteTile(uid: string | number) {
        if (!this.containerEl) throw new Error('Missing containerEl');

        const id = `remote-${uid}`;
        let el = document.getElementById(id) as HTMLDivElement | null;
        if (!el) {
            el = document.createElement('div');
            el.id = id;
            el.classList.add('remote-tile');

            // Optional: if you want 2x2-ish layout, don’t force 100% height on each tile.
            // Let CSS grid control sizing.
            this.containerEl.appendChild(el);
        }
        return el;
    }

    private removeRemoteTile(uid: string | number) {
        const el = document.getElementById(`remote-${uid}`);
        if (el && el.parentElement) el.parentElement.removeChild(el);
    }

    private clearContainer() {
        if (this.containerEl) this.containerEl.innerHTML = '';
    }
}
