import {
  Component,
  OnDestroy,
  OnInit,
} from "@angular/core";
import { VideoService } from "../../services/video.service";
import { MatIconModule } from "@angular/material/icon";
import { MatTooltipModule } from "@angular/material/tooltip";
import { FlexLayoutModule } from "@angular/flex-layout";
import { concatMap, first, Subject, tap } from "rxjs";
import { CommonModule } from "@angular/common";
import { ActivatedRoute, Router } from "@angular/router";
import { PlayerStateService } from "../../state/player-state.service";
import { DeviceAuthService } from "../../services/device-auth.service";
import { GamepadFocusableDirective } from "../../directives/gamepad-focusable.directive";

@Component({
  selector: "app-profile",
  standalone: true,
  imports: [MatIconModule, MatTooltipModule, FlexLayoutModule, CommonModule, GamepadFocusableDirective],
  providers: [VideoService],
  templateUrl: "./profile.component.html",
  styleUrl: "./profile.component.scss",
})
export class ProfileComponent implements OnInit, OnDestroy {
  isAuthenticated$ = this.deviceAuth.isAuthenticated$;
  userId: string | null = null;
  private destroy$ = new Subject<void>();
  videos: any[] = [];
  isUploading = false;
  showPreviousButton: boolean = false;

  constructor(
    private videoService: VideoService,
    public deviceAuth: DeviceAuthService,
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
      this.deviceAuth.user$
        .pipe(
          first(),
          concatMap((user) => {
            if (!!user) {
              return this.videoService.getUserVideos(`${user.sub}`);
            } else {
              this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
              return [];
            }
          }),
          tap((videos) => {
            if (!!videos) this.videos = videos as any[];
          })
        )
        .subscribe();
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
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
    this.isUploading = true;
    this.videoService
      .uploadToPresignedUrl(file)
      .catch((er) => (this.isUploading = false))
      .then((file) => {
        this.isUploading = false;
        this.videos.push(file);
      });
  }
}
