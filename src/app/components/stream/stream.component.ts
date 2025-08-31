import {
  AfterViewInit,
  Component,
  ElementRef,
  ViewChild,
} from "@angular/core";
import { FlexLayoutModule } from "@angular/flex-layout";
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { VideoService } from "../../services/video.service";
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  filter,
  map,
  Observable,
  of,
  Subject,
  switchMap,
  take,
  takeUntil,
} from "rxjs";
import { CommonModule, DatePipe } from "@angular/common";
import { AuthService } from "@auth0/auth0-angular";
import { SeoService } from "../../services/seo.service";
import { WowzaPublishService } from "../../services/wowza-publish.service";
import { WebRtcState } from "../../models/webrtc-state.model";
import { Router } from "@angular/router";
import { StreamUpdate, StreamService } from "../../services/stream.service";
import { LiveStream } from "../../models/live-stream.model";

@Component({
  selector: "app-stream",
  standalone: true,
  imports: [MatButtonModule, MatIconModule, FlexLayoutModule, CommonModule, MatProgressSpinnerModule],
  providers: [VideoService, DatePipe, WowzaPublishService],
  templateUrl: "./stream.component.html",
  styleUrl: "./stream.component.scss",
})
export class StreamComponent implements AfterViewInit {
  isAuthenticated$ = this.auth.isAuthenticated$;
  isLive$ = this.wowzaPublishService.isLive$;
  isReady = false;
  streamId: number | undefined;
  private destroy$ = new Subject<void>();
  @ViewChild("video") videoElement!: ElementRef<HTMLVideoElement>;

  constructor(
    private wowzaPublishService: WowzaPublishService,
    private streamService: StreamService,
    public auth: AuthService,
    private seo: SeoService,
    private snack: MatSnackBar,
    private router: Router
  ) { }

  ngOnInit() {
    this.isAuthenticated$.pipe(
      takeUntil(this.destroy$)).subscribe(isAuthenticated => {
        isAuthenticated ? this.init() : this.login();
      });
  }

  init() {
    this.wowzaPublishService.errors$
      .pipe(
        takeUntil(this.destroy$))
      .subscribe(err => {
        this.snack.open(err.message, 'Dismiss', {
          duration: 6000,
          horizontalPosition: 'right',
          verticalPosition: 'top',
        });
        // Optional: log details to console/telemetry 
        if (err.details) console.error('[WOWZA ERROR]', err);
      });
    this.streamService.getAvailableStreamOnce()
      .pipe(
        switchMap(s => this.getUpdates$(s).pipe(
          filter(u => u.phase === 'ready'),
          take(1),
          map(updates => ({ s, updates }))
        )
        ),
        takeUntil(this.destroy$)).subscribe(({ s, updates }) => {
          const state: WebRtcState = {
            sdpUrl: s.wssStreamUrl,
            applicationName: s.applicationName,
            streamName: s.streamName,
            videoElementPublish: this.videoElement.nativeElement
          }
          this.wowzaPublishService.init(state);
          this.isReady = true;
          this.streamId = s.id;
        });
  }

  login() {
    this.auth.loginWithRedirect({
      appState: {
        // -> comes back to us after login
        target: this.router.url,
        // scope: 'openid profile email offline_access'
      },
    });
  }

  async ngAfterViewInit() {
    this.setUpSeo();
  }

  getUpdates$(s: LiveStream): Observable<StreamUpdate> {
    if (s.phase == 'ready') {
      return of({
        id: s.id,
        phase: s.phase
      })
    }
    return this.streamService.updates$(s.id);
  }

  resumeWebcam() {
    this.wowzaPublishService.startPublish();
    this.streamService.start(this.streamId!);
  }

  stopWebcam() {
    this.wowzaPublishService.stopPublish();
    this.streamService.stop(this.streamId!).pipe(
      takeUntil(this.destroy$))
      .subscribe();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setUpSeo() {
    const title = "Stream – Skriin AI TV";
    const description =
      "One-click streaming hub: push gameplay, camera or desktop to Twitch, YouTube & Skriin Cloud. AI overlays, chat integration, 0.6 s latency.";
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
