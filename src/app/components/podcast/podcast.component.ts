import { CommonModule } from "@angular/common";
import { AfterViewInit, Component, ElementRef, inject, OnDestroy, OnInit, ViewChild, ViewEncapsulation } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { SeoService } from "../../services/seo.service";
import { CallOrchestratorService } from "../../services/agora/call-orchestrator.service";
import { RtmService } from "../../services/agora/rtm.service";
import { concatMap, filter, firstValueFrom, Observable, of, Subject, take, takeUntil } from "rxjs";
import { ActivatedRoute, Router } from "@angular/router";
import { Auth0User } from "../../models/auth0-user.model";
import { UserService } from "../../services/user.service";
import { AgoraService } from "../../services/agora/agora.service";
import { RtcService } from "../../services/agora/rtc.service";
import { MatDialog } from "@angular/material/dialog";
import { AcceptCallModal } from "./../calls/accept-call.components";
import { MatButtonModule } from "@angular/material/button";
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from "@angular/material/snack-bar";
import { RecordingSocketService } from "../../services/socket/recording.service";
import { MatIconModule } from "@angular/material/icon";
import { StreamService } from "../../services/stream.service";
import { DeviceAuthService, DeviceUser } from "../../services/device-auth.service";
import { GamepadFocusableDirective } from "../../directives/gamepad-focusable.directive";

@Component({
  selector: "app-podcast",
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [CommonModule, FormsModule, MatButtonModule, MatSlideToggleModule,
    MatIconModule, GamepadFocusableDirective],
  templateUrl: "./podcast.component.html",
  styleUrl: "./podcast.component.scss",
})
export class PodcastComponent implements OnInit, AfterViewInit, OnDestroy {
  private dialog = inject(MatDialog);
  private destroy$ = new Subject<void>();
  private userId: number | undefined;
  sidebarCollapsed = false;
  isAuthenticated$ = this.deviceAuth.isAuthenticated$;
  users$: Observable<Auth0User[]> = of();
  user$: Observable<DeviceUser | null> = of();
  isVideo = true;
  isPodcast = false;
  isRecording = false;
  isLive = false;
  channelName = '';
  token: string | undefined;

  constructor(
    private orchestrator: CallOrchestratorService,
    public rtm: RtmService,
    private seo: SeoService,
    private deviceAuth: DeviceAuthService,
    private userService: UserService,
    private tokenApi: AgoraService,
    private rtc: RtcService,
    private snack: MatSnackBar,
    private router: Router,
    private route: ActivatedRoute,
    private streamservice: StreamService,
    private socket: RecordingSocketService) { }

  @ViewChild('localPreview') localPreview!: ElementRef<HTMLVideoElement>;
  private localStream: MediaStream | null = null;

  showUserPicker = false;
  selected: Record<number, boolean> = {};

  async ngAfterViewInit() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      const el = this.localPreview.nativeElement;
      el.muted = true;
      el.srcObject = this.localStream;
    } catch (err) {
      console.error('Camera access denied', err);
    }
  }

  toggleUserPicker() {
    this.showUserPicker = !this.showUserPicker;
  }

  online(uid: number) {
    return this.rtm.onlineMap$.value.get(`${uid}`) === 'online';
  }

  get selectedCount() {
    return Object.values(this.selected).filter(v => v).length;
  }

  get isConnected() {
    return this.rtc.isConnected();
  }

  onSidebarEnter() {
    this.sidebarCollapsed = false;
  }

  onSidebarLeave() {
    this.sidebarCollapsed = true;
  }

  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
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
      this.channelName = `${this.isPodcast ? 'podcast' : 'call'}_${crypto.randomUUID()}`;
      console.log('call selected: ', this.channelName);
      await this.socket.connect();
      await this.orchestrator.startCall(this.userId, invitees, this.channelName, this.isVideo ? 'video' : 'audio');
      await firstValueFrom(this.streamservice.ensureReady(this.channelName));
    } catch (e) {
      console.error('startCall failed', e);
    }
  }

  async hangup() {
    await this.stopRecording();
    await this.orchestrator.hangup();
  }

  async ngOnInit() {
    this.isAuthenticated$.pipe(
      takeUntil(this.destroy$)).subscribe(isAuthenticated => {
        isAuthenticated ? this.init() : this.login();
      });

    this.socket.recordingStarted$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.isRecording = true;
      this.snack.open('Recording has started!', 'Dismiss', {
        duration: 10000,
        horizontalPosition: 'center',
        verticalPosition: 'top',
        politeness: 'assertive',
        panelClass: ['snack-error']
      });
    });

    this.socket.recordingStopped$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.isRecording = false;
      this.snack.open('Recording has stopped!', 'Dismiss', {
        duration: 10000,
        horizontalPosition: 'center',
        verticalPosition: 'top',
        politeness: 'assertive',
        panelClass: ['snack-error']
      });
    });
  }

  async startRecording() {
    if (this.channelName === '') {
      console.error('No channel name set. Cannot start recording.');
      return;
    }
    this.socket.startRecording(this.channelName);
    await this.streamservice.start(this.channelName, undefined, false);
    this.isRecording = true;
  }

  async stopRecording() {
    this.socket.stopRecording(this.channelName);
    await this.streamservice.stop(this.channelName);
    this.isRecording = false;
    this.isLive = false;
  }

  async toggleLive() {
    if (this.isLive) {
      await this.streamservice.stopLive(this.channelName);
      this.isLive = false;
    } else {
      await this.streamservice.start(this.channelName, undefined, true);
      this.isLive = true;
    }
  }

  init() {
    this.isPodcast = this.route.snapshot.url.map(u => u.path).indexOf('podcast') != -1;
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
        await this.socket.connect();
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
    this.localStream?.getTracks().forEach(t => t.stop());
    (async () => {
      try {
        if (this.isRecording) {
          await this.stopRecording();
        }
        await this.orchestrator.hangup();
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
