// src/app/services/call-orchestrator.service.ts
import { Injectable } from '@angular/core';
import { RtmService } from './rtm.service';
import { RtcService } from './rtc.service';
import { AgoraService } from './agora.service';
import { firstValueFrom, take } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class CallOrchestratorService {
    constructor(
        private tokenApi: AgoraService,
        private rtm: RtmService,
        private rtc: RtcService
    ) { }

    /**
     * User signs in → get tokens and log into RTM for presence/invites
     */
    async initForUser(uid: string) {
        // Use a dummy channel for token minting or mint RTM-only token endpoint
        const channel = 'presence';
        const { appId, rtmToken } = await firstValueFrom(
            this.tokenApi.createTokens(uid, channel)
        );
        await this.rtm.login(appId, uid, rtmToken);
    }

    /**
     * Start a call with selected users
     */
    async startCall(callerUid: string, invitees: string[], channel = `call_${crypto.randomUUID()}`, media: 'audio'|'video' = 'audio') {
        const { appId, rtcToken } = await firstValueFrom(
            this.tokenApi.createTokens(callerUid, channel)
        );

        await this.rtm.sendInvite(invitees, channel, media);   // <— ring them
        await this.rtc.join(appId, channel, callerUid, rtcToken, media === 'video');
        return { channel };
    }

    /**
     * Accept an incoming invite
     */
    async acceptInvite(myUid: string, channel: string, video = false) {
        const { appId, rtcToken } = await firstValueFrom(
            this.tokenApi.createTokens(myUid, channel)
        );
        await this.rtc.join(appId, channel, myUid, rtcToken, video);
    }

    async hangup() { await this.rtc.leave(); }
}
