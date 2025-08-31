// src/types/WowzaWebRTCPlay.d.ts
export {};

declare global {
  const WowzaWebRTCPlay: {
    new (): {
      set(opts: {
        videoElementPlay: HTMLVideoElement;
        sdpURL: string;
        streamInfo: { applicationName: string; streamName: string };
      }): void;
      play(): void;
      stop(): void;
      getAvailableStreams?: () => Promise<any>;
    };
  };
}
