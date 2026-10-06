import { StreamPlatform } from './stream-key.model';

export type MultistreamState = 'starting' | 'active' | 'stopped' | 'error';

/** Outcome of restreaming a live stream to one third-party platform. */
export interface MultistreamStatus {
  platform: StreamPlatform;
  status: MultistreamState;
  error?: string;
}

export interface PublishResponse {
  ok: boolean;
  multistream?: MultistreamStatus[];
}
