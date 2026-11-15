import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'skriin.tvMode';
/** Origin of the box's local Wi-Fi launcher (utilities/wifi-setup), which hands the kiosk off to skriin.com. */
const KIOSK_LAUNCHER = /^http:\/\/(127\.0\.0\.1|localhost):5757\//;

/**
 * Whether this page is running on the skriin TV box rather than in a normal
 * browser. Web-only chrome (the site footer and the homepage H1) is hidden on
 * the box.
 *
 * The box is an Edge kiosk that starts at the local Wi-Fi launcher on
 * 127.0.0.1:5757 and then redirects here, so its first page load carries that
 * referrer. Also counts as TV: `?tv=1` in the URL, or a gamepad being
 * connected. The result is kept in sessionStorage so in-app reloads stay in
 * TV mode. `?tv=0` clears it (handy for testing).
 */
@Injectable({ providedIn: 'root' })
export class TvModeService {
  readonly isTv = signal(this.detect());

  constructor() {
    this.apply(this.isTv());
    if (typeof window !== 'undefined') {
      window.addEventListener('gamepadconnected', () => this.set(true));
    }
  }

  private detect(): boolean {
    if (typeof window === 'undefined') return false;
    const flag = new URLSearchParams(window.location.search).get('tv');
    if (flag === '0') {
      this.store(false);
      return false;
    }
    if (flag === '1' || KIOSK_LAUNCHER.test(document.referrer)) {
      this.store(true);
      return true;
    }
    try {
      if (sessionStorage.getItem(STORAGE_KEY) === '1') return true;
    } catch {
      /* storage blocked */
    }
    try {
      return Array.from(navigator.getGamepads?.() ?? []).some(Boolean);
    } catch {
      return false;
    }
  }

  private set(on: boolean): void {
    if (this.isTv() === on) return;
    this.store(on);
    this.isTv.set(on);
    this.apply(on);
  }

  private store(on: boolean): void {
    try {
      if (on) sessionStorage.setItem(STORAGE_KEY, '1');
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage blocked */
    }
  }

  /** `tv-mode` on <html>, for any CSS that needs to know. */
  private apply(on: boolean): void {
    if (typeof document !== 'undefined') document.documentElement.classList.toggle('tv-mode', on);
  }
}
