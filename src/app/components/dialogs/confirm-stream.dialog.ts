// confirm-end-stream.dialog.ts
import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { GamepadFocusableDirective } from '../../directives/gamepad-focusable.directive';

@Component({
  standalone: true,
  template: `
    <h2 mat-dialog-title>{{data.title}}</h2>
    <mat-dialog-content>{{data.body}}</mat-dialog-content>
    <mat-dialog-actions align="end">
      <button gamepadFocusable mat-button *ngIf="!!data.cancelBtnText" (click)="close(false)">{{data.cancelBtnText}}</button>
      <button gamepadFocusable mat-raised-button color="primary" (click)="close(true)">{{data.confirmBtnText}}</button>
    </mat-dialog-actions>
  `,
  imports: [MatDialogModule, MatButtonModule, CommonModule, GamepadFocusableDirective]
})
export class ConfirmEndStreamDialog {
  constructor(
    private ref: MatDialogRef<ConfirmEndStreamDialog>,
    @Inject(MAT_DIALOG_DATA) public data: { title: string; body: string, confirmBtnText: string, cancelBtnText: string }
  ) { }
  close(v: boolean) { this.ref.close(v); }
}
