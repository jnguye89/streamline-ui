import { Inject, Injectable, NgZone, OnDestroy, PLATFORM_ID } from '@angular/core';
import { Location, isPlatformBrowser } from '@angular/common';

type Direction = 'up' | 'down' | 'left' | 'right';

// Standard gamepad mapping (PS4 controller via Chrome's "standard" layout):
// 0 = Cross (X), 1 = Circle, 12-15 = D-pad up/down/left/right.
const BUTTON_ACTIVATE = 0;
const BUTTON_BACK = 1;
const BUTTON_DPAD_UP = 12;
const BUTTON_DPAD_DOWN = 13;
const BUTTON_DPAD_LEFT = 14;
const BUTTON_DPAD_RIGHT = 15;

const AXIS_DEADZONE = 0.5;
const REPEAT_DELAY_MS = 420;
const REPEAT_RATE_MS = 150;
const SCROLL_STEP_PX = 120;

const FOCUS_CLASS = 'gamepad-focused';

/**
 * Polls the Gamepad API and translates D-pad / left-stick / button input into
 * spatial focus movement and activation across the app's `gamepadFocusable` elements.
 */
@Injectable({ providedIn: 'root' })
export class GamepadNavigationService implements OnDestroy {
  private readonly isBrowser: boolean;
  private started = false;
  private rafId: number | null = null;

  private readonly focusables = new Set<HTMLElement>();
  private currentEl: HTMLElement | null = null;

  private prevButtons: boolean[] = [];
  private heldDirection: Direction | null = null;
  private heldSince = 0;
  private lastRepeatAt = 0;

  constructor(
    @Inject(PLATFORM_ID) platformId: object,
    private zone: NgZone,
    private location: Location
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  start(): void {
    if (!this.isBrowser || this.started) return;
    this.started = true;

    window.addEventListener('gamepadconnected', this.onGamepadConnected);
    window.addEventListener('gamepaddisconnected', this.onGamepadDisconnected);

    if (this.hasConnectedGamepad()) {
      this.zone.runOutsideAngular(() => this.loop());
    }
  }

  ngOnDestroy(): void {
    if (!this.isBrowser) return;
    window.removeEventListener('gamepadconnected', this.onGamepadConnected);
    window.removeEventListener('gamepaddisconnected', this.onGamepadDisconnected);
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
  }

  register(el: HTMLElement): void {
    this.focusables.add(el);
    if (!this.currentEl) this.focusElement(el);
  }

  unregister(el: HTMLElement): void {
    this.focusables.delete(el);
    if (this.currentEl === el) {
      el.classList.remove(FOCUS_CLASS);
      this.currentEl = null;
    }
  }

  private onGamepadConnected = (): void => {
    if (this.rafId === null) {
      this.zone.runOutsideAngular(() => this.loop());
    }
  };

  private onGamepadDisconnected = (): void => {
    if (!this.hasConnectedGamepad() && this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  };

  private hasConnectedGamepad(): boolean {
    return Array.from(navigator.getGamepads()).some((pad) => !!pad);
  }

  private loop = (): void => {
    this.pollGamepad();
    this.rafId = requestAnimationFrame(this.loop);
  };

  private pollGamepad(): void {
    const pad = Array.from(navigator.getGamepads()).find((p) => !!p);
    if (!pad) return;

    const buttons = pad.buttons.map((b) => b.pressed);

    if (buttons[BUTTON_ACTIVATE] && !this.prevButtons[BUTTON_ACTIVATE]) this.activateCurrent();
    if (buttons[BUTTON_BACK] && !this.prevButtons[BUTTON_BACK]) this.goBack();

    this.handleDirection(this.getDirection(pad, buttons));

    this.prevButtons = buttons;
  }

  private getDirection(pad: Gamepad, buttons: boolean[]): Direction | null {
    if (buttons[BUTTON_DPAD_UP]) return 'up';
    if (buttons[BUTTON_DPAD_DOWN]) return 'down';
    if (buttons[BUTTON_DPAD_LEFT]) return 'left';
    if (buttons[BUTTON_DPAD_RIGHT]) return 'right';

    const [x, y] = pad.axes;
    if (x <= -AXIS_DEADZONE) return 'left';
    if (x >= AXIS_DEADZONE) return 'right';
    if (y <= -AXIS_DEADZONE) return 'up';
    if (y >= AXIS_DEADZONE) return 'down';
    return null;
  }

  private handleDirection(direction: Direction | null): void {
    const now = performance.now();

    if (!direction) {
      this.heldDirection = null;
      return;
    }

    if (direction !== this.heldDirection) {
      this.heldDirection = direction;
      this.heldSince = now;
      this.lastRepeatAt = now;
      this.moveFocus(direction);
      return;
    }

    const heldDuration = now - this.heldSince;
    const interval = heldDuration < REPEAT_DELAY_MS ? REPEAT_DELAY_MS : REPEAT_RATE_MS;
    if (now - this.lastRepeatAt >= interval) {
      this.lastRepeatAt = now;
      this.moveFocus(direction);
    }
  }

  private moveFocus(direction: Direction): void {
    const candidates = Array.from(this.focusables).filter((el) => this.isFocusable(el));
    if (!candidates.length) {
      this.scroll(direction);
      return;
    }

    if (!this.currentEl || !candidates.includes(this.currentEl)) {
      const first = this.pickInitial(candidates);
      if (first) this.focusElement(first);
      return;
    }

    const fromRect = this.currentEl.getBoundingClientRect();
    let best: HTMLElement | null = null;
    let bestScore = Infinity;

    for (const el of candidates) {
      if (el === this.currentEl) continue;
      const score = this.score(fromRect, el.getBoundingClientRect(), direction);
      if (score !== null && score < bestScore) {
        bestScore = score;
        best = el;
      }
    }

    if (best) {
      this.focusElement(best);
    } else {
      this.scroll(direction);
    }
  }

  /**
   * Falls back to scrolling the page (or the nearest scrollable ancestor of
   * the focused element) when there's no focusable target in the pressed
   * direction - lets the D-pad/stick page through long content like the
   * profile video grid.
   */
  private scroll(direction: Direction): void {
    const dx = direction === 'left' ? -SCROLL_STEP_PX : direction === 'right' ? SCROLL_STEP_PX : 0;
    const dy = direction === 'up' ? -SCROLL_STEP_PX : direction === 'down' ? SCROLL_STEP_PX : 0;

    const container = this.findScrollContainer(dx, dy);
    if (!container) return;

    this.zone.run(() => container.scrollBy({ left: dx, top: dy, behavior: 'smooth' }));
  }

  private findScrollContainer(dx: number, dy: number): { scrollBy: (opts: ScrollToOptions) => void } | null {
    let el: HTMLElement | null = this.currentEl ?? document.body;

    while (el && el !== document.documentElement) {
      const style = getComputedStyle(el);
      const canScrollY = dy !== 0 && /(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight;
      const canScrollX = dx !== 0 && /(auto|scroll)/.test(style.overflowX) && el.scrollWidth > el.clientWidth;
      if (canScrollY || canScrollX) return el;
      el = el.parentElement;
    }

    const root = document.scrollingElement;
    if (!root) return null;
    const canScrollY = dy !== 0 && root.scrollHeight > root.clientHeight;
    const canScrollX = dx !== 0 && root.scrollWidth > root.clientWidth;
    return canScrollY || canScrollX ? window : null;
  }

  private score(from: DOMRect, to: DOMRect, dir: Direction): number | null {
    const fromCenter = { x: from.left + from.width / 2, y: from.top + from.height / 2 };
    const toCenter = { x: to.left + to.width / 2, y: to.top + to.height / 2 };
    const dx = toCenter.x - fromCenter.x;
    const dy = toCenter.y - fromCenter.y;

    switch (dir) {
      case 'right': return dx > 0 ? dx + Math.abs(dy) * 2 : null;
      case 'left': return dx < 0 ? -dx + Math.abs(dy) * 2 : null;
      case 'down': return dy > 0 ? dy + Math.abs(dx) * 2 : null;
      case 'up': return dy < 0 ? -dy + Math.abs(dx) * 2 : null;
    }
  }

  private pickInitial(candidates: HTMLElement[]): HTMLElement | null {
    return candidates.slice().sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      if (Math.abs(ra.top - rb.top) > 10) return ra.top - rb.top;
      return ra.left - rb.left;
    })[0] ?? null;
  }

  private isFocusable(el: HTMLElement): boolean {
    if ((el as HTMLButtonElement).disabled) return false;
    if (el instanceof HTMLLabelElement && el.control instanceof HTMLInputElement && el.control.disabled) return false;
    if (!el.isConnected) return false;

    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;

    const style = getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none';
  }

  private focusElement(el: HTMLElement): void {
    this.zone.run(() => {
      this.currentEl?.classList.remove(FOCUS_CLASS);
      this.currentEl = el;
      el.classList.add(FOCUS_CLASS);
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    });
  }

  private activateCurrent(): void {
    if (!this.currentEl) return;
    this.zone.run(() => this.currentEl?.click());
  }

  private goBack(): void {
    this.zone.run(() => this.location.back());
  }
}
