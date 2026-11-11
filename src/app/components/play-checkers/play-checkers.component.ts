import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CheckersComponent } from '../../checkers/checkers.component';
import { GamepadNavigationService } from '../../services/gamepad-navigation.service';

/**
 * Host page for checkers at /play/checkers. Same setup as PlayPokerComponent/PlayMahjongComponent:
 * a self-contained 1920×1080 TV stage with its own controller/keyboard input, so the app-wide
 * spatial navigation is suspended while it's on screen (only the both-sticks hard refresh stays
 * live) and the host covers the whole viewport, top nav included.
 */
@Component({
  selector: 'app-play-checkers',
  standalone: true,
  imports: [CheckersComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isBrowser) {
      <skriin-checkers (exit)="leave()" />
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
export class PlayCheckersComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly gamepadNav = inject(GamepadNavigationService);
  // Checkers reads window/gamepads/rAF/localStorage and starts its AI Web Worker as soon as it
  // starts, so it only renders in the browser; SSR sends the black host.
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
