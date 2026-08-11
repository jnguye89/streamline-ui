import { TestBed } from '@angular/core/testing';
import type {
  IAgoraRTCClient,
  ILocalAudioTrack,
  ILocalTrack,
  ILocalVideoTrack,
} from 'agora-rtc-sdk-ng';
import {
  RTC_STREAM_AGORA,
  RtcStreamAgora,
  RtcStreamService,
} from './rtc-stream.service';

function browserTrack(
  kind: 'audio' | 'video',
  settings: MediaTrackSettings = {},
): MediaStreamTrack {
  return {
    kind,
    readyState: 'live',
    getSettings: () => settings,
    stop: jasmine.createSpy(`${kind} source stop`),
  } as unknown as MediaStreamTrack;
}

function browserStream(tracks: MediaStreamTrack[]): MediaStream {
  return {
    getTracks: () => tracks,
    getVideoTracks: () => tracks.filter(({ kind }) => kind === 'video'),
    getAudioTracks: () => tracks.filter(({ kind }) => kind === 'audio'),
  } as unknown as MediaStream;
}

function agoraTrack(kind: 'audio' | 'video'): ILocalTrack {
  return {
    trackMediaType: kind,
    stop: jasmine.createSpy(`${kind} Agora stop`),
    close: jasmine.createSpy(`${kind} Agora close`),
  } as unknown as ILocalTrack;
}

describe('RtcStreamService', () => {
  let service: RtcStreamService;
  let client: jasmine.SpyObj<IAgoraRTCClient>;
  let adapter: jasmine.SpyObj<RtcStreamAgora>;

  beforeEach(() => {
    client = jasmine.createSpyObj<IAgoraRTCClient>('Agora client', [
      'setClientRole',
      'join',
      'publish',
      'unpublish',
      'leave',
    ]);
    client.setClientRole.and.resolveTo();
    client.join.and.resolveTo(1);
    client.publish.and.resolveTo();
    client.unpublish.and.resolveTo();
    client.leave.and.resolveTo();

    adapter = jasmine.createSpyObj<RtcStreamAgora>('Agora adapter', [
      'createClient',
      'createCustomAudioTrack',
      'createCustomVideoTrack',
    ]);
    adapter.createClient.and.resolveTo(client);

    TestBed.configureTestingModule({
      providers: [
        RtcStreamService,
        { provide: RTC_STREAM_AGORA, useValue: adapter },
      ],
    });
    service = TestBed.inject(RtcStreamService);
  });

  afterEach(async () => {
    await service.leave();
    TestBed.resetTestingModule();
  });

  async function join(): Promise<void> {
    await service.join('app-id', 'channel', 'token', 42);
  }

  it('joins without implicitly acquiring default devices', async () => {
    await join();

    expect(client.join).toHaveBeenCalledWith(
      'app-id',
      'channel',
      'token',
      42,
    );
  });

  it('publishes custom tracks backed by the selected preview sources', async () => {
    const sourceVideo = browserTrack('video', {
      width: 1920,
      height: 1080,
      frameRate: 30,
    });
    const sourceAudio = browserTrack('audio');
    const customVideo = agoraTrack('video') as ILocalVideoTrack;
    const customAudio = agoraTrack('audio') as ILocalAudioTrack;
    adapter.createCustomVideoTrack.and.resolveTo(customVideo);
    adapter.createCustomAudioTrack.and.resolveTo(customAudio);
    await join();

    await service.startPublish(browserStream([sourceVideo, sourceAudio]));

    expect(adapter.createCustomVideoTrack).toHaveBeenCalledWith({
      mediaStreamTrack: sourceVideo,
      width: 1920,
      height: 1080,
      frameRate: 30,
    });
    expect(adapter.createCustomAudioTrack).toHaveBeenCalledWith({
      mediaStreamTrack: sourceAudio,
    });
    expect(client.publish).toHaveBeenCalledWith([customAudio, customVideo]);
    expect(service.isLive$.value).toBeTrue();
  });

  it('unpublishes and closes every local track on stop', async () => {
    const sourceAudio = browserTrack('audio');
    const sourceVideo = browserTrack('video');
    const audio = agoraTrack('audio') as ILocalAudioTrack;
    const video = agoraTrack('video') as ILocalVideoTrack;
    adapter.createCustomAudioTrack.and.resolveTo(audio);
    adapter.createCustomVideoTrack.and.resolveTo(video);
    await join();
    await service.startPublish(browserStream([sourceAudio, sourceVideo]));

    await service.stopPublish();

    expect(client.unpublish).toHaveBeenCalledWith([audio, video]);
    expect(audio.stop).toHaveBeenCalled();
    expect(audio.close).toHaveBeenCalled();
    expect(video.stop).toHaveBeenCalled();
    expect(video.close).toHaveBeenCalled();
    expect(service.isLive$.value).toBeFalse();
  });

  it('replaces only published video without interrupting audio', async () => {
    const firstVideo = browserTrack('video');
    const firstAudio = browserTrack('audio');
    const firstCustomVideo = agoraTrack('video') as ILocalVideoTrack;
    const firstCustomAudio = agoraTrack('audio') as ILocalAudioTrack;
    const nextVideo = browserTrack('video');
    const nextCustomVideo = agoraTrack('video') as ILocalVideoTrack;
    adapter.createCustomVideoTrack.and.resolveTo(firstCustomVideo);
    adapter.createCustomAudioTrack.and.resolveTo(firstCustomAudio);
    await join();
    await service.startPublish(browserStream([firstVideo, firstAudio]));
    adapter.createCustomVideoTrack.and.resolveTo(nextCustomVideo);

    await service.replacePublishedVideo(browserStream([nextVideo]));

    expect(client.unpublish).toHaveBeenCalledWith(firstCustomVideo);
    expect(client.publish).toHaveBeenCalledWith(nextCustomVideo);
    expect(firstCustomAudio.close).not.toHaveBeenCalled();
    expect(firstCustomVideo.close).toHaveBeenCalled();
    expect(client.leave).not.toHaveBeenCalled();
    expect(service.isLive$.value).toBeTrue();
  });

  it('keeps the existing Agora wrapper when the compositor track is unchanged', async () => {
    const sharedVideo = browserTrack('video');
    const customVideo = agoraTrack('video') as ILocalVideoTrack;
    adapter.createCustomVideoTrack.and.resolveTo(customVideo);
    await join();
    await service.startPublish(browserStream([sharedVideo]));
    adapter.createCustomVideoTrack.calls.reset();
    client.publish.calls.reset();

    await service.replacePublishedVideo(browserStream([sharedVideo]));

    expect(adapter.createCustomVideoTrack).not.toHaveBeenCalled();
    expect(client.unpublish).not.toHaveBeenCalled();
    expect(client.publish).not.toHaveBeenCalled();
    expect(customVideo.close).not.toHaveBeenCalled();
    expect(service.isLive$.value).toBeTrue();
  });

  it('adds audio to an active video-only publication', async () => {
    const sourceVideo = browserTrack('video');
    const customVideo = agoraTrack('video') as ILocalVideoTrack;
    const sourceAudio = browserTrack('audio');
    const customAudio = agoraTrack('audio') as ILocalAudioTrack;
    adapter.createCustomVideoTrack.and.resolveTo(customVideo);
    adapter.createCustomAudioTrack.and.resolveTo(customAudio);
    await join();
    await service.startPublish(browserStream([sourceVideo]));
    client.publish.calls.reset();

    await service.syncPublishedAudio(browserStream([sourceVideo, sourceAudio]));

    expect(adapter.createCustomAudioTrack).toHaveBeenCalledWith({
      mediaStreamTrack: sourceAudio,
    });
    expect(client.publish).toHaveBeenCalledWith(customAudio);
    expect(client.unpublish).not.toHaveBeenCalled();
  });

  it('replaces published audio without interrupting video', async () => {
    const sourceVideo = browserTrack('video');
    const firstSourceAudio = browserTrack('audio');
    const nextSourceAudio = browserTrack('audio');
    const customVideo = agoraTrack('video') as ILocalVideoTrack;
    const firstCustomAudio = agoraTrack('audio') as ILocalAudioTrack;
    const nextCustomAudio = agoraTrack('audio') as ILocalAudioTrack;
    adapter.createCustomVideoTrack.and.resolveTo(customVideo);
    adapter.createCustomAudioTrack.and.resolveTo(firstCustomAudio);
    await join();
    await service.startPublish(browserStream([sourceVideo, firstSourceAudio]));
    adapter.createCustomAudioTrack.and.resolveTo(nextCustomAudio);

    await service.syncPublishedAudio(
      browserStream([sourceVideo, nextSourceAudio]),
    );

    expect(client.unpublish).toHaveBeenCalledWith(firstCustomAudio);
    expect(client.publish).toHaveBeenCalledWith(nextCustomAudio);
    expect(firstCustomAudio.close).toHaveBeenCalled();
    expect(customVideo.close).not.toHaveBeenCalled();
  });

  it('removes published audio when both inputs are disabled', async () => {
    const sourceVideo = browserTrack('video');
    const sourceAudio = browserTrack('audio');
    const customVideo = agoraTrack('video') as ILocalVideoTrack;
    const customAudio = agoraTrack('audio') as ILocalAudioTrack;
    adapter.createCustomVideoTrack.and.resolveTo(customVideo);
    adapter.createCustomAudioTrack.and.resolveTo(customAudio);
    await join();
    await service.startPublish(browserStream([sourceVideo, sourceAudio]));

    await service.syncPublishedAudio(browserStream([sourceVideo]));

    expect(client.unpublish).toHaveBeenCalledWith(customAudio);
    expect(customAudio.close).toHaveBeenCalled();
    expect(customVideo.close).not.toHaveBeenCalled();
  });

  it('closes a custom video track when custom audio creation fails', async () => {
    const sourceVideo = browserTrack('video');
    const sourceAudio = browserTrack('audio');
    const customVideo = agoraTrack('video') as ILocalVideoTrack;
    adapter.createCustomVideoTrack.and.resolveTo(customVideo);
    adapter.createCustomAudioTrack.and.rejectWith(new Error('audio failed'));
    await join();

    await expectAsync(
      service.startPublish(browserStream([sourceVideo, sourceAudio])),
    ).toBeRejected();

    expect(customVideo.stop).toHaveBeenCalledTimes(1);
    expect(customVideo.close).toHaveBeenCalledTimes(1);
    expect(client.publish).not.toHaveBeenCalled();
  });

  it('closes custom tracks when publication fails', async () => {
    const sourceVideo = browserTrack('video');
    const customVideo = agoraTrack('video') as ILocalVideoTrack;
    adapter.createCustomVideoTrack.and.resolveTo(customVideo);
    client.publish.and.rejectWith(new Error('publish failed'));
    await join();

    await expectAsync(
      service.startPublish(browserStream([sourceVideo])),
    ).toBeRejected();

    expect(customVideo.stop).toHaveBeenCalled();
    expect(customVideo.close).toHaveBeenCalled();
    expect(service.isLive$.value).toBeFalse();
  });

});
