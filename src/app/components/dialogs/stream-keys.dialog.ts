import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl } from '@angular/forms';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { Subscription, firstValueFrom, interval, startWith, switchMap } from 'rxjs';
import { GamepadFocusableDirective } from '../../directives/gamepad-focusable.directive';
import { UserService } from '../../services/user.service';
import { StreamPlatform } from '../../models/stream-key.model';
import { GamepadNavigationService } from '../../services/gamepad-navigation.service';
import { TextKeyboardDialogComponent } from '../search/text-keyboard-dialog.component';
import { QrComponent } from '../../bot-or-not/tv/ui/qr.component';

/** Where the phone goes. The app opens this as /link?code=… (Universal Links). */
export const LINK_PAGE = 'https://skriin.com/link';
/** How often the TV asks whether the phone has sent the key. */
const POLL_MS = 2500;

type StreamField = 'streamKey' | 'streamUrl';

interface PlatformEntry {
  platform: StreamPlatform;
  label: string;
  /** Kick needs its own ingest URL as well as the key. */
  requiresUrl: boolean;
  streamKey: string;
  streamUrl: string;
  on: boolean;
}

/**
 * Simulcast (handoff mockups 27_simulcast and 28_stream_key).
 *
 * List: one row per platform. A switches it on/off for the next live, or
 * opens "Add key" when there is no key yet. X changes a saved key. B closes.
 *
 * Add key: a QR and a short code. The phone (signed in to the same account)
 * opens skriin.com/link?code=…, pastes the key, and the TV notices within a
 * few seconds and goes back to the list with that platform on. Or "Type it on
 * the TV instead", which uses the TV keyboard. B goes back to the list.
 */
@Component({
  standalone: true,
  selector: 'app-stream-keys-dialog',
  templateUrl: './stream-keys.dialog.html',
  styleUrl: './stream-keys.dialog.scss',
  imports: [CommonModule, MatDialogModule, GamepadFocusableDirective, QrComponent],
})
export class StreamKeysDialog implements OnInit, OnDestroy {
  platforms: PlatformEntry[] = [
    this.makeEntry(StreamPlatform.YOUTUBE, 'YouTube', false),
    this.makeEntry(StreamPlatform.TWITCH, 'Twitch', false),
    this.makeEntry(StreamPlatform.KICK, 'Kick', true),
  ];
  loading = true;
  /** A switch that couldn't be saved, shown under the list. */
  listError: string | null = null;

  /** The row with focus, for X (change the key). */
  focused: PlatformEntry | null = null;

  /** Set while the "Add key" view is showing. */
  adding: PlatformEntry | null = null;
  /** The code from the API for the Add key view; empty while it's being fetched. */
  phoneCode = '';
  /** Set when a code couldn't be fetched; "Type it on the TV" still works. */
  codeError: string | null = null;
  saving = false;
  saveError: string | null = null;
  private polling: Subscription | null = null;

  get linkUrl(): string {
    return `${LINK_PAGE}?code=${this.phoneCode}`;
  }

  constructor(
    private userService: UserService,
    private ref: MatDialogRef<StreamKeysDialog>,
    private dialog: MatDialog,
    private gamepadNav: GamepadNavigationService,
  ) { }

  ngOnInit(): void {
    // Drop focus left on the page behind us so B isn't spent dismissing that
    // first. The first stick press picks a start inside the dialog.
    this.gamepadNav.clearFocus();
    this.claimButtons();

    this.userService.getStreamKeys().subscribe({
      next: (existing) => {
        for (const saved of existing) {
          const entry = this.platforms.find(p => p.platform === saved.platform);
          if (!entry) continue;
          entry.streamKey = saved.streamKey ?? '';
          entry.streamUrl = saved.streamUrl ?? '';
          entry.on = saved.enabled !== false;
        }
        this.loading = false;
      },
      error: () => { this.loading = false; },
    });
  }

  hasKey(entry: PlatformEntry): boolean {
    return !!entry.streamKey.trim() && (!entry.requiresUrl || !!entry.streamUrl.trim());
  }

  status(entry: PlatformEntry): string {
    if (!this.hasKey(entry)) return 'No key yet';
    return entry.on ? 'Stream key saved · on for your next live' : 'Stream key saved · off';
  }

  /** A on a row: switch it, or add a key if there is none. */
  activate(entry: PlatformEntry): void {
    if (!this.hasKey(entry)) {
      this.openAdd(entry);
      return;
    }
    // Shown at once; put back if the account couldn't be updated.
    const on = !entry.on;
    entry.on = on;
    this.listError = null;
    this.userService.setStreamKeyEnabled(entry.platform, on).subscribe({
      error: () => {
        entry.on = !on;
        this.listError = `Couldn’t switch ${entry.label} ${on ? 'on' : 'off'}. Try again.`;
      },
    });
  }

  /** X: change the key of the focused row. */
  changeFocusedKey(): void {
    if (this.adding || !this.focused || !this.hasKey(this.focused)) return;
    this.openAdd(this.focused);
  }

  openAdd(entry: PlatformEntry): void {
    this.adding = entry;
    this.saveError = null;
    this.gamepadNav.clearFocus();
    this.newCode(entry);
  }

  /** Asks the API for a code for this platform, then waits for the phone. */
  private newCode(entry: PlatformEntry): void {
    this.stopPolling();
    this.phoneCode = '';
    this.codeError = null;
    this.userService.createStreamKeyLink(entry.platform).subscribe({
      next: ({ code }) => {
        if (this.adding !== entry) return; // left the screen meanwhile
        this.phoneCode = code;
        this.waitForPhone(entry, code);
      },
      error: () => {
        if (this.adding !== entry) return;
        this.codeError = 'Couldn’t get a code. You can still type the key on the TV.';
      },
    });
  }

  private waitForPhone(entry: PlatformEntry, code: string): void {
    this.polling = interval(POLL_MS).pipe(
      startWith(0),
      switchMap(() => this.userService.getStreamKeyLinkStatus(code)),
    ).subscribe({
      next: ({ status }) => {
        if (this.adding !== entry || this.phoneCode !== code) return;
        if (status === 'done') this.phoneSentKey(entry);
        // Codes last 10 minutes; a TV left on this screen just gets a fresh one.
        else if (status === 'expired') this.newCode(entry);
      },
      // A dropped request isn't worth an error on screen; try again next tick.
      error: () => {
        if (this.adding === entry && this.phoneCode === code) {
          this.stopPolling();
          this.waitForPhone(entry, code);
        }
      },
    });
  }

  /** The phone saved the key on the account: show it, switched on. */
  private phoneSentKey(entry: PlatformEntry): void {
    this.stopPolling();
    this.userService.getStreamKeys().subscribe({
      next: (keys) => {
        const saved = keys.find((k) => k.platform === entry.platform);
        entry.streamKey = saved?.streamKey ?? entry.streamKey;
        entry.streamUrl = saved?.streamUrl ?? entry.streamUrl;
        this.markOn(entry);
      },
      error: () => this.markOn(entry),
    });
  }

  private markOn(entry: PlatformEntry): void {
    // Even if the keys couldn't be reloaded, the API said it's saved. Only
    // hasKey() reads these here; the real values never come back to the TV list.
    if (!entry.streamKey) entry.streamKey = 'saved';
    if (entry.requiresUrl && !entry.streamUrl) entry.streamUrl = 'saved';
    // Saving a key switches it on in the API.
    entry.on = true;
    if (this.adding === entry) this.backToList();
  }

  private stopPolling(): void {
    this.polling?.unsubscribe();
    this.polling = null;
  }

  backToList(): void {
    this.stopPolling();
    const entry = this.adding;
    this.adding = null;
    this.saveError = null;
    this.gamepadNav.clearFocus();
    // Put focus back on the row we came from once it is drawn again.
    setTimeout(() => {
      const row = document.querySelector<HTMLElement>(`[data-platform="${entry?.platform}"]`);
      if (row) this.gamepadNav.requestFocus(row);
    });
  }

  /** "Type it on the TV instead": URL first when needed, then the key, then save. */
  async typeOnTv(): Promise<void> {
    const entry = this.adding;
    if (!entry || this.saving) return;
    const fields: StreamField[] = entry.requiresUrl ? ['streamUrl', 'streamKey'] : ['streamKey'];

    const typed: Record<StreamField, string> = { streamUrl: entry.streamUrl, streamKey: '' };
    for (const field of fields) {
      typed[field] = (await this.openKeyboard(entry, field, typed[field])).trim();
      if (!typed[field]) return; // closed without typing: stay on Add key
    }

    if (entry.requiresUrl && !isUrl(typed.streamUrl)) {
      this.saveError = 'That stream URL does not look right. It should start with rtmp:// or rtmps://';
      return;
    }

    this.saving = true;
    this.saveError = null;
    this.userService.saveStreamKey({
      platform: entry.platform,
      streamKey: typed.streamKey,
      streamUrl: typed.streamUrl || undefined,
    }).subscribe({
      next: () => {
        this.saving = false;
        entry.streamKey = typed.streamKey;
        entry.streamUrl = typed.streamUrl;
        // A new key is on for the next live.
        // Saving a key switches it on in the API.
        entry.on = true;
        this.backToList();
      },
      error: () => {
        this.saving = false;
        this.saveError = 'The key could not be saved. Try again.';
      },
    });
  }

  close(): void {
    this.ref.close();
  }

  ngOnDestroy(): void {
    this.stopPolling();
    this.gamepadNav.setBackAction(null);
    this.gamepadNav.clearAuxButtonActions();
  }

  private openKeyboard(entry: PlatformEntry, field: StreamField, start: string): Promise<string> {
    const control = new FormControl<string | null>(start);
    const closed = this.dialog.open(TextKeyboardDialogComponent, {
      width: '560px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      position: { top: '6%' },
      panelClass: 'spotlight-panel',
      backdropClass: 'spotlight-backdrop',
      autoFocus: false,
      data: {
        control,
        placeholder: field === 'streamKey'
          ? `${entry.label} stream key`
          : `${entry.label} stream URL (rtmp://...)`,
        icon: field === 'streamKey' ? 'key' : 'link',
        symbols: true,
        doneLabel: 'Done',
      },
    }).afterClosed();

    return firstValueFrom(closed).then(() => {
      // The keyboard clears B and the aux buttons when it closes - take them back.
      this.claimButtons();
      return control.value ?? '';
    });
  }

  private claimButtons(): void {
    this.gamepadNav.setBackAction(() => {
      if (this.adding) this.backToList(); else this.close();
      return true;
    });
    this.gamepadNav.setAuxButtonActions({ x: () => this.changeFocusedKey() });
  }

  private makeEntry(platform: StreamPlatform, label: string, requiresUrl: boolean): PlatformEntry {
    return { platform, label, requiresUrl, streamKey: '', streamUrl: '', on: true };
  }
}

function isUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}
