import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TableStore } from '../table-store.service';

/** "Pung!" / "Chow!" / "Kong!" next to the claimer, with their face. Short, never blocks input. */
@Component({
  selector: 'mj-callouts',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (c of store.callouts(); track c.id) {
      <div class="callout" [class]="c.spot" role="status">
        <span class="face" [class.bot]="c.bot" [class.you]="c.spot === 'bottom'">{{
          c.bot || c.spot === 'bottom' ? '' : c.name.charAt(0)
        }}</span>
        <span class="text">{{ c.text }}</span>
      </div>
    }
  `,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 8;
    }
    .callout {
      position: absolute;
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 12px 28px 12px 12px;
      border-radius: 999px;
      background: var(--indigo);
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
      animation: pop 260ms var(--ease);
      white-space: nowrap;
    }
    .face {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: #1e1b4b;
      font: 600 30px/1 var(--font-display);
      color: #fff;
    }
    .face.bot {
      background: #1e1b4b
        url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cg fill='none' stroke='%23c7d2fe' stroke-width='4' stroke-linecap='round'%3E%3Crect x='12' y='16' width='40' height='34' rx='11'/%3E%3Cpath d='M25 41q7 5 14 0'/%3E%3C/g%3E%3Ccircle cx='25' cy='32' r='4' fill='%23c7d2fe'/%3E%3Ccircle cx='39' cy='32' r='4' fill='%23c7d2fe'/%3E%3C/svg%3E")
        center / 64% no-repeat;
    }
    .face.you {
      background: #1e1b4b
        url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cg fill='none' stroke='%23c7d2fe' stroke-width='1.8' stroke-linejoin='round'%3E%3Crect x='2.5' y='6.5' width='13' height='11' rx='2.5'/%3E%3Cpath d='M15.5 10.5 21 7.5v9l-5.5-3'/%3E%3C/g%3E%3C/svg%3E")
        center / 56% no-repeat;
    }
    .text {
      font: 600 44px/1 var(--font-display);
      letter-spacing: -0.02em;
      color: #fff;
    }
    .bottom {
      left: 50%;
      top: 742px;
      transform: translateX(-50%);
    }
    .right {
      left: 1310px;
      top: 300px;
    }
    .top {
      left: 50%;
      top: 196px;
      transform: translateX(-50%);
    }
    .left {
      left: 316px;
      top: 300px;
    }
    @keyframes pop {
      from {
        opacity: 0;
        scale: 0.7;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .callout {
        animation: none;
      }
    }
  `,
})
export class CalloutsComponent {
  protected readonly store = inject(TableStore);
}
