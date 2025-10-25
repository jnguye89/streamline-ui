import { CommonModule } from "@angular/common";
import { Component, Inject } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from "@angular/material/dialog";

// accept-call.modal.ts (pseudo)
@Component({
    selector: 'app-accept-call-modal',
    standalone: true,
    imports: [MatDialogModule, MatButtonModule, CommonModule],
    template: `
    <h2 mat-dialog-title>{{data.from}} is calling…</h2>
    <mat-dialog-content>Join {{media === 'video' ? 'video' : 'audio'}} call?</mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="decline()">Decline</button>
      <button mat-raised-button color="primary" (click)="accept()">Accept</button>
    </mat-dialog-actions>
  `
})
export class AcceptCallModal {
    // from!: string;
    media: 'audio' | 'video' = 'video';
    constructor(private ref: MatDialogRef<AcceptCallModal>, @Inject(MAT_DIALOG_DATA) public data: { from: string }) { }
    accept() { this.ref.close(true); }
    decline() { this.ref.close(false); }
}
