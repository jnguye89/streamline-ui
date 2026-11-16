import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  ViewChild,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { NavigationEnd, Router } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { GamepadFocusableDirective } from '../../directives/gamepad-focusable.directive';
import { GamepadNavigationService } from '../../services/gamepad-navigation.service';
import { TvModeService } from '../../services/tv-mode.service';

/** Where the QR code (and the web link) sends people. UTM tags let the store's analytics count these visits. */
export const GET_A_TV_URL = 'https://skriin.tv/?utm_source=skriin.com&utm_medium=qr&utm_campaign=get_a_tv';
const STORE_LINK = 'https://skriin.tv/?utm_source=skriin.com&utm_medium=web&utm_campaign=get_a_tv';

/** Set once the first-visit intro has been shown, so it never shows again in this browser. */
const INTRO_SEEN_KEY = 'skriin.getTvIntroSeen';
/** How long the first-visit intro stays open. Keep in sync with the progress bar's animation. */
export const INTRO_MS = 5000;

/** Routes that show the watch feed: "/", "/watch", "/watch/:id". */
const WATCH_ROUTE = /^\/(watch(\/[^?#]*)?)?([?#].*)?$/;

type Panel = 'none' | 'intro' | 'qr';

/**
 * "Get a TV" button in the top bar.
 *
 * - The first time someone lands on the watch feed in a normal browser, an
 *   intro card ("skriin is a TV box.") opens under the button for 5 seconds
 *   with a shrinking progress bar, then closes on its own. Hovering pauses it.
 *   Not shown on the TV box: that viewer already has one.
 * - Clicking the button opens a card with a QR code to skriin.tv.
 *   Closes with the X, Escape, B on the controller, or a click outside.
 */
@Component({
  selector: 'app-get-tv',
  standalone: true,
  imports: [CommonModule, MatIconModule, GamepadFocusableDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button gamepadFocusable type="button" class="get-tv" [class.get-tv--open]="panel !== 'none'"
      (click)="toggleQr()" aria-haspopup="dialog" [attr.aria-expanded]="panel === 'qr'">
      <mat-icon aria-hidden="true">shopping_bag</mat-icon>
      <span class="get-tv__label">Get a TV</span>
    </button>

    <div *ngIf="panel === 'intro'" class="card card--intro" role="dialog" aria-label="skriin is a TV box"
      (mouseenter)="pauseIntro()" (mouseleave)="resumeIntro()" (focusin)="pauseIntro()" (focusout)="resumeIntro()">
      <button gamepadFocusable type="button" class="card__close" (click)="close()" aria-label="Close">
        <mat-icon>close</mat-icon>
      </button>
      <div class="intro">
        <div class="intro__icon" aria-hidden="true"><mat-icon>tv</mat-icon></div>
        <div class="intro__body">
          <p class="card__title">skriin is a TV box.</p>
          <p class="card__text">It puts all of this on your TV: watch, go live and podcast from the couch.</p>
          <button #introCta gamepadFocusable type="button" class="pill" (click)="openQr()">Get a TV</button>
        </div>
      </div>
      <div class="timer" aria-hidden="true"><div class="timer__bar" [class.timer__bar--paused]="introPaused"></div></div>
    </div>

    <div *ngIf="panel === 'qr'" class="card card--qr" role="dialog" aria-label="Get a TV">
      <button *ngIf="!tv.isTv()" gamepadFocusable type="button" class="card__close" (click)="close()" aria-label="Close">
        <mat-icon>close</mat-icon>
      </button>
      <img class="qr" [src]="qrDataUrl" width="200" height="200" *ngIf="qrDataUrl; else qrPlaceholder"
        alt="QR code that opens skriin.tv" />
      <ng-template #qrPlaceholder><div class="qr"></div></ng-template>
      <div class="qr-body">
        <p class="card__title card__title--lg">Get a TV</p>
        <p class="card__text">Scan the code with your phone’s camera.</p>
        <p *ngIf="tv.isTv(); else webLink" class="hint"><span class="hint__key">B</span> Close</p>
        <ng-template #webLink>
          <a gamepadFocusable class="hint hint--link" [href]="storeLink" target="_blank" rel="noopener">or open skriin.tv</a>
        </ng-template>
      </div>
    </div>
  `,
  styles: [`
    :host { position: relative; display: inline-flex; margin-right: 8px; }

    /* Background opacity of the header button: change --get-tv-alpha to tune it.
       Icon and label stay fully opaque so they read over video. */
    :host { --get-tv-alpha: 0.4; }
    .get-tv {
      display: inline-flex; align-items: center; gap: 8px;
      height: 40px; padding: 0 18px; border: 0; border-radius: 999px;
      background: rgb(79 70 229 / var(--get-tv-alpha)); color: #fff; cursor: pointer;
      font: 500 15px/1 Roboto, "Helvetica Neue", Arial, sans-serif; letter-spacing: .02em;
      transition: background .15s ease;
    }
    /* Hover keeps the same transparency; a faint white tint shows it's interactive. */
    .get-tv:hover { background-image: linear-gradient(rgb(255 255 255 / 0.1), rgb(255 255 255 / 0.1)); }
    /* The app-wide focus style (.gamepad-focused in styles.scss) swaps the
       background for 8% white with !important, and clicking focuses the
       button, so it lost its colour. Keep ours; the global ring and zoom
       still show focus. These rules win on specificity (both !important). */
    .get-tv.gamepad-focused { background-color: rgb(79 70 229 / var(--get-tv-alpha)) !important; }
    .pill.gamepad-focused { background-color: #4F46E5 !important; }
    .card__close.gamepad-focused { background-color: #e7e8f0 !important; }
    .get-tv--open, .get-tv:focus-visible { outline: 2px solid rgb(255 255 255 / 0.6); outline-offset: 2px; }
    .get-tv mat-icon { font-size: 20px; width: 20px; height: 20px; }

    .card {
      position: absolute; top: calc(100% + 14px); right: 0; z-index: 200;
      background: #fff; color: #1b1d2a; border-radius: 16px;
      box-shadow: 0 24px 60px rgba(0, 0, 0, .45);
      font-family: Roboto, "Helvetica Neue", Arial, sans-serif; text-align: left;
      animation: card-in .18s ease-out;
    }
    /* Caret pointing at the button. */
    .card::before {
      content: ''; position: absolute; top: -7px; right: 56px;
      width: 14px; height: 14px; background: #fff; transform: rotate(45deg); border-radius: 2px;
    }
    .card__close {
      position: absolute; top: 10px; right: 10px; width: 28px; height: 28px;
      display: flex; align-items: center; justify-content: center;
      border: 0; border-radius: 50%; background: none; color: #5b6070; cursor: pointer;
    }
    .card__close:hover { background: #f0f1f5; }
    /* Controller focus (GamepadNavigationService adds .gamepad-focused) and keyboard focus. */
    .card__close:focus-visible, .card__close.gamepad-focused { background: #e7e8f0; outline: 2px solid #4F46E5; outline-offset: 1px; }
    .pill:focus-visible, .pill.gamepad-focused { outline: 3px solid #1b1d2a; outline-offset: 2px; }
    .hint--link:focus-visible, .hint--link.gamepad-focused { outline: 2px solid #4F46E5; outline-offset: 3px; border-radius: 4px; }
    .card__close mat-icon { font-size: 20px; width: 20px; height: 20px; }
    .card__title { margin: 0 0 6px; font-size: 17px; font-weight: 600; color: #15172a; }
    .card__title--lg { font-size: 21px; margin-bottom: 10px; }
    .card__text { margin: 0; font-size: 14px; line-height: 1.45; color: #4a4f5f; }

    .card--intro { width: 360px; padding: 18px 20px 16px 18px; }
    .intro { display: flex; gap: 14px; }
    .intro__icon {
      flex: none; width: 46px; height: 46px; border-radius: 12px; background: #4F46E5; color: #fff;
      display: flex; align-items: center; justify-content: center;
    }
    .intro__icon mat-icon { font-size: 28px; width: 28px; height: 28px; }
    .intro__body { padding-right: 18px; }
    .pill {
      margin-top: 12px; height: 36px; padding: 0 18px; border: 0; border-radius: 999px;
      background: #4F46E5; color: #fff; font-family: inherit; font-size: 14px; font-weight: 500; cursor: pointer;
    }
    .pill:hover { background: #4338CA; }
    .timer { margin-top: 14px; height: 3px; border-radius: 3px; background: #e6e7ee; overflow: hidden; }
    .timer__bar {
      height: 100%; background: #4F46E5; transform-origin: left center;
      animation: intro-timer ${INTRO_MS}ms linear forwards;
    }
    /* Visual only: the JS timer (introTimer) decides when the card closes. */
    .timer__bar--paused { animation-play-state: paused; }

    .card--qr { display: flex; align-items: center; gap: 20px; padding: 16px 28px 16px 16px; }
    .qr { width: 200px; height: 200px; flex: none; display: block; image-rendering: pixelated; }
    .qr-body { width: 180px; }
    .hint { display: flex; align-items: center; gap: 8px; margin: 14px 0 0; font-size: 14px; color: #5b6070; }
    .hint__key {
      width: 22px; height: 22px; border-radius: 50%; background: #1b1d2a; color: #fff;
      display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600;
    }
    .hint--link { color: #4F46E5; text-decoration: none; }
    .hint--link:hover { text-decoration: underline; }

    @keyframes intro-timer { from { transform: scaleX(1); } to { transform: scaleX(0); } }
    @keyframes card-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }

    /* Small screens: icon-only button, cards pinned to the right edge. */
    @media (max-width: 640px) {
      .get-tv { padding: 0 12px; }
      .get-tv__label { display: none; }
      .card--intro { width: min(320px, calc(100vw - 24px)); }
      .card::before { right: 14px; }
      .card--qr { padding: 12px 20px 12px 12px; gap: 14px; }
      .qr { width: 140px; height: 140px; }
      .qr-body { width: 140px; }
    }
    @media (prefers-reduced-motion: reduce) { .card { animation: none; } }
  `],
})
export class GetTvComponent implements OnInit, OnDestroy {
  panel: Panel = 'none';
  qrDataUrl: string | null = null;
  introPaused = false;
  /** A controller took over the intro: it stays open until closed. */
  private introHeldByController = false;
  readonly storeLink = STORE_LINK;

  @ViewChild('introCta') private introCta?: ElementRef<HTMLButtonElement>;

  private routeSub?: Subscription;
  private introTimer: ReturnType<typeof setTimeout> | null = null;
  private introRemaining = INTRO_MS;
  private introStartedAt = 0;

  constructor(
    public tv: TvModeService,
    private router: Router,
    private gamepad: GamepadNavigationService,
    private host: ElementRef<HTMLElement>,
    private cdr: ChangeDetectorRef,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    // Wait for the first navigation so we know which page this is.
    this.routeSub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this.maybeShowIntro(e.urlAfterRedirects));
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    this.clearIntroTimer();
    if (this.panel !== 'none') this.releaseInput();
    this.setOpenFlag(false);
  }

  toggleQr(): void {
    if (this.panel === 'qr') this.close();
    else this.openQr();
  }

  openQr(): void {
    this.clearIntroTimer();
    this.introHeldByController = false;
    this.panel = 'qr';
    this.setOpenFlag(true);
    // Clearing gamepad focus first means the first B press reaches this card
    // rather than just dismissing the top-bar row (see claimInput()).
    this.gamepad.clearFocus();
    this.claimInput();
    if (!this.qrDataUrl) {
      // Loaded on first open, so the QR library stays out of the startup bundle.
      import('qrcode')
        .then((m) => m.default.toDataURL(GET_A_TV_URL, { width: 400, margin: 1, errorCorrectionLevel: 'M' }))
        .then((url) => {
          this.qrDataUrl = url;
          this.cdr.markForCheck();
        })
        .catch((err) => console.warn('Could not draw the Get a TV QR code:', err));
    }
    this.cdr.markForCheck();
  }

  close(): void {
    if (this.panel === 'none') return;
    this.clearIntroTimer();
    this.releaseInput();
    this.introHeldByController = false;
    this.panel = 'none';
    this.setOpenFlag(false);
    this.cdr.markForCheck();
  }

  /** Hovering or focusing the intro pauses its countdown (timer and progress bar together). */
  pauseIntro(): void {
    if (this.panel !== 'intro' || this.introPaused) return;
    this.clearIntroTimer();
    this.introRemaining -= performance.now() - this.introStartedAt;
    this.introPaused = true;
    this.cdr.markForCheck();
  }

  resumeIntro(): void {
    if (this.panel !== 'intro' || !this.introPaused || this.introHeldByController) return;
    this.introPaused = false;
    this.startIntroTimer();
    this.cdr.markForCheck();
  }

  /**
   * Browsers only report a controller after its first button press, so a
   * controller that wakes up while the intro is open would otherwise have
   * nothing focused and 5 seconds to find the card. Put focus on its
   * "Get a TV" button and stop the countdown: the card then stays until the
   * viewer picks Get a TV, the X, or presses B. (Not left to the focusin
   * handler: focus events don't fire while the window isn't focused.)
   */
  @HostListener('window:gamepadconnected')
  onGamepadConnected(): void {
    if (this.panel !== 'intro') return;
    this.pauseIntro();
    this.introHeldByController = true;
    // Next tick: the directive registers the button in ngAfterViewInit.
    setTimeout(() => {
      const cta = this.introCta?.nativeElement;
      if (this.panel === 'intro' && cta?.isConnected) this.gamepad.requestFocus(cta);
    });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(e: MouseEvent): void {
    // composedPath() is fixed when the click happens. contains(e.target) is
    // not: the intro's "Get a TV" button is removed from the DOM as soon as it
    // swaps the intro for the QR card, so by the time the click bubbles up
    // here it would look like a click outside and close the QR card at once.
    if (this.panel !== 'none' && !e.composedPath().includes(this.host.nativeElement)) this.close();
  }

  private maybeShowIntro(url: string): void {
    if (this.tv.isTv() || this.panel !== 'none' || !WATCH_ROUTE.test(url)) return;
    try {
      if (localStorage.getItem(INTRO_SEEN_KEY)) return;
      localStorage.setItem(INTRO_SEEN_KEY, new Date().toISOString());
    } catch {
      return; // storage blocked: we can't remember it, so don't show it on every visit
    }
    this.routeSub?.unsubscribe();
    this.panel = 'intro';
    this.introPaused = false;
    this.introRemaining = INTRO_MS;
    this.startIntroTimer();
    this.setOpenFlag(true);
    this.claimInput();
    this.cdr.markForCheck();
  }

  private startIntroTimer(): void {
    this.clearIntroTimer();
    this.introStartedAt = performance.now();
    this.introTimer = setTimeout(() => {
      if (this.panel === 'intro') this.close();
    }, Math.max(0, this.introRemaining));
  }

  private clearIntroTimer(): void {
    if (this.introTimer) clearTimeout(this.introTimer);
    this.introTimer = null;
  }

  /**
   * While a card is open it owns A/Enter and B/Escape. Without this, A goes to
   * whatever the page had focused: on the watch feed that's the Next button
   * (WatchComponent focuses it on load), so A/Enter skipped the video while
   * the card, with the header button ringed, looked like the thing in focus.
   *
   * - A on one of this component's own buttons (header button, intro's Get a
   *   TV or X, QR card's X/link) clicks it as usual.
   * - Otherwise: the intro opens the QR card; the QR card swallows the press
   *   so it can't act on the page behind it.
   * - B closes the card.
   */
  private claimInput(): void {
    this.gamepad.setActivateAction(() => {
      if (this.host.nativeElement.querySelector('.gamepad-focused')) return false;
      if (this.panel === 'intro') this.openQr();
      return true;
    });
    this.gamepad.setBackAction(() => {
      this.close();
      return true;
    });
  }

  private releaseInput(): void {
    // A dialog opened over the card (e.g. Search, whose click also closes the
    // card) has installed its own A/B handlers in the same slots: leave them.
    // The dialog clears them itself when it closes.
    if (this.dialog.openDialogs.length > 0) return;
    this.gamepad.setActivateAction(null);
    this.gamepad.setBackAction(null);
  }

  /** Keeps the top bar visible while a card is open, even if the watch overlay auto-hides. */
  private setOpenFlag(open: boolean): void {
    document.body.classList.toggle('get-tv-open', open);
  }
}
