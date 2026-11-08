import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { Router } from '@angular/router';
import { PokerComponent } from '../../poker/poker.component';
import { GamepadNavigationService } from '../../services/gamepad-navigation.service';

/**
 * Host page for poker at /play/poker. The poker app is a self-contained 1920×1080 TV stage with its
 * own controller/keyboard input (TvInputService), so while it's on screen the app-wide spatial
 * navigation is suspended (only the both-sticks hard refresh stays live) and the host covers the
 * whole viewport, top nav included.
 *
 * `[live]` is false for now: going live runs inside StreamComponent, which is torn down when you
 * navigate here, so the TV can't be live while poker is open yet. When the stream outlives its
 * page, feed RtcStreamService.isLive$ in here and poker's streamer mode hides the cards on its own.
 */
@Component({
  selector: 'app-play-poker',
  standalone: true,
  imports: [PokerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isBrowser) {
      <skriin-poker [live]="false" (exit)="leave()" />
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
export class PlayPokerComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly gamepadNav = inject(GamepadNavigationService);
  // Poker reads window/gamepads/rAF as soon as it starts, so it only renders in the browser; SSR
  // sends the black host and the client takes it from there.
  protected readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

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
