import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import qrcode from 'qrcode-generator';

/** Join QR as crisp SVG (dark modules on white, with the quiet zone). */
@Component({
  selector: 'bon-qr',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.viewBox]="viewBox()" [style.width.px]="size()" [style.height.px]="size()" shape-rendering="crispEdges" role="img" [attr.aria-label]="'QR code for ' + text()">
      <rect [attr.width]="extent()" [attr.height]="extent()" fill="#fff" />
      <path [attr.d]="path()" fill="#0b0b10" />
    </svg>
  `,
  styles: `:host { display: inline-block; line-height: 0; } svg { border-radius: 20px; }`,
})
export class QrComponent {
  readonly text = input.required<string>();
  readonly size = input(280);

  private static readonly QUIET = 3;

  private readonly code = computed(() => {
    const qr = qrcode(0, 'M');
    qr.addData(this.text());
    qr.make();
    return qr;
  });
  protected readonly extent = computed(() => this.code().getModuleCount() + QrComponent.QUIET * 2);
  protected readonly viewBox = computed(() => `0 0 ${this.extent()} ${this.extent()}`);
  protected readonly path = computed(() => {
    const qr = this.code();
    const n = qr.getModuleCount();
    const q = QrComponent.QUIET;
    let d = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + q} ${r + q}h1v1h-1z`;
    }
    return d;
  });
}
