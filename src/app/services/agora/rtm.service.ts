// rtm.service.ts (2.2.2-style)
import { Injectable } from '@angular/core';
import AgoraRTM, { OccupancyDetail } from 'agora-rtm-sdk';
import { BehaviorSubject, Subject } from 'rxjs';

type PresenceStatus = 'online' | 'offline';
type InvitePayload =
  | { type: 'CALL_INVITE'; channel: string; from: string; media: 'audio' | 'video' }
  | { type: 'CALL_CANCEL'; channel: string; from: string }
  | { type: 'CALL_ACCEPT'; channel: string; from: string, media: 'audio' | 'videl' }
  | { type: 'CALL_DECLINE'; channel: string; from: string; reason?: string };

@Injectable({ providedIn: 'root' })
export class RtmService {
  private client?: InstanceType<typeof AgoraRTM.RTM>;
  private lobby = 'skriin-lobby';
  private me!: number;
  private userChannel!: string;

  onlineMap$ = new BehaviorSubject<Map<string, PresenceStatus>>(new Map());
  incomingInvite$ = new Subject<{ from: string; channel: string; media: 'audio' | 'video' }>();
  callSignals$ = new Subject<InvitePayload>(); // accept/decline/cancel updates

  async login(appId: string, uid: number, token: string) {
    this.me = uid;
    this.client = new AgoraRTM.RTM(appId, `${uid}`, { presenceTimeout: 30 });
    await this.client.login({ token });

    // 1) Presence lobby
    await this.client.subscribe(this.lobby);
    const snap = await this.client.presence.getOnlineUsers(this.lobby, 'MESSAGE');
    const map = new Map<string, PresenceStatus>();

    (snap?.occupants ?? []).forEach((u: OccupancyDetail) => map.set(u.userId, 'online'));
    // (snap?.occupants ?? []).forEach((u: string) => map.set(u, 'online'));
    this.onlineMap$.next(map);

    this.client.addEventListener('presence', (evt: any) => {
      if (evt.channelName !== this.lobby) return;
      const m = new Map(this.onlineMap$.value);
      if (evt.eventType === 'REMOTE_JOIN') m.set(evt.publisherId, 'online');
      if (evt.eventType === 'REMOTE_LEAVE' || evt.eventType === 'REMOTE_TIMEOUT') m.set(evt.publisherId, 'offline');
      this.onlineMap$.next(m);
    });

    // 2) Personal user channel for direct signals
    this.userChannel = `user:${uid}`;
    await this.client.subscribe(this.userChannel);

    this.client.addEventListener('message', (evt: any) => {
      // evt.channelName, evt.publisherId, evt.message
      try {
        const data: InvitePayload = JSON.parse(evt.message);
        if (evt.channelName !== this.userChannel) return;

        if (data.type === 'CALL_INVITE') {
          this.incomingInvite$.next({ from: data.from, channel: data.channel, media: data.media });
        } else {
          this.callSignals$.next(data);
        }
      } catch { /* ignore parse errors */ }
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
    if (!this.client) return;
    const payload = JSON.stringify({ type: 'CALL_INVITE', channel, from: `${this.me}`, media } as InvitePayload);
    await Promise.all(invitees.map(id => this.client!.publish(`user:${id}`, payload)));
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
