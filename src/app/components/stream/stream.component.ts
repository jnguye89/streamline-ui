import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { FlexLayoutModule } from "@angular/flex-layout";
import { MatButtonModule } from "@angular/material/button";
import { MatDialog } from "@angular/material/dialog";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from "@angular/router";
import { MediaInputState, MediaPreviewState } from '../../models/media-input.models';
import {
  Subject,
  filter,
  firstValueFrom,
  take,
  takeUntil,
} from "rxjs";
import { DeviceAuthService } from "../../services/device-auth.service";
import { GamepadFocusableDirective } from "../../directives/gamepad-focusable.directive";
import { ChatColorPipe } from "../../pipes/chat-color.pipe";
import { GamepadNavigationService } from "../../services/gamepad-navigation.service";
import { MediaInputService } from "../../services/media-input.service";
import { RtcStreamService } from "../../services/agora/rtc-stream.service";
import { SeoService } from "../../services/seo.service";
import { StreamService } from "../../services/stream.service";
import {
  ChatMessage,
  RecordingSocketService,
} from "../../services/socket/recording.service";
import { ConfirmEndStreamDialog } from "../dialogs/confirm-stream.dialog";

/**
 * Which video source(s) are currently feeding the stream. This mirrors the
 * "Main stream" (primary) / "Facecam" (overlay) pairing MediaInputService
 * already tracks internally - it's just a friendlier, TV-remote-sized
 * control surface on top of that same state.
 */
type DisplayMode = 'webcam' | 'screen' | 'screen-cam';

@Component({
  selector: "app-stream",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    FlexLayoutModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    GamepadFocusableDirective,
    ChatColorPipe,
  ],
  templateUrl: "./stream.component.html",
  styleUrl: "./stream.component.scss",
})
export class StreamComponent
  implements OnInit, AfterViewInit, OnDestroy
{
  private readonly dialog = inject(MatDialog);
  private readonly destroy$ = new Subject<void>();
  private inputChangeQueue = Promise.resolve();

  @ViewChild('video', { static: true })
  videoElement!: ElementRef<HTMLVideoElement>;
  @ViewChild('previewStage', { static: true })
  previewStageElement!: ElementRef<HTMLElement>;

  readonly isAuthenticated$ = this.deviceAuth.isAuthenticated$;
  readonly isLive$ = this.rtcStreamService.isLive$;
  readonly mediaState$ = this.mediaInput.state$;
  readonly previewState$ = this.mediaInput.preview$;
  readonly audioMix$ = this.mediaInput.audioMix$;

  isAuthenticated = false;
  isLive = this.rtcStreamService.isLive$.value;
  previewState: MediaPreviewState = this.mediaInput.previewSnapshot;
  isReady = false;
  isStarting = false;
  isInitializing = false;
  isApplyingInputs = false;
  channelName: string | undefined;
  workflowError: string | null = null;
  chatMessages: (ChatMessage & { key: string })[] = [];
  chatText = '';

  /** The video source quick-picker's current mode; defaults to both on. */
  displayMode: DisplayMode = 'screen-cam';
  /** Device id for whichever video source is currently treated as "the screen" (main). */
  screenDeviceId: string | null = null;
  /** Device id for whichever video source is currently treated as "the webcam" (facecam). */
  webcamDeviceId: string | null = null;
  /** True once media has offered a primary+overlay pair to remember for Screen + cam mode. */
  isWebcamPrimary = false;
  private capturedDefaultDevices = false;

  private readonly chatMaxVisible = 12;

  constructor(
    private readonly streamService: StreamService,
    public readonly deviceAuth: DeviceAuthService,
    private readonly seo: SeoService,
    private readonly router: Router,
    private readonly gamepadNavigation: GamepadNavigationService,
    private readonly rtcStreamService: RtcStreamService,
    private readonly socket: RecordingSocketService,
    public readonly mediaInput: MediaInputService,
  ) {}

  ngOnInit(): void {
    this.isAuthenticated$
      .pipe(takeUntil(this.destroy$))
      .subscribe((isAuthenticated) => {
        this.isAuthenticated = isAuthenticated;
        if (isAuthenticated && !this.channelName) {
          void this.init();
        } else if (!isAuthenticated) {
          void this.login();
        }
      });
    this.isLive$
      .pipe(takeUntil(this.destroy$))
      .subscribe((isLive) => (this.isLive = isLive));
    this.previewState$
      .pipe(takeUntil(this.destroy$))
      .subscribe((previewState) => (this.previewState = previewState));
    this.mediaState$
      .pipe(takeUntil(this.destroy$))
      .subscribe((media) => this.onMediaState(media));

    // Y swaps the primary/facecam pairing (only meaningful, and only
    // wired up on-screen, while Screen + cam is active). LB/RB mute the
    // mic/screen audio - this claims those two buttons away from their
    // normal app-wide previous/next-page swipe for as long as this page
    // is active; LT/RT still page-swipe as the fallback.
    this.gamepadNavigation.setAuxButtonActions({
      y: () => {
        if (this.displayMode === 'screen-cam') void this.swapSources();
      },
      lb: () => this.toggleMicrophoneMute(),
      rb: () => this.toggleGameMute(),
    });
  }

  /**
   * The screen/webcam pairing must be derived from the enumerated device
   * list (`videoInputs`), never from `selection`/`consoleSelection` -
   * those reflect whatever MediaInputService restored from localStorage,
   * which is the primary device *from the previous session*. That could be
   * either physical device depending on what the user last did (swapped,
   * switched to screen-only, etc.), so keying the role assignment off it
   * made the webcam/screen mapping flip randomly on reload even though the
   * user never touched anything this session. `videoInputs` order comes
   * straight from the browser's device enumeration and is stable for the
   * same connected hardware, so pairing off it instead means the same
   * physical camera is always "the screen" and the other is always "the
   * webcam," reload after reload. The first time both roles are known -
   * which can be on the very first device list, or later, if a camera
   * (e.g. Continuity Camera) enumerates after a "devicechange" event - we
   * force the underlying selection to match synchronously so Screen + cam
   * starts out screen-forward. That flip is synchronous and side-effect
   * free, so it never races refreshPreview()'s getUserMedia call; only if
   * a preview/publish is already running (the late-arrival case) do we
   * also kick off the async refresh needed to update the live stream.
   */
  private onMediaState(media: MediaInputState): void {
    const [firstDevice, secondDevice] = media.videoInputs;

    if (!this.capturedDefaultDevices && firstDevice && secondDevice) {
      const screen = firstDevice.deviceId;
      const webcam = secondDevice.deviceId;
      this.webcamDeviceId = webcam;
      this.screenDeviceId = screen;
      this.capturedDefaultDevices = true;
      this.displayMode = 'screen-cam';

      this.mediaInput.selectVideo(screen);
      this.mediaInput.selectOverlayVideo(webcam);

      if (this.isReady) {
        // The second source only became known after the preview/publish
        // was already running (e.g. it enumerated late) - refresh the
        // live stream to match, not just the idle selection.
        void this.selectVideo(screen).then(() =>
          this.selectOverlayVideo(webcam),
        );
      }
    } else if (!this.capturedDefaultDevices && firstDevice && !this.webcamDeviceId) {
      // Only one video source exists so far - there's nothing to pair it
      // with as "the screen" yet, so treat it as the webcam and stay in
      // single-source mode. If a second source shows up later (a camera
      // that enumerates late), the branch above takes over from here.
      this.webcamDeviceId = firstDevice.deviceId;
      this.screenDeviceId = null;
      this.displayMode = 'webcam';
    }

    // Read the live snapshot here rather than the `media` argument: the
    // two forced selectVideo/selectOverlayVideo calls above emit their own
    // state synchronously and re-enter this method before this line runs,
    // so by the time we get here `media` is a stale snapshot from before
    // that swap. Using `media` here would silently overwrite the correct,
    // freshly-recomputed isWebcamPrimary with the pre-swap value - visible
    // as the W/S highlight not updating on the very first swap after load.
    const currentVideoDeviceId = this.mediaInput.snapshot.selection.videoDeviceId;
    this.isWebcamPrimary =
      !!currentVideoDeviceId && currentVideoDeviceId === this.webcamDeviceId;
  }

  ngAfterViewInit(): void {
    this.setUpSeo();
  }

  async init(): Promise<void> {
    if (this.isInitializing) return;
    this.isInitializing = true;
    this.workflowError = null;
    this.channelName = `host-${Math.random().toString(36).substring(2, 15)}`;

    try {
      await firstValueFrom(
        this.deviceAuth.user$.pipe(
          filter((user): user is NonNullable<typeof user> & { sub: string } => !!user?.sub),
          take(1),
        ),
      );

      const token = await firstValueFrom(
        this.streamService.ensureReady(this.channelName),
      );
      if (!token.agoraUid) {
        throw new Error('The stream token response did not include an Agora UID.');
      }

      await this.mediaInput.initialize();
      if (this.mediaInput.snapshot.selection.videoDeviceId) {
        await this.refreshPreview();
      }

      await this.rtcStreamService.join(
        token.appId,
        this.channelName,
        token.rtcToken,
        token.agoraUid,
      );
      this.isReady = true;
      this.initializeChat();
    } catch {
      this.mediaInput.stopPreview();
      this.clearVideoElement();
      try {
        await this.rtcStreamService.leave();
      } catch {
        // Preserve the actionable setup error even if Agora cleanup also fails.
      }
      this.workflowError =
        'The stream could not be prepared. Check your connection and retry.';
      this.isReady = false;
      this.channelName = undefined;
    } finally {
      this.isInitializing = false;
    }
  }

  private initializeChat(): void {
    try {
      this.socket.connect();
      this.socket.joinRoom(this.channelName!);
      this.socket.chatMessage$
        .pipe(takeUntil(this.destroy$))
        .subscribe((message) => this.onChatMessage(message));
    } catch {
      // Chat is supplemental and must not invalidate a ready media session.
    }
  }

  retrySetup(): Promise<void> {
    return this.init();
  }

  login(): Promise<boolean> {
    return this.router.navigate(['/login'], {
      queryParams: { returnUrl: this.router.url },
    });
  }

  /** Webcam becomes the main display; screen is turned off. */
  async selectWebcamMode(): Promise<void> {
    if (this.displayMode === 'webcam' || !this.webcamDeviceId) return;
    this.displayMode = 'webcam';
    await this.selectSingleSource(this.webcamDeviceId);
  }

  /** Screen becomes the main display; webcam is turned off. */
  async selectScreenMode(): Promise<void> {
    if (this.displayMode === 'screen' || !this.screenDeviceId) return;
    this.displayMode = 'screen';
    await this.selectSingleSource(this.screenDeviceId);
  }

  /** Both screen and webcam are live; screen is the main display by default. */
  async selectScreenCamMode(): Promise<void> {
    if (this.displayMode === 'screen-cam') return;
    if (!this.screenDeviceId || !this.webcamDeviceId) return;
    this.displayMode = 'screen-cam';
    await this.selectVideo(this.screenDeviceId);
    await this.selectOverlayVideo(this.webcamDeviceId);
  }

  selectVideo(deviceId: string): Promise<void> {
    return this.queueInputChange(async () => {
      const wasLive = this.rtcStreamService.isLive$.value;
      try {
        this.mediaInput.selectVideo(deviceId || null);
        const stream = await this.mediaInput.refreshPrimaryVideo();
        if (!stream) return;
        await this.mediaInput.refreshOverlayVideo();
        await this.mediaInput.refreshAudioSources();
        if (this.rtcStreamService.isLive$.value) {
          await this.rtcStreamService.replacePublishedVideo(stream);
          await this.syncPublishedAudio();
        }
        this.mediaInput.commitPrimaryVideoRefresh();
        await this.renderPrimaryPreview(stream);
      } catch {
        await this.handleInputChangeFailure(wasLive);
      }
    });
  }

  selectOverlayVideo(deviceId: string): Promise<void> {
    return this.queueInputChange(async () => {
      const wasLive = this.rtcStreamService.isLive$.value;
      try {
        this.mediaInput.selectOverlayVideo(deviceId || null);
        await this.mediaInput.refreshOverlayVideo();
      } catch {
        await this.handleInputChangeFailure(wasLive);
      }
    });
  }

  /**
   * Switches to a single video source (webcam-only or screen-only) without
   * ever touching the other device. MediaInputService.selectVideo() always
   * re-pairs *some* other camera as the overlay as its own auto-pairing
   * default (see reconcileConsoleSelection) - so selecting a new primary
   * and only clearing the overlay afterward (the old selectVideo() +
   * selectOverlayVideo('') sequence) briefly re-acquired the other device
   * as an overlay before releasing it a moment later. Clearing the overlay
   * in the same synchronous step as the primary change means
   * refreshOverlayVideo() below sees "no overlay" from the start and never
   * touches the other device at all.
   */
  private selectSingleSource(deviceId: string): Promise<void> {
    return this.queueInputChange(async () => {
      const wasLive = this.rtcStreamService.isLive$.value;
      try {
        this.mediaInput.selectVideo(deviceId || null);
        this.mediaInput.selectOverlayVideo(null);
        const stream = await this.mediaInput.refreshPrimaryVideo();
        if (!stream) return;
        await this.mediaInput.refreshOverlayVideo();
        await this.mediaInput.refreshAudioSources();
        if (this.rtcStreamService.isLive$.value) {
          await this.rtcStreamService.replacePublishedVideo(stream);
          await this.syncPublishedAudio();
        }
        this.mediaInput.commitPrimaryVideoRefresh();
        await this.renderPrimaryPreview(stream);
      } catch {
        await this.handleInputChangeFailure(wasLive);
      }
    });
  }

  toggleGameMute(): void {
    this.mediaInput.setGameMuted(!this.mediaInput.audioMixSnapshot.gameMuted);
  }

  toggleMicrophoneMute(): void {
    this.mediaInput.setMicrophoneMuted(
      !this.mediaInput.audioMixSnapshot.microphoneMuted,
    );
  }

  swapSources(): Promise<void> {
    return this.queueInputChange(async () => {
      const wasLive = this.rtcStreamService.isLive$.value;
      try {
        this.mediaInput.swapSources();
        const stream = await this.mediaInput.refreshPrimaryVideo();
        await this.mediaInput.refreshOverlayVideo();
        await this.mediaInput.refreshAudioSources();
        if (stream && this.rtcStreamService.isLive$.value) {
          await this.rtcStreamService.replacePublishedVideo(stream);
          await this.syncPublishedAudio();
        }
        if (stream) this.mediaInput.commitPrimaryVideoRefresh();
        if (stream) await this.renderPrimaryPreview(stream);
      } catch {
        await this.handleInputChangeFailure(wasLive);
      }
    });
  }

  private async syncPublishedAudio(): Promise<void> {
    if (!this.rtcStreamService.isLive$.value) return;
    const stream = this.mediaInput.previewSnapshot.stream;
    if (stream) await this.rtcStreamService.syncPublishedAudio(stream);
  }

  async toggleFullscreen(): Promise<void> {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await this.previewStageElement.nativeElement.requestFullscreen();
    }
  }

  async retryInputs(): Promise<void> {
    this.workflowError = null;
    await this.mediaInput.initialize();
    if (this.mediaInput.snapshot.selection.videoDeviceId) {
      await this.refreshPreview();
    }
  }

  async resumeWebcam(): Promise<void> {
    if (!this.channelName || this.isStarting) {
      return;
    }

    this.isStarting = true;
    this.workflowError = null;
    try {
      let stream = this.mediaInput.previewSnapshot.stream;
      if (!stream || stream.getVideoTracks()[0]?.readyState === 'ended') {
        stream = await this.refreshPreview();
      }
      if (!stream) {
        throw new Error('No preview stream is available.');
      }

      await this.mediaInput.resumeAudioContext();
      await this.rtcStreamService.startPublish(stream);
      await this.streamService.start(this.channelName);
    } catch {
      await this.rtcStreamService.stopPublish();
      await this.restorePreview();
      this.workflowError =
        'Going live failed. Check the selected inputs and try again.';
    } finally {
      this.isStarting = false;
    }
  }

  async stopWebcam(openDialog = true): Promise<void> {
    if (!this.channelName) {
      return;
    }

    let response: { filename: string } | undefined;
    let stopFailed = false;
    let backendStopFailed = false;
    let previewRestoreFailed = false;
    try {
      try {
        await this.rtcStreamService.stopPublish();
      } catch {
        stopFailed = true;
      }
      try {
        response = await this.streamService.stop(this.channelName);
      } catch {
        stopFailed = true;
        backendStopFailed = true;
      }
    } finally {
      previewRestoreFailed = !(await this.restorePreview());
    }

    if (stopFailed) {
      this.workflowError =
        'The stream stopped locally, but some shutdown steps failed. Retry before going live again.';
    } else if (previewRestoreFailed) {
      this.workflowError =
        'The stream stopped, but the local preview could not be restarted. Review the selected inputs and retry.';
    }
    if (openDialog && !backendStopFailed) this.showEndStreamDialog(response);
  }

  ngOnDestroy(): void {
    if (this.channelName) this.socket.leaveRoom(this.channelName);
    this.gamepadNavigation.clearAuxButtonActions();
    this.destroy$.next();
    this.destroy$.complete();
    this.mediaInput.stopPreview();
    this.clearVideoElement();
    void this.rtcStreamService.leave().catch(() => undefined);
  }

  sendChat(): void {
    const text = this.chatText.trim();
    if (!text || !this.channelName) return;

    this.socket.sendChat(this.channelName, text);
    this.chatText = '';
  }

  trackChatMessage(
    _: number,
    message: ChatMessage & { key: string },
  ): string {
    return message.key;
  }

  private onChatMessage(message: ChatMessage): void {
    if (message.roomId !== this.channelName) return;

    const entry = {
      ...message,
      key: `${message.ts}-${Math.random().toString(36).slice(2)}`,
    };
    this.chatMessages = [...this.chatMessages, entry].slice(
      -this.chatMaxVisible,
    );
  }

  private async refreshPreview(): Promise<MediaStream | null> {
    const stream = await this.mediaInput.startPreview();
    if (!stream) {
      this.clearVideoElement();
      return null;
    }

    await this.renderPrimaryPreview(stream);
    return stream;
  }

  private async restorePreview(): Promise<boolean> {
    try {
      return !!(await this.refreshPreview());
    } catch {
      this.mediaInput.stopPreview();
      this.clearVideoElement();
      return false;
    }
  }

  private async renderPrimaryPreview(stream: MediaStream): Promise<void> {
    const video = this.videoElement.nativeElement;
    video.muted = true;
    video.volume = 0;
    video.srcObject = new MediaStream(stream.getVideoTracks());
    try {
      await video.play();
    } catch {
      // The stream remains attached; a user gesture can resume autoplay.
    }
  }

  private clearVideoElement(): void {
    if (this.videoElement) {
      this.videoElement.nativeElement.srcObject = null;
    }
  }

  private async handleInputChangeFailure(wasLive: boolean): Promise<void> {
    if (wasLive) {
      await this.stopWebcam(false);
    } else {
      this.mediaInput.stopPreview();
      this.clearVideoElement();
    }
    this.workflowError =
      'The selected input could not be applied. Review the available devices and retry.';
  }

  private queueInputChange(operation: () => Promise<void>): Promise<void> {
    const queued = this.inputChangeQueue.then(async () => {
      this.isApplyingInputs = true;
      try {
        await operation();
      } finally {
        this.isApplyingInputs = false;
      }
    });
    this.inputChangeQueue = queued.catch(() => undefined);
    return queued;
  }

  private showEndStreamDialog(response?: { filename: string }): void {
    if (response?.filename) {
      const dialogRef = this.dialog.open(ConfirmEndStreamDialog, {
        data: {
          title: 'Nice work.',
          body:
            'Your stream has been saved to your profile. Do you want to ' +
            'automatically process your video?',
          confirmBtnText: 'Process Video',
          cancelBtnText: 'No Thanks',
        },
      });

      dialogRef.afterClosed().subscribe((confirmed: boolean) => {
        if (confirmed) {
          void this.streamService.process(response.filename);
          const progressDialog = this.dialog.open(ConfirmEndStreamDialog, {
            data: {
              title: 'Processing Started',
              body:
                'Your video is being processed. This can take a few minutes. ' +
                'The video will show up in your profile when ready!',
              confirmBtnText: 'OK',
            },
          });
          const timeout = setTimeout(() => progressDialog.close(), 5000);
          progressDialog.afterClosed().subscribe(() => clearTimeout(timeout));
        }
      });
      return;
    }

    const dialogRef = this.dialog.open(ConfirmEndStreamDialog, {
      data: {
        title: 'Nice work.',
        body:
          "We're saving your stream; it'll land on your profile shortly. " +
          'Go live again!',
      },
    });
    const timeout = setTimeout(() => dialogRef.close(), 3000);
    dialogRef.afterClosed().subscribe(() => clearTimeout(timeout));
  }

  private setUpSeo(): void {
    this.seo.setTags({
      title: 'skriin AI TV | stream (beta)',
      description:
        'One-click streaming hub: push gameplay, camera or both to ' +
        'Twitch, YouTube & skriin Cloud. AI overlays, chat integration, ' +
        '0.6 s latency.',
      keywords:
        'live game streaming, smart tv streamer, ai overlays, low latency ' +
        'broadcast, twitch youtube stream',
      path: '/watch',
    });
  }
}
