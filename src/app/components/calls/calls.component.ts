import { CommonModule } from "@angular/common";
import { Component, inject, OnDestroy, OnInit } from "@angular/core";
import { AuthService, User } from "@auth0/auth0-angular";
import { VoximplantService } from "../../services/voximplant.service";
import { FormsModule } from "@angular/forms";
import { SeoService } from "../../services/seo.service";
import { CallOrchestratorService } from "../../services/agora/call-orchestrator.service";
import { RtmService } from "../../services/agora/rtm.service";
import { filter, firstValueFrom, Observable, of, Subject, take, takeUntil, tap } from "rxjs";
import { Router } from "@angular/router";
import { Auth0User } from "../../models/auth0-user.model";
import { UserService } from "../../services/user.service";
import { AgoraService } from "../../services/agora/agora.service";
import { RtcService } from "../../services/agora/rtc.service";
import { MatDialog } from "@angular/material/dialog";
import { AcceptCallModal } from "./accept-call.components";
import { MatButtonModule } from "@angular/material/button";
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from "@angular/material/snack-bar";

@Component({
  selector: "app-calls",
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatSlideToggleModule],
  providers: [VoximplantService],
  templateUrl: "./calls.component.html",
  styleUrl: "./calls.component.scss",
})
export class CallsComponent implements OnInit, OnDestroy {
  private dialog = inject(MatDialog);
  private destroy$ = new Subject<void>();
  private userId: string | undefined;
  isAuthenticated$ = this.auth.isAuthenticated$;
  users$: Observable<Auth0User[]> = of();
  user$: Observable<User | null | undefined> = of();
  isVideo = true;

  constructor(
    private orchestrator: CallOrchestratorService,
    private rtm: RtmService,
    private seo: SeoService,
    private auth: AuthService,
    private userService: UserService,
    private tokenApi: AgoraService,
    private rtc: RtcService,
    private snack: MatSnackBar,
    private router: Router) { }

  selected: Record<string, boolean> = {};

  online(uid: string) {
    return this.rtm.onlineMap$.value.get(uid) === 'online';
  }

  async callSelected() {
    // grab the latest users once
    const users = await firstValueFrom(this.users$);

    const invitees = (users ?? [])
      .filter(u => !!this.selected?.[u.auth0UserId])
      .map(u => u.auth0UserId);

    if (invitees.length === 0 || !this.userId) return;

    try {
      await this.orchestrator.startCall(this.userId, invitees);
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
    this.auth.user$.pipe(
      filter(r => !!r?.sub),
      take(1))
      .subscribe(u => {
        this.userId = u?.sub;
        this.orchestrator.initForUser(this.userId!);     // login to RTM / presence}
        this.users$ = this.userService.getUsers();
      });

    this.rtm.incomingInvite$.subscribe(async ({ from, channel, media }) => {
      // Open your modal: “{from} is calling…”
      const accepted = await this.openIncomingModal(from, media); // returns true/false

      if (accepted) {
        const { appId, rtcToken } = await firstValueFrom(
          this.tokenApi.createTokens(this.userId!, channel)
        );
        await this.rtm.sendAccept(from, channel, this.isVideo);
        await this.rtc.join(appId, channel, this.userId!, rtcToken, this.isVideo);
      } else {
        await this.rtm.sendDecline(from, channel, 'user-declined');
      }
    });

    // (optional) receive CANCEL from caller if they hang up before you answer
    this.rtm.callSignals$.subscribe(async sig => {
      const user = await firstValueFrom(this.userService.getAuth0User(sig.from));
      let message = '';
      if (sig.type === 'CALL_CANCEL') {
        // close the modal if visible
        message = `Call cancelled by ${user.username}`;
      }
      if (sig.type === 'CALL_DECLINE') {
        // close the modal if visible
        message = `Call declined by ${user.username}`;
      }

      // close the modal if visible
      this.snack.open(message, 'Dismiss', {
        duration: 6000,
        horizontalPosition: 'right',
        verticalPosition: 'top',
      });
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
    const user = await firstValueFrom(this.userService.getAuth0User(from));
    const ref = this.dialog.open(AcceptCallModal, {
      data: { from: user.username, media },
      disableClose: false, // allow Esc/backdrop if you want
    });

    // Convert Observable -> Promise for async/await usage
    const result = await firstValueFrom(ref.afterClosed()); // result could be true/false/undefined
    return !!result; // coerce undefined (backdrop) to false
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
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
