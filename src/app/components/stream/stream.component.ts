import {
  AfterViewInit,
  Component,
  ElementRef,
  Inject,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  ViewChild,
} from "@angular/core";
import { FlexLayoutModule } from "@angular/flex-layout";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { VideoService } from "../../services/video.service";
import {
  combineLatest,
  filter,
  first,
  from,
  ReplaySubject,
  Subject,
  switchMap,
  take,
  takeUntil,
} from "rxjs";
import { CommonModule, DatePipe, isPlatformBrowser } from "@angular/common";
import { IvsBroadcastService } from "../../services/ivs-broadcast.service";
import { AuthService } from "@auth0/auth0-angular";
import { Router } from "@angular/router";
import { Meta, Title } from "@angular/platform-browser";
import { SeoService } from "../../services/seo.service";

@Component({
  selector: "app-stream",
  standalone: true,
  imports: [MatButtonModule, MatIconModule, FlexLayoutModule, CommonModule],
  providers: [VideoService, DatePipe, IvsBroadcastService],
  templateUrl: "./stream.component.html",
  styleUrl: "./stream.component.scss",
})
export class StreamComponent implements OnDestroy, AfterViewInit, OnInit {
  isAuthenticated$ = this.auth.isAuthenticated$;
  private destroy$ = new Subject<void>();
  @ViewChild("video") videoElement!: ElementRef<HTMLVideoElement>;
  broadcasting = false;
  private viewReady$ = new ReplaySubject<void>(1);

  constructor(
    public auth: AuthService,
    private ivs: IvsBroadcastService,
    private videoService: VideoService,
    private router: Router,
    private seo: SeoService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  async ngOnInit() {
    this.setUpSeo();
    if (isPlatformBrowser(this.platformId)) {
      this.isAuthenticated$.pipe(first()).subscribe((isAuth) => {
        if (!isAuth)
          this.auth.loginWithRedirect({
            appState: {
              // -> comes back to us after login
              target: this.router.url,
            },
          });
      });

      /* 2️⃣ When BOTH auth === true AND the view is present, start the player */
      combineLatest([
        this.isAuthenticated$.pipe(filter(Boolean)),
        this.viewReady$,
      ])
        .pipe(
          take(1), // run once
          switchMap(() =>
            from(
              navigator.mediaDevices.getUserMedia({ video: true, audio: true })
            )
          ),
          takeUntil(this.destroy$)
        )
        .subscribe(async (stream) => {
          this.videoElement.nativeElement.srcObject = stream;
          await this.videoElement.nativeElement.play();
          await this.ivs.init();
        });
    }
  }

  async ngAfterViewInit() {
    if (isPlatformBrowser(this.platformId)) {
      this.viewReady$.next();
    }
  }

  async toggle() {}

  resumeWebcam() {
    this.ivs.startBroadcast();
    this.videoElement.nativeElement.play();
    this.broadcasting = true;
  }

  pauseWebcam() {
    this.videoElement.nativeElement.pause();
    this.ivs.stopBroadcast();
    this.broadcasting = false;
  }

  stopWebcam() {
    this.ivs.stopBroadcast();
    this.videoElement.nativeElement.srcObject = null;
    this.broadcasting = false;
  }

  ngOnDestroy() {
    this.broadcasting = false;
    this.videoElement.nativeElement.srcObject = null;
    this.ivs.stopBroadcast();
    this.destroy$.next();
    this.destroy$.complete();
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    this.videoService.uploadVideo(file).pipe(first()).subscribe();
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
