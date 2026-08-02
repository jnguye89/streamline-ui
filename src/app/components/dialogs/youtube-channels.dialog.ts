import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { first } from 'rxjs';
import { GamepadFocusableDirective } from '../../directives/gamepad-focusable.directive';
import { YoutubeChannelService } from '../../services/youtube-channel.service';
import { YoutubeChannel } from '../../models/youtube-channel.model';
import { ConfirmEndStreamDialog } from './confirm-stream.dialog';

interface ChannelRowState {
  id: string | number;
  channelId: string;
  name: string;
  enabled: boolean;
  initialName: string;
  initialEnabled: boolean;
  saving: boolean;
  saved: boolean;
  error: boolean;
  deleting: boolean;
}

@Component({
  standalone: true,
  selector: 'app-youtube-channels-dialog',
  templateUrl: './youtube-channels.dialog.html',
  styleUrl: './youtube-channels.dialog.scss',
  imports: [CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatIconModule, GamepadFocusableDirective],
})
export class YoutubeChannelsDialog implements OnInit {
  channels: ChannelRowState[] = [];
  loading = true;

  newChannelHandle = '';
  newChannelName = '';
  adding = false;
  addError: string | null = null;

  constructor(
    private youtubeChannelService: YoutubeChannelService,
    private dialog: MatDialog,
    private ref: MatDialogRef<YoutubeChannelsDialog>
  ) { }

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading = true;
    this.youtubeChannelService.getChannels().subscribe({
      next: (channels) => {
        this.channels = channels.map(c => this.toRow(c));
        this.loading = false;
      },
      error: () => { this.loading = false; },
    });
  }

  private toRow(c: YoutubeChannel): ChannelRowState {
    const name = c.name ?? '';
    return {
      id: c.id,
      channelId: c.channelId,
      name,
      enabled: c.enabled,
      initialName: name,
      initialEnabled: c.enabled,
      saving: false,
      saved: false,
      error: false,
      deleting: false,
    };
  }

  addChannel(): void {
    const handle = this.newChannelHandle.trim();
    if (!handle || this.adding) return;

    this.adding = true;
    this.addError = null;

    // The API field is still named channelId, but the backend now accepts a
    // handle here and resolves the actual channel ID from it server-side.
    this.youtubeChannelService.createChannel({
      channelId: handle,
      name: this.newChannelName.trim() || undefined,
    }).subscribe({
      next: (created) => {
        this.channels.push(this.toRow(created));
        this.newChannelHandle = '';
        this.newChannelName = '';
        this.adding = false;
      },
      error: () => {
        this.adding = false;
        this.addError = 'Could not add that channel. Check the handle and try again.';
      },
    });
  }

  isDirty(row: ChannelRowState): boolean {
    return row.name.trim() !== row.initialName.trim() || row.enabled !== row.initialEnabled;
  }

  canSave(row: ChannelRowState): boolean {
    return !row.saving && this.isDirty(row);
  }

  save(row: ChannelRowState): void {
    if (!this.canSave(row)) return;

    row.saving = true;
    row.saved = false;
    row.error = false;

    this.youtubeChannelService.updateChannel(row.id, {
      name: row.name.trim() || undefined,
      enabled: row.enabled,
    }).subscribe({
      next: () => {
        row.saving = false;
        row.saved = true;
        row.initialName = row.name.trim();
        row.initialEnabled = row.enabled;
      },
      error: () => { row.saving = false; row.error = true; },
    });
  }

  remove(row: ChannelRowState): void {
    const dialogRef = this.dialog.open(ConfirmEndStreamDialog, {
      panelClass: 'spotlight-panel',
      data: {
        title: 'Remove channel',
        body: `Remove ${row.name || row.channelId}? Its videos will no longer sync into the feed.`,
        confirmBtnText: 'Remove',
        cancelBtnText: 'Cancel',
      },
    });

    dialogRef.afterClosed().pipe(first()).subscribe((confirmed) => {
      if (!confirmed) return;

      row.deleting = true;
      this.youtubeChannelService.deleteChannel(row.id).subscribe({
        next: () => { this.channels = this.channels.filter(c => c !== row); },
        error: () => { row.deleting = false; row.error = true; },
      });
    });
  }

  close(): void {
    this.ref.close();
  }
}
