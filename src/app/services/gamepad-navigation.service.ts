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
const SCROLL_STEP_PX = 240;

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

  private dpadActions: Partial<Record<Direction, () => void>> = {};

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
    window.addEventListener('keydown', this.onKeyDown);

    if (this.hasConnectedGamepad()) {
      this.zone.runOutsideAngular(() => this.loop());
    }
  }

  ngOnDestroy(): void {
    if (!this.isBrowser) return;
    window.removeEventListener('gamepadconnected', this.onGamepadConnected);
    window.removeEventListener('gamepaddisconnected', this.onGamepadDisconnected);
    window.removeEventListener('keydown', this.onKeyDown);
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
  }

  setDpadActions(actions: Partial<Record<Direction, () => void>>): void {
    this.dpadActions = { ...actions };
  }

  clearDpadActions(): void {
    this.dpadActions = {};
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
      // Defer so all synchronous unregistrations on the same destroy cycle finish first
      Promise.resolve().then(() => {
        if (this.currentEl) return;
        const candidates = Array.from(this.focusables).filter(e => this.isFocusable(e));
        const next = this.pickInitial(candidates);
        if (next) this.zone.run(() => this.focusElement(next));
      });
    }
  }

  requestFocus(el: HTMLElement): void {
    console.log('request focus', el);
    this.focusElement(el);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const t = e.target as HTMLElement | null;
    const inputType = t instanceof HTMLInputElement ? t.type : '';
    const isTyping = !!t && (
      (t.tagName === 'INPUT' && inputType !== 'checkbox' && inputType !== 'radio') ||
      t.tagName === 'TEXTAREA' ||
      t.isContentEditable
    );
    if (isTyping) return;

    // Arrow keys mirror the D-pad: respect page-specific overrides (e.g. prev/next on watch)
    const arrowMap: Record<string, Direction> = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    };

    // WASD mirrors the joystick: always moves focus, never triggers page overrides
    const wasdMap: Record<string, Direction> = {
      w: 'up', s: 'down', a: 'left', d: 'right',
    };

    if (arrowMap[e.key]) {
      e.preventDefault();
      this.zone.run(() => {
        const dir = arrowMap[e.key];
        if (this.dpadActions[dir]) {
          this.dpadActions[dir]!();
        } else {
          this.moveFocus(dir);
        }
      });
      return;
    }

    if (wasdMap[e.key]) {
      e.preventDefault();
      this.zone.run(() => this.moveFocus(wasdMap[e.key]));
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      this.activateCurrent();
      return;
    }

    if (e.key === 'Escape' || e.key === 'Backspace') {
      e.preventDefault();
      this.goBack();
    }
  };

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

    // Fire page-specific D-pad overrides on the leading edge only.
    const dpadMap: [number, Direction][] = [
      [BUTTON_DPAD_UP, 'up'], [BUTTON_DPAD_DOWN, 'down'],
      [BUTTON_DPAD_LEFT, 'left'], [BUTTON_DPAD_RIGHT, 'right'],
    ];
    for (const [btn, dir] of dpadMap) {
      if (this.dpadActions[dir] && buttons[btn] && !this.prevButtons[btn]) {
        this.zone.run(() => this.dpadActions[dir]!());
      }
    }

    this.handleDirection(this.getDirection(pad, buttons));

    this.prevButtons = buttons;
  }

  private getDirection(pad: Gamepad, buttons: boolean[]): Direction | null {
    if (buttons[BUTTON_DPAD_UP] && !this.dpadActions['up']) return 'up';
    if (buttons[BUTTON_DPAD_DOWN] && !this.dpadActions['down']) return 'down';
    if (buttons[BUTTON_DPAD_LEFT] && !this.dpadActions['left']) return 'left';
    if (buttons[BUTTON_DPAD_RIGHT] && !this.dpadActions['right']) return 'right';

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

    const container = this.findScrollContainer(dx, dy) ?? window;
    this.zone.run(() => container.scrollBy({ left: dx, top: dy, behavior: 'smooth' }));
  }

  /**
   * Finds the nearest scrollable ancestor element of the focused element.
   * Returns null (so the caller falls back to scrolling the window) when
   * none of the ancestors scroll - the window itself is always a valid
   * scroll target and doesn't need to be detected up front.
   */
  private findScrollContainer(dx: number, dy: number): { scrollBy: (opts: ScrollToOptions) => void } | null {
    let el: HTMLElement | null = this.currentEl ?? document.body;

    while (el && el !== document.documentElement) {
      const style = getComputedStyle(el);
      const canScrollY = dy !== 0 && /(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight;
      const canScrollX = dx !== 0 && /(auto|scroll)/.test(style.overflowX) && el.scrollWidth > el.clientWidth;
      if (canScrollY || canScrollX) return el;
      el = el.parentElement;
    }

    return null;
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
