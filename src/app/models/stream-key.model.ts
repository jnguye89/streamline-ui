export enum StreamPlatform {
  TWITCH = 'twitch',
  KICK = 'kick',
  RUMBLE = 'rumble',
}

export interface StreamKeyPayload {
  platform: StreamPlatform;
  streamKey: string;
  streamUrl?: string;
}
