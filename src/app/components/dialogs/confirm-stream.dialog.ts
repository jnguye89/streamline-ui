// confirm-end-stream.dialog.ts
import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

@Component({
  standalone: true,
  template: `
    <h2 mat-dialog-title>{{data.title}}</h2>
    <mat-dialog-content>{{data.body}}</mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="close(false)">Stay</button>
      <button mat-flat-button color="warn" (click)="close(true)">End & Leave</button>
    </mat-dialog-actions>
  `,
  imports: [MatDialogModule, MatButtonModule, CommonModule]
})
export class ConfirmEndStreamDialog {
  constructor(
    private ref: MatDialogRef<ConfirmEndStreamDialog>,
    @Inject(MAT_DIALOG_DATA) public data: { title: string; body: string }
  ) { }
  close(v: boolean) { this.ref.close(v); }
}
