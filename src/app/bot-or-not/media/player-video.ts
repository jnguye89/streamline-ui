import { Injectable, InjectionToken, Signal, signal } from '@angular/core';

/**
 * Where a face tile's picture comes from. Phase 1 ships avatars only (no live video).
 * Later sources plug in behind this interface with no UI change:
 *  - 'phone-camera': a player's front camera. Opt-in, off by default, one tap on the join screen
 *    ("Show your face on the TV?"), and the phone says "This TV is live" first when it is.
 *  - 'couch-camera': the host TV's own camera as one group tile (host opts in; hidden while the
 *    privacy shutter is closed). Shown in the Results reaction moment.
 */
export type PlayerVideoSource = 'avatar' | 'phone-camera' | 'couch-camera';

export interface PlayerVideo {
  readonly source: PlayerVideoSource;
  /** Live picture, or null → the tile draws the avatar. */
  readonly stream: Signal<MediaStream | null>;
}

export interface PlayerVideoProvider {
  /** One tile per player (humans and bots; bots never have a camera). */
  forPlayer(playerId: string): PlayerVideo;
  /** The couch tile, or null when the host hasn't turned it on (or the shutter is closed). */
  couch(): PlayerVideo | null;
}

export const PLAYER_VIDEO = new InjectionToken<PlayerVideoProvider>('PLAYER_VIDEO');

const AVATAR_ONLY: PlayerVideo = { source: 'avatar', stream: signal<MediaStream | null>(null).asReadonly() };

/** Phase 1: no video stack yet, so every tile is an avatar and there is no couch tile. */
@Injectable()
export class AvatarVideoProvider implements PlayerVideoProvider {
  forPlayer(): PlayerVideo {
    return AVATAR_ONLY;
  }
  couch(): PlayerVideo | null {
    return null;
  }
}
