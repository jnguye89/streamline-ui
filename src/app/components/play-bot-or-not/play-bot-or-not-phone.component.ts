import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, PLATFORM_ID, effect, inject, untracked } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MockRoomHost } from '../../bot-or-not/data/mock-clients';
import { BotOrNotPhoneComponent } from '../../bot-or-not/phone/bot-or-not-phone.component';
import { GamepadNavigationService } from '../../services/gamepad-navigation.service';
import { BOT_OR_NOT_PROVIDERS, SIM_PLAYERS } from './bot-or-not-providers';

/**
 * Phone web controller at /play/CODE (the URL the TV lobby's QR code points to).
 *
 * Phase 1: there is no server yet, so the phone can't reach the TV's room. Like the prototype's
 * phone-only mode it opens its own mock room under that code with simulated players and hosts it.
 * Phase 2 swaps in the Colyseus phone client and this page just joins the TV's room.
 */
@Component({
  selector: 'app-play-bot-or-not-phone',
  standalone: true,
  imports: [BotOrNotPhoneComponent],
  providers: BOT_OR_NOT_PROVIDERS,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isBrowser) {
      <skriin-bot-or-not-phone [code]="code" />
    }
  `,
  styles: [
    `
      :host {
        position: fixed;
        inset: 0;
        z-index: 1000;
        display: block;
        height: var(--ph-vvh, 100dvh);
        background: #fff;
      }
      skriin-bot-or-not-phone {
        height: 100%;
      }
    `,
  ],
})
export class PlayBotOrNotPhoneComponent implements OnInit, OnDestroy {
  private readonly gamepadNav = inject(GamepadNavigationService);
  protected readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly code = (inject(ActivatedRoute).snapshot.paramMap.get('code') ?? '').toUpperCase();

  constructor() {
    if (!this.isBrowser) return;
    // No TV to press Start, so the phone hosts the mock room.
    const host = inject(MockRoomHost);
    host.newGame(SIM_PLAYERS, this.code);
    effect(() => {
      const id = host.phonePlayerId();
      untracked(() => host.room.setHost(id));
    });
  }

  ngOnInit(): void {
    // Typing an answer must not be picked up by the app-wide arrow/Enter navigation.
    this.gamepadNav.suspend();
  }

  ngOnDestroy(): void {
    this.gamepadNav.resume();
  }
}
