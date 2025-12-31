import { HttpClient } from "@angular/common/http";
import { Injectable, NgZone } from "@angular/core";
import { environment } from "../../environments/environment";
import { LiveStream } from "../models/live-stream.model";
import { catchError, defer, EMPTY, exhaustMap, firstValueFrom, map, Observable, shareReplay, Subject, takeUntil, timer } from "rxjs";
import { PlayItem } from "../models/play-item.model";
import { AgoraTokenResponse } from "../models/agora/agora.model";

export type StreamUpdate = { id: number; phase: string; wowzaState?: string; errorMessage?: string; };

@Injectable({ providedIn: 'root' })
export class StreamService {
    private apiUrl = environment.baseUrl;
    private stop$ = new Subject<void>();
    constructor(private http: HttpClient, private zone: NgZone) { }

    ensureReady(channelName: string): Observable<AgoraTokenResponse> {
        return this.http.post<AgoraTokenResponse>(`${this.apiUrl}/stream/ensure`, { channelName });
    }

    async start(channelName: string, uid?: number) {
        // stop any existing heartbeat
        // this.stop();
        await this.publish(channelName);

        // fire immediately, then every 10s
        timer(0, 10_000).pipe(
            takeUntil(this.stop$),
            // exhaustMap prevents overlapping requests if one takes >10s
            exhaustMap(() =>
                firstValueFrom(this.http.post(`${this.apiUrl}/stream/heartbeat`, { channelName, uid })
                )
            )
        ).subscribe();
    }

    private publish(channelName: string): Promise<void> {
        return firstValueFrom(this.http.put<void>(`${this.apiUrl}/stream/publish`, { channelName }));
    }

    async stop(channelName?: string) {
        this.stop$.next();
        await firstValueFrom(this.http.put<void>(`${this.apiUrl}/stream/unpublish`, { channelName }));
    }

    getLiveStreams(): Observable<LiveStream[]> {
        // Change '/api/live/streams' to your actual endpoint path
        return this.http.get<LiveStream[]>(`${this.apiUrl}/stream/agora`).pipe(map(r => { return r.map(r => ({ ...r, type: 'live' } as LiveStream)); }));

    }
}
