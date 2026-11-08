import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import * as qrcodeModule from 'qrcode-generator';

interface QrCode {
  addData(data: string): void;
  make(): void;
  getModuleCount(): number;
  isDark(row: number, col: number): boolean;
}
type QrFactory = (typeNumber: 0, errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H') => QrCode;

/** Works whether or not the host app turns on esModuleInterop (skriin.com on Angular 17.3 or 22). */
const qrcode = ((qrcodeModule as unknown as { default?: QrFactory }).default ?? (qrcodeModule as unknown as QrFactory)) as QrFactory;

/** Scannable QR as one SVG path (qrcode-generator, MIT). White quiet zone so phones read it off a TV. */
@Component({
  selector: 'pk-qr',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.viewBox]="box()" [style.width.px]="size()" [style.height.px]="size()" role="img" [attr.aria-label]="'QR code for ' + text()">
      <rect [attr.width]="dim()" [attr.height]="dim()" fill="#fff" />
      <path [attr.d]="path()" fill="#0b0b10" />
    </svg>
  `,
  styles: `:host { display: block; flex: none; line-height: 0; } svg { border-radius: 14px; }`,
})
export class QrComponent {
  readonly text = input.required<string>();
  readonly size = input(200);

  private readonly qr = computed(() => {
    const q = qrcode(0, 'M');
    q.addData(this.text());
    q.make();
    return q;
  });
  private readonly margin = 3;
  protected readonly dim = computed(() => this.qr().getModuleCount() + this.margin * 2);
  protected readonly box = computed(() => `0 0 ${this.dim()} ${this.dim()}`);
  protected readonly path = computed(() => {
    const q = this.qr();
    const n = q.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (q.isDark(r, c)) d += `M${c + this.margin} ${r + this.margin}h1v1h-1z`;
      }
    }
    return d;
  });
}
