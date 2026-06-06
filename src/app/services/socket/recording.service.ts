import { Injectable, OnDestroy } from "@angular/core";
import { BehaviorSubject, Subject } from "rxjs";
import { io, Socket } from "socket.io-client";
import { environment } from "../../../environments/environment";
import { DeviceAuthService } from "../device-auth.service";

export interface RoomUserJoined {
    userId: string;
    socketId: string;
    roomId: string;
}

export interface RecordingEvent {
    userId: string;
    socketId: string;
    roomId: string;
}

@Injectable({
    providedIn: 'root'
})
export class RecordingSocketService implements OnDestroy {
    private apiBaseUrl = environment.baseUrl;
    private socket?: Socket;
    private destroyed$ = new Subject<void>();

    private connected$ = new BehaviorSubject<boolean>(false);

    roomUserJoined$ = new Subject<RoomUserJoined>();
    roomUserLeft$ = new Subject<RoomUserJoined>();
    recordingStarted$ = new Subject<RecordingEvent>();
    recordingStopped$ = new Subject<RecordingEvent>();

    constructor(private deviceAuth: DeviceAuthService) { }

    connect(): void {
        if (this.socket?.connected) {
            return;
        }

        const token = this.deviceAuth.getAccessToken();

        this.socket = io(`${this.apiBaseUrl}/ws`, {
            auth: { token },
            transports: ['websocket'],
        });

        this.socket.on('connect', () => {
            this.connected$.next(true);
            console.log('[WS] connected', this.socket?.id);
        });

        this.socket.on('disconnect', () => {
            this.connected$.next(false);
            console.log('[WS] disconnected');
        });

        this.socket.on('room:user-joined', (payload: RoomUserJoined) => {
            this.roomUserJoined$.next(payload);
        });

        this.socket.on('room:user-left', (payload: RoomUserJoined) => {
            this.roomUserLeft$.next(payload);
        });

        this.socket.on('recording:started', (payload: RecordingEvent) => {
            this.recordingStarted$.next(payload);
        });

        this.socket.on('recording:stopped', (payload: RecordingEvent) => {
            this.recordingStopped$.next(payload);
        });
    }

    joinRoom(roomId: string): void {
        console.log('join room, roomId: ', roomId);
        if (!this.socket) return;

        this.socket.emit('room:join', { roomId }, (ack: any) => {
            console.log('[WS] room:join ack', ack);
        });
    }

    leaveRoom(roomId: string): void {
        console.log('leave room, roomId: ', roomId);
        if (!this.socket) return;

        this.socket.emit('room:leave', { roomId }, (ack: any) => {
            console.log('[WS] room:leave ack', ack);
        });
    }

    startRecording(roomId: string): void {
        if (!this.socket) return;

        this.socket.emit('recording:started', { roomId }, (ack: any) => {
            console.log('[WS] recording:started ack', ack);
        });
    }

    stopRecording(roomId: string): void {
        console.log('stop recording, roomId: ', roomId);
        if (!this.socket) return;

        this.socket.emit('recording:stopped', { roomId }, (ack: any) => {
            console.log('[WS] recording:stopped ack', ack);
        });
    }

    ping(): void {
        if (!this.socket) return;
        this.socket.emit('system:ping', { ts: Date.now() }, (ack: any) => {
            console.log('[WS] ping ack', ack);
        });
    }

    ngOnDestroy(): void {
        this.destroyed$.next();
        this.destroyed$.complete();

        if (this.socket) {
            this.socket.disconnect();
            this.socket = undefined;
        }
    }
}
