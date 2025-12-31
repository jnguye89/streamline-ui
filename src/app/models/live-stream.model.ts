import { Auth0User } from "./auth0-user.model";

export interface LiveStream {
    id: number,
    channelName: string,
    user: Auth0User,
    status: 'created' | 'live' | 'ended' | 'error',
    createdAt: string,
    updatedAt?: string,
    lastHeartbeatAt?: string,
    type: 'live'
    // wowzaId: string,
    // broadcastLocation: string,
    // applicationName: string,
    // wssStreamUrl: string,
    // streamName: string,
    // phase: string,
    // lastWowzaState: string,
    // errorMessage: string,
    // isProvisioning: boolean,
    // provisonedUser: string
}