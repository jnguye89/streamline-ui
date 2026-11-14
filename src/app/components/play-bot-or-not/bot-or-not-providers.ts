import { Provider } from '@angular/core';
import { HOST_GAME_CLIENT, PHONE_GAME_CLIENT } from '../../bot-or-not/data/game-client';
import { MockHostClient, MockPhoneClient, MockRoomHost } from '../../bot-or-not/data/mock-clients';
import { AvatarVideoProvider, PLAYER_VIDEO } from '../../bot-or-not/media/player-video';
import { NoopTtsProvider, TTS_PROVIDER } from '../../bot-or-not/media/tts-provider';

/**
 * Phase 1: Bot or Not runs offline on a mock room. Provided on the host page (not in root) so the
 * room and its 100 ms tick loop are created when the page opens and torn down when you leave it.
 * Phase 2 swaps the two clients for Colyseus ones; Phase 4 swaps the TTS provider.
 */
export const BOT_OR_NOT_PROVIDERS: Provider[] = [
  MockRoomHost,
  MockHostClient,
  MockPhoneClient,
  { provide: HOST_GAME_CLIENT, useExisting: MockHostClient },
  { provide: PHONE_GAME_CLIENT, useExisting: MockPhoneClient },
  { provide: PLAYER_VIDEO, useClass: AvatarVideoProvider },
  { provide: TTS_PROVIDER, useClass: NoopTtsProvider },
];

/** Simulated players in the TV room until real phones can join (Phase 2). */
export const SIM_PLAYERS = 5;
