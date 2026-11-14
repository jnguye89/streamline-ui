import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injectable,
  ViewEncapsulation,
  afterNextRender,
  inject,
  signal,
} from '@angular/core';
import { STAGE_H, STAGE_W } from './tv.types';

/** Current stage scale, for anything that measures the screen (e.g. faces flying onto cards). */
@Injectable()
export class TvStageScale {
  readonly scale = signal(1);
}

/**
 * The checkers v2 stage scaler: a fixed 1920×1080 stage on black, scaled to fit and centered.
 * Same math and CSS as checkers (min(w/1920, h/1080), translate(-50%,-50%) scale()).
 * The only difference: it measures its own box instead of the window, so the preview can put the TV
 * next to a phone. On the TV the host fills the window (position: fixed; inset: 0), so it is identical.
 */
@Component({
  selector: 'skriin-tv-stage',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  providers: [TvStageScale],
  template: `<div class="tv-stage" [style.--tv-scale]="stage.scale()"><ng-content /></div>`,
  styles: `
    skriin-tv-stage { position: relative; display: block; width: 100%; height: 100%; overflow: hidden; background: #000; }
    skriin-tv-stage.fill { position: fixed; inset: 0; }
    .tv-stage {
      position: absolute; left: 50%; top: 50%; width: 1920px; height: 1080px;
      transform: translate(-50%, -50%) scale(var(--tv-scale, 1));
    }
  `,
})
export class TvStageComponent {
  protected readonly stage = inject(TvStageScale);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      this.fit();
      const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.fit());
      ro?.observe(this.host.nativeElement);
      const onResize = () => this.fit();
      globalThis.addEventListener?.('resize', onResize);
      destroyRef.onDestroy(() => {
        ro?.disconnect();
        globalThis.removeEventListener?.('resize', onResize);
      });
    });
  }

  fit(): void {
    const box = this.host.nativeElement.getBoundingClientRect();
    const w = box.width || globalThis.innerWidth || STAGE_W;
    const h = box.height || globalThis.innerHeight || STAGE_H;
    this.stage.scale.set(Math.min(w / STAGE_W, h / STAGE_H));
  }
}
