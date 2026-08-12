/* agora.service.ts */
import { Injectable } from '@angular/core';
import type { ILocalTrack, IAgoraRTCClient } from 'agora-rtc-sdk-ng';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { AgoraTokenResponse } from '../../models/agora/agora.model';

@Injectable({
    providedIn: 'root'
})
export class AgoraService {
    private clientPromise?: Promise<IAgoraRTCClient>;
    private appId = environment.AgoraAppId

    private channelJoinedSource = new BehaviorSubject<boolean>(false);
    channelJoined$ = this.channelJoinedSource.asObservable();

    constructor(private http: HttpClient) {
        if (this.appId == '')
            console.error('APPID REQUIRED -- Open AgoraService.ts and update appId ')
    }

    private async loadClient(): Promise<IAgoraRTCClient> {
        this.clientPromise ??= import('agora-rtc-sdk-ng').then(({ default: AgoraRTC }) =>
            AgoraRTC.createClient({ mode: 'rtc', codec: 'vp9' })
        );
        return this.clientPromise;
    }

    async joinChannel(channelName: string, token: string | null, uid: string | null) {
        const client = await this.loadClient();
        await client.join(this.appId, channelName, token, uid)
        this.channelJoinedSource.next(true)
    }

    async leaveChannel() {
        const client = await this.loadClient();
        await client.leave()
        this.channelJoinedSource.next(false)
    }

    async setupLocalTracks(): Promise<ILocalTrack[]> {
        const { default: AgoraRTC } = await import('agora-rtc-sdk-ng');
        return AgoraRTC.createMicrophoneAndCameraTracks();
    }

    getClient() {
        return this.loadClient();
    }

    createTokens(uid: number, channel: string): Observable<AgoraTokenResponse> {
        return this.http.post<AgoraTokenResponse>(
            `${environment.baseUrl}/call/agora/token`,
            { uid, channel }
        );
    }
}
