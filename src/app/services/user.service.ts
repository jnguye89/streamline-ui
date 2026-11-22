import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { Auth0User } from "../models/auth0-user.model";
import { StreamKeyPayload, StreamPlatform } from "../models/stream-key.model";
import { environment } from "../../environments/environment";

@Injectable({
    providedIn: 'root'
})
export class UserService {
    constructor(private http: HttpClient) { }

    getUsers(): Observable<Auth0User[]> {
        return this.http.get<Auth0User[]>(`${environment.baseUrl}/user`)
    }

    getAuth0User(authId: string): Observable<Auth0User> {
        return this.http.get<Auth0User>(`${environment.baseUrl}/user/auth0/${authId}`);
    }

    getAgoraUser(agoraId: string): Observable<Auth0User> {
        return this.http.get<Auth0User>(`${environment.baseUrl}/user/agora/${agoraId}`);
    }

    searchUsers(query: string): Observable<Auth0User[]> {
        return this.http.get<Auth0User[]>(`${environment.baseUrl}/user/search`, {
            params: { q: query }
        });
    }

    saveStreamKey(payload: StreamKeyPayload): Observable<void> {
        return this.http.post<void>(`${environment.baseUrl}/user/stream-keys`, payload);
    }

    getStreamKeys(): Observable<StreamKeyPayload[]> {
        return this.http.get<StreamKeyPayload[]>(`${environment.baseUrl}/user/stream-keys`);
    }

    /** On or off for the next live, saved on the account so every device agrees. */
    setStreamKeyEnabled(platform: StreamPlatform, enabled: boolean): Observable<StreamKeyPayload> {
        return this.http.patch<StreamKeyPayload>(
            `${environment.baseUrl}/user/stream-keys/${encodeURIComponent(platform)}`, { enabled });
    }

    /** A short code a phone (same account) can use at skriin.com/link to send this platform's key. */
    createStreamKeyLink(platform: StreamPlatform): Observable<{ code: string; platform: StreamPlatform; expiresInSeconds: number }> {
        return this.http.post<{ code: string; platform: StreamPlatform; expiresInSeconds: number }>(
            `${environment.baseUrl}/user/stream-keys/link`, { platform });
    }

    /** Phone (skriin.com/link): which platform a TV code is for. 404 if expired or another account's. */
    lookupStreamKeyLink(code: string): Observable<{ code: string; platform: StreamPlatform; requiresUrl: boolean; status: 'waiting' | 'done' }> {
        return this.http.get<{ code: string; platform: StreamPlatform; requiresUrl: boolean; status: 'waiting' | 'done' }>(
            `${environment.baseUrl}/user/stream-keys/link/${encodeURIComponent(code)}`);
    }

    /** Phone (skriin.com/link): send the key for a TV code; the TV picks it up by itself. */
    sendStreamKeyLink(code: string, streamKey: string, streamUrl?: string): Observable<{ platform: StreamPlatform }> {
        return this.http.post<{ platform: StreamPlatform }>(
            `${environment.baseUrl}/user/stream-keys/link/${encodeURIComponent(code)}`,
            { streamKey, streamUrl: streamUrl || undefined });
    }

    /** Has the phone sent the key for this code yet? "expired" once the code is gone. */
    getStreamKeyLinkStatus(code: string): Observable<{ status: 'waiting' | 'done' | 'expired' }> {
        return this.http.get<{ status: 'waiting' | 'done' | 'expired' }>(
            `${environment.baseUrl}/user/stream-keys/link/${encodeURIComponent(code)}/status`);
    }
}