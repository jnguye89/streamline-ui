import { AfterViewInit, Component, OnDestroy, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { MatDividerModule } from "@angular/material/divider";
import { MatButtonModule } from "@angular/material/button";
import { FlexLayoutModule } from "@angular/flex-layout";
import { MatChipsModule } from "@angular/material/chips";
import { VideoService } from "../services/video.service";
import { HttpClientModule } from "@angular/common/http";
import { RouterModule } from "@angular/router";
import { BehaviorSubject, Subject, takeUntil } from "rxjs";


@Component({
  selector: "app-watch",
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    FlexLayoutModule,
    MatChipsModule,
    HttpClientModule,
    RouterModule,
    CommonModule,
  ],
  providers: [VideoService],
  templateUrl: "./watch.component.html",
  styleUrl: "./watch.component.scss",
})
export class WatchComponent implements OnDestroy {
  private destroy$ = new Subject<void>();
  private videoTitlesSubject = new BehaviorSubject<string[]>([]);
  videoTitles$ = this.videoTitlesSubject.asObservable();
  isPortrait = false;

  currentIndex = 0;
  currentTitle = "";

  constructor(private videoService: VideoService) {
    this.videoService
      .getVideos()
      .pipe(takeUntil(this.destroy$))
      .subscribe((titles) => {
        this.videoTitlesSubject.next(titles);

        if (titles.length > 0) {
          this.currentIndex = Math.floor(Math.random() * titles.length);
          this.currentTitle = titles[this.currentIndex];
        }
      });
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
    const aspectRatio = video.videoWidth / video.videoHeight;
    this.isPortrait = aspectRatio < 1; // if width < height, it's portrait
  }
}
