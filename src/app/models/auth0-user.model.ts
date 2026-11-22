export interface Auth0User {
    auth0UserId: string;
    username: string;
    lastSyncedAt?: Date;
    agoraUserId: number;
    /** Profile photo URL, mirrored from Auth0 by the API. */
    picture?: string | null;
}