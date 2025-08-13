import {
  AfterViewInit,
  Component,
  ElementRef,
  OnInit,
  ViewChild,
} from "@angular/core";
import { FlexLayoutModule } from "@angular/flex-layout";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { VideoService } from "../../services/video.service";
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  ReplaySubject,
  Subject,
  takeUntil,
} from "rxjs";
import { CommonModule, DatePipe } from "@angular/common";
import { AuthService } from "@auth0/auth0-angular";
import { SeoService } from "../../services/seo.service";
import { WowzaPublishService } from "../../services/wowza-publish.service";
import { WebRtcState } from "../../models/webrtc-state.model";
import { Router } from "@angular/router";

@Component({
  selector: "app-stream",
  standalone: true,
  imports: [MatButtonModule, MatIconModule, FlexLayoutModule, CommonModule],
  providers: [VideoService, DatePipe, WowzaPublishService],
  templateUrl: "./stream.component.html",
  styleUrl: "./stream.component.scss",
})
export class StreamComponent implements AfterViewInit {
  isAuthenticated$ = this.auth.isAuthenticated$;
  isLive$ = this.wowzaService.isLive$;
  private destroy$ = new Subject<void>();
  @ViewChild("video") videoElement!: ElementRef<HTMLVideoElement>;

  constructor(
    private wowzaService: WowzaPublishService,
    public auth: AuthService,
    private seo: SeoService,
    private snack: MatSnackBar,
    private router: Router
  ) { }

  ngOnInit() {
    this.wowzaService.errors$
      .pipe(takeUntil(this.destroy$))
      .subscribe(err => {
        this.snack.open(err.message, 'Dismiss', {
          duration: 6000,
          horizontalPosition: 'right',
          verticalPosition: 'top',
        });
        // Optional: log details to console/telemetry
        if (err.details) console.error('[WOWZA ERROR]', err);
      });
  }

  login() {
    this.auth.loginWithRedirect({
      appState: {
        // -> comes back to us after login
        target: this.router.url,
      },
    });
  }

  async ngAfterViewInit() {
    this.setUpSeo();
    const state: WebRtcState = {
      sdpUrl: 'wss://9b8d039ecdad.entrypoint.cloud.wowza.com/webrtc-session.json',
      applicationName: 'app-82XX3701',
      streamName: 'VU5rZnln',
      videoElementPublish: this.videoElement.nativeElement
    }
    this.wowzaService.init(state);
  }

  resumeWebcam() {
    this.wowzaService.startPublish();
  }

  stopWebcam() {
    this.wowzaService.stopPublish();
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
      // image: "https://www.yoursite.com/assets/calls-og-image.jpg",
    });
  }
}
