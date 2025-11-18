import { CommonModule } from "@angular/common";
import { Component, inject, OnDestroy, OnInit, ViewEncapsulation } from "@angular/core";
import { AuthService, User } from "@auth0/auth0-angular";
import { VoximplantService } from "../../services/voximplant.service";
import { FormsModule } from "@angular/forms";
import { SeoService } from "../../services/seo.service";
import { CallOrchestratorService } from "../../services/agora/call-orchestrator.service";
import { RtmService } from "../../services/agora/rtm.service";
import { concatMap, filter, firstValueFrom, map, Observable, of, single, Subject, take, takeUntil, tap } from "rxjs";
import { ActivatedRoute, Router } from "@angular/router";
import { Auth0User } from "../../models/auth0-user.model";
import { UserService } from "../../services/user.service";
import { AgoraService } from "../../services/agora/agora.service";
import { RtcService } from "../../services/agora/rtc.service";
import { MatDialog } from "@angular/material/dialog";
import { AcceptCallModal } from "./accept-call.components";
import { MatButtonModule } from "@angular/material/button";
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from "@angular/material/snack-bar";
import { PodcastService } from "../../services/podcast.service";

@Component({
  selector: "app-calls",
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [CommonModule, FormsModule, MatButtonModule, MatSlideToggleModule],
  providers: [VoximplantService],
  templateUrl: "./calls.component.html",
  styleUrl: "./calls.component.scss",
})
export class CallsComponent implements OnInit, OnDestroy {
  private dialog = inject(MatDialog);
  private destroy$ = new Subject<void>();
  private userId: number | undefined;
  isAuthenticated$ = this.auth.isAuthenticated$;
  users$: Observable<Auth0User[]> = of();
  user$: Observable<User | null | undefined> = of();
  isVideo = true;
  channelName = '';

  constructor(
    private orchestrator: CallOrchestratorService,
    public rtm: RtmService,
    private seo: SeoService,
    private auth: AuthService,
    private userService: UserService,
    private tokenApi: AgoraService,
    private rtc: RtcService,
    private snack: MatSnackBar,
    private router: Router,
    private route: ActivatedRoute,
    private podcastService: PodcastService) { }

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
    // allow if it's currently selected (so you can uncheck),
    // or if we haven't hit the limit yet
    return isSelected || this.selectedCount < 4;
  }

  toggleSelection(id: number) {
    // only toggle if it's allowed
    if (this.canSelect(id)) {
      this.selected[id] = !this.selected[id];
    }
  }

  async callSelected() {
    // grab the latest users once
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
    this.user$ = this.auth.user$;
    // .pipe(
    // map(u => {
    //   const user = { ...u };
    //   user.sub = user.sub?.replace(/\D/g, '');
    //   return user;
    // })
    // );
    this.user$.pipe(
      filter(r => !!r?.sub),
      concatMap(u => this.userService.getAuth0User(u?.sub!)),
      take(1))
      .subscribe(u => {
        this.userId = u.agoraUserId;
        this.orchestrator.initForUser(this.userId!);     // login to RTM / presence}
        this.users$ = this.userService.getUsers()
        // .pipe(
        //   map(u => u.map(uu => {
        //     const user = { ...uu };
        //     user.auth0UserId = user.auth0UserId.replace(/\D/g, '');
        //     return user;
        //   }))
        // );
      });

    this.rtm.incomingInvite$.subscribe(async ({ from, channel, media }) => {
      // Open your modal: “{from} is calling…”
      this.channelName = channel;
      const accepted = await this.openIncomingModal(from, media); // returns true/false

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

    // (optional) receive CANCEL from caller if they hang up before you answer
    this.rtm.callSignals$.subscribe(async sig => {
      const user = await firstValueFrom(this.userService.getAgoraUser(sig.from));
      let message;
      if (sig.type === 'CALL_CANCEL') {
        // close the modal if visible
        message = `Call cancelled by ${user.username}`;
      }
      if (sig.type === 'CALL_DECLINE') {
        // close the modal if visible
        message = `Call declined by ${user.username}`;
      }

      if (!!message) {
        // close the modal if visible
        this.snack.open(message, 'Dismiss', {
          duration: 6000,
          horizontalPosition: 'right',
          verticalPosition: 'top',
        });
      }
    });
  }

  login() {
    this.auth.loginWithRedirect({
      appState: {
        target: this.router.url,
      },
    });
  }

  async openIncomingModal(from: string, media: 'audio' | 'video'): Promise<boolean> {
    const user = await firstValueFrom(this.userService.getAgoraUser(from));
    const ref = this.dialog.open(AcceptCallModal, {
      data: { from: user.username, media },
      disableClose: false, // allow Esc/backdrop if you want
    });

    // Convert Observable -> Promise for async/await usage
    const result = await firstValueFrom(ref.afterClosed()); // result could be true/false/undefined
    return !!result; // coerce undefined (backdrop) to false
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
      // image: "https://www.yoursite.com/assets/calls-og-image.jpg",
    });
  }
}
