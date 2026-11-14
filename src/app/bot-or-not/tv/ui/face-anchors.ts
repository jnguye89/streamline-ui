import {
  Directive,
  ElementRef,
  Injectable,
  OnDestroy,
  OnInit,
  afterNextRender,
  inject,
  input,
} from '@angular/core';
import { TvStageScale } from '../../../shared/tv/tv-stage.component';

/** Where each player's face sits on screen, so voters' faces can fly from the strip onto cards. */
@Injectable()
export class FaceAnchors {
  private readonly els = new Map<string, HTMLElement>();
  set(playerId: string, el: HTMLElement): void {
    this.els.set(playerId, el);
  }
  delete(playerId: string, el: HTMLElement): void {
    if (this.els.get(playerId) === el) this.els.delete(playerId);
  }
  get(playerId: string): HTMLElement | undefined {
    return this.els.get(playerId);
  }
}

/** Marks a face in the strip as the anchor for its player. */
@Directive({ selector: '[bonFaceAnchor]', standalone: true })
export class FaceAnchorDirective implements OnInit, OnDestroy {
  readonly bonFaceAnchor = input.required<string>();
  private readonly anchors = inject(FaceAnchors);
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  ngOnInit(): void {
    this.anchors.set(this.bonFaceAnchor(), this.el.nativeElement);
  }
  ngOnDestroy(): void {
    this.anchors.delete(this.bonFaceAnchor(), this.el.nativeElement);
  }
}

/**
 * Plays a short flight from the player's face in the strip to where this element sits.
 * Measures once after render; the offset is in stage pixels (screen pixels ÷ stage scale).
 */
@Directive({ selector: '[bonFlyFrom]', standalone: true, host: { class: 'bon-fly-ready' } })
export class FlyFromDirective {
  readonly bonFlyFrom = input.required<string>();
  readonly flyDelay = input(0);
  private readonly anchors = inject(FaceAnchors);
  private readonly scale = inject(TvStageScale);
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterNextRender(() => {
      const me = this.el.nativeElement;
      const from = this.anchors.get(this.bonFlyFrom());
      const s = this.scale.scale() || 1;
      if (from) {
        const a = from.getBoundingClientRect();
        const b = me.getBoundingClientRect();
        me.style.setProperty('--fx', `${(a.left + a.width / 2 - (b.left + b.width / 2)) / s}px`);
        me.style.setProperty('--fy', `${(a.top + a.height / 2 - (b.top + b.height / 2)) / s}px`);
      }
      me.style.animationDelay = `${this.flyDelay()}ms`;
      me.classList.add('bon-fly');
    });
  }
}
