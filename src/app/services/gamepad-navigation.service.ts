import { Inject, Injectable, NgZone, OnDestroy, PLATFORM_ID } from '@angular/core';
import { Location, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';

type Direction = 'up' | 'down' | 'left' | 'right';

// Standard gamepad mapping (PS4 controller via Chrome's "standard" layout):
// 0 = Cross (X), 1 = Circle, 12-15 = D-pad up/down/left/right.
const BUTTON_ACTIVATE = 0;
const BUTTON_BACK = 1;
const BUTTON_X = 2;
const BUTTON_Y = 3;
const BUTTON_LB = 4;
const BUTTON_RB = 5;
const BUTTON_LT = 6;
const BUTTON_RT = 7;
const BUTTONS_PREVIOUS_ROUTE = [BUTTON_LB, BUTTON_LT];
const BUTTONS_NEXT_ROUTE = [BUTTON_RB, BUTTON_RT];
const BUTTON_DPAD_UP = 12;
const BUTTON_DPAD_DOWN = 13;
const BUTTON_DPAD_LEFT = 14;
const BUTTON_DPAD_RIGHT = 15;

type AuxButton = 'x' | 'y' | 'lb' | 'rb';
const AUX_BUTTON_INDEXES: Record<AuxButton, number> = {
  x: BUTTON_X,
  y: BUTTON_Y,
  lb: BUTTON_LB,
  rb: BUTTON_RB,
};

const AXIS_DEADZONE = 0.5;
const BUTTON_PRESS_THRESHOLD = 0.5;
const FALLBACK_DPAD_X_AXIS = 6;
const FALLBACK_DPAD_Y_AXIS = 7;
const FALLBACK_DPAD_HAT_AXIS = 9;
const PAGE_ROUTES = ['/podcast', '/stream', '/watch', '/yap'];
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
  private inputWindowActive = false;

  private dpadActions: Partial<Record<Direction, () => void>> = {};
  private auxActions: Partial<Record<AuxButton, () => void>> = {};
  private backAction: (() => boolean) | null = null;
  private selectMode: HTMLSelectElement | null = null;
  private selectInitialIndex = -1;
  private rangeMode: HTMLInputElement | null = null;
  private rangeInitialValue = '';

  constructor(
    @Inject(PLATFORM_ID) platformId: object,
    private zone: NgZone,
    private location: Location,
    private router: Router,
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

  /**
   * Page-specific shortcuts for the X/Y face buttons and the LB/RB shoulder
   * buttons. LB and RB double as global previous/next-page swipe (see
   * BUTTONS_PREVIOUS_ROUTE/BUTTONS_NEXT_ROUTE) - setting an override here
   * for 'lb' or 'rb' suppresses that button's page-swipe for as long as the
   * override is active (LT/RT keep working as the page-swipe fallback), so
   * only bind them for actions worth losing that swipe gesture for.
   */
  setAuxButtonActions(actions: Partial<Record<AuxButton, () => void>>): void {
    this.auxActions = { ...actions };
  }

  clearAuxButtonActions(): void {
    this.auxActions = {};
  }

  setBackAction(action: (() => boolean) | null): void {
    this.backAction = action;
  }

  register(el: HTMLElement): void {
    this.focusables.add(el);
    if (!this.currentEl) this.focusElement(el);
  }

  unregister(el: HTMLElement): void {
    this.focusables.delete(el);
    if (this.selectMode === el) this.exitSelectMode(false);
    if (this.rangeMode === el) this.exitRangeMode(false);
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

    // Keyboard equivalents of the LB/RB/Y aux buttons - Q/E is the
    // standard "shoulder button" convention, Y matches its on-screen hint.
    const auxKeyMap: Record<string, AuxButton> = { q: 'lb', e: 'rb', y: 'y' };
    const auxKey = auxKeyMap[e.key.toLowerCase()];
    if (auxKey && this.auxActions[auxKey]) {
      e.preventDefault();
      this.zone.run(() => this.auxActions[auxKey]!());
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
    if (!this.canProcessInput()) {
      this.resetInputState();
      return;
    }

    const pad = Array.from(navigator.getGamepads()).find((p) => !!p);
    if (!pad) {
      this.resetInputState();
      return;
    }

    const buttons = pad.buttons.map(
      (button) => button.pressed || button.value >= BUTTON_PRESS_THRESHOLD,
    );
    if (!this.inputWindowActive) {
      this.inputWindowActive = true;
      this.prevButtons = buttons;
      return;
    }

    if (buttons[BUTTON_ACTIVATE] && !this.prevButtons[BUTTON_ACTIVATE]) this.activateCurrent();
    if (buttons[BUTTON_BACK] && !this.prevButtons[BUTTON_BACK]) this.goBack();

    for (const key of Object.keys(AUX_BUTTON_INDEXES) as AuxButton[]) {
      const index = AUX_BUTTON_INDEXES[key];
      const action = this.auxActions[key];
      if (action && buttons[index] && !this.prevButtons[index]) {
        this.zone.run(() => action());
      }
    }

    // LB/RB only page-swipe when nothing on the current page has claimed
    // them via setAuxButtonActions(); LT/RT always page-swipe regardless.
    const previousRouteButtons = this.auxActions.lb
      ? [BUTTON_LT]
      : BUTTONS_PREVIOUS_ROUTE;
    const nextRouteButtons = this.auxActions.rb
      ? [BUTTON_RT]
      : BUTTONS_NEXT_ROUTE;
    if (this.anyButtonPressed(buttons, this.prevButtons, previousRouteButtons)) {
      this.changeRoute(-1);
    }
    if (this.anyButtonPressed(buttons, this.prevButtons, nextRouteButtons)) {
      this.changeRoute(1);
    }

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

  private canProcessInput(): boolean {
    return document.visibilityState === 'visible' && document.hasFocus();
  }

  private resetInputState(): void {
    this.inputWindowActive = false;
    this.prevButtons = [];
    this.heldDirection = null;
    this.heldSince = 0;
    this.lastRepeatAt = 0;
  }

  private getDirection(pad: Gamepad, buttons: boolean[]): Direction | null {
    if (buttons[BUTTON_DPAD_UP] && !this.dpadActions['up']) return 'up';
    if (buttons[BUTTON_DPAD_DOWN] && !this.dpadActions['down']) return 'down';
    if (buttons[BUTTON_DPAD_LEFT] && !this.dpadActions['left']) return 'left';
    if (buttons[BUTTON_DPAD_RIGHT] && !this.dpadActions['right']) return 'right';

    const [x = 0, y = 0] = pad.axes;
    if (x <= -AXIS_DEADZONE) return 'left';
    if (x >= AXIS_DEADZONE) return 'right';
    if (y <= -AXIS_DEADZONE) return 'up';
    if (y >= AXIS_DEADZONE) return 'down';

    // Some Bluetooth/driver combinations expose an otherwise standard Xbox
    // D-pad as a pair of hat axes instead of buttons 12–15. Browsers that
    // advertise the standard mapping have already normalized those axes.
    if (pad.mapping !== 'standard' || pad.axes.length > 4) {
      const dpadX = pad.axes[FALLBACK_DPAD_X_AXIS] ?? 0;
      const dpadY = pad.axes[FALLBACK_DPAD_Y_AXIS] ?? 0;
      if (dpadX <= -AXIS_DEADZONE) return 'left';
      if (dpadX >= AXIS_DEADZONE) return 'right';
      if (dpadY <= -AXIS_DEADZONE) return 'up';
      if (dpadY >= AXIS_DEADZONE) return 'down';

      const hat = pad.axes[FALLBACK_DPAD_HAT_AXIS];
      if (hat !== undefined && hat >= -1.1 && hat <= 1.1) {
        const sector = Math.round((hat + 1) * 3.5) % 8;
        if (sector === 0 || sector === 1 || sector === 7) return 'up';
        if (sector === 2 || sector === 3) return 'right';
        if (sector === 4 || sector === 5) return 'down';
        return 'left';
      }
    }
    return null;
  }

  private handleDirection(direction: Direction | null): void {
    const now = performance.now();

    if (!direction) {
      this.heldDirection = null;
      return;
    }

    if (this.selectMode || this.rangeMode) {
      if (direction !== this.heldDirection) {
        this.heldDirection = direction;
        this.heldSince = now;
        this.lastRepeatAt = now;
        this.adjustActiveControl(direction);
        return;
      }
      const heldDuration = now - this.heldSince;
      const interval =
        heldDuration < REPEAT_DELAY_MS ? REPEAT_DELAY_MS : REPEAT_RATE_MS;
      if (now - this.lastRepeatAt >= interval) {
        this.lastRepeatAt = now;
        this.adjustActiveControl(direction);
      }
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
    if (this.currentEl instanceof HTMLSelectElement) {
      if (this.selectMode === this.currentEl) {
        this.exitSelectMode(true);
        return;
      }
      this.selectMode = this.currentEl;
      this.selectInitialIndex = this.currentEl.selectedIndex;
      this.currentEl.size = Math.min(6, this.currentEl.options.length);
      this.currentEl.classList.add('gamepad-selecting');
      this.currentEl.setAttribute('aria-expanded', 'true');
      return;
    }
    if (
      this.currentEl instanceof HTMLInputElement &&
      this.currentEl.type === 'range'
    ) {
      if (this.rangeMode === this.currentEl) {
        this.exitRangeMode(true);
        return;
      }
      this.rangeMode = this.currentEl;
      this.rangeInitialValue = this.currentEl.value;
      this.currentEl.classList.add('gamepad-adjusting');
      return;
    }
    this.zone.run(() => this.currentEl?.click());
  }

  private goBack(): void {
    if (this.selectMode) {
      this.exitSelectMode(false);
      return;
    }
    if (this.rangeMode) {
      this.exitRangeMode(false);
      return;
    }
    let handled = false;
    if (this.backAction) {
      this.zone.run(() => {
        handled = this.backAction?.() ?? false;
      });
    }
    if (handled) return;
    this.zone.run(() => this.location.back());
  }

  private changeRoute(offset: -1 | 1): void {
    const currentPath = '/' + this.router.url.split(/[?#]/, 1)[0].split('/')[1];
    const currentIndex = PAGE_ROUTES.indexOf(currentPath);
    const nextIndex =
      (Math.max(0, currentIndex) + offset + PAGE_ROUTES.length) %
      PAGE_ROUTES.length;
    this.zone.run(() => void this.router.navigateByUrl(PAGE_ROUTES[nextIndex]));
  }

  private changeSelectOption(direction: Direction): void {
    const select = this.selectMode;
    if (!select || (direction !== 'up' && direction !== 'down')) return;
    const offset = direction === 'up' ? -1 : 1;
    const nextIndex = Math.min(
      select.options.length - 1,
      Math.max(0, select.selectedIndex + offset),
    );
    if (nextIndex === select.selectedIndex) return;
    select.selectedIndex = nextIndex;
    select.options[nextIndex]?.scrollIntoView({ block: 'nearest' });
  }

  private adjustActiveControl(direction: Direction): void {
    if (this.selectMode) {
      this.changeSelectOption(direction);
      return;
    }
    const range = this.rangeMode;
    if (!range || (direction !== 'left' && direction !== 'right')) return;
    const minimum = Number(range.min || 0);
    const maximum = Number(range.max || 100);
    const offset = direction === 'left' ? -5 : 5;
    const nextValue = Math.min(
      maximum,
      Math.max(minimum, Number(range.value) + offset),
    );
    if (nextValue === Number(range.value)) return;
    range.value = String(nextValue);
    this.zone.run(() =>
      range.dispatchEvent(new Event('input', { bubbles: true })),
    );
  }

  private exitSelectMode(commit: boolean): void {
    const select = this.selectMode;
    if (!select) return;
    if (!commit && this.selectInitialIndex >= 0) {
      select.selectedIndex = this.selectInitialIndex;
    }
    select.size = 0;
    select.classList.remove('gamepad-selecting');
    select.removeAttribute('aria-expanded');
    if (commit && select.selectedIndex !== this.selectInitialIndex) {
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    this.selectMode = null;
    this.selectInitialIndex = -1;
  }

  private exitRangeMode(commit: boolean): void {
    const range = this.rangeMode;
    if (!range) return;
    if (!commit && this.rangeInitialValue !== '') {
      range.value = this.rangeInitialValue;
      this.zone.run(() =>
        range.dispatchEvent(new Event('input', { bubbles: true })),
      );
    }
    range.classList.remove('gamepad-adjusting');
    this.rangeMode = null;
    this.rangeInitialValue = '';
  }

  private anyButtonPressed(
    buttons: boolean[],
    previousButtons: boolean[],
    indexes: number[],
  ): boolean {
    return indexes.some((index) => buttons[index] && !previousButtons[index]);
  }
}
