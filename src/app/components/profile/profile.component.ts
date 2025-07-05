import {
  Component,
  Inject,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
} from "@angular/core";
import { VideoService } from "../../services/video.service";
import { HttpClientModule } from "@angular/common/http";
import { MatIconModule } from "@angular/material/icon";
import { FlexLayoutModule } from "@angular/flex-layout";
import { concatMap, first, Subject, takeUntil, tap } from "rxjs";
import { CommonModule, isPlatformBrowser } from "@angular/common";
import { AuthService } from "@auth0/auth0-angular";
import { ActivatedRoute, Router } from "@angular/router";

@Component({
  selector: "app-profile",
  standalone: true,
  imports: [HttpClientModule, MatIconModule, FlexLayoutModule, CommonModule],
  providers: [VideoService],
  templateUrl: "./profile.component.html",
  styleUrl: "./profile.component.scss",
})
export class ProfileComponent implements OnInit, OnDestroy {
  isAuthenticated$ = this.auth.isAuthenticated$;
  userId: string | null = null;
  private destroy$ = new Subject<void>();
  videos: any[] = [];
  constructor(
    private videoService: VideoService,
    public auth: AuthService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.userId = this.route.snapshot.paramMap.get("id");
    if (!!this.userId) {
      this.videoService
        .getUserVideos(this.userId)
        .pipe(first())
        .subscribe((videos) => {
          this.videos = videos;
        });
    } else {
      this.auth.user$
        .pipe(
          first(),
          concatMap((user) => {
            if (!!user) {
              return this.videoService.getUserVideos(`${user.sub}`);
            } else {
              return this.auth.loginWithRedirect({
                appState: {
                  // -> comes back to us after login
                  target: this.router.url,
                },
              });
            }
          }),
          tap((videos) => {
            if (!!videos) this.videos = videos;
          })
        )
        .subscribe();
    }
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
        // concatMap(() => this.videoService.getUserVideos("123")),
        takeUntil(this.destroy$)
      )
      .subscribe((videos: any[]) => (this.videos = videos));
  }
}
