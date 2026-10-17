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
}
