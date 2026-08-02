import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { GamepadFocusableDirective } from '../../directives/gamepad-focusable.directive';
import { UserService } from '../../services/user.service';
import { StreamPlatform } from '../../models/stream-key.model';

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
export class StreamKeysDialog implements OnInit {
  platforms: PlatformFormState[] = [
    this.makeEntry(StreamPlatform.TWITCH, 'Twitch', false, false),
    this.makeEntry(StreamPlatform.KICK, 'Kick', true, true),
    this.makeEntry(StreamPlatform.RUMBLE, 'Rumble', true, true),
  ];
  loading = true;

  constructor(
    private userService: UserService,
    private ref: MatDialogRef<StreamKeysDialog>
  ) { }

  ngOnInit(): void {
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

  close(): void {
    this.ref.close();
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
