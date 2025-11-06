// rtc.service.ts
import { Injectable } from '@angular/core';
import AgoraRTC, {
    IAgoraRTCClient,
    ILocalAudioTrack,
    ILocalVideoTrack,
    IAgoraRTCRemoteUser,
    UID,
} from 'agora-rtc-sdk-ng';
import { BehaviorSubject } from 'rxjs';

AgoraRTC.setLogLevel(0);

@Injectable({ providedIn: 'root' })
export class RtcService {
    private client: IAgoraRTCClient = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
    private localAudio?: ILocalAudioTrack;
    private localVideo?: ILocalVideoTrack;

    /** Remote users we currently see */
    private remotes = new Map<UID, IAgoraRTCRemoteUser>();
    /** Emits current remote count */
    remoteCount$ = new BehaviorSubject<number>(0);

    /** Optional: automatically hang up when alone */
    autoHangupAfterMs = 1000; // set 0 to disable, or tweak (e.g., 3000–8000)
    private aloneTimer: any = null;
    private everHadRemote = false; // only auto-hang if we previously had someone

    onUserJoined?: (user: IAgoraRTCRemoteUser) => void;
    onUserLeft?: (uid: UID) => void;

    constructor() {
        // this.client
        // Subscribe when new publications happen AFTER you're already in
        this.client.on('user-published', async (user, mediaType) => {
            await this.subscribeAndRender(user, mediaType);
            this.onUserJoined?.(user);
        });
        
        this.client.on('user-unpublished', (user, mediaType) => {
            // Optional: if video unpublished, you can remove their tile
            const el = document.getElementById(`remote-${user.uid}`);
            if (el && mediaType === 'video') el.remove();
            if (!user.audioTrack && !user.videoTrack) {
                this.remotes.delete(user.uid);
                this.flushRemoteCount();
            }
            this.flushRemoteCount();
            this.onUserLeft?.(user.uid);
        });

        this.client.on('user-left', (user) => {
            const el = document.getElementById(`remote-${user.uid}`);
            if (el) el.remove();
            this.remotes.delete(user.uid);
            this.flushRemoteCount();
            this.onUserLeft?.(user.uid);
        });
    }

    private ensureRemoteTile(uid: UID) {
        const id = `remote-${uid}`;
        let el = document.getElementById(id);
        if (!el) {
            el = document.createElement('div');
            el.id = id;
            el.classList.add('remote-tile');
            // Make sure this exists in your page template:
            document.getElementById('remote-container')?.appendChild(el);
        }
        return id;
    }

    private async subscribeAndRender(user: IAgoraRTCRemoteUser, mediaType?: 'audio' | 'video' | 'datachannel') {
        // If mediaType provided (from event), subscribe to that one; otherwise subscribe to both that exist.
        if (mediaType) {
            await this.client.subscribe(user, mediaType);
        } else {
            if (user.audioTrack) await this.client.subscribe(user, 'audio');
            if (user.videoTrack) await this.client.subscribe(user, 'video');
        }
        // Track presence when they publish anything (audio/video)
        this.remotes.set(user.uid, user);
        this.flushRemoteCount();

        if (user.videoTrack) {
            const elId = this.ensureRemoteTile(user.uid);
            user.videoTrack.play(elId);
        }
        if (user.audioTrack) {
            user.audioTrack.play(); // audio doesn’t need a container
        }
    }

    private flushRemoteCount() {
        const count = this.remotes.size;
        this.remoteCount$.next(count);

        if (count > 0) {
            this.everHadRemote = true;
            if (this.aloneTimer) { clearTimeout(this.aloneTimer); this.aloneTimer = null; }
            return;
        }
        // count == 0; only auto-hang if we were in a call with someone before
        if (this.everHadRemote && this.autoHangupAfterMs > 0 && !this.aloneTimer) {
            this.aloneTimer = setTimeout(() => {
                this.aloneTimer = null;
                // leave only if still alone
                if (this.remotes.size === 0) this.leave();
            }, this.autoHangupAfterMs);
        }
    }

    async join(appId: string, channel: string, uid: UID, token: string, withVideo = true) {
        await this.client.join(appId, channel, token, uid);

        this.localAudio = await AgoraRTC.createMicrophoneAudioTrack();
        if (withVideo) this.localVideo = await AgoraRTC.createCameraVideoTrack();

        const tracks = [this.localAudio, this.localVideo].filter(Boolean) as (ILocalAudioTrack | ILocalVideoTrack)[];
        if (tracks.length) await this.client.publish(tracks);

        if (this.localVideo) {
            const el = document.getElementById('local-player');
            if (el) this.localVideo.play(el);
        }

        // 👇 ADD THIS: subscribe to users who were already published before you arrived
        for (const u of this.client.remoteUsers) {
            // subscribe to both if available
            console.log('u.videoTrack', u.videoTrack)
            if (u.videoTrack) {
                console.log('inside if u.videoTrack', u.videoTrack)
                await this.client.subscribe(u, 'video');
                const elId = `remote-${u.uid}`;
                console.log('elId', elId);
                if (!document.getElementById(elId)) {
                    console.log('creating div');
                    const div = document.createElement('div');
                    div.id = elId;
                    div.classList.add('remote-tile');
                    document.getElementById('remote-container')?.appendChild(div);
                }
                u.videoTrack.play(elId);
            }
            if (u.audioTrack) {
                await this.client.subscribe(u, 'audio');
                u.audioTrack.play();
            }
        }

        console.log(`✅ Joined channel ${channel} as ${uid}`);
    }

    isConnected() {
        return this.client.connectionState === 'CONNECTED';
    }

    async leave() {
        try {
            await this.client.unpublish();
        } catch (e) {
            console.warn('unpublish failed', e);
        } finally {
            this.localAudio?.close();
            this.localVideo?.close();
            this.localAudio = undefined;
            this.localVideo = undefined;
            await this.client.leave();
            console.log('👋 Left RTC channel');
        }
    }

    async toggleMic(mute: boolean) {
        if (!this.localAudio) return;
        await this.localAudio.setEnabled(!mute);
    }

    async toggleCam(mute: boolean) {
        if (!this.localVideo) return;
        await this.localVideo.setEnabled(!mute);
    }
}
