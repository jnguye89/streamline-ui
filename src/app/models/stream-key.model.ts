export enum StreamPlatform {
  TWITCH = 'twitch',
  KICK = 'kick',
  RUMBLE = 'rumble',
  YOUTUBE = 'youtube',
}

export interface StreamKeyPayload {
  platform: StreamPlatform;
  streamKey: string;
  streamUrl?: string;
  /** On for the next live (saved in the API; a newly saved key is on). */
  enabled?: boolean;
}
