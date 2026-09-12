import { Injectable, OnDestroy } from "@angular/core";
import { BehaviorSubject, Subject, skip } from "rxjs";
import { io, Socket } from "socket.io-client";
import { environment } from "../../../environments/environment";
import { DeviceAuthService } from "../device-auth.service";
import { ChessAck, ChessDrawDeclinedPayload, ChessDrawOfferedPayload, ChessEndedPayload, ChessJoinedPayload, ChessMovePayload, ChessYourTurnPayload } from "../../models/chess/chess-game.model";

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

    // Public (not just used internally) - ChessGameComponent listens for a
    // reconnect so it can re-issue room:join for whatever room it had before,
    // since Socket.IO does not restore server-side room membership by itself
    // after a connection is torn down and recreated (see reconnect() below,
    // and the client's own built-in auto-reconnect after a network drop).
    connected$ = new BehaviorSubject<boolean>(false);

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
    // Personal "it's your turn" nudge - delivered over this same connection's
    // own 'user:{id}' room (see 'user:register' below), independent of
    // whether any chess:{id} room has been joined. Subscribed to app-wide by
    // ChessTurnNotificationService, not scoped to ChessGameComponent like the
    // other chess subjects above.
    chessYourTurn$ = new Subject<ChessYourTurnPayload>();

    constructor(private deviceAuth: DeviceAuthService) {
        // Socket.IO's handshake `auth` payload (see connect() below) is
        // captured once, at `io(...)` call time. If the socket first
        // connects before the user logs in (the common case - connect() is
        // called unconditionally on app boot), it just keeps riding that
        // anonymous handshake forever otherwise: REST calls pick up a fresh
        // Authorization header on every request via an interceptor, but this
        // one long-lived socket never does. Concretely, that stale
        // connection is exactly what made a chess move silently do nothing
        // right after logging in to join a game - ChessGateway's chess:move
        // handler is guarded by the *hard* WsJwtGuard, which requires a
        // userId that was only ever going to be set from this socket's
        // original (pre-login) unauthenticated handshake, so the ack this
        // socket was waiting on never arrived and the click just appeared to
        // do nothing. `skip(1)` ignores the value isAuthenticated$ already
        // holds when this subscription starts (that's the state the current
        // socket, if any, was already created with) and only reacts to
        // actual login/logout transitions from here on. Only reconnects if
        // a socket already exists - if nothing has called connect() yet,
        // there's nothing stale to fix and the next explicit connect() call
        // will already use whatever token is current at that point.
        this.deviceAuth.isAuthenticated$.pipe(skip(1)).subscribe(() => {
            if (this.socket) {
                this.reconnect();
            }
        });
    }

    // Tears down any existing connection and opens a fresh one so the
    // handshake picks up whatever access token is current right now - see
    // the constructor above for why this needs to exist at all. Only
    // reconnect()/connect() actually create a socket; nothing else should
    // reach into `this.socket` to replace it.
    reconnect(): void {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = undefined;
        }
        this.connect();
    }

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
            // Register this socket into its own personal room right away so
            // server-initiated personal events (e.g. chess:your-turn) reach
            // it immediately - not only after some other feature happens to
            // call joinRoom() for an unrelated room first. No-ops server-side
            // for an anonymous (unauthenticated) connection.
            this.socket?.emit('user:register');
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

        this.socket.on('chess:your-turn', (payload: ChessYourTurnPayload) => {
            this.chessYourTurn$.next(payload);
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
