import { Injectable, InjectionToken, OnDestroy, inject } from "@angular/core";
import type {
  IAgoraRTCClient,
  ILocalAudioTrack,
  ILocalTrack,
  ILocalVideoTrack,
} from "agora-rtc-sdk-ng";
import { BehaviorSubject } from "rxjs";

export interface RtcStreamAgora {
  createClient(): Promise<IAgoraRTCClient>;
  createCustomAudioTrack(config: {
    mediaStreamTrack: MediaStreamTrack;
  }): Promise<ILocalAudioTrack>;
  createCustomVideoTrack(config: {
    mediaStreamTrack: MediaStreamTrack;
    width?: number;
    height?: number;
    frameRate?: number;
  }): Promise<ILocalVideoTrack>;
}

export const RTC_STREAM_AGORA = new InjectionToken<RtcStreamAgora>(
  'RTC_STREAM_AGORA',
  {
    providedIn: 'root',
    factory: () => ({
      createClient: async () => {
        const { default: AgoraRTC } = await import('agora-rtc-sdk-ng');
        return AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
      },
      createCustomAudioTrack: async (config) => {
        const { default: AgoraRTC } = await import('agora-rtc-sdk-ng');
        return AgoraRTC.createCustomAudioTrack(config);
      },
      createCustomVideoTrack: async (config) => {
        const { default: AgoraRTC } = await import('agora-rtc-sdk-ng');
        return AgoraRTC.createCustomVideoTrack(config);
      },
    }),
  },
);

@Injectable({ providedIn: "root" })
export class RtcStreamService implements OnDestroy {
  private readonly agora = inject(RTC_STREAM_AGORA);
  private readonly clientPromise = this.agora.createClient();
  private localTracks: ILocalTrack[] = [];
  private readonly trackSources = new Map<ILocalTrack, MediaStreamTrack>();
  private joined = false;

  readonly isLive$ = new BehaviorSubject(false);

  async join(
    appId: string,
    channelName: string,
    rtcToken: string,
    uid: number,
  ): Promise<void> {
    try {
      const client = await this.clientPromise;
      await client.setClientRole('host');
      await client.join(appId, channelName, rtcToken, uid);
      this.joined = true;
    } catch (error: unknown) {
      this.closeLocalTracks();
      throw error;
    }
  }

  async startPublish(stream: MediaStream): Promise<void> {
    if (!this.joined) {
      throw new Error('Join the Agora channel before publishing.');
    }

    try {
      const client = await this.clientPromise;
      await this.prepareLocalTracks(stream);
      if (this.localTracks.length === 0) {
        throw new Error('No local media tracks are available to publish.');
      }
      await client.publish(this.localTracks);
      this.isLive$.next(true);
    } catch (error: unknown) {
      this.closeLocalTracks();
      this.isLive$.next(false);
      throw error;
    }
  }

  async replacePublishedVideo(stream: MediaStream): Promise<void> {
    if (!this.joined || !this.isLive$.value) {
      throw new Error('A live Agora publication is required to replace tracks.');
    }

    const client = await this.clientPromise;
    const sourceVideo = stream.getVideoTracks()[0];
    const previousVideo = this.localTracks.find(
      (track) => track.trackMediaType === 'video',
    );
    if (!sourceVideo || !previousVideo) {
      throw new Error('A published video track is required for replacement.');
    }
    if (this.trackSources.get(previousVideo) === sourceVideo) {
      return;
    }

    const settings = sourceVideo.getSettings();
    const replacementVideo = await this.agora.createCustomVideoTrack({
      mediaStreamTrack: sourceVideo,
      width: settings.width,
      height: settings.height,
      frameRate: settings.frameRate,
    });
    this.trackSources.set(replacementVideo, sourceVideo);
    let previousVideoUnpublished = false;
    try {
      await client.unpublish(previousVideo);
      previousVideoUnpublished = true;
      await client.publish(replacementVideo);
      this.localTracks = this.localTracks.map((track) =>
        track === previousVideo ? replacementVideo : track,
      );
      this.closeTracks([previousVideo]);
    } catch (error: unknown) {
      this.closeTracks([replacementVideo]);
      if (previousVideoUnpublished) {
        try {
          await client.publish(previousVideo);
        } catch {
          this.isLive$.next(false);
        }
      }
      throw error;
    }
  }

  async syncPublishedAudio(stream: MediaStream): Promise<void> {
    if (!this.joined || !this.isLive$.value) {
      throw new Error('A live Agora publication is required to replace tracks.');
    }

    const client = await this.clientPromise;
    const sourceAudio = stream.getAudioTracks()[0];
    const previousAudio = this.localTracks.find(
      (track) => track.trackMediaType === 'audio',
    );

    if (previousAudio && this.trackSources.get(previousAudio) === sourceAudio) {
      return;
    }

    if (!sourceAudio) {
      if (!previousAudio) return;
      await client.unpublish(previousAudio);
      this.localTracks = this.localTracks.filter(
        (track) => track !== previousAudio,
      );
      this.closeTracks([previousAudio]);
      return;
    }

    const replacementAudio = await this.agora.createCustomAudioTrack({
      mediaStreamTrack: sourceAudio,
    });
    this.trackSources.set(replacementAudio, sourceAudio);

    if (!previousAudio) {
      try {
        await client.publish(replacementAudio);
        this.localTracks.unshift(replacementAudio);
      } catch (error: unknown) {
        this.closeTracks([replacementAudio]);
        throw error;
      }
      return;
    }

    let previousAudioUnpublished = false;
    try {
      await client.unpublish(previousAudio);
      previousAudioUnpublished = true;
      await client.publish(replacementAudio);
      this.localTracks = this.localTracks.map((track) =>
        track === previousAudio ? replacementAudio : track,
      );
      this.closeTracks([previousAudio]);
    } catch (error: unknown) {
      this.closeTracks([replacementAudio]);
      if (previousAudioUnpublished) {
        try {
          await client.publish(previousAudio);
        } catch {
          this.isLive$.next(false);
        }
      }
      throw error;
    }
  }

  async stopPublish(): Promise<void> {
    if (this.isLive$.value && this.localTracks.length > 0) {
      try {
        const client = await this.clientPromise;
        await client.unpublish(this.localTracks);
      } finally {
        this.isLive$.next(false);
        this.closeLocalTracks();
      }
      return;
    }

    this.isLive$.next(false);
    this.closeLocalTracks();
  }

  async leave(): Promise<void> {
    try {
      await this.stopPublish();
    } finally {
      if (this.joined) {
        try {
          const client = await this.clientPromise;
          await client.leave();
        } finally {
          this.joined = false;
        }
      }
    }
  }

  ngOnDestroy(): void {
    void this.leave().catch(() => undefined);
    this.isLive$.complete();
  }

  private async prepareLocalTracks(stream: MediaStream): Promise<void> {
    this.closeLocalTracks();

    this.localTracks = await this.createLocalTracks(stream);
  }

  private async createLocalTracks(stream: MediaStream): Promise<ILocalTrack[]> {
    const videoTrack = stream.getVideoTracks()[0];
    const audioTrack = stream.getAudioTracks()[0];
    if (!videoTrack) {
      throw new Error('The selected preview has no video track.');
    }

    const tracks: ILocalTrack[] = [];
    try {
      const settings = videoTrack.getSettings();
      const customVideoTrack = await this.agora.createCustomVideoTrack({
        mediaStreamTrack: videoTrack,
        width: settings.width,
        height: settings.height,
        frameRate: settings.frameRate,
      });
      tracks.push(customVideoTrack);
      this.trackSources.set(customVideoTrack, videoTrack);
      if (audioTrack) {
        const customAudioTrack = await this.agora.createCustomAudioTrack({
          mediaStreamTrack: audioTrack,
        });
        tracks.unshift(customAudioTrack);
        this.trackSources.set(customAudioTrack, audioTrack);
      }
      return tracks;
    } catch (error: unknown) {
      this.closeTracks(tracks);
      throw error;
    }
  }

  private closeLocalTracks(): void {
    const tracks = this.localTracks;
    this.localTracks = [];
    this.closeTracks(tracks);
  }

  private closeTracks(tracks: ILocalTrack[]): void {
    tracks.forEach((track) => {
      this.trackSources.delete(track);
      track.stop();
      track.close();
    });
  }
}
