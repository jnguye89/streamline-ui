import { Inject, Injectable, NgZone, OnDestroy, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type Direction = 'up' | 'down' | 'left' | 'right';

// Standard gamepad mapping (Xbox-layout controllers - e.g. the 8BitDo
// Ultimate 2/2C - via the browser's "standard" Gamepad API layout; see
// "skriin ai TV - Controller Map v2"): 0 = A, 1 = B, 2 = X, 3 = Y,
// 12-15 = D-pad up/down/left/right.
const BUTTON_ACTIVATE = 0;
const BUTTON_BACK = 1;
const BUTTON_X = 2;
const BUTTON_Y = 3;
const BUTTON_LB = 4;
const BUTTON_RB = 5;
const BUTTON_LT = 6;
const BUTTON_RT = 7;
const BUTTON_DPAD_UP = 12;
const BUTTON_DPAD_DOWN = 13;
const BUTTON_DPAD_LEFT = 14;
const BUTTON_DPAD_RIGHT = 15;
// L3/R3 (left/right stick clicks) - not part of the Controller Map v2
// per-page context model; reserved app-wide for the hard-refresh combo
// (see handleHardRefreshCombo()).
const BUTTON_L3 = 10;
const BUTTON_R3 = 11;

// Per Controller Map v2, only D-pad left/right, the left stick, A, B, X, Y,
// LB and RB are meant to change meaning by page/context; LT/RT stay a
// fixed, app-wide action (seek jump - see WatchComponent) wherever a page
// chooses to bind them.
type AuxButton = 'x' | 'y' | 'lb' | 'rb' | 'lt' | 'rt';
const AUX_BUTTON_INDEXES: Record<AuxButton, number> = {
  x: BUTTON_X,
  y: BUTTON_Y,
  lb: BUTTON_LB,
  rb: BUTTON_RB,
  lt: BUTTON_LT,
  rt: BUTTON_RT,
};

const AXIS_DEADZONE = 0.5;
const BUTTON_PRESS_THRESHOLD = 0.5;
const FALLBACK_DPAD_X_AXIS = 6;
const FALLBACK_DPAD_Y_AXIS = 7;
const FALLBACK_DPAD_HAT_AXIS = 9;
const REPEAT_DELAY_MS = 420;
const REPEAT_RATE_MS = 150;
const SCROLL_STEP_PX = 240;
const HARD_REFRESH_HOLD_MS = 1500;
// Guards against a stuck/pinned L3+R3 (e.g. a controller resting on its
// sticks) causing a reload loop: the in-memory "already triggered" flag
// below necessarily resets on every page load, so without this a held
// combo would just re-trigger 1.5s after every reload, forever. Recorded
// in sessionStorage (not a service field) specifically because it has to
// survive the reload that resets everything else - see triggerHardRefresh().
const HARD_REFRESH_COOLDOWN_MS = 30_000;
const HARD_REFRESH_STORAGE_KEY = 'skriin:lastHardRefreshAt';

// Right stick ("RS (2,3)" per Controller Map v2 rule 5) - only the
// horizontal axis is used (scrub back/forward); vertical is "Nothing" in
// every context, so it's never read. Smaller deadzone than the left
// stick's since this is a continuous, magnitude-driven control rather than
// a discrete direction trigger - see handleRightStickScrub().
const RIGHT_STICK_X_AXIS = 2;
const RIGHT_STICK_DEADZONE = 0.15;
const SCRUB_MAX_SECONDS_PER_SEC = 8;
const SCRUB_UPDATE_INTERVAL_MS = 100;

const FOCUS_CLASS = 'gamepad-focused';

// Controller Map v2's "row" concept: the top nav bar and Watch's bottom
// action row (uploader profile/like/chess) both carry this attribute
// today; a future island bar can opt in the same way. Used by goBack()'s
// "Dismiss row" handling and by moveFocus()'s constrainToRow(), which
// keeps left/right movement inside a row instead of leaking out to
// whatever's visually closest on the rest of the page.
const GAMEPAD_ROW_SELECTOR = '[data-gamepad-row]';

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
  // Tracks which direction a page's setDpadActions() override last fired
  // for, regardless of whether the D-pad, the left stick, or a hat-axis
  // D-pad emulation produced it (see pollGamepad()) - lets an override fire
  // once per distinct press/deflection the same way a plain D-pad press
  // always has, instead of only D-pad buttons getting that treatment.
  private lastDpadOverrideDirection: Direction | null = null;
  private lastScrubAt = 0;
  private hardRefreshHoldSince = 0;
  private hardRefreshTriggered = false;

  private dpadActions: Partial<Record<Direction, () => void>> = {};
  // Whether the *true* left stick (not the D-pad, and not a hat-axis
  // D-pad emulation - see getStickDirection()) also reaches dpadActions,
  // set per setDpadActions() call. Off by default: a page like Watch that
  // fully claims the D-pad for dedicated controls (seek/volume) still
  // needs the stick free to pan spatial focus to its nav bar/action row,
  // since the D-pad has nothing left over to do that with. A page with no
  // real DOM focus of its own to move between - e.g. the search dialog's
  // on-screen keyboard - opts in instead, so the stick reaches it exactly
  // like the D-pad does.
  private dpadActionsIncludeStick = false;
  private auxActions: Partial<Record<AuxButton, () => void>> = {};
  private rightStickScrubAction: ((deltaSeconds: number) => void) | null = null;
  private backAction: (() => boolean) | null = null;
  private activateAction: (() => boolean) | null = null;
  private selectMode: HTMLSelectElement | null = null;
  private selectInitialIndex = -1;
  private rangeMode: HTMLInputElement | null = null;
  private rangeInitialValue = '';

  constructor(
    @Inject(PLATFORM_ID) platformId: object,
    private zone: NgZone,
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

  setDpadActions(
    actions: Partial<Record<Direction, () => void>>,
    opts?: { includeStick?: boolean },
  ): void {
    this.dpadActions = { ...actions };
    this.dpadActionsIncludeStick = opts?.includeStick ?? false;
    this.lastDpadOverrideDirection = null;
  }

  clearDpadActions(): void {
    this.dpadActions = {};
    this.dpadActionsIncludeStick = false;
    this.lastDpadOverrideDirection = null;
  }

  /**
   * Page-specific shortcuts for the X/Y/LB/RB/LT/RT buttons (Controller
   * Map v2). X/Y/LB/RB meaning is expected to vary by page/context; LT/RT
   * are meant to stay a fixed app-wide action (seek jump) wherever a page
   * binds them, so it stays a no-op - never something else - on any page
   * that doesn't. Switching pages/sections is handled by the top nav row,
   * not these buttons, so there's no shared fallback behavior to suppress
   * here - unbound buttons simply do nothing.
   */
  setAuxButtonActions(actions: Partial<Record<AuxButton, () => void>>): void {
    this.auxActions = { ...actions };
  }

  clearAuxButtonActions(): void {
    this.auxActions = {};
  }

  /**
   * Right stick left/right ("Scrub timeline back/forward - push distance =
   * speed", Controller Map v2): called at most every SCRUB_UPDATE_INTERVAL_MS
   * while the stick is held past its deadzone, with a signed seconds-of-video
   * delta already scaled by how far it's pushed and how long it's been since
   * the last call - the page just applies it (see WatchComponent.seekBy()).
   * A no-op page never sees a call at all.
   */
  setRightStickScrubAction(action: ((deltaSeconds: number) => void) | null): void {
    this.rightStickScrubAction = action;
    this.lastScrubAt = 0;
  }

  clearRightStickScrubAction(): void {
    this.rightStickScrubAction = null;
  }

  setBackAction(action: (() => boolean) | null): void {
    this.backAction = action;
  }

  /**
   * Page/dialog-specific override for the main Activate button (A on a
   * gamepad, Enter on a keyboard). Used by UI that tracks its own cursor
   * instead of real DOM focus - e.g. the search dialog's on-screen
   * keyboard, whose "focused" key is just component state, not something
   * `.click()` on `currentEl` could ever reach. Return true to suppress
   * the default `.click()` behavior; return false (or leave no override
   * set) to fall back to it, same convention as `setBackAction`.
   */
  setActivateAction(action: (() => boolean) | null): void {
    this.activateAction = action;
  }

  clearActivateAction(): void {
    this.activateAction = null;
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
    try {
      this.pollGamepad();
    } catch (err) {
      // A page-level action thrown from here (e.g. calling a method on a
      // not-yet-ready YouTube IFrame player - see WatchComponent's
      // adjustVolume() history) must never kill this loop for the rest of
      // the page's life. Without this catch, an uncaught throw here would
      // skip the requestAnimationFrame() call below on this one frame -
      // and neither onGamepadConnected() nor onGamepadDisconnected() would
      // ever restart it afterward, since both only act when rafId is null,
      // and rafId is left holding its last successfully-scheduled (already
      // fired) id forever, never reset by the frame that threw. Logging
      // and continuing keeps one bad frame from silently disabling gamepad
      // input site-wide until a full page reload.
      console.error('[GamepadNavigationService] pollGamepad() threw - continuing', err);
    }
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

    // A page's setDpadActions() override always applies to the D-pad
    // (buttons 12-15, or a hat-axis emulation of them - see
    // getDpadDirection()), fired once per distinct press rather than on
    // hold-repeat. The *true* left stick (getStickDirection()) only reaches
    // the override when the page opted in via includeStick - otherwise it
    // stays free to drive the generic spatial focus move below, same as
    // when no override is set at all. See dpadActionsIncludeStick for why.
    const dpadDir = this.getDpadDirection(pad, buttons);
    const dir = dpadDir ?? this.getStickDirection(pad);
    const canOverride = dpadDir !== null || this.dpadActionsIncludeStick;
    if (dir && this.dpadActions[dir] && canOverride) {
      if (dir !== this.lastDpadOverrideDirection) {
        this.zone.run(() => this.dpadActions[dir]!());
      }
      this.lastDpadOverrideDirection = dir;
      this.handleDirection(null);
    } else {
      this.lastDpadOverrideDirection = null;
      this.handleDirection(dir);
    }
    this.handleRightStickScrub(pad);
    this.handleHardRefreshCombo(buttons);

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
    this.lastScrubAt = 0;
    this.hardRefreshHoldSince = 0;
    this.hardRefreshTriggered = false;
    this.lastDpadOverrideDirection = null;
  }

  /**
   * Analog counterpart to the LT/RT jump buttons: instead of a fixed step
   * per press, the seek delta scales continuously with how far the stick
   * is pushed (map: "push distance = speed") and with real elapsed time,
   * so it feels the same whether the frame rate dips or not. Throttled to
   * SCRUB_UPDATE_INTERVAL_MS rather than firing every animation frame -
   * smooth enough to feel analog without hammering pages that seek via a
   * postMessage-based API (e.g. the YouTube IFrame player) 60 times/sec.
   */
  private handleRightStickScrub(pad: Gamepad): void {
    const action = this.rightStickScrubAction;
    const x = pad.axes[RIGHT_STICK_X_AXIS] ?? 0;
    if (!action || Math.abs(x) < RIGHT_STICK_DEADZONE) {
      this.lastScrubAt = 0;
      return;
    }

    const now = performance.now();
    if (this.lastScrubAt && now - this.lastScrubAt < SCRUB_UPDATE_INTERVAL_MS) return;
    const dt = this.lastScrubAt
      ? (now - this.lastScrubAt) / 1000
      : SCRUB_UPDATE_INTERVAL_MS / 1000;
    this.lastScrubAt = now;

    // Ramp smoothly from 0 just past the deadzone, rather than jumping
    // straight to some nonzero minimum speed the instant it's cleared.
    const eased = (Math.abs(x) - RIGHT_STICK_DEADZONE) / (1 - RIGHT_STICK_DEADZONE);
    const secondsPerSecond = eased * SCRUB_MAX_SECONDS_PER_SEC * Math.sign(x);
    this.zone.run(() => action(secondsPerSecond * dt));
  }

  /**
   * L3+R3 held together for HARD_REFRESH_HOLD_MS - an app-wide combo (not
   * part of Controller Map v2's per-page context model) for when the app
   * feels stuck/stale. Deliberately requires both stick clicks held at
   * once so it can never fire by accident during normal navigation.
   */
  private handleHardRefreshCombo(buttons: boolean[]): void {
    if (!buttons[BUTTON_L3] || !buttons[BUTTON_R3]) {
      this.hardRefreshHoldSince = 0;
      this.hardRefreshTriggered = false;
      return;
    }

    if (this.hardRefreshTriggered) return;

    const now = performance.now();
    if (!this.hardRefreshHoldSince) {
      this.hardRefreshHoldSince = now;
      return;
    }

    if (now - this.hardRefreshHoldSince < HARD_REFRESH_HOLD_MS) return;

    // Mark handled either way so a combo that's still held doesn't re-evaluate
    // (and re-log/re-check cooldown) on every remaining frame - it only
    // re-arms once L3+R3 are both released above.
    this.hardRefreshTriggered = true;
    if (this.isHardRefreshOnCooldown()) return;
    this.zone.run(() => void this.triggerHardRefresh());
  }

  private isHardRefreshOnCooldown(): boolean {
    try {
      const last = Number(sessionStorage.getItem(HARD_REFRESH_STORAGE_KEY) ?? '0');
      return Date.now() - last < HARD_REFRESH_COOLDOWN_MS;
    } catch {
      return false; // sessionStorage unavailable (e.g. private browsing) - fail open rather than block a legitimate hard refresh forever
    }
  }

  /**
   * Unregisters the Angular service worker and clears Cache Storage before
   * reloading - a plain `location.reload()` alone can still serve stale
   * cached content (see `provideServiceWorker` in app.config.ts). Each step
   * is best-effort so a failure to unregister/clear never blocks the reload.
   */
  private async triggerHardRefresh(): Promise<void> {
    try {
      sessionStorage.setItem(HARD_REFRESH_STORAGE_KEY, String(Date.now()));
    } catch {
      // Best-effort - cooldown just won't survive the reload in this case.
    }

    this.showHardRefreshIndicator();

    try {
      const registrations = await navigator.serviceWorker?.getRegistrations?.();
      await Promise.all((registrations ?? []).map((registration) => registration.unregister()));
    } catch {
      // Best-effort - fall through to reload regardless.
    }

    try {
      const keys = await caches?.keys?.();
      await Promise.all((keys ?? []).map((key) => caches.delete(key)));
    } catch {
      // Best-effort - fall through to reload regardless.
    }

    window.location.reload();
  }

  private showHardRefreshIndicator(): void {
    const overlay = document.createElement('div');
    overlay.textContent = 'Refreshing\u2026';
    overlay.setAttribute('aria-live', 'assertive');
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:2147483647',
      'display:flex', 'align-items:center', 'justify-content:center',
      'background:rgba(0,0,0,0.85)', 'color:#fff',
      'font-size:2rem', 'font-family:sans-serif',
    ].join(';');
    document.body.appendChild(overlay);
    // No cleanup needed - the page reloads shortly after this is shown.
  }

  /**
   * D-pad direction: real buttons 12-15, or - for Bluetooth/driver
   * combinations that expose an otherwise standard D-pad as axes instead of
   * buttons - the equivalent hat-axis fallback. Deliberately excludes the
   * true left stick (see getStickDirection()): both of these count as
   * "the D-pad" for a setDpadActions() override, which always applies to
   * them regardless of dpadActionsIncludeStick.
   */
  private getDpadDirection(pad: Gamepad, buttons: boolean[]): Direction | null {
    if (buttons[BUTTON_DPAD_UP]) return 'up';
    if (buttons[BUTTON_DPAD_DOWN]) return 'down';
    if (buttons[BUTTON_DPAD_LEFT]) return 'left';
    if (buttons[BUTTON_DPAD_RIGHT]) return 'right';

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

  /** The true left stick (axes 0/1) only - see getDpadDirection(). */
  private getStickDirection(pad: Gamepad): Direction | null {
    const [x = 0, y = 0] = pad.axes;
    if (x <= -AXIS_DEADZONE) return 'left';
    if (x >= AXIS_DEADZONE) return 'right';
    if (y <= -AXIS_DEADZONE) return 'up';
    if (y >= AXIS_DEADZONE) return 'down';
    return null;
  }

  private getDirection(pad: Gamepad, buttons: boolean[]): Direction | null {
    return this.getDpadDirection(pad, buttons) ?? this.getStickDirection(pad);
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

    // currentEl can be null or stale here - not just on first load, but any
    // time it was pointing at something that's since become unregistered or
    // disconnected without going through the usual unregister() cleanup
    // (e.g. a router-navigation race). Falls through to the normal scoring
    // below from the freshly-picked baseline instead of just landing there
    // and stopping - otherwise this same direction press looks like it did
    // nothing (especially if the baseline happens to be wherever focus
    // already visually was), and the user needs a second, "wasted" press
    // before the D-pad/stick actually seems to respond.
    if (!this.currentEl || !candidates.includes(this.currentEl)) {
      const first = this.pickInitial(candidates);
      if (!first) return;
      this.focusElement(first);
    }

    const fromRect = this.currentEl!.getBoundingClientRect();
    const scoped = this.constrainToRow(candidates, direction);
    let best: HTMLElement | null = null;
    let bestScore = Infinity;

    for (const el of scoped) {
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
   * Controller Map v2's "row" concept: left/right movement from an element
   * inside a marked row (GAMEPAD_ROW_SELECTOR) stays within that same row,
   * rather than jumping to whatever's visually closest on the rest of the
   * page - e.g. the top nav's "yap" -> "search" transition landing on a
   * page-level button instead, just because it happened to sit closer on
   * screen. Vertical movement is left unconstrained, since a row is a
   * horizontal strip and "down" is how you leave it in the first place.
   */
  private constrainToRow(candidates: HTMLElement[], direction: Direction): HTMLElement[] {
    if (direction !== 'left' && direction !== 'right') return candidates;
    const row = this.currentEl?.closest(GAMEPAD_ROW_SELECTOR);
    if (!row) return candidates;
    return candidates.filter((el) => el.closest(GAMEPAD_ROW_SELECTOR) === row);
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
    if (this.activateAction) {
      let handled = false;
      this.zone.run(() => {
        handled = this.activateAction?.() ?? false;
      });
      if (handled) return;
    }
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
    // Controller Map v2: B "dismisses" a focused row back to a neutral,
    // nothing-highlighted state ("dismiss back to video"). Checked ahead
    // of the page-level back action so a row always dismisses first, even
    // on a page that also has its own setBackAction() override.
    if (this.currentEl?.closest(GAMEPAD_ROW_SELECTOR)) {
      this.dismissRow();
      return;
    }
    // B is otherwise "Nothing" in Default (viewing) per the map - no
    // implicit browser-history-back fallback. A page that wants B to do
    // something (e.g. close a dialog) still can via setBackAction(); a
    // page with no override, or one whose action declines by returning
    // false, just leaves B a no-op here.
    if (this.backAction) {
      this.zone.run(() => this.backAction?.());
    }
  }

  /**
   * Clears gamepad focus entirely rather than landing it on whatever
   * happens to be spatially nearest below the row - the map doesn't say a
   * specific control should light up when a row is dismissed, just that
   * the row goes away, so neither the row nor some arbitrary control (e.g.
   * a Like button that merely happened to be closest) stays highlighted.
   * The next direction press re-derives a starting focus on its own -
   * moveFocus() already falls back to pickInitial() whenever currentEl is
   * null - so navigation still works normally afterward.
   */
  private dismissRow(): void {
    this.clearFocus();
  }

  /**
   * Clears whatever element is currently tracked as gamepad-focused, with
   * no replacement. A modal dialog opened from a row (e.g. search, opened
   * from the top nav) should call this itself when it takes over input:
   * otherwise the row button stays "current" behind the dialog, and B's
   * row-dismiss handling in goBack() fires first and consumes the press -
   * clearing focus with no visible effect, since the row isn't shown while
   * the dialog covers it - before a second B press ever reaches the
   * dialog's own setBackAction(). Calling this up front means there's no
   * row left to dismiss, so the very first B reaches the dialog directly.
   */
  clearFocus(): void {
    this.zone.run(() => {
      this.currentEl?.classList.remove(FOCUS_CLASS);
      this.currentEl?.blur();
      this.currentEl = null;
    });
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

}
