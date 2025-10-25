// src/app/models/agora.models.ts
export interface AgoraTokenResponse {
    appId: string;
    rtcToken: string;
    rtmToken: string;
    expireAt: number;
}
