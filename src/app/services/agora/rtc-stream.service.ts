import { Injectable } from "@angular/core";
import AgoraRTC, { IAgoraRTCClient, ICameraVideoTrack, IMicrophoneAudioTrack } from "agora-rtc-sdk-ng";
import { BehaviorSubject } from "rxjs";

@Injectable({ providedIn: "root" })
export class RtcStreamService {
    private localTracks?: [IMicrophoneAudioTrack, ICameraVideoTrack];
    private client: IAgoraRTCClient = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
    isLive$: BehaviorSubject<boolean> = new BehaviorSubject(false);
    constructor() {
        // this.client.on()
        this.client.on('user-published', async (user, mediaType) => {
            console.log('even user published', user, mediaType);
            this.isLive$.next(true);
        });
        this.client.on('user-unpublished', async (user, mediaType) => {
            this.isLive$.next(false);
        });
    }

    async join(appId: string, channelName: string, rtcToken: string, uid: number) {
        console.log('joining channel', appId, channelName, rtcToken, uid);
        this.localTracks = await this.getLocalTracks();
        this.localTracks.forEach(track => {
            track.play('local-player'); // attach to your preview element
        });
        try {
            await this.client.setClientRole('host'); // host can publish :contentReference[oaicite:3]{index=3}
            await this.client.join(appId, channelName, rtcToken, uid);
            console.log("joined OK", { channelName, uid });
        } catch (e) {
            console.error("join failed", e);
            throw e;
        }
    }

    async startPublish() {
        try {
            if (!this.localTracks) this.localTracks = await this.getLocalTracks();

            const [mic, cam] = this.localTracks;
            cam.play('local-player');
            mic.play();

            await this.client.publish(this.localTracks);
            console.log("publish OK");
        } catch (e) {
            console.error("publish failed", e);
            throw e;
        }
        this.isLive$.next(true);

        // call backend to update status
    }

    async stopPublish() {
        await this.client.unpublish(this.localTracks!);
        // this.localTracks?.forEach(track => {
        //     track.stop();
        //     track.close();
        // });

        this.isLive$.next(false);
        // call backend to update status
    }

    private async getLocalTracks() {
        if (!this.localTracks) {
            this.localTracks = await AgoraRTC.createMicrophoneAndCameraTracks();
        }
        return this.localTracks;
    }
}