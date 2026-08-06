import {
  AfterViewInit,
  Component,
  ElementRef,
  inject,
  ViewChild,
} from "@angular/core";
import { FlexLayoutModule } from "@angular/flex-layout";
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { FormsModule } from "@angular/forms";
import {
  concatMap,
  filter,
  firstValueFrom,
  Observable,
  of,
  Subject,
  take,
  takeUntil,
} from "rxjs";
import { CommonModule } from "@angular/common";
import { SeoService } from "../../services/seo.service";
import { Router } from "@angular/router";
import { StreamService } from "../../services/stream.service";
import { MatDialog } from "@angular/material/dialog";
import { ConfirmEndStreamDialog } from "../dialogs/confirm-stream.dialog";
import { RtcStreamService } from "../../services/agora/rtc-stream.service";
import { UserService } from "../../services/user.service";
import { DeviceAuthService, DeviceUser } from "../../services/device-auth.service";
import { GamepadFocusableDirective } from "../../directives/gamepad-focusable.directive";
import { RecordingSocketService, ChatMessage } from "../../services/socket/recording.service";
import { ChatColorPipe } from "../../pipes/chat-color.pipe";

@Component({
  selector: "app-stream",
  standalone: true,
  imports: [MatButtonModule, MatIconModule, FlexLayoutModule, CommonModule, MatProgressSpinnerModule, GamepadFocusableDirective, FormsModule, ChatColorPipe],
  templateUrl: "./stream.component.html",
  styleUrl: "./stream.component.scss",
})
export class StreamComponent implements AfterViewInit {
  private dialog = inject(MatDialog);
  private userId: number | undefined;
  isAuthenticated$ = this.deviceAuth.isAuthenticated$;
  isLive$ = this.rtcStreamService.isLive$;
  isReady = false;
  aiMagicEnabled = false;
  user$: Observable<DeviceUser | null> = of();
  channelName: string | undefined;
  private destroy$ = new Subject<void>();
  @ViewChild('video', { static: true }) videoElement!: ElementRef<HTMLVideoElement>;

  // Live chat (floating overlay, TikTok-style) - lets the host see and
  // reply to viewer chat while broadcasting. Fixed-size buffer, oldest
  // message drops off as a new one comes in.
  private readonly CHAT_MAX_VISIBLE = 12;
  chatMessages: (ChatMessage & { key: string })[] = [];
  chatText = '';

  constructor(
    private streamService: StreamService,
    public deviceAuth: DeviceAuthService,
    private seo: SeoService,
    private router: Router,
    private rtcStreamService: RtcStreamService,
    private userService: UserService,
    private socket: RecordingSocketService,
  ) { }

  ngOnInit() {
    this.isAuthenticated$.pipe(
      takeUntil(this.destroy$)).subscribe(isAuthenticated => {
        isAuthenticated ? this.init() : this.login();
      });
  }

  async init() {
    this.user$ = this.deviceAuth.user$;
    this.user$.pipe(
      filter(r => !!r?.sub),
      concatMap(u => this.userService.getAuth0User(u?.sub!)),
      take(1))
      .subscribe(u => {
        this.userId = (u as any).agoraUserId;
      });
    this.channelName = `host-${Math.random().toString(36).substring(2, 15)}`;
    const token = await firstValueFrom(this.streamService.ensureReady(this.channelName));

    this.rtcStreamService.join(token.appId, this.channelName, token.rtcToken, this.userId!);
    this.isReady = true;

    this.socket.connect();
    this.socket.joinRoom(this.channelName);
    this.socket.chatMessage$.pipe(takeUntil(this.destroy$)).subscribe(msg => this.onChatMessage(msg));
  }

  login() {
    this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
  }

  async ngAfterViewInit() {
    this.setUpSeo();
  }

  async resumeWebcam() {
    await this.rtcStreamService.startPublish();
    await this.streamService.start(this.channelName!);
  }

  toggleLive(): void {
    if (this.rtcStreamService.isLive$.value) {
      void this.stopWebcam();
    } else {
      void this.resumeWebcam();
    }
  }

  toggleAiMagic(): void {
    this.aiMagicEnabled = !this.aiMagicEnabled;
  }

  async stopWebcam(openDialog: boolean = true) {
    console.log('stopped got called');
    await this.rtcStreamService.stopPublish();
    var response = await this.streamService.stop(this.channelName!);
    console.log('response', response);
    if (!openDialog) return;

    if (!response.filename) {
      const dialogRef = this.dialog.open(ConfirmEndStreamDialog, {
        data: {
          title: 'Nice work.',
          body: `We're saving your stream; it'll land on your profile shortly. Go live again!`
        }
      });

      const timeout = setTimeout(() => dialogRef.close(), 3000);
      dialogRef.afterClosed().subscribe(() => clearTimeout(timeout));
      return;
    }

    if (this.aiMagicEnabled) {
      this.runAiMagic(response.filename);
      return;
    }

    // AI Magic isn't on - ask instead of silently skipping it.
    const dialogRef = this.dialog.open(ConfirmEndStreamDialog, {
      data: {
        title: 'AI Magic is off',
        body: `Your stream has been saved to your profile. Want to turn on AI Magic to automatically enhance this video?`,
        confirmBtnText: 'Yes, enable it',
        cancelBtnText: 'No thanks'
      }
    });

    dialogRef.afterClosed().subscribe((enable: boolean) => {
      if (enable) {
        this.aiMagicEnabled = true;
        this.runAiMagic(response.filename);
      }
    });
  }

  private runAiMagic(filename: string): void {
    this.streamService.process(filename);
    const dialogRef = this.dialog.open(ConfirmEndStreamDialog, {
      data: {
        title: 'AI Magic running',
        body: `Your video is being processed. This can take a few minutes. The video will show up in your profile when ready!`,
        confirmBtnText: 'OK',
      }
    });
    const timeout = setTimeout(() => dialogRef.close(), 5000);
    dialogRef.afterClosed().subscribe(() => clearTimeout(timeout));
  }

  ngOnDestroy(): void {
    if (this.channelName) this.socket.leaveRoom(this.channelName);
    this.destroy$.next();
    this.destroy$.complete();
    void this.rtcStreamService.leave();
  }

  private onChatMessage(msg: ChatMessage): void {
    if (msg.roomId !== this.channelName) return;

    const entry = { ...msg, key: `${msg.ts}-${Math.random().toString(36).slice(2)}` };
    this.chatMessages = [...this.chatMessages, entry].slice(-this.CHAT_MAX_VISIBLE);
  }

  sendChat(): void {
    const text = this.chatText.trim();
    if (!text || !this.channelName) return;

    this.socket.sendChat(this.channelName, text);
    this.chatText = '';
  }

  trackChatMessage(_: number, m: ChatMessage & { key: string }): string {
    return m.key;
  }

  private setUpSeo() {
    const title = 'skriin AI TV | stream (beta)';
    const description =
      "One-click streaming hub: push gameplay, camera or desktop to Twitch, YouTube & skriin Cloud. AI overlays, chat integration, 0.6 s latency.";
    const keywords =
      "live game streaming, smart tv streamer, ai overlays, low latency broadcast, twitch youtube stream";

    this.seo.setTags({
      title,
      description,
      keywords,
      path: "/watch",
    });
  }
}
