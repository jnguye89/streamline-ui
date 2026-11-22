import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { GamepadFocusableDirective } from '../../directives/gamepad-focusable.directive';

// A viewer's "···" on a video card (handoff mockup 32_viewer_video_options).
// Report goes to support by email for now; Block is left out until the API
// has a block endpoint.
@Component({
  standalone: true,
  imports: [CommonModule, MatDialogModule, GamepadFocusableDirective],
  template: `
    <div class="options">
      <h2 class="options-title">Options</h2>
      <p class="options-sub">Video<ng-container *ngIf="data.duration"> · {{ data.duration }}</ng-container> · by {{ data.ownerName }}</p>

      <a gamepadFocusable class="row" [href]="reportHref" (click)="ref.close()">
        <span class="row-title"><span class="ic" style="--ic: url(/assets/icons/tv/report.svg)"></span>Report this video</span>
        <span class="row-sub">Tell skriin what is wrong with it</span>
      </a>
    </div>
  `,
  styles: [`
    .options {
      padding: 32px 36px 28px; color: #fff; min-width: min(760px, 90vw); box-sizing: border-box;
      background: #19191c; border: 2px solid #2e2e33; border-radius: 24px;
      font-family: Inter, system-ui, sans-serif;
    }
    .options-title { margin: 0; font-size: 32px; font-weight: 600; line-height: 1.2; }
    .options-sub { margin: 8px 0 20px; color: rgba(255,255,255,.72); font-size: 20px; font-weight: 500; }
    .row {
      display: flex; flex-direction: column; align-items: flex-start; gap: 4px;
      width: 100%; box-sizing: border-box; margin-top: 12px; padding: 16px 22px;
      background: #26262a; border-radius: 12px; color: #fff; text-decoration: none; cursor: pointer;
    }
    .row:focus, .row.gamepad-focused { outline: none; box-shadow: 0 0 0 4px #fff !important; }
    .row-title { display: flex; align-items: center; gap: 12px; font-size: 24px; font-weight: 600; }
    .row-sub { font-size: 18px; color: rgba(255,255,255,.72); font-weight: 500; }
    .ic {
      width: 24px; height: 24px; flex: none; background: currentColor;
      -webkit-mask: var(--ic) center / contain no-repeat; mask: var(--ic) center / contain no-repeat;
    }
  `],
})
export class VideoOptionsDialog {
  readonly reportHref: string;

  constructor(
    public ref: MatDialogRef<VideoOptionsDialog>,
    @Inject(MAT_DIALOG_DATA) public data: { videoId: number; ownerName: string; duration: string | null },
  ) {
    const subject = encodeURIComponent(`Report video ${data.videoId}`);
    this.reportHref = `mailto:him@skriin.com?subject=${subject}`;
  }
}
