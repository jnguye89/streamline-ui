import {
  AfterViewInit,
  Component,
  OnDestroy,
  OnInit,
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

  ngOnInit() {
    this.setUpSeo();
  }

  ngAfterViewInit(): void {
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
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
    });
  }
}
