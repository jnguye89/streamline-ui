// rtc.service.ts
import { Injectable } from '@angular/core';
import type AgoraRTCModule from 'agora-rtc-sdk-ng';
import type {
    IAgoraRTCClient,
    ILocalAudioTrack,
    ILocalVideoTrack,
    IAgoraRTCRemoteUser,
    UID,
} from 'agora-rtc-sdk-ng';
import { BehaviorSubject } from 'rxjs';
import { RecordingSocketService } from '../socket/recording.service';

@Injectable({ providedIn: 'root' })
export class RtcService {
    private agora?: typeof AgoraRTCModule;
    private client?: IAgoraRTCClient;
    private clientPromise?: Promise<IAgoraRTCClient>;
    private localAudio?: ILocalAudioTrack;
    private localVideo?: ILocalVideoTrack;

    /** Remote users we currently see */
    private remotes = new Map<UID, IAgoraRTCRemoteUser>();
    /** Emits current remote count */
    remoteCount$ = new BehaviorSubject<number>(0);

    /** Optional: automatically hang up when alone */
    autoHangupAfterMs = 1000; // set 0 to disable, or tweak (e.g., 3000–8000)
    private aloneTimer: ReturnType<typeof setTimeout> | null = null;
    private everHadRemote = false; // only auto-hang if we previously had someone

    onUserJoined?: (user: IAgoraRTCRemoteUser) => void;
    onUserLeft?: (uid: UID) => void;

    constructor(private socket: RecordingSocketService) {}

    private async getClient(): Promise<IAgoraRTCClient> {
        if (this.client) return this.client;
        if (this.clientPromise) return this.clientPromise;

        this.clientPromise = import('agora-rtc-sdk-ng')
          .then(({ default: AgoraRTC }) => {
              AgoraRTC.setLogLevel(0);
              this.agora = AgoraRTC;
              const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

              client.on('user-published', async (user, mediaType) => {
                  await this.subscribeAndRender(user, mediaType);
                  this.onUserJoined?.(user);
              });

              client.on('user-unpublished', (user, mediaType) => {
                  const el = document.getElementById(`remote-${user.uid}`);
                  if (el && mediaType === 'video') el.remove();
                  if (!user.audioTrack && !user.videoTrack) {
                      this.remotes.delete(user.uid);
                      this.flushRemoteCount();
                  }
                  this.flushRemoteCount();
                  this.onUserLeft?.(user.uid);
              });

              client.on('user-left', (user) => {
                  const el = document.getElementById(`remote-${user.uid}`);
                  if (el) el.remove();
                  this.remotes.delete(user.uid);
                  this.flushRemoteCount();
                  this.onUserLeft?.(user.uid);
              });

              this.client = client;
              return client;
          })
          .catch((error) => {
              this.clientPromise = undefined;
              throw error;
          });

        return this.clientPromise;
    }


    async watchStream(appId: string, channelName: string, token: string, uid: number) {
        const client = await this.getClient();
        // Audience = receive only
        await client.setClientRole("audience");
        await client.join(appId, channelName, token, uid);

        client.on("user-published", async (user, mediaType) => {
            await client.subscribe(user, mediaType);

            if (mediaType === "video") {
                user.videoTrack?.play("remote-player");
            }
            if (mediaType === "audio") {
                user.audioTrack?.play(); // audio doesn’t need a container
            }
        });

        client.on("user-unpublished", (user, mediaType) => {
            if (mediaType === "video") {
                // optional: clear your UI
                const el = document.getElementById("remote-player");
                if (el) el.innerHTML = "";
            }
        });
    }

    async stopWatching() {
        if (!this.client) return;
        this.client.removeAllListeners();
        await this.client.leave();
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
        const client = await this.getClient();
        // If mediaType provided (from event), subscribe to that one; otherwise subscribe to both that exist.
        if (mediaType) {
            await client.subscribe(user, mediaType);
        } else {
            if (user.audioTrack) await client.subscribe(user, 'audio');
            if (user.videoTrack) await client.subscribe(user, 'video');
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
                if (this.remotes.size === 0) {
                    void this.leave().catch(() => undefined);
                }
            }, this.autoHangupAfterMs);
        }
    }

    async join(appId: string, channel: string, uid: UID, token: string, withVideo = true) {
        const client = await this.getClient();
        const agora = this.agora;
        if (!agora) throw new Error('Agora RTC is unavailable.');
        this.socket.joinRoom(channel);
        await client.join(appId, channel, token, uid);

        this.localAudio = await agora.createMicrophoneAudioTrack();
        if (withVideo) this.localVideo = await agora.createCameraVideoTrack();

        const tracks = [this.localAudio, this.localVideo].filter(
            Boolean
        ) as (ILocalAudioTrack | ILocalVideoTrack)[];
        if (tracks.length) {
            await client.publish(tracks);
        }

        if (this.localVideo) {
            const container = document.getElementById('remote-container');
            if (container) {
                const elId = `remote-${uid}`;

                let tile = document.getElementById(elId) as HTMLDivElement | null;
                if (!tile) {
                    tile = document.createElement('div');
                    tile.id = elId;
                    tile.classList.add('remote-tile');
                    container.appendChild(tile);
                }

                this.localVideo.play(tile);
            }
        }

        // Subscribe to users who published before this client joined.
        for (const u of client.remoteUsers) {
            if (u.videoTrack) {
                await client.subscribe(u, 'video');
                const elId = `remote-${u.uid}`;
                if (!document.getElementById(elId)) {
                    const div = document.createElement('div');
                    div.id = elId;
                    div.classList.add('remote-tile');
                    document.getElementById('remote-container')?.appendChild(div);
                }
                u.videoTrack.play(elId);
            }
            if (u.audioTrack) {
                await client.subscribe(u, 'audio');
                u.audioTrack.play();
            }
        }

    }


    isConnected() {
        return this.client?.connectionState === 'CONNECTED';
    }

    async leave() {
        if (!this.client) return;
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
