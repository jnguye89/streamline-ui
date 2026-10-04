import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormsModule } from '@angular/forms';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { GamepadFocusableDirective } from '../../directives/gamepad-focusable.directive';
import { UserService } from '../../services/user.service';
import { StreamPlatform } from '../../models/stream-key.model';
import { GamepadNavigationService } from '../../services/gamepad-navigation.service';
import { TextKeyboardDialogComponent } from '../search/text-keyboard-dialog.component';

type StreamField = 'streamKey' | 'streamUrl';

interface PlatformFormState {
  platform: StreamPlatform;
  label: string;
  showUrl: boolean;
  requiresUrl: boolean;
  streamKey: string;
  streamUrl: string;
  initialStreamKey: string;
  initialStreamUrl: string;
  saving: boolean;
  saved: boolean;
  error: boolean;
}

@Component({
  standalone: true,
  selector: 'app-stream-keys-dialog',
  templateUrl: './stream-keys.dialog.html',
  styleUrl: './stream-keys.dialog.scss',
  imports: [CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatIconModule, GamepadFocusableDirective],
})
export class StreamKeysDialog implements OnInit, OnDestroy {
  platforms: PlatformFormState[] = [
    this.makeEntry(StreamPlatform.TWITCH, 'Twitch', false, false),
    this.makeEntry(StreamPlatform.KICK, 'Kick', true, true),
    this.makeEntry(StreamPlatform.RUMBLE, 'Rumble', true, true),
  ];
  loading = true;

  constructor(
    private userService: UserService,
    private ref: MatDialogRef<StreamKeysDialog>,
    private dialog: MatDialog,
    private gamepadNav: GamepadNavigationService,
  ) { }

  ngOnInit(): void {
    // Drop focus left on the profile page behind us (e.g. the "streaming"
    // button) so B isn't spent dismissing that first, then claim B to close
    // this dialog. The first stick press picks a start inside the dialog.
    this.gamepadNav.clearFocus();
    this.claimBackButton();

    this.userService.getStreamKeys().subscribe({
      next: (existing) => {
        for (const saved of existing) {
          const entry = this.platforms.find(p => p.platform === saved.platform);
          if (!entry) continue;
          entry.streamKey = saved.streamKey ?? '';
          entry.streamUrl = saved.streamUrl ?? '';
          entry.initialStreamKey = entry.streamKey;
          entry.initialStreamUrl = entry.streamUrl;
        }
        this.loading = false;
      },
      error: () => { this.loading = false; },
    });
  }

  isDirty(entry: PlatformFormState): boolean {
    return entry.streamKey.trim() !== entry.initialStreamKey.trim()
      || entry.streamUrl.trim() !== entry.initialStreamUrl.trim();
  }

  isUrlDirty(entry: PlatformFormState): boolean {
    return entry.streamUrl.trim() !== entry.initialStreamUrl.trim();
  }

  urlError(entry: PlatformFormState): string | null {
    if (!entry.showUrl) return null;

    const url = entry.streamUrl.trim();
    if (!url) return entry.requiresUrl ? 'Stream URL is required' : null;

    try {
      new URL(url);
      return null;
    } catch {
      return 'Enter a valid URL';
    }
  }

  canSave(entry: PlatformFormState): boolean {
    return !entry.saving
      && this.isDirty(entry)
      && !!entry.streamKey.trim()
      && !this.urlError(entry);
  }

  save(entry: PlatformFormState): void {
    if (!this.canSave(entry)) return;

    entry.saving = true;
    entry.saved = false;
    entry.error = false;

    this.userService.saveStreamKey({
      platform: entry.platform,
      streamKey: entry.streamKey.trim(),
      streamUrl: entry.streamUrl.trim() || undefined,
    }).subscribe({
      next: () => {
        entry.saving = false;
        entry.saved = true;
        entry.initialStreamKey = entry.streamKey.trim();
        entry.initialStreamUrl = entry.streamUrl.trim();
      },
      error: () => { entry.saving = false; entry.error = true; },
    });
  }

  // Opens the on-screen glider keyboard (same one as the search icon / the
  // podcast page's people search) for a stream url/key field when it's
  // activated with the controller's A button. The gamepad service activates
  // via el.click(), which reports event.detail === 0; real mouse/touch
  // clicks report detail >= 1 and are left alone so desktop users can still
  // type or paste into the input directly.
  onFieldClick(event: MouseEvent, entry: PlatformFormState, field: StreamField): void {
    if (event.detail !== 0) return;
    this.openKeyboard(event.currentTarget as HTMLElement, entry, field);
  }

  openKeyboard(input: HTMLElement, entry: PlatformFormState, field: StreamField): void {
    // TextKeyboardDialogComponent works on a FormControl; mirror it into the
    // ngModel-bound entry live so dirty/URL validation update as you type.
    const control = new FormControl<string | null>(entry[field]);
    const sub = control.valueChanges.subscribe(v => { entry[field] = v ?? ''; });

    this.dialog.open(TextKeyboardDialogComponent, {
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
          : `${entry.label} stream url (rtmp://...)`,
        icon: field === 'streamKey' ? 'key' : 'link',
        symbols: true,
        doneLabel: 'Done',
      },
    }).afterClosed().subscribe(() => {
      sub.unsubscribe();
      // The keyboard dialog clears the back action on destroy - take B back
      // so it closes this dialog again now that the keyboard is gone.
      this.claimBackButton();
      // The keyboard dialog clears gamepad focus on open; put it back on the
      // field we came from so the next stick move continues from here.
      this.gamepadNav.requestFocus(input);
    });
  }

  close(): void {
    this.ref.close();
  }

  ngOnDestroy(): void {
    this.gamepadNav.setBackAction(null);
  }

  private claimBackButton(): void {
    this.gamepadNav.setBackAction(() => {
      this.close();
      return true;
    });
  }

  private makeEntry(platform: StreamPlatform, label: string, showUrl: boolean, requiresUrl: boolean): PlatformFormState {
    return {
      platform, label, showUrl, requiresUrl,
      streamKey: '', streamUrl: '',
      initialStreamKey: '', initialStreamUrl: '',
      saving: false, saved: false, error: false,
    };
  }
}
