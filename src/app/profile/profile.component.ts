import { Component, OnDestroy, OnInit } from "@angular/core";
import { VideoService } from "../services/video.service";
import { HttpClientModule } from "@angular/common/http";
import { MatIconModule } from "@angular/material/icon";
import { FlexLayoutModule } from "@angular/flex-layout";
import { concatMap, first, Subject, takeUntil, tap } from "rxjs";
import { CommonModule } from "@angular/common";

@Component({
  selector: "app-profile",
  standalone: true,
  imports: [HttpClientModule, MatIconModule, FlexLayoutModule, CommonModule],
  providers: [VideoService],
  templateUrl: "./profile.component.html",
  styleUrl: "./profile.component.scss",
})
export class ProfileComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  videos: any[] = [];
  constructor(private videoService: VideoService) {}

  ngOnInit(): void {
    this.videoService
      .getUserVideos()
      .pipe(first())
      .subscribe((videos) => {
        this.videos = videos;
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete;
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    this.videoService
      .uploadVideo(file)
      .pipe(
        tap(() => console.log("upload done, now fetching user videos")),
        concatMap(() => this.videoService.getUserVideos()),
        takeUntil(this.destroy$)
      )
      .subscribe((videos: any[]) => (this.videos = videos));
  }
}
