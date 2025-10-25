/* agora.service.ts */
import { Injectable } from '@angular/core';
import AgoraRTC, { ILocalTrack, IAgoraRTCClient } from 'agora-rtc-sdk-ng';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { AgoraTokenResponse } from '../../models/agora/agora.model';

@Injectable({
    providedIn: 'root'
})
export class AgoraService {
    private client: IAgoraRTCClient;
    private appId = environment.AgoraAppId

    private channelJoinedSource = new BehaviorSubject<boolean>(false);
    channelJoined$ = this.channelJoinedSource.asObservable();

    constructor(private http: HttpClient) {
        if (this.appId == '')
            console.error('APPID REQUIRED -- Open AgoraService.ts and update appId ')
        this.client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp9' })
    }

    async joinChannel(channelName: string, token: string | null, uid: string | null) {
        await this.client.join(this.appId, channelName, token, uid)
        this.channelJoinedSource.next(true)
    }

    async leaveChannel() {
        await this.client.leave()
        this.channelJoinedSource.next(false)
    }

    setupLocalTracks(): Promise<ILocalTrack[]> {
        return AgoraRTC.createMicrophoneAndCameraTracks();
    }

    getClient() {
        return this.client
    }

    createTokens(uid: string, channel: string): Observable<AgoraTokenResponse> {
        return this.http.post<AgoraTokenResponse>(
            `${environment.baseUrl}/call/agora/token`,
            { uid, channel }
        );
    }
}