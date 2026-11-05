import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { GamepadFocusableDirective } from '../../directives/gamepad-focusable.directive';
import { AgeService } from '../../services/age.service';

/** "saved" with the date, or "underage" when the API removed the account (under 13). */
export type BirthdayDialogResult = { outcome: 'saved'; birthDate: string } | { outcome: 'underage' };

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Asks for a date of birth once, after signing in. Neutrally worded — it doesn't say what age
 * is needed — so nobody is nudged into a different answer. Dropdowns rather than a calendar,
 * so it works with a TV remote or gamepad as well as a mouse. Can't be dismissed without an
 * answer.
 */
@Component({
  standalone: true,
  template: `
    <h2 mat-dialog-title>When’s your birthday?</h2>
    <mat-dialog-content>
      <p class="note">This won’t be shown on your profile.</p>
      <div class="fields">
        <mat-form-field appearance="outline" class="month">
          <mat-label>Month</mat-label>
          <mat-select gamepadFocusable [(ngModel)]="month" (selectionChange)="clampDay()">
            <mat-option *ngFor="let name of months; let i = index" [value]="i + 1">{{ name }}</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" class="day">
          <mat-label>Day</mat-label>
          <mat-select gamepadFocusable [(ngModel)]="day">
            <mat-option *ngFor="let d of days" [value]="d">{{ d }}</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" class="year">
          <mat-label>Year</mat-label>
          <mat-select gamepadFocusable [(ngModel)]="year" (selectionChange)="clampDay()">
            <mat-option *ngFor="let y of years" [value]="y">{{ y }}</mat-option>
          </mat-select>
        </mat-form-field>
      </div>
      <p class="error" *ngIf="error">{{ error }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button gamepadFocusable mat-raised-button color="primary" [disabled]="!birthDate || saving" (click)="save()">
        <mat-spinner *ngIf="saving" diameter="18"></mat-spinner>
        <span *ngIf="!saving">Continue</span>
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .note { margin: 0 0 16px; opacity: 0.75; }
      .fields { display: flex; gap: 12px; flex-wrap: wrap; }
      .month { width: 170px; }
      .day { width: 100px; }
      .year { width: 120px; }
      .error { color: #e5484d; margin: 4px 0 0; }
    `,
  ],
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    GamepadFocusableDirective,
  ],
})
export class BirthdayDialog {
  readonly months = MONTHS;
  readonly years: number[];
  month: number | null = null;
  day: number | null = null;
  year: number | null = null;
  saving = false;
  error: string | null = null;
  private readonly today = new Date();

  constructor(
    private readonly ref: MatDialogRef<BirthdayDialog, BirthdayDialogResult>,
    private readonly age: AgeService,
  ) {
    const thisYear = this.today.getFullYear();
    this.years = Array.from({ length: thisYear - 1900 + 1 }, (_, i) => thisYear - i);
  }

  /** The days in the chosen month (and year, for February). */
  get days(): number[] {
    const count = new Date(this.year ?? 2000, this.month ?? 1, 0).getDate();
    return Array.from({ length: count }, (_, i) => i + 1);
  }

  /** A complete, real, not-in-the-future date as YYYY-MM-DD, or null. */
  get birthDate(): string | null {
    if (!this.year || !this.month || !this.day) return null;
    const picked = new Date(this.year, this.month - 1, this.day);
    if (picked > this.today) return null;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${this.year}-${pad(this.month)}-${pad(this.day)}`;
  }

  /** Switching to a shorter month (or out of a leap year) mustn't leave the 31st selected. */
  clampDay(): void {
    if (this.day && this.day > this.days.length) this.day = this.days.length;
  }

  async save(): Promise<void> {
    const birthDate = this.birthDate;
    if (!birthDate) return;
    this.saving = true;
    this.error = null;
    try {
      const outcome = await this.age.setBirthDate(birthDate);
      this.ref.close(outcome === 'underage' ? { outcome } : { outcome, birthDate });
    } catch {
      this.error = 'Couldn’t save that. Please check your connection and try again.';
      this.saving = false;
    }
  }
}
