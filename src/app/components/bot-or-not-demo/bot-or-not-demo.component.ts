// bot-or-not-demo.component.ts
//
// The Bot or Not tile in the watch feed - same idea as the other game
// previews: a game that plays itself, so the tile looks alive like the videos
// around it, with a "Press to play" call to action on top.
//
// It's the real TV screen (BotOrNotTvComponent) on its own mock room of
// simulated players - the same room /play/bot-or-not opens with - started
// straight away and replayed when it ends. BOT_OR_NOT_TV_DEMO tells the TV
// to take no keyboard/controller input (it would grab the watch page's keys
// and pads) and to hide the host-only chrome. The TV stage already scales its
// 1920×1080 picture to whatever box it's given.
//
// Pure decoration: actually playing is delegated back up via `join`, which
// WatchComponent turns into a navigation to /play/bot-or-not.
import { isPlatformBrowser } from '@angular/common';
import { Component, DestroyRef, EventEmitter, Output, PLATFORM_ID, effect, inject } from '@angular/core';

import { HOST_GAME_CLIENT } from '../../bot-or-not/data/game-client';
import { MockRoomHost } from '../../bot-or-not/data/mock-clients';
import { BOT_OR_NOT_TV_DEMO, BotOrNotTvComponent } from '../../bot-or-not/tv/bot-or-not-tv.component';
import { GamepadFocusableDirective } from '../../directives/gamepad-focusable.directive';
import { BOT_OR_NOT_PROVIDERS, SIM_PLAYERS } from '../play-bot-or-not/bot-or-not-providers';

// Time on the final scores before the next game starts.
const PLAY_AGAIN_MS = 8000;

@Component({
  selector: 'app-bot-or-not-demo',
  standalone: true,
  imports: [BotOrNotTvComponent, GamepadFocusableDirective],
  // Its own room (and tick loop), separate from /play/bot-or-not's.
  providers: [...BOT_OR_NOT_PROVIDERS, { provide: BOT_OR_NOT_TV_DEMO, useValue: true }],
  templateUrl: './bot-or-not-demo.component.html',
  styleUrl: './bot-or-not-demo.component.scss',
})
export class BotOrNotDemoComponent {
  @Output() join = new EventEmitter<void>();

  protected readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly client = inject(HOST_GAME_CLIENT);
  private replayTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // The room ticks on timers, which would keep SSR from ever settling.
    if (!this.isBrowser) return;

    // Skip the lobby: deal round 1 right away, on the game's own shortest
    // options (30 s to answer, 4 rounds) so the tile keeps moving.
    inject(MockRoomHost).newGame(SIM_PLAYERS);
    this.client.updateSettings({ answerSeconds: 30, rounds: 4 });
    this.client.start();

    // Show the final scores for a moment, then play again with the same room.
    effect(() => {
      const phase = this.client.state().phase;
      if (phase === 'final' && !this.replayTimer) {
        this.replayTimer = setTimeout(() => {
          this.replayTimer = null;
          this.client.playAgain();
        }, PLAY_AGAIN_MS);
      } else if (phase === 'lobby' && !this.replayTimer) {
        // Shouldn't happen (playAgain only falls back to the lobby if players left), but never sit
        // there. Deferred: starting writes room signals, which an effect may not do directly.
        this.replayTimer = setTimeout(() => {
          this.replayTimer = null;
          this.client.start();
        });
      }
    });
    inject(DestroyRef).onDestroy(() => {
      if (this.replayTimer) clearTimeout(this.replayTimer);
    });
  }

  onJoinClick(): void {
    this.join.emit();
  }
}
