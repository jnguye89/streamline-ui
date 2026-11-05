import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { BirthdayDialog, BirthdayDialogResult } from '../components/dialogs/birthday.dialog';
import { ConfirmEndStreamDialog } from '../components/dialogs/confirm-stream.dialog';
import { DeviceAuthService } from './device-auth.service';

/**
 * Asks a signed-in user for their date of birth when the API has none, and deals with the
 * answer: under 13, the account is already gone, so this browser is signed out and told so.
 */
@Injectable({ providedIn: 'root' })
export class BirthdayPromptService {
  private open: Promise<string | null> | null = null;

  constructor(
    private readonly dialog: MatDialog,
    private readonly deviceAuth: DeviceAuthService,
    private readonly router: Router,
  ) {}

  /** Their birth date, asking for it first if needed. Null if they turned out to be under 13. */
  ensureBirthDate(known?: string | null): Promise<string | null> {
    if (known) return Promise.resolve(known);
    // Only one dialog, even if the app shell and a page both ask at once.
    this.open ??= this.ask().finally(() => (this.open = null));
    return this.open;
  }

  private async ask(): Promise<string | null> {
    const result = await firstValueFrom(
      this.dialog
        .open<BirthdayDialog, void, BirthdayDialogResult>(BirthdayDialog, {
          disableClose: true,
          autoFocus: 'first-tabbable',
        })
        .afterClosed(),
    );
    if (result?.outcome === 'saved') return result.birthDate;

    this.deviceAuth.logout();
    void this.router.navigateByUrl('/');
    this.dialog.open(ConfirmEndStreamDialog, {
      data: {
        title: 'Sorry, you’re not eligible to use skriin',
        body: 'Your account has been removed. You can still watch without an account.',
        confirmBtnText: 'OK',
        cancelBtnText: '',
      },
    });
    return null;
  }
}
