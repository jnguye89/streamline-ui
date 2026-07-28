import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { Auth0User } from "../models/auth0-user.model";
import { StreamKeyPayload } from "../models/stream-key.model";
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
}