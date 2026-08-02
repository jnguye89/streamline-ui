export interface YoutubeChannel {
  id: string | number;
  channelId: string;
  name?: string;
  enabled: boolean;
}

export interface CreateYoutubeChannelPayload {
  channelId: string;
  name?: string;
}

export interface UpdateYoutubeChannelPayload {
  name?: string;
  enabled?: boolean;
}
