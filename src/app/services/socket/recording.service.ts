import { Injectable, OnDestroy } from "@angular/core";
import { BehaviorSubject, Subject } from "rxjs";
import { io, Socket } from "socket.io-client";
import { environment } from "../../../environments/environment";
import { DeviceAuthService } from "../device-auth.service";
import { ChessAck, ChessDrawDeclinedPayload, ChessDrawOfferedPayload, ChessEndedPayload, ChessJoinedPayload, ChessMovePayload } from "../../models/chess/chess-game.model";

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

export interface ChatMessage {
    userId: string;
    username: string;
    text: string;
    roomId: string;
    ts: number;
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
    chatMessage$ = new Subject<ChatMessage>();
    // Chess uses this same '/ws' connection - ChessGateway is a separate
    // gateway class on the same namespace (see chess.gateway.ts on the API),
    // so there's no second socket to manage on the client either.
    chessMove$ = new Subject<ChessMovePayload>();
    chessEnded$ = new Subject<ChessEndedPayload>();
    chessJoined$ = new Subject<ChessJoinedPayload>();
    chessDrawOffered$ = new Subject<ChessDrawOfferedPayload>();
    chessDrawDeclined$ = new Subject<ChessDrawDeclinedPayload>();

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

        this.socket.on('chat:message', (payload: ChatMessage) => {
            this.chatMessage$.next(payload);
        });

        this.socket.on('chess:move', (payload: ChessMovePayload) => {
            this.chessMove$.next(payload);
        });

        this.socket.on('chess:ended', (payload: ChessEndedPayload) => {
            this.chessEnded$.next(payload);
        });

        this.socket.on('chess:joined', (payload: ChessJoinedPayload) => {
            this.chessJoined$.next(payload);
        });

        this.socket.on('chess:draw-offered', (payload: ChessDrawOfferedPayload) => {
            this.chessDrawOffered$.next(payload);
        });

        this.socket.on('chess:draw-declined', (payload: ChessDrawDeclinedPayload) => {
            this.chessDrawDeclined$.next(payload);
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

    sendChat(roomId: string, text: string): void {
        if (!this.socket) return;

        this.socket.emit('chat:send', { roomId, text }, (ack: any) => {
            console.log('[WS] chat:send ack', ack);
        });
    }

    // Resolves to an ack rather than throwing, so ChessGameComponent can show
    // "illegal move" / "not your turn" inline instead of an unhandled error.
    // Resigning goes over plain REST instead (ChessService.resign) - it's
    // not latency-sensitive the way a move is, and the API broadcasts the
    // result to the room itself either way.
    sendChessMove(gameId: number, from: string, to: string, promotion?: string): Promise<ChessAck> {
        return new Promise(resolve => {
            if (!this.socket) { resolve({ ok: false, error: 'Not connected' }); return; }
            this.socket.emit('chess:move', { gameId, from, to, promotion }, (ack: ChessAck) => {
                resolve(ack);
            });
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
