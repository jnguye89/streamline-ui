import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, NgZone, inject, signal } from '@angular/core';
import { TvAction } from './checkers.types';

/**
 * One input stream for everything that can drive the game on skriin ai TV:
 *  - the controller (8BitDo Ultimate 2C, XInput, read through the browser Gamepad API)
 *  - the short remote (Flirc sends keyboard keys: arrows, Enter = OK, Escape/Backspace = Back)
 *  - a keyboard and mouse when testing in a browser
 *
 * Controller map (Xbox names, matches the skriin controller card): D-pad / left stick = move,
 * A = pick / move, B = cancel / back, X = undo, Y = hint, + (Menu) or − (View) = menu.
 */

const KEYS: Record<string, TvAction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'select',
  NumpadEnter: 'select',
  ' ': 'select',
  a: 'select',
  Escape: 'back',
  Backspace: 'back',
  BrowserBack: 'back',
  GoBack: 'back',
  b: 'back',
  x: 'undo',
  u: 'undo',
  y: 'hint',
  h: 'hint',
  m: 'menu',
  ContextMenu: 'menu',
};

/** Standard Gamepad mapping indices. */
const PAD_BUTTONS: Record<number, TvAction> = {
  0: 'select', // A
  1: 'back', // B
  2: 'undo', // X
  3: 'hint', // Y
  8: 'menu', // − / View
  9: 'menu', // + / Menu
};
const PAD_DIRS: Record<number, TvAction> = { 12: 'up', 13: 'down', 14: 'left', 15: 'right' };

const REPEAT_DELAY_MS = 360;
const REPEAT_EVERY_MS = 115;
const STICK_DEADZONE = 0.55;

type Listener = (a: TvAction) => void;

@Injectable()
export class TvInputService {
  readonly lastSource = signal<'keyboard' | 'gamepad' | 'pointer'>('keyboard');
  readonly gamepadConnected = signal(false);

  private readonly listeners = new Set<Listener>();
  private readonly doc = inject(DOCUMENT);
  private readonly zone = inject(NgZone);
  private readonly win = this.doc.defaultView;
  private readonly prevButtons = new Map<number, boolean[]>();
  private held: { dir: TvAction; next: number } | null = null;
  private raf = 0;

  constructor() {
    const win = this.win;
    if (!win) return;
    const onKey = (e: KeyboardEvent) => this.onKey(e);
    const onPad = () => this.gamepadConnected.set(this.pads().length > 0);
    win.addEventListener('keydown', onKey);
    win.addEventListener('gamepadconnected', onPad);
    win.addEventListener('gamepaddisconnected', onPad);
    // skriin.com: the poll loop runs outside Angular's zone. zone.js patches requestAnimationFrame,
    // so an in-zone loop would run change detection for the whole app every frame (~60/s) with
    // nothing pressed. A press re-enters the zone in emit(), so only real input updates the view.
    const loop = () => {
      this.poll();
      this.raf = win.requestAnimationFrame(loop);
    };
    this.zone.runOutsideAngular(() => {
      this.raf = win.requestAnimationFrame(loop);
    });
    inject(DestroyRef).onDestroy(() => {
      win.removeEventListener('keydown', onKey);
      win.removeEventListener('gamepadconnected', onPad);
      win.removeEventListener('gamepaddisconnected', onPad);
      win.cancelAnimationFrame(this.raf);
      this.listeners.clear();
    });
  }

  /** Subscribe; returns an unsubscribe function. */
  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** For on-screen buttons clicked with a mouse. */
  emit(a: TvAction, source: 'keyboard' | 'gamepad' | 'pointer' = 'pointer'): void {
    const fire = () => {
      this.lastSource.set(source);
      for (const fn of [...this.listeners]) fn(a);
    };
    if (NgZone.isInAngularZone()) fire();
    else this.zone.run(fire);
  }

  private onKey(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const action = KEYS[key];
    if (!action) return;
    e.preventDefault();
    // A mouse-clicked button keeps focus; drop it so Enter/Space never fire it a second time.
    const active = this.doc.activeElement;
    if (active instanceof HTMLElement && active !== this.doc.body) active.blur();
    this.emit(action, 'keyboard');
  }

  private pads(): Gamepad[] {
    const nav = this.win?.navigator;
    if (!nav?.getGamepads) return [];
    return [...nav.getGamepads()].filter((p): p is Gamepad => !!p && p.connected);
  }

  private poll(): void {
    const pads = this.pads();
    if (!pads.length) {
      this.held = null;
      return;
    }
    const now = performance.now();
    let dir: TvAction | null = null;

    for (const pad of pads) {
      const prev = this.prevButtons.get(pad.index) ?? [];
      const cur = pad.buttons.map((b) => b.pressed || b.value > 0.5);
      for (const [idx, action] of Object.entries(PAD_BUTTONS)) {
        const i = Number(idx);
        if (cur[i] && !prev[i]) this.emit(action, 'gamepad');
      }
      for (const [idx, action] of Object.entries(PAD_DIRS)) {
        if (cur[Number(idx)]) dir = action;
      }
      const [ax = 0, ay = 0] = pad.axes;
      if (!dir && Math.max(Math.abs(ax), Math.abs(ay)) > STICK_DEADZONE) {
        dir = Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? 'right' : 'left') : ay > 0 ? 'down' : 'up';
      }
      this.prevButtons.set(pad.index, cur);
    }

    // Directions fire once on press, then repeat while held.
    if (!dir) {
      this.held = null;
    } else if (!this.held || this.held.dir !== dir) {
      this.held = { dir, next: now + REPEAT_DELAY_MS };
      this.emit(dir, 'gamepad');
    } else if (now >= this.held.next) {
      this.held.next = now + REPEAT_EVERY_MS;
      this.emit(dir, 'gamepad');
    }
  }
}
