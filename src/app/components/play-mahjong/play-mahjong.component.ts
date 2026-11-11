import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MahjongComponent } from '../../mahjong/mahjong.component';
import { GamepadNavigationService } from '../../services/gamepad-navigation.service';

/**
 * Host page for mahjong at /play/mahjong. Same setup as PlayPokerComponent: the mahjong app is a
 * self-contained 1920×1080 TV stage with its own controller/keyboard input, so the app-wide spatial
 * navigation is suspended while it's on screen (only the both-sticks hard refresh stays live) and
 * the host covers the whole viewport, top nav included.
 */
@Component({
  selector: 'app-play-mahjong',
  standalone: true,
  imports: [MahjongComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isBrowser) {
      <skriin-mahjong (exit)="leave()" />
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
export class PlayMahjongComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly gamepadNav = inject(GamepadNavigationService);
  // Mahjong reads window/gamepads/rAF/localStorage as soon as it starts, so it only renders in the
  // browser; SSR sends the black host and the client takes it from there.
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
