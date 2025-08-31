// models/play-item.model.ts
export type PlayItem =
  | {
      type: 'live';
      id: number;
      title: string;
      user?: string;
      wssUrl: string;
      thumbnail?: string;
      applicationName: string;
      streamName: string;
    }
  | {
      type: 'vod';
      id: string | number;
      title: string;
      user?: string;
      src: string; // <-- map from your Video model (e.g., video.url)
      thumbnail?: string;
    };
