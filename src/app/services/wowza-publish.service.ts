// wowza-webrtc.service.ts
import { Injectable, NgZone, inject } from '@angular/core';
import { BehaviorSubject, distinctUntilChanged, map, Subject, tap } from 'rxjs';
import { WowzaError } from '../models/wowza-error.model';
import { WebRtcState } from '../models/webrtc-state.model';

declare const WowzaWebRTC: any;

export type ConnectionState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';

@Injectable({ providedIn: 'root' })
export class WowzaPublishService {
    private zone = inject(NgZone);

    private connectionState$ = new BehaviorSubject<ConnectionState>('disconnected');
    private readonly _isLive$ = this.connectionState$.pipe(
        tap(s => console.log('islive in service', s)),
        map(s => s === 'connected'),
        distinctUntilChanged()
    );
    public get isLive$() {
        return this._isLive$;
    }

    private errorSubject = new Subject<WowzaError>();
    readonly errors$ = this.errorSubject.asObservable();

    private initialized = false;

    init(state: WebRtcState) {
        if (!this.initialized) {
            WowzaWebRTC.on({
                onStateChanged: ({ connectionState }: { connectionState: ConnectionState }) => {
                    this.zone.run(() => {
                        this.connectionState$.next(connectionState);
                        if (connectionState === 'failed') {
                            this.emitError({ message: 'Failed to connect to Wowza.', code: 'CONNECTION_FAILED' });
                        }
                    });
                },
                onError: (error: any) => this.emitError({ message: error.message, code: 'CONNECTION_FAILED' }),
            });
            this.initialized = true;
        }

        WowzaWebRTC.set({
            videoElementPublish: state.videoElementPublish,
            sdpURL: state.sdpUrl,
            streamInfo: { applicationName: state.applicationName, streamName: state.streamName }
        });
    }

    startPublish() {
        try {
            WowzaWebRTC.start();
        } catch (e) {
            this.emitError(this.formatWowzaError(e));
        }
    }

    stopPublish() {
        try {
            WowzaWebRTC.stop();
        } catch (e) {
            this.emitError(this.formatWowzaError(e));
        }
    }

    private emitError(err: WowzaError) {
        this.zone.run(() => this.errorSubject.next(err));
    }

    private formatWowzaError(e: any): WowzaError {
        if (typeof e === 'string') return { message: e };
        if (e?.message) return { message: e.message, code: e.code, details: e };
        return { message: 'Unexpected streaming error.', details: e };
    }
}
