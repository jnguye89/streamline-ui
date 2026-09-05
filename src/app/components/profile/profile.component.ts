import {
  Component,
  OnDestroy,
  OnInit,
} from "@angular/core";
import { VideoService } from "../../services/video.service";
import { MatIconModule } from "@angular/material/icon";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatButtonModule } from "@angular/material/button";
import { MatDialog } from "@angular/material/dialog";
import { FlexLayoutModule } from "@angular/flex-layout";
import { concatMap, first, Subject, tap } from "rxjs";
import { CommonModule } from "@angular/common";
import { ActivatedRoute, Router } from "@angular/router";
import { PlayerStateService } from "../../state/player-state.service";
import { DeviceAuthService } from "../../services/device-auth.service";
import { GamepadFocusableDirective } from "../../directives/gamepad-focusable.directive";
import { GamepadNavigationService } from "../../services/gamepad-navigation.service";
import { ConfirmEndStreamDialog } from "../dialogs/confirm-stream.dialog";
import { StreamKeysDialog } from "../dialogs/stream-keys.dialog";
import { YoutubeChannelsDialog } from "../dialogs/youtube-channels.dialog";
import { SafeUrlPipe } from "../../pipes/safe-url.pipe";

@Component({
  selector: "app-profile",
  standalone: true,
  imports: [MatIconModule, MatTooltipModule, MatButtonModule, FlexLayoutModule, CommonModule, GamepadFocusableDirective, SafeUrlPipe],
  providers: [VideoService],
  templateUrl: "./profile.component.html",
  styleUrl: "./profile.component.scss",
})
export class ProfileComponent implements OnInit, OnDestroy {
  isAuthenticated$ = this.deviceAuth.isAuthenticated$;
  userId: string | null = null;
  currentUserSub: string | null = null;
  private destroy$ = new Subject<void>();
  videos: any[] = [];
  // Currently gamepad/keyboard-focused video tile (see the (focus) binding
  // on .video-item in the template) - what the Y aux action deletes.
  focusedVideo: any | null = null;
  isUploading = false;
  showPreviousButton: boolean = false;

  get isOwnProfile() {
    return !this.userId || this.userId === this.currentUserSub;
  }

  constructor(
    private videoService: VideoService,
    public deviceAuth: DeviceAuthService,
    private route: ActivatedRoute,
    private router: Router,
    private store: PlayerStateService,
    private dialog: MatDialog,
    private readonly gamepadNavigation: GamepadNavigationService
  ) { }

  ngOnInit(): void {
    this.userId = this.route.snapshot.paramMap.get("id");
    this.showPreviousButton = !!this.store.snapshot;

    // Delete has no separate focus stop of its own - see deleteFocusedVideo()
    // and the plan notes on why a second per-tile focusable target for the
    // small, corner-overlapping delete icon would be spatially unreliable.
    this.gamepadNavigation.setAuxButtonActions({ y: () => this.deleteFocusedVideo() });

    this.deviceAuth.user$.pipe(first()).subscribe(user => {
      this.currentUserSub = user?.sub ?? null;
    });

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
    this.gamepadNavigation.clearAuxButtonActions();
    this.destroy$.next();
    this.destroy$.complete();
  }

  goToWatch() {
    const url = `/watch/${this.store.snapshot?.id}`;
    this.store.clear();
    this.router.navigate([url]);
  }

  openStreamKeys(): void {
    this.dialog.open(StreamKeysDialog, { panelClass: 'spotlight-panel', autoFocus: false });
  }

  openYoutubeChannels(): void {
    this.dialog.open(YoutubeChannelsDialog, { panelClass: 'spotlight-panel', autoFocus: false });
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    this.isUploading = true;
    this.videoService
      .uploadToPresignedUrl(file)
      .catch(() => { this.isUploading = false; })
      .then(() => {
        this.isUploading = false;
        this.deviceAuth.user$.pipe(
          first(),
          concatMap(user => user ? this.videoService.getUserVideos(`${user.sub}`) : [])
        ).subscribe(videos => { this.videos = videos as any[]; });
      });
  }

  deleteVideo(video: any): void {
    const dialogRef = this.dialog.open(ConfirmEndStreamDialog, {
      panelClass: 'spotlight-panel',
      data: {
        title: 'Delete Video',
        body: 'Are you sure you want to delete this video? This cannot be undone.',
        confirmBtnText: 'Delete',
        cancelBtnText: 'Cancel',
      },
    });

    dialogRef.afterClosed().pipe(first()).subscribe((confirmed) => {
      if (!confirmed) return;
      this.videoService.deleteVideo(video.id).pipe(first()).subscribe(() => {
        this.videos = this.videos.filter((v) => v.id !== video.id);
      });
    });
  }

  // Y aux-button target: deletes whichever tile currently has
  // gamepad/keyboard focus, same guard the delete button's own *ngIf
  // applies in the template (own profile, logged in), then reuses the
  // existing confirm-dialog delete flow unchanged.
  private deleteFocusedVideo(): void {
    if (!this.isOwnProfile || !this.deviceAuth.getAccessToken()) return;
    if (!this.focusedVideo) return;
    this.deleteVideo(this.focusedVideo);
  }

  // A/Enter activation target (GamepadNavigationService.activateCurrent()
  // just calls .click() on the focused element, which for a video tile is
  // this handler). The event.target check is what keeps this from firing a
  // second time when a real mouse click bubbles up from something inside
  // the tile that already handles its own click - the native <video
  // controls> scrubber/play button, or the delete button above - since
  // those clicks target a descendant, not .video-item itself. A synthetic
  // .click() called directly on .video-item (the gamepad/keyboard path)
  // always targets .video-item itself, so it always passes this check.
  //
  // Looks up the tile's own <video> via querySelector at click time rather
  // than a #template-ref variable - the <video> is inside *ngIf, and *ngIf
  // desugars to its own <ng-template>, which puts a template-ref declared
  // on an element inside it out of scope for bindings outside that *ngIf
  // (an Angular NG9 template error, not a runtime one - this fixes it by
  // not needing a compile-time reference across that boundary at all).
  onTileClick(event: MouseEvent): void {
    if (event.target !== event.currentTarget) return;
    const tile = event.currentTarget as HTMLElement;
    const video = tile.querySelector<HTMLVideoElement>('video.video-player');
    if (!video) return; // YouTube tiles have no native <video> to toggle
    if (video.paused) { void video.play(); } else { video.pause(); }
  }
}
