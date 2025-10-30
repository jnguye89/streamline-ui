import {
  Component,
  OnDestroy,
  OnInit,
} from "@angular/core";
import { VideoService } from "../../services/video.service";
import { MatIconModule } from "@angular/material/icon";
import { FlexLayoutModule } from "@angular/flex-layout";
import { concatMap, first, Subject, tap } from "rxjs";
import { CommonModule } from "@angular/common";
import { AuthService } from "@auth0/auth0-angular";
import { ActivatedRoute, Router } from "@angular/router";
import { PlayerStateService } from "../../state/player-state.service";

@Component({
  selector: "app-profile",
  standalone: true,
  imports: [MatIconModule, FlexLayoutModule, CommonModule],
  providers: [VideoService],
  templateUrl: "./profile.component.html",
  styleUrl: "./profile.component.scss",
})
export class ProfileComponent implements OnInit, OnDestroy {
  isAuthenticated$ = this.auth.isAuthenticated$;
  userId: string | null = null;
  private destroy$ = new Subject<void>();
  videos: any[] = [];
  isUploading = false; // <-- Added
  showPreviousButton: boolean = false;

  constructor(
    private videoService: VideoService,
    public auth: AuthService,
    private route: ActivatedRoute,
    private router: Router,
    private store: PlayerStateService
  ) { }

  ngOnInit(): void {
    this.userId = this.route.snapshot.paramMap.get("id");
    this.showPreviousButton = !!this.store.snapshot;
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

  goToWatch() {
    const url = `/watch/${this.store.snapshot?.id}`;
    this.store.clear();
    this.router.navigate([url]);
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    this.isUploading = true; // <-- Start loading
    this.videoService
      .uploadToPresignedUrl(file)
      .catch((er) => (this.isUploading = false))
      .then((file) => {
        this.isUploading = false;
        this.videos.push(file);
      });
  }
}
