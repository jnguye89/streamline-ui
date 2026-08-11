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
import { MediaPreviewState } from '../../models/media-input.models';
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
import { MediaInputService } from "../../services/media-input.service";
import { RtcStreamService } from "../../services/agora/rtc-stream.service";
import { SeoService } from "../../services/seo.service";
import { StreamService } from "../../services/stream.service";
import { UserService } from "../../services/user.service";
import {
  ChatMessage,
  RecordingSocketService,
} from "../../services/socket/recording.service";
import { ConfirmEndStreamDialog } from "../dialogs/confirm-stream.dialog";

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
  readonly audioMeter$ = this.mediaInput.audioMeter$;

  isAuthenticated = false;
  isLive = this.rtcStreamService.isLive$.value;
  previewState: MediaPreviewState = this.mediaInput.previewSnapshot;
  isReady = false;
  isStarting = false;
  isInitializing = false;
  isApplyingInputs = false;
  channelName: string | undefined;
  workflowError: string | null = null;
  inputPanelOpen = false;
  chatMessages: (ChatMessage & { key: string })[] = [];
  chatText = '';

  private readonly chatMaxVisible = 12;

  constructor(
    private readonly streamService: StreamService,
    public readonly deviceAuth: DeviceAuthService,
    private readonly seo: SeoService,
    private readonly router: Router,
    private readonly rtcStreamService: RtcStreamService,
    private readonly userService: UserService,
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
      const authUser = await firstValueFrom(
        this.deviceAuth.user$.pipe(
          filter((user): user is NonNullable<typeof user> & { sub: string } => !!user?.sub),
          take(1),
        ),
      );
      const apiUser = await firstValueFrom(
        this.userService.getAuth0User(authUser.sub),
      );

      await this.mediaInput.initialize();
      if (this.mediaInput.snapshot.selection.videoDeviceId) {
        await this.refreshPreview();
      }

      const token = await firstValueFrom(
        this.streamService.ensureReady(this.channelName),
      );
      await this.rtcStreamService.join(
        token.appId,
        this.channelName,
        token.rtcToken,
        apiUser.agoraUserId,
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

  toggleInputPanel(): void {
    this.inputPanelOpen = !this.inputPanelOpen;
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

  selectGameAudio(deviceId: string): Promise<void> {
    return this.queueInputChange(async () => {
      const wasLive = this.rtcStreamService.isLive$.value;
      try {
        this.mediaInput.selectGameAudio(deviceId || null);
        await this.mediaInput.refreshAudioSources();
        await this.syncPublishedAudio();
      } catch {
        await this.handleInputChangeFailure(wasLive);
      }
    });
  }

  selectMicrophone(deviceId: string): Promise<void> {
    return this.queueInputChange(async () => {
      const wasLive = this.rtcStreamService.isLive$.value;
      try {
        this.mediaInput.selectMicrophone(deviceId || null);
        await this.mediaInput.refreshAudioSources();
        await this.syncPublishedAudio();
      } catch {
        await this.handleInputChangeFailure(wasLive);
      }
    });
  }

  setGameLevel(value: string): void {
    this.mediaInput.setGameLevel(Number(value) / 100);
  }

  toggleGameMute(): void {
    this.mediaInput.setGameMuted(!this.mediaInput.audioMixSnapshot.gameMuted);
  }

  setMicrophoneLevel(value: string): void {
    this.mediaInput.setMicrophoneLevel(Number(value) / 100);
  }

  toggleMicrophoneMute(): void {
    this.mediaInput.setMicrophoneMuted(
      !this.mediaInput.audioMixSnapshot.microphoneMuted,
    );
  }

  meterScale(loudness: number): number {
    return Math.min(1, Math.max(0, (loudness + 60) / 60));
  }

  meterBand(loudness: number): 'green' | 'yellow' | 'red' {
    if (loudness > -3) return 'red';
    if (loudness > -12) return 'yellow';
    return 'green';
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
