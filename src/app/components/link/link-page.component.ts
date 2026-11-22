import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, Inject, OnDestroy, OnInit, PLATFORM_ID } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription } from 'rxjs';

import { StreamPlatform } from '../../models/stream-key.model';
import { DeviceAuthService, DeviceTokenResponse } from '../../services/device-auth.service';
import { UserService } from '../../services/user.service';

/** Letters and digits the TV uses for codes: no 0/O or 1/I, so they can't be misread. */
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_LENGTH = 4;

const NAMES: Record<StreamPlatform, string> = {
  [StreamPlatform.YOUTUBE]: 'YouTube',
  [StreamPlatform.TWITCH]: 'Twitch',
  [StreamPlatform.KICK]: 'Kick',
  [StreamPlatform.RUMBLE]: 'Rumble',
};

/** Where each platform shows your stream key, for the "Open …" link. */
const KEY_PAGES: Record<StreamPlatform, { url: string; where: string }> = {
  [StreamPlatform.YOUTUBE]: { url: 'https://studio.youtube.com', where: 'YouTube Studio, Go live, Stream' },
  [StreamPlatform.TWITCH]: { url: 'https://dashboard.twitch.tv/settings/stream', where: 'Twitch Creator Dashboard, Settings, Stream' },
  [StreamPlatform.KICK]: { url: 'https://kick.com/dashboard/settings/stream', where: 'Kick, Settings, Stream' },
  [StreamPlatform.RUMBLE]: { url: 'https://rumble.com/account/livestreaming', where: 'Rumble, Account, Live streaming' },
};

export const APP_STORE_URL = 'https://apps.apple.com/us/app/skriin/id6825611485';

interface Link {
  code: string;
  platform: StreamPlatform;
  requiresUrl: boolean;
}

type Step =
  | { kind: 'signIn' }
  | { kind: 'enterCode' }
  | { kind: 'checking' }
  | { kind: 'key'; link: Link }
  | { kind: 'sending'; link: Link }
  | { kind: 'done'; link: Link };

export function cleanCode(typed: string): string {
  return [...(typed ?? '').toUpperCase()].filter((c) => CODE_ALPHABET.includes(c)).join('').slice(0, CODE_LENGTH);
}

/**
 * skriin.com/link: send a simulcast stream key to the TV from a phone browser.
 * The same page the iPhone app has (streamline-mobile src/app/link.tsx), for
 * phones without the app. The TV's QR opens this with ?code=; iPhones with
 * the app get the app instead (the /link Universal Link).
 *
 * Sign-in uses the same device code as the TV: "Sign in" opens Auth0 with the
 * code filled in, in a new tab, and this page picks the sign-in up by itself.
 */
@Component({
  selector: 'app-link-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './link-page.component.html',
  styleUrl: './link-page.component.scss',
})
export class LinkPageComponent implements OnInit, OnDestroy {
  step: Step = { kind: 'enterCode' };
  typedCode = '';
  streamUrl = '';
  streamKey = '';
  error: string | null = null;
  readonly appStoreUrl = APP_STORE_URL;

  /** Device sign-in, while signed out. */
  signIn: DeviceTokenResponse | null = null;
  signInError: string | null = null;
  /** Who's signed in, so they can check it's the TV's account. */
  signedInAs = '';

  private startCode = '';
  private startChecked = false;
  private subs = new Subscription();
  private polling: Subscription | null = null;
  private readonly isBrowser: boolean;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly users: UserService,
    public readonly deviceAuth: DeviceAuthService,
    @Inject(PLATFORM_ID) platformId: object,
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit(): void {
    this.startCode = cleanCode(this.route.snapshot.queryParamMap.get('code') ?? '');
    this.typedCode = this.startCode;
    if (!this.isBrowser) return; // the server only draws the empty page

    this.subs.add(
      this.deviceAuth.user$.subscribe(
        (u) => (this.signedInAs = u?.['nickname'] ?? u?.name ?? u?.email ?? ''),
      ),
    );
    this.subs.add(
      this.deviceAuth.isAuthenticated$.subscribe((signedIn) => {
        if (!signedIn) {
          this.step = { kind: 'signIn' };
          this.startSignIn();
          return;
        }
        this.stopPolling();
        if (this.step.kind === 'signIn') this.step = { kind: 'enterCode' };
        // A code from the QR is looked up once, as soon as we're signed in -
        // whether that's straight away or after signing in on this page.
        if (!this.startChecked && this.startCode.length === CODE_LENGTH) {
          this.startChecked = true;
          this.check(this.startCode);
        }
      }),
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.stopPolling();
  }

  get name(): string {
    return this.step.kind === 'key' || this.step.kind === 'sending' || this.step.kind === 'done'
      ? NAMES[this.step.link.platform]
      : '';
  }

  get keyPage() {
    return this.step.kind === 'key' || this.step.kind === 'sending'
      ? KEY_PAGES[this.step.link.platform]
      : null;
  }


  get codeBoxes(): string[] {
    return Array.from({ length: CODE_LENGTH }, (_, i) => this.typedCode[i] ?? '');
  }

  onCodeInput(value: string): void {
    this.typedCode = cleanCode(value);
    this.error = null;
  }

  /** Looks a code up; it says which platform the key is for. */
  check(code = this.typedCode): void {
    if (cleanCode(code).length !== CODE_LENGTH) return;
    this.error = null;
    this.step = { kind: 'checking' };
    this.users.lookupStreamKeyLink(cleanCode(code)).subscribe({
      next: (link) => {
        this.step = link.status === 'done' ? { kind: 'done', link } : { kind: 'key', link };
      },
      error: (e: HttpErrorResponse) => {
        this.error =
          e.status === 404
            ? 'That code has expired or is for another account. Check the code on your TV, and that you’re signed in as the same account.'
            : 'Couldn’t check the code. Check your connection and try again.';
        this.step = { kind: 'enterCode' };
      },
    });
  }

  send(): void {
    if (this.step.kind !== 'key') return;
    const link = this.step.link;
    if (!this.streamKey.trim()) {
      this.error = 'Paste your stream key first.';
      return;
    }
    if (link.requiresUrl && !/^rtmps?:\/\/\S+$/i.test(this.streamUrl.trim())) {
      this.error = 'That stream URL doesn’t look right. It should start with rtmp:// or rtmps://';
      return;
    }
    this.error = null;
    this.step = { kind: 'sending', link };
    this.users
      .sendStreamKeyLink(link.code, this.streamKey.trim(), link.requiresUrl ? this.streamUrl.trim() : undefined)
      .subscribe({
        next: () => {
          this.streamKey = '';
          this.step = { kind: 'done', link };
        },
        error: (e: HttpErrorResponse) => {
          if (e.status === 404) {
            this.error = 'That code has expired. Get a new one on your TV.';
            this.step = { kind: 'enterCode' };
          } else {
            this.error =
              e.status === 400
                ? 'That key wasn’t accepted. Check it and try again.'
                : 'Couldn’t send the key. Check your connection and try again.';
            this.step = { kind: 'key', link };
          }
        },
      });
  }

  async paste(field: 'streamUrl' | 'streamKey'): Promise<void> {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) this[field] = text;
    } catch {
      this.error = 'Your browser didn’t allow pasting. Long-press the box and choose Paste.';
    }
  }

  /** Asks for a sign-in code and waits for it to be used. */
  private startSignIn(): void {
    if (this.signIn || this.polling) return;
    this.signInError = null;
    this.deviceAuth.initiateDeviceFlow().subscribe({
      next: (res) => {
        this.signIn = res;
        this.polling = this.deviceAuth.pollForToken(res.deviceCode, res.interval || 5).subscribe({
          // pollForToken stores the tokens; isAuthenticated$ takes it from there.
          error: () => {
            this.signIn = null;
            this.polling = null;
            this.signInError = 'Signing in didn’t finish. Try again.';
          },
        });
      },
      error: () => (this.signInError = 'Couldn’t start signing in. Check your connection and try again.'),
    });
  }

  retrySignIn(): void {
    this.stopPolling();
    this.signIn = null;
    this.startSignIn();
  }

  private stopPolling(): void {
    this.polling?.unsubscribe();
    this.polling = null;
  }
}
