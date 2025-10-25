import { Component } from "@angular/core";
import { MatDialogModule, MatDialogRef } from "@angular/material/dialog";

// accept-call.modal.ts (pseudo)
@Component({
    selector: 'app-accept-call-modal',
    standalone: true,
    imports: [MatDialogModule],
    template: `
    <h2 mat-dialog-title>{{from}} is calling…</h2>
    <mat-dialog-content>Join {{media === 'video' ? 'video' : 'audio'}} call?</mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="decline()">Decline</button>
      <button mat-raised-button color="primary" (click)="accept()">Accept</button>
    </mat-dialog-actions>
  `
})
export class AcceptCallModal {
    from!: string;
    media: 'audio' | 'video' = 'video';
    constructor(private ref: MatDialogRef<AcceptCallModal>) { }
    accept() { this.ref.close(true); }
    decline() { this.ref.close(false); }
}
