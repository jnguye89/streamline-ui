import { Injectable } from '@angular/core';
import type AgoraRTMModule from 'agora-rtm-sdk';
import type {
  OccupancyDetail,
  RTMEvents,
} from 'agora-rtm-sdk';
import { BehaviorSubject, Subject } from 'rxjs';

type RtmClient = InstanceType<typeof AgoraRTMModule.RTM>;

type PresenceStatus = 'online' | 'offline';
type InvitePayload =
  | { type: 'CALL_INVITE'; channel: string; from: string; media: 'audio' | 'video' }
  | { type: 'CALL_CANCEL'; channel: string; from: string }
  | { type: 'CALL_ACCEPT'; channel: string; from: string; media: 'audio' | 'video' }
  | { type: 'CALL_DECLINE'; channel: string; from: string; reason?: string };

@Injectable({ providedIn: 'root' })
export class RtmService {
  private client?: RtmClient;
  private readonly lobby = 'skriin-lobby';
  private me!: number;
  private userChannel!: string;

  readonly onlineMap$ = new BehaviorSubject<Map<string, PresenceStatus>>(new Map());
  readonly incomingInvite$ = new Subject<{
    from: string;
    channel: string;
    media: 'audio' | 'video';
  }>();
  readonly callSignals$ = new Subject<InvitePayload>();

  async login(appId: string, uid: number, token: string) {
    const { default: AgoraRTM } = await import('agora-rtm-sdk');
    this.me = uid;
    this.client = new AgoraRTM.RTM(appId, `${uid}`, { presenceTimeout: 30 });
    await this.client.login({ token });

    await this.client.subscribe(this.lobby);
    const snap = await this.client.presence.getOnlineUsers(this.lobby, 'MESSAGE');
    const map = new Map<string, PresenceStatus>();

    (snap?.occupants ?? []).forEach((u: OccupancyDetail) => map.set(u.userId, 'online'));
    this.onlineMap$.next(map);

    this.client.addEventListener('presence', (evt: RTMEvents.PresenceEvent) => {
      if (evt.channelName !== this.lobby) return;
      const m = new Map(this.onlineMap$.value);
      if (evt.eventType === 'REMOTE_JOIN') m.set(evt.publisher, 'online');
      if (evt.eventType === 'REMOTE_LEAVE' || evt.eventType === 'REMOTE_TIMEOUT') {
        m.set(evt.publisher, 'offline');
      }
      this.onlineMap$.next(m);
    });

    this.userChannel = `user:${uid}`;
    await this.client.subscribe(this.userChannel);

    this.client.addEventListener('message', (evt: RTMEvents.MessageEvent) => {
      if (typeof evt.message !== 'string') return;
      try {
        const data: InvitePayload = JSON.parse(evt.message);
        if (evt.channelName !== this.userChannel) return;

        if (data.type === 'CALL_INVITE') {
          this.incomingInvite$.next({ from: data.from, channel: data.channel, media: data.media });
        } else {
          this.callSignals$.next(data);
        }
      } catch {
        // Ignore messages that are not call-signaling payloads.
      }
    });
  }

  async logout() {
    try { await this.client?.logout(); } finally {
      this.client = undefined;
      this.onlineMap$.next(new Map());
    }
  }

  /** Send invites to each callee’s personal channel */
  async sendInvite(invitees: string[], channel: string, media: 'audio' | 'video' = 'video') {
    const client = this.client;
    if (!client) return;
    const payload = JSON.stringify({ type: 'CALL_INVITE', channel, from: `${this.me}`, media } as InvitePayload);
    await Promise.all(invitees.map(id => client.publish(`user:${id}`, payload)));
  }

  async sendAccept(to: string, channel: string, isVideo: boolean) {
    if (!this.client) return;
    const payload = JSON.stringify({ type: 'CALL_ACCEPT', channel, from: `${this.me}`, media: isVideo ? 'video' : 'audio' } as InvitePayload);
    await this.client.publish(`user:${to}`, payload);
  }

  async sendDecline(to: string, channel: string, reason?: string) {
    if (!this.client) return;
    const payload = JSON.stringify({ type: 'CALL_DECLINE', channel, from: `${this.me}`, reason } as InvitePayload);
    await this.client.publish(`user:${to}`, payload);
  }

  async sendCancel(to: string, channel: string) {
    if (!this.client) return;
    const payload = JSON.stringify({ type: 'CALL_CANCEL', channel, from: `${this.me}` } as InvitePayload);
    await this.client.publish(`user:${to}`, payload);
  }
}
