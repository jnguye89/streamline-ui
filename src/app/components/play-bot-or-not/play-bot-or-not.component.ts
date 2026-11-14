import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MockRoomHost } from '../../bot-or-not/data/mock-clients';
import { BotOrNotTvComponent } from '../../bot-or-not/tv/bot-or-not-tv.component';
import { GamepadNavigationService } from '../../services/gamepad-navigation.service';
import { BOT_OR_NOT_PROVIDERS, SIM_PLAYERS } from './bot-or-not-providers';

/**
 * Host page for Bot or Not (TV side) at /play/bot-or-not. Same setup as the other /play/* games:
 * a self-contained 1920×1080 TV stage with its own controller/keyboard input, so the app-wide
 * spatial navigation is suspended while it's on screen and the host covers the whole viewport.
 *
 * Phase 1: the room is a mock in this page with simulated players; a phone can't join it from
 * another device until the Colyseus room lands in Phase 2.
 */
@Component({
  selector: 'app-play-bot-or-not',
  standalone: true,
  imports: [BotOrNotTvComponent],
  providers: BOT_OR_NOT_PROVIDERS,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isBrowser) {
      <skriin-bot-or-not-tv (exit)="leave()" />
    }
  `,
  styles: [
    `
      :host {
        position: fixed;
        inset: 0;
        z-index: 1000;
        background: #000;
      }
    `,
  ],
})
export class PlayBotOrNotComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly gamepadNav = inject(GamepadNavigationService);
  // The mock room ticks on timers and the stage reads window/gamepads/rAF, so it only renders in the
  // browser; SSR sends the black host.
  protected readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  constructor() {
    if (this.isBrowser) inject(MockRoomHost).newGame(SIM_PLAYERS);
  }

  ngOnInit(): void {
    this.gamepadNav.suspend();
  }

  ngOnDestroy(): void {
    this.gamepadNav.resume();
  }

  protected leave(): void {
    this.router.navigate(['/watch']);
  }
}
