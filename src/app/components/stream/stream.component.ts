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
import { CommonModule, DatePipe } from "@angular/common";
import { AuthService, User } from "@auth0/auth0-angular";
import { SeoService } from "../../services/seo.service";
import { Router } from "@angular/router";
import { StreamService } from "../../services/stream.service";
import { MatDialog } from "@angular/material/dialog";
import { ConfirmEndStreamDialog } from "../dialogs/confirm-stream.dialog";
import { RtcStreamService } from "../../services/agora/rtc-stream.service";
import { UserService } from "../../services/user.service";
import { CanComponentDeactivate } from "../../guards/stream-exist.guard";

@Component({
  selector: "app-stream",
  standalone: true,
  imports: [MatButtonModule, MatIconModule, FlexLayoutModule, CommonModule, MatProgressSpinnerModule],
  providers: [DatePipe],
  templateUrl: "./stream.component.html",
  styleUrl: "./stream.component.scss",
})
export class StreamComponent implements AfterViewInit, CanComponentDeactivate {
  private dialog = inject(MatDialog);
  private userId: number | undefined;
  isAuthenticated$ = this.auth.isAuthenticated$;
  isLive$ = this.rtcStreamService.isLive$;
  isReady = false;
  streamId: number | undefined;
  user$: Observable<User | null | undefined> = of();
  channelName: string | undefined;
  private destroy$ = new Subject<void>();
  @ViewChild('video', { static: true }) videoElement!: ElementRef<HTMLVideoElement>;

  beforeRouteLeave = async () => this.stopWebcam();

  constructor(
    private streamService: StreamService,
    public auth: AuthService,
    private seo: SeoService,
    private router: Router,
    private rtcStreamService: RtcStreamService,
    private userService: UserService,
  ) { }

  ngOnInit() {
    this.isAuthenticated$.pipe(
      takeUntil(this.destroy$)).subscribe(isAuthenticated => {
        isAuthenticated ? this.init() : this.login();
      });
  }

  async canDeactivate(): Promise<boolean> {
    // if (!this.hasUnsavedChanges) return true;

    const ref = this.dialog.open(ConfirmEndStreamDialog, {
      disableClose: true,
      data: { title: 'End stream?', body: `Are you sure you want to end your live stream and leave?` }
    });

    const isClose = await firstValueFrom(ref.afterClosed());

    if (isClose) {
      await this.stopWebcam();
    }

    return isClose;
  }

  async init() {
    this.user$ = this.auth.user$;
    this.user$.pipe(
      filter(r => !!r?.sub),
      concatMap(u => this.userService.getAuth0User(u?.sub!)),
      take(1))
      .subscribe(u => {
        this.userId = u.agoraUserId;
      });
    this.channelName = `host-${Math.random().toString(36).substring(2, 15)}`;
    const token = await firstValueFrom(this.streamService.ensureReady(this.channelName));
    // console.log('token', token.rtcToken)
    this.rtcStreamService.join(token.appId, this.channelName, token.rtcToken, this.userId!);
    this.isReady = true;
  }

  login() {
    this.auth.loginWithRedirect({
      appState: {
        target: this.router.url,
      },
    });
  }

  async ngAfterViewInit() {
    this.setUpSeo();
  }

  async resumeWebcam() {
    await this.rtcStreamService.startPublish();
    await this.streamService.start(this.channelName!);
  }

  async stopWebcam() {
    await this.rtcStreamService.stopPublish();
    await this.streamService.stop(this.channelName!);
    // this.wowzaPublishService.stopPublish();
    // if (isNav) this.detachAndStopVideoTracks();          // always do this

    // if (!isNav) {
    //   const ref = this.dialog.open(ConfirmEndStreamDialog, {
    //     width: '420px',
    //     data: { title: 'End stream?', body: `Click stay to start another live stream.` }
    //   });
    //   ref.afterClosed().pipe(take(1)).subscribe(v => v ? this.router.navigateByUrl('/profile') : this.init());
    // }
  }

  // stopAndNavigate() {
  //   this.streamService.stop(this.streamId!).pipe(
  //     takeUntil(this.destroy$))
  //     .subscribe(_ =>
  //       this.router.navigateByUrl('/profile'));
  // }

  ngOnDestroy(): void {
    this.stopWebcam();
    this.destroy$.next();
    this.destroy$.complete();
  }

  private detachAndStopVideoTracks() {
    const video = this.videoElement?.nativeElement;
    const ms = video?.srcObject as MediaStream | null;
    ms?.getTracks().forEach(t => t.stop());
    if (video) video.srcObject = null;
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
