import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { GamepadFocusableDirective } from '../../directives/gamepad-focusable.directive';

export type AccountChoice = 'youtube' | 'logout' | undefined;

// Account, behind "+ Menu" on the profile (handoff mockup 06_account).
// Subscription price is left out until the API has one.
@Component({
  standalone: true,
  imports: [CommonModule, MatDialogModule, GamepadFocusableDirective],
  template: `
    <div class="account">
      <h2 class="account-name">{{ data.name }}</h2>
      <p class="account-sub">Your account. The stream keys moved to Simulcast.</p>

      <button gamepadFocusable class="row" (click)="ref.close('youtube')">
        <span class="row-title"><span class="ic" style="--ic: url(/assets/icons/tv/youtube_channels.svg)"></span>YouTube Channels</span>
      </button>

      <a gamepadFocusable class="row" href="mailto:him&#64;skriin.com">
        <span class="row-title">Need help?</span>
        <span class="row-sub">him&#64;skriin.com</span>
      </a>

      <button gamepadFocusable class="row row--danger" (click)="ref.close('logout')">
        <span class="row-title"><span class="ic" style="--ic: url(/assets/icons/tv/log_out.svg)"></span>Log Out</span>
      </button>
    </div>
  `,
  styles: [`
    .account {
      padding: 32px 36px 28px; color: #fff; min-width: min(680px, 90vw); box-sizing: border-box;
      background: #19191c; border: 2px solid #2e2e33; border-radius: 24px;
    }
    .account-name { margin: 0; font: 600 32px/1.2 Inter, system-ui, sans-serif; }
    .account-sub { margin: 8px 0 20px; color: rgba(255,255,255,.72); font: 500 18px/1.3 Inter, system-ui, sans-serif; }
    .row {
      display: flex; flex-direction: column; align-items: flex-start; gap: 4px;
      width: 100%; box-sizing: border-box; margin-top: 12px; padding: 16px 22px;
      background: #26262a; border: 0; border-radius: 12px; color: #fff;
      text-align: left; text-decoration: none; cursor: pointer; font-family: Inter, system-ui, sans-serif;
    }
    .row:focus, .row.gamepad-focused { outline: 4px solid #fff; outline-offset: 2px; }
    .row-title { display: flex; align-items: center; gap: 12px; font-size: 22px; font-weight: 600; }
    .row-sub { font-size: 16px; color: rgba(255,255,255,.72); font-weight: 500; }
    .row--danger { color: #ff5c7a; padding: 22px; }
    .ic {
      width: 24px; height: 24px; flex: none; background: currentColor;
      -webkit-mask: var(--ic) center / contain no-repeat; mask: var(--ic) center / contain no-repeat;
    }
  `],
})
export class AccountDialog {
  constructor(
    public ref: MatDialogRef<AccountDialog, AccountChoice>,
    @Inject(MAT_DIALOG_DATA) public data: { name: string },
  ) { }
}
