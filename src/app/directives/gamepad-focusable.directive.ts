import { AfterViewInit, Directive, ElementRef, OnDestroy } from '@angular/core';
import { GamepadNavigationService } from '../services/gamepad-navigation.service';

/**
 * Marks an element as a target for gamepad (e.g. PS4 controller) D-pad/stick
 * navigation. Registers with `GamepadNavigationService` so it can receive
 * spatial focus and be "clicked" via the controller's activate button.
 *
 * For components whose host element isn't itself the interactive control
 * (e.g. `mat-slide-toggle`, which renders an inner `<button class="mdc-switch">`),
 * the inner control is registered instead so focus/click land on the right element.
 */
@Directive({
  selector: '[gamepadFocusable]',
  standalone: true,
})
export class GamepadFocusableDirective implements AfterViewInit, OnDestroy {
  private target: HTMLElement | null = null;

  constructor(
    private el: ElementRef<HTMLElement>,
    private gamepadNav: GamepadNavigationService
  ) {}

  ngAfterViewInit(): void {
    const host = this.el.nativeElement;
    const target = host.tagName === 'MAT-SLIDE-TOGGLE'
      ? host.querySelector<HTMLElement>('button.mdc-switch') ?? host
      : host;

    target.classList.add('gamepad-focusable');
    if (!target.hasAttribute('tabindex')) {
      target.setAttribute('tabindex', '0');
    }

    this.target = target;
    this.gamepadNav.register(target);
  }

  ngOnDestroy(): void {
    if (this.target) this.gamepadNav.unregister(this.target);
  }
}
