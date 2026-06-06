import { CommonModule } from "@angular/common";
import { Component, inject, OnDestroy, OnInit, ViewEncapsulation } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { SeoService } from "../../services/seo.service";
import { CallOrchestratorService } from "../../services/agora/call-orchestrator.service";
import { RtmService } from "../../services/agora/rtm.service";
import { concatMap, filter, firstValueFrom, Observable, of, Subject, take, takeUntil } from "rxjs";
import { Auth0User } from "../../models/auth0-user.model";
import { UserService } from "../../services/user.service";
import { AgoraService } from "../../services/agora/agora.service";
import { RtcService } from "../../services/agora/rtc.service";
import { MatDialog } from "@angular/material/dialog";
import { AcceptCallModal } from "./accept-call.components";
import { MatButtonModule } from "@angular/material/button";
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from "@angular/material/snack-bar";
import { Router } from "@angular/router";
import { DeviceAuthService, DeviceUser } from "../../services/device-auth.service";

@Component({
  selector: "app-calls",
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [CommonModule, FormsModule, MatButtonModule, MatSlideToggleModule],
  templateUrl: "./calls.component.html",
  styleUrl: "./calls.component.scss",
})
export class CallsComponent implements OnInit, OnDestroy {
  private dialog = inject(MatDialog);
  private destroy$ = new Subject<void>();
  private userId: number | undefined;
  isAuthenticated$ = this.deviceAuth.isAuthenticated$;
  users$: Observable<Auth0User[]> = of();
  user$: Observable<DeviceUser | null> = of();
  isVideo = true;
  channelName = '';

  constructor(
    private orchestrator: CallOrchestratorService,
    public rtm: RtmService,
    private seo: SeoService,
    private deviceAuth: DeviceAuthService,
    private userService: UserService,
    private tokenApi: AgoraService,
    private rtc: RtcService,
    private snack: MatSnackBar,
    private router: Router) { }

  selected: Record<number, boolean> = {};

  online(uid: number) {
    return this.rtm.onlineMap$.value.get(`${uid}`) === 'online';
  }

  get selectedCount() {
    return Object.values(this.selected).filter(v => v).length;
  }

  get isConnected() {
    return this.rtc.isConnected();
  }

  canSelect(id: number): boolean {
    const isSelected = this.selected[id];
    return isSelected || this.selectedCount < 4;
  }

  toggleSelection(id: number) {
    if (this.canSelect(id)) {
      this.selected[id] = !this.selected[id];
    }
  }

  async callSelected() {
    const users = await firstValueFrom(this.users$);

    const invitees = (users ?? [])
      .filter(u => !!this.selected?.[u.agoraUserId])
      .map(u => u.agoraUserId);

    if (invitees.length === 0 || !this.userId) return;

    try {
      this.channelName = `call_${crypto.randomUUID()}`;
      await this.orchestrator.startCall(this.userId, invitees, this.channelName, this.isVideo ? 'video' : 'audio');
    } catch (e) {
      console.error('startCall failed', e);
    }
  }

  async hangup() { await this.orchestrator.hangup(); }

  async ngOnInit() {
    this.isAuthenticated$.pipe(
      takeUntil(this.destroy$)).subscribe(isAuthenticated => {
        isAuthenticated ? this.init() : this.login();
      });
  }

  init() {
    this.setUpSeo();
    this.user$ = this.deviceAuth.user$;
    this.user$.pipe(
      filter(r => !!r?.sub),
      concatMap(u => this.userService.getAuth0User(u?.sub!)),
      take(1))
      .subscribe(u => {
        this.userId = u.agoraUserId;
        this.orchestrator.initForUser(this.userId!);
        this.users$ = this.userService.getUsers();
      });

    this.rtm.incomingInvite$.subscribe(async ({ from, channel, media }) => {
      this.channelName = channel;
      const accepted = await this.openIncomingModal(from, media);

      if (accepted) {
        const { appId, rtcToken } = await firstValueFrom(
          this.tokenApi.createTokens(this.userId!, channel)
        );
        await this.rtm.sendAccept(from, channel, media == 'video');
        await this.rtc.join(appId, channel, this.userId!, rtcToken, media == 'video');
      } else {
        await this.rtm.sendDecline(from, channel, 'user-declined');
      }
    });

    this.rtm.callSignals$.subscribe(async sig => {
      const user = await firstValueFrom(this.userService.getAgoraUser(sig.from));
      let message;
      if (sig.type === 'CALL_CANCEL') {
        message = `Call cancelled by ${user.username}`;
      }
      if (sig.type === 'CALL_DECLINE') {
        message = `Call declined by ${user.username}`;
      }

      if (!!message) {
        this.snack.open(message, 'Dismiss', {
          duration: 6000,
          horizontalPosition: 'right',
          verticalPosition: 'top',
        });
      }
    });
  }

  login() {
    this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
  }

  async openIncomingModal(from: string, media: 'audio' | 'video'): Promise<boolean> {
    const user = await firstValueFrom(this.userService.getAgoraUser(from));
    const ref = this.dialog.open(AcceptCallModal, {
      data: { from: user.username, media },
      disableClose: false,
    });

    const result = await firstValueFrom(ref.afterClosed());
    return !!result;
  }

  ngOnDestroy(): void {
    (async () => {
      try {
        if (this.isConnected) {
          await this.hangup();
        }
      } catch (err) {
        console.error('Error during cleanup in ngOnDestroy', err);
      } finally {
        this.destroy$.next();
        this.destroy$.complete();
      }
    })();
  }

  private setUpSeo() {
    const title = 'skriin AI TV';
    const description =
      "Place crystal-clear AI-enhanced video and voice calls from any smart-TV. Auto-framing, noise cleanup, instant family conferencing.";
    const keywords =
      "ai video calls on tv, smart tv calling, skriin calls, family video chat, noise cancelling tv calls";

    this.seo.setTags({
      title,
      description,
      keywords,
      path: "/watch",
    });
  }
}
