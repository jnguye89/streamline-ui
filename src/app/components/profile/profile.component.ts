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
import { CompactCountPipe } from "../../pipes/compact-count.pipe";
import { RouterLink } from "@angular/router";
import { UserService } from "../../services/user.service";
import { AccountDialog } from "./account.dialog";
import { VideoOptionsDialog } from "./video-options.dialog";
import { UserAvatarComponent } from "../user-avatar/user-avatar.component";

// Who can watch a video. The API does not send this yet; when it does,
// each card gets its top-left chip from VISIBILITY_BADGES.
type Visibility = 'private' | 'free' | 'free_ads' | 'subscribers' | 'rent_buy';
const VISIBILITY_BADGES: Record<Visibility, { icon: string; label: string; light?: boolean }> = {
  private: { icon: 'lock', label: 'Private', light: true },
  free: { icon: 'globe', label: 'Free' },
  free_ads: { icon: 'ads', label: 'Free · ads' },
  subscribers: { icon: 'star', label: 'Subscribers' },
  rent_buy: { icon: 'tag', label: 'Rent or buy' },
};

@Component({
  selector: "app-profile",
  standalone: true,
  imports: [MatIconModule, MatTooltipModule, MatButtonModule, FlexLayoutModule, CommonModule, RouterLink, UserAvatarComponent, GamepadFocusableDirective, SafeUrlPipe, CompactCountPipe],
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
  // Only true on an actual Skriin kiosk device - see WifiStatusService for
  // why a plain browser visitor never gets a truthy result here.
  wifiAvailable = false;
  // Number of simulcast destinations with a stream key saved.
  simulcastCount = 0;
  // Video id -> "m:ss" / "h:mm:ss", filled in as each card's metadata loads.
  durations: Record<number, string> = {};

  // Viewer view: the profile owner's name, from the API.
  ownerName = '';
  // Viewer view: the owner's photo (Auth0, mirrored by the API).
  ownerPicture: string | null = null;

  // Viewers never see private videos.
  get shownVideos(): any[] {
    return this.isOwnProfile ? this.videos : this.videos.filter(v => v.visibility !== 'private');
  }

  get subscriberVideoCount(): number {
    return this.videos.filter(v => v.visibility === 'subscribers').length;
  }

  get freeVideoCount(): number {
    return this.videos.filter(v => v.visibility === 'free' || v.visibility === 'free_ads').length;
  }

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
    private userService: UserService,
    private readonly gamepadNavigation: GamepadNavigationService
  ) { }

  ngOnInit(): void {
    this.userId = this.route.snapshot.paramMap.get("id");
    this.showPreviousButton = !!this.store.snapshot;

    // Y plays the focused video (the key line says "Y Play"). Hold-Y to
    // delete needs hold support in GamepadNavigationService; until then
    // delete is the trash button on the card.
    this.deviceAuth.user$.pipe(first()).subscribe(user => {
      this.currentUserSub = user?.sub ?? null;
      if (user && this.isOwnProfile) this.loadSimulcastCount();
    });

    if (this.isOwnProfile) {
      this.bindOwnerButtons();
    } else {
      // Viewer key line: X Like, B Back to the video.
      this.gamepadNavigation.setAuxButtonActions({ x: () => this.likeFocusedVideo() });
      if (this.showPreviousButton) {
        this.gamepadNavigation.setBackAction(() => { this.goToWatch(); return true; });
      }
      this.userService.getAuth0User(this.userId!).pipe(first()).subscribe({
        next: u => {
          this.ownerName = u?.username ?? '';
          this.ownerPicture = u?.picture ?? null;
        },
        error: () => this.ownerName = '',
      });
    }

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
    if (!this.isOwnProfile && this.showPreviousButton) this.gamepadNavigation.setBackAction(null);
    this.destroy$.next();
    this.destroy$.complete();
  }

  goToWatch() {
    const url = `/watch/${this.store.snapshot?.id}`;
    this.store.clear();
    this.router.navigate([url]);
  }

  openStreamKeys(): void {
    this.dialog.open(StreamKeysDialog, { panelClass: 'spotlight-panel', autoFocus: false })
      .afterClosed().pipe(first()).subscribe(() => {
        // The dialog took the controller buttons; take them back, and show
        // any keys or on/off changes on the Simulcast tile.
        this.bindOwnerButtons();
        this.loadSimulcastCount();
      });
  }

  private bindOwnerButtons(): void {
    this.gamepadNavigation.setAuxButtonActions({ y: () => this.playFocusedVideo() });
  }

  openYoutubeChannels(): void {
    this.dialog.open(YoutubeChannelsDialog, { panelClass: 'spotlight-panel', autoFocus: false });
  }

  // Account (YouTube Channels, help, Log Out) - behind "+ Menu".
  openAccount(): void {
    this.deviceAuth.user$.pipe(first()).subscribe(user => {
      this.dialog.open(AccountDialog, {
        panelClass: 'spotlight-panel',
        autoFocus: false,
        data: { name: user?.['nickname'] ?? user?.name ?? user?.email ?? 'Your account' },
      }).afterClosed().pipe(first()).subscribe(choice => {
        if (choice === 'youtube') this.openYoutubeChannels();
        if (choice === 'logout') this.logout();
      });
    });
  }

  icon(name: string): string {
    return `url(/assets/icons/tv/${name}.svg)`;
  }

  badgeFor(video: any) {
    const badge = VISIBILITY_BADGES[video?.visibility as Visibility] ?? null;
    // A viewer sees Subscribers videos as locked (handoff mockup 30).
    if (badge && video.visibility === 'subscribers' && !this.isOwnProfile) return { ...badge, icon: 'lock' };
    return badge;
  }

  // What A does on the focused card, for the viewer key line.
  viewerAction(video: any): string {
    if (video?.visibility === 'subscribers') return 'Subscribe to watch';
    if (video?.visibility === 'rent_buy') return 'Rent or buy';
    return 'Play';
  }

  likeFocusedVideo(): void {
    const video = this.focusedVideo;
    if (!video || video.liked || !this.deviceAuth.getAccessToken()) return;
    this.videoService.addLike(video.id).pipe(first()).subscribe(() => {
      video.liked = true;
      video.likeCount = (video.likeCount ?? 0) + 1;
    });
  }

  openOptions(video: any): void {
    this.focusedVideo = video;
    this.dialog.open(VideoOptionsDialog, {
      panelClass: 'spotlight-panel',
      autoFocus: false,
      data: { videoId: video.id, ownerName: this.ownerName || 'this creator', duration: this.durations[video.id] ?? null },
    });
  }

  onMetadata(video: any, event: Event): void {
    const secs = Math.round((event.target as HTMLVideoElement).duration);
    if (!isFinite(secs) || secs <= 0) return;
    const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    this.durations[video.id] = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }

  private loadSimulcastCount(): void {
    this.userService.getStreamKeys().pipe(first()).subscribe({
      // Destinations with a key that are switched on for the next live.
      next: keys => this.simulcastCount = (keys ?? [])
        .filter(k => !!k.streamKey && k.enabled !== false).length,
      error: () => this.simulcastCount = 0,
    });
  }

  private playFocusedVideo(): void {
    const el = document.activeElement as HTMLElement | null;
    const video = el?.classList.contains('card') ? el.querySelector<HTMLVideoElement>('video.video-player') : null;
    if (!video) return;
    if (video.paused) { void video.play(); } else { video.pause(); }
  }

  logout(): void {
    const dialogRef = this.dialog.open(ConfirmEndStreamDialog, {
      panelClass: 'spotlight-panel',
      data: {
        title: 'Log Out',
        body: 'Are you sure you want to log out?',
        confirmBtnText: 'Log Out',
        cancelBtnText: 'Cancel',
      },
    });

    dialogRef.afterClosed().pipe(first()).subscribe((confirmed) => {
      if (!confirmed) return;
      this.deviceAuth.logout();
      this.router.navigate(['/']);
    });
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
