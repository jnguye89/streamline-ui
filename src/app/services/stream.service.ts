import { HttpClient } from "@angular/common/http";
import { Injectable, NgZone } from "@angular/core";
import { environment } from "../../environments/environment";
import { LiveStream } from "../models/live-stream.model";
import { defer, firstValueFrom, map, Observable, shareReplay } from "rxjs";
import { PlayItem } from "../models/play-item.model";

export type StreamUpdate = { id: number; phase: string; wowzaState?: string; errorMessage?: string; };

@Injectable({ providedIn: 'root' })
export class StreamService {
    private sessionId: string = '';
    private es?: EventSource;
    private apiUrl = environment.baseUrl;
    constructor(private http: HttpClient, private zone: NgZone) { }

    private readonly availableStreamOnce$ = defer(() =>
        this.http.post<LiveStream>(`${this.apiUrl}/stream/ensure-ready`, null)
    ).pipe(
        // runs only on the first subscription; later subscribers get the cached value
        shareReplay({ bufferSize: 1, refCount: false })
    );

    getAvailableStreamOnce(): Observable<LiveStream> {
        return this.availableStreamOnce$;
    }

    updates$(id: number): Observable<StreamUpdate> {
        return new Observable<StreamUpdate>((observer) => {
            // TODO: add auhorization headers? make public()??
            const es = new EventSource(`${this.apiUrl}/stream/${id}/updates`, { withCredentials: true });
            es.onmessage = (evt) => {
                // Run change detection
                this.zone.run(() => observer.next(JSON.parse(evt.data)));
            };
            es.onerror = (e) => {
                this.zone.run(() => observer.error(e));
                es.close();
            };
            return () => es.close();
        });
    }

    async start(id: number): Promise<void> {
        const res = await firstValueFrom(this.http.put<{ sessionId: string }>(`${this.apiUrl}/stream/${id}/start`, null));
        this.sessionId = res.sessionId;
        this.es = new EventSource(
            `${this.apiUrl}/stream/${id}/publisher-presence?sessionId=${encodeURIComponent(this.sessionId)}`,
            { withCredentials: true }
        );
        this.es.onopen = () => console.debug('presence open');
        this.es.onerror = () => console.debug('presence error');
        this.es.addEventListener('ka', () => { }); // keepalive

        // Belt & suspenders: tell server on pagehide
        const off = () => {
            if (this.sessionId) {
                const payload = JSON.stringify({ sessionId: this.sessionId });
                navigator.sendBeacon(`${this.apiUrl}/stream/${id}/publish/leave`,
                    new Blob([payload], { type: 'application/json' })
                );
            }
            this.es?.close();
            window.removeEventListener('pagehide', off, { capture: true } as any);
        };
        window.addEventListener('pagehide', off, { capture: true });
        // return this.http.put<void>(`${this.apiUrl}/stream/${id}/start`, null);
    }

    stop(id: number): Observable<void> {
        return this.http.put<void>(`${this.apiUrl}/stream/${id}/stop`, null);
    }

    getLiveStreams(): Observable<PlayItem[]> {
        // Change '/api/live/streams' to your actual endpoint path
        return this.http.get<LiveStream[]>(`${this.apiUrl}/stream`).pipe(
            map(rows =>
                rows
                    .filter(r => !!r.wssStreamUrl)
                    .map(r => ({
                        type: 'live',
                        id: r.id,
                        title: r.streamName,
                        user: r.provisonedUser,
                        wssUrl: r.wssStreamUrl,
                        applicationName: r.applicationName,
                        streamName: r.streamName
                    }) as PlayItem)
            )
        );
    }
}
