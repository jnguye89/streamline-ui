import {
  AfterViewInit,
  Component,
  OnDestroy,
  OnInit,
  ViewChild,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { MatDividerModule } from "@angular/material/divider";
import { MatButtonModule } from "@angular/material/button";
import { FlexLayoutModule } from "@angular/flex-layout";
import { MatChipsModule } from "@angular/material/chips";
import { VideoService } from "../../services/video.service";
import { Router, RouterModule } from "@angular/router";
import { BehaviorSubject, Subject, takeUntil } from "rxjs";
import { Video } from "../../models/video.model";
import { Meta, Title } from "@angular/platform-browser";
import { SeoService } from "../../services/seo.service";

declare const IVSPlayer: any;

@Component({
  selector: "app-watch",
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    FlexLayoutModule,
    MatChipsModule,
    RouterModule,
    CommonModule,
  ],
  providers: [VideoService],
  templateUrl: "./watch.component.html",
  styleUrl: "./watch.component.scss",
})
export class WatchComponent implements OnDestroy, AfterViewInit, OnInit {
  private destroy$ = new Subject<void>();
  private videoTitlesSubject = new BehaviorSubject<Video[]>([]);
  // @ViewChild("player", { static: false })
  // playerRef!: ElementRef<HTMLVideoElement>;
  videoTitles$ = this.videoTitlesSubject.asObservable();
  isPortrait = false;

  currentIndex = 0;
  currentTitle: Video | null = null;
  isLive = false;

  constructor(
    private videoService: VideoService,
    private router: Router,
    private seo: SeoService
  ) {
    this.videoService
      .getVideos()
      .pipe(takeUntil(this.destroy$))
      .subscribe((videos) => {
        this.videoTitlesSubject.next(videos);
        if (videos.length > 0) {
          this.currentIndex = Math.floor(Math.random() * videos.length);
          this.currentTitle = videos[this.currentIndex];
        }
      });
  }

  // private checkIfStreamIsLive(): Observable<StreamStatus> {
  //   return this.videoService.getStreamStatus().pipe(
  //     catchError((error) => {
  //       console.error("Error checking stream status:", error);
  //       return of({ isLive: false } as StreamStatus); // fallback value
  //     })
  //   );
  // }

  ngOnInit() {
    this.setUpSeo();
  }

  ngAfterViewInit(): void {
    // this.videoService
    //   .getVideos()
    //   .pipe(
    //     switchMap((videos) =>
    //       forkJoin({
    //         videos: of(videos),
    //         // status: this.checkIfStreamIsLive(), // your new HTTP call
    //       })
    //     ),
    //     takeUntil(this.destroy$)
    //   )
    //   .subscribe(({ videos }) => {
    //     // if (status.isLive) {
    //     //   this.isLive = true;
    //     //   const videoEl = document.getElementById(
    //     //     "live-player"
    //     //   ) as HTMLVideoElement;
    //     //   console.log(videoEl);
    //     //   // if (IVSPlayer.isPlayerSupported) {
    //     //   const player = IVSPlayer.create();
    //     //   player.attachHTMLVideoElement(videoEl);
    //     //   player.load(environment.streamUrl);
    //     //   player.play();
    //     //   //   } else {
    //     //   //     console.error("IVS player not supported in this browser");
    //     //   //   }
    //     // }
    //     // } else if (videos.length > 0) {
    //     this.currentIndex = Math.floor(Math.random() * videos.length);
    //     this.currentTitle = videos[this.currentIndex];
    //     this.videoTitlesSubject.next(videos);
    //     // }
    //   });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete;
  }

  next() {
    const titles = this.videoTitlesSubject.value;
    if (!titles.length) return;

    this.currentIndex++;
    if (this.currentIndex >= titles.length) {
      this.currentIndex = 0;
    }
    this.currentTitle = titles[this.currentIndex];
  }

  previous() {
    const titles = this.videoTitlesSubject.value;
    if (!titles.length) return;

    this.currentIndex--;
    if (this.currentIndex < 0) {
      this.currentIndex = titles.length - 1;
    }
    this.currentTitle = titles[this.currentIndex];
  }

  onVideoLoaded(video: HTMLVideoElement) {
    console.log("video loaded: ", video);
    const aspectRatio = video.videoWidth / video.videoHeight;
    this.isPortrait = aspectRatio < 1; // if width < height, it's portrait
    video.defaultMuted = true;
    video.muted = true;
    video
      .play()
      .then(() => {
        console.log("✅ video started");
      })
      .catch((err) => {
        console.warn("🚫 play() was blocked or failed:", err);
      });
  }

  goToProfile() {
    this.router.navigate(["/profile", this.currentTitle?.user || ""]);
  }

  private setUpSeo() {
    const title = "Watch – Skriin AI TV";
    const description =
      "Discover and watch creators, VODs, podcasts and cloud DVR in one curated interface powered by AI recommendations and voice search.";
    const keywords =
      "watch streaming content, creator hub tv, ai recommendations, vod player, voice search tv";
    this.seo.setTags({
      title,
      description,
      keywords,
      path: "/watch",
      // image: "https://www.yoursite.com/assets/calls-og-image.jpg",
    });
  }
}
