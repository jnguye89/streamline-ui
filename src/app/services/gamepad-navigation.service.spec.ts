import { NgZone } from '@angular/core';
import { fakeAsync, tick } from '@angular/core/testing';
import { GamepadNavigationService } from './gamepad-navigation.service';

function makePad(pressedIndexes: number[] = [], axes: number[] = [0, 0]): Gamepad {
  const buttons = Array.from({ length: 17 }, (_, index) => ({
    pressed: pressedIndexes.includes(index),
    value: pressedIndexes.includes(index) ? 1 : 0,
    touched: false,
  })) as GamepadButton[];
  return { axes, buttons, mapping: 'standard' } as unknown as Gamepad;
}

describe('GamepadNavigationService', () => {
  let service: GamepadNavigationService;

  beforeEach(() => {
    service = new GamepadNavigationService(
      'browser' as unknown as object,
      new NgZone({ enableLongStackTrace: false }),
    );
  });

  afterEach(() => {
    try {
      sessionStorage.removeItem('skriin:lastHardRefreshAt');
    } catch {
      // ignore - nothing to clean up if storage isn't available
    }
  });

  it('reads a non-standard Bluetooth D-pad from Xbox hat axes', () => {
    const pad = {
      axes: [0, 0, 0, 0, 0, 0, 1, 0],
      mapping: '',
    } as unknown as Gamepad;

    expect(
      (
        service as unknown as {
          getDirection(pad: Gamepad, buttons: boolean[]): string | null;
        }
      ).getDirection(pad, Array(16).fill(false)),
    ).toBe('right');
  });

  it('does not process gamepad input while its window lacks focus', () => {
    spyOn(document, 'hasFocus').and.returnValue(false);

    expect(
      (
        service as unknown as {
          canProcessInput(): boolean;
        }
      ).canProcessInput(),
    ).toBeFalse();
  });

  it('does not apply raw-axis fallbacks to a normalized standard controller', () => {
    const pad = {
      axes: [0, 0, 0, 0],
      mapping: 'standard',
    } as unknown as Gamepad;

    expect(
      (
        service as unknown as {
          getDirection(pad: Gamepad, buttons: boolean[]): string | null;
        }
      ).getDirection(pad, Array(16).fill(false)),
    ).toBeNull();
  });

  it('reads the legacy single-axis D-pad hat representation', () => {
    const pad = {
      axes: [0, 0, 0, 0, 0, 0, 0, 0, 0, -1],
      mapping: '',
    } as unknown as Gamepad;

    expect(
      (
        service as unknown as {
          getDirection(pad: Gamepad, buttons: boolean[]): string | null;
        }
      ).getDirection(pad, Array(16).fill(false)),
    ).toBe('up');
  });

  it('lets a page-level back action consume the B button behavior', () => {
    const dismiss = jasmine.createSpy('dismiss').and.returnValue(true);
    service.setBackAction(dismiss);

    (
      service as unknown as {
        goBack(): void;
      }
    ).goBack();

    expect(dismiss).toHaveBeenCalled();
  });

  it('dismisses a focused row on B to a neutral, nothing-highlighted state (Controller Map v2), ahead of any page-level back action', () => {
    const row = document.createElement('div');
    row.setAttribute('data-gamepad-row', 'top');
    const button = document.createElement('button');
    row.appendChild(button);
    button.classList.add('gamepad-focused');
    const blurSpy = spyOn(button, 'blur');

    const controls = service as unknown as {
      currentEl: HTMLElement | null;
      goBack(): void;
    };
    controls.currentEl = button;

    const backAction = jasmine.createSpy('backAction').and.returnValue(true);
    service.setBackAction(backAction);

    controls.goBack();

    expect(blurSpy).toHaveBeenCalled();
    expect(button.classList).not.toContain('gamepad-focused');
    expect(controls.currentEl).toBeNull();
    expect(backAction).not.toHaveBeenCalled();
  });

  it('keeps left/right movement inside a marked row instead of jumping to whatever page content is visually closest', () => {
    const row = document.createElement('div');
    row.setAttribute('data-gamepad-row', 'top');
    document.body.appendChild(row);

    const yap = document.createElement('button');
    const search = document.createElement('button');
    row.appendChild(yap);
    row.appendChild(search);

    // A page-level button (e.g. profile's "YouTube Channels") that sits
    // just below "yap" - much closer on screen than "search" is, but not
    // part of the row, so it must never win a left/right move out of it.
    const pageButton = document.createElement('button');
    document.body.appendChild(pageButton);

    spyOn(yap, 'getBoundingClientRect').and.returnValue(
      { left: 100, right: 140, top: 0, bottom: 20, width: 40, height: 20 } as DOMRect,
    );
    spyOn(search, 'getBoundingClientRect').and.returnValue(
      { left: 500, right: 540, top: 0, bottom: 20, width: 40, height: 20 } as DOMRect,
    );
    spyOn(pageButton, 'getBoundingClientRect').and.returnValue(
      { left: 110, right: 150, top: 40, bottom: 60, width: 40, height: 20 } as DOMRect,
    );

    service.register(yap);
    service.register(search);
    service.register(pageButton);

    const controls = service as unknown as {
      currentEl: HTMLElement | null;
      moveFocus(direction: string): void;
    };
    controls.currentEl = yap;

    controls.moveFocus('right');

    expect(controls.currentEl).toBe(search);

    row.remove();
    pageButton.remove();
  });

  it('falls back to scrolling rather than leaving a row when nothing further right is in that row', () => {
    const row = document.createElement('div');
    row.setAttribute('data-gamepad-row', 'top');
    document.body.appendChild(row);

    const search = document.createElement('button'); // the last item in the row
    row.appendChild(search);

    const pageButton = document.createElement('button'); // outside the row, to the right
    document.body.appendChild(pageButton);

    spyOn(search, 'getBoundingClientRect').and.returnValue(
      { left: 500, right: 540, top: 0, bottom: 20, width: 40, height: 20 } as DOMRect,
    );
    spyOn(pageButton, 'getBoundingClientRect').and.returnValue(
      { left: 600, right: 640, top: 0, bottom: 20, width: 40, height: 20 } as DOMRect,
    );

    service.register(search);
    service.register(pageButton);

    const controls = service as unknown as {
      currentEl: HTMLElement | null;
      moveFocus(direction: string): void;
    };
    controls.currentEl = search;

    const scrollSpy = spyOn(window, 'scrollBy');

    controls.moveFocus('right');

    expect(controls.currentEl).toBe(search); // unchanged - stayed in the row
    expect(scrollSpy).toHaveBeenCalled();

    row.remove();
    pageButton.remove();
  });

  it('falls back to the page-level back action when focus is outside any row', () => {
    const button = document.createElement('button');

    const controls = service as unknown as {
      currentEl: HTMLElement;
      goBack(): void;
    };
    controls.currentEl = button;

    const backAction = jasmine.createSpy('backAction').and.returnValue(true);
    service.setBackAction(backAction);

    controls.goBack();

    expect(backAction).toHaveBeenCalled();
  });

  it('lets a page-level activate action consume the A button/Enter behavior', () => {
    const button = document.createElement('button');
    const clicked = jasmine.createSpy('clicked');
    button.addEventListener('click', clicked);
    const controls = service as unknown as {
      currentEl: HTMLElement;
      activateCurrent(): void;
    };
    controls.currentEl = button;

    const activate = jasmine.createSpy('activate').and.returnValue(true);
    service.setActivateAction(activate);
    controls.activateCurrent();

    expect(activate).toHaveBeenCalled();
    expect(clicked).not.toHaveBeenCalled();
  });

  it('falls back to the default click when the activate action declines to handle it', () => {
    const button = document.createElement('button');
    const clicked = jasmine.createSpy('clicked');
    button.addEventListener('click', clicked);
    const controls = service as unknown as {
      currentEl: HTMLElement;
      activateCurrent(): void;
    };
    controls.currentEl = button;

    const activate = jasmine.createSpy('activate').and.returnValue(false);
    service.setActivateAction(activate);
    controls.activateCurrent();

    expect(activate).toHaveBeenCalled();
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it('previews select options and commits them only when A is pressed again', () => {
    const select = document.createElement('select');
    select.add(new Option('First', 'first'));
    select.add(new Option('Second', 'second'));
    const changed = jasmine.createSpy('changed');
    select.addEventListener('change', changed);
    (
      service as unknown as {
        currentEl: HTMLElement;
        activateCurrent(): void;
        handleDirection(direction: string | null): void;
      }
    ).currentEl = select;

    (
      service as unknown as {
        activateCurrent(): void;
      }
    ).activateCurrent();
    (
      service as unknown as {
        handleDirection(direction: string | null): void;
      }
    ).handleDirection('down');

    expect(select.selectedIndex).toBe(1);
    expect(changed).not.toHaveBeenCalled();

    (
      service as unknown as {
        activateCurrent(): void;
      }
    ).activateCurrent();

    expect(changed).toHaveBeenCalledTimes(1);
    expect(select.size).toBe(0);
  });

  it('restores a select value when B cancels selection mode', () => {
    const select = document.createElement('select');
    select.add(new Option('First', 'first'));
    select.add(new Option('Second', 'second'));
    const controls = service as unknown as {
      currentEl: HTMLElement;
      activateCurrent(): void;
      handleDirection(direction: string | null): void;
      goBack(): void;
    };
    controls.currentEl = select;
    controls.activateCurrent();
    controls.handleDirection('down');

    controls.goBack();

    expect(select.selectedIndex).toBe(0);
    expect(select.size).toBe(0);
  });

  it('adjusts a focused range in five-percent steps and commits with A', () => {
    const range = document.createElement('input');
    range.type = 'range';
    range.min = '0';
    range.max = '100';
    range.value = '50';
    const changed = jasmine.createSpy('changed');
    range.addEventListener('input', changed);
    const controls = service as unknown as {
      currentEl: HTMLElement;
      activateCurrent(): void;
      handleDirection(direction: string | null): void;
    };
    controls.currentEl = range;

    controls.activateCurrent();
    controls.handleDirection('right');

    expect(range.value).toBe('55');
    expect(changed).toHaveBeenCalledTimes(1);
    expect(range.classList).toContain('gamepad-adjusting');

    controls.activateCurrent();

    expect(range.value).toBe('55');
    expect(range.classList).not.toContain('gamepad-adjusting');
  });

  it('fires a bound LB aux action on each leading-edge press', () => {
    spyOn(document, 'hasFocus').and.returnValue(true);
    spyOnProperty(document, 'visibilityState', 'get').and.returnValue('visible');
    const gamepadsSpy = spyOn(navigator, 'getGamepads');
    const poll = (pressed: number[]) => {
      gamepadsSpy.and.returnValue(
        [makePad(pressed)] as unknown as (Gamepad | null)[],
      );
      (service as unknown as { pollGamepad(): void }).pollGamepad();
    };

    const lb = jasmine.createSpy('lb');
    service.setAuxButtonActions({ lb });

    poll([]); // arms the input window - no edge yet
    poll([4]); // LB leading edge

    expect(lb).toHaveBeenCalledTimes(1);
  });

  it('fires bound LT/RT aux actions on each leading-edge press (Controller Map v2 seek jump)', () => {
    spyOn(document, 'hasFocus').and.returnValue(true);
    spyOnProperty(document, 'visibilityState', 'get').and.returnValue('visible');
    const gamepadsSpy = spyOn(navigator, 'getGamepads');
    const poll = (pressed: number[]) => {
      gamepadsSpy.and.returnValue(
        [makePad(pressed)] as unknown as (Gamepad | null)[],
      );
      (service as unknown as { pollGamepad(): void }).pollGamepad();
    };

    const lt = jasmine.createSpy('lt');
    const rt = jasmine.createSpy('rt');
    service.setAuxButtonActions({ lt, rt });

    poll([]);
    poll([6]); // LT leading edge
    expect(lt).toHaveBeenCalledTimes(1);
    expect(rt).not.toHaveBeenCalled();

    poll([]);
    poll([7]); // RT leading edge
    expect(rt).toHaveBeenCalledTimes(1);
  });

  it('scrubs by a delta that scales with right-stick deflection, throttled to the update interval', () => {
    spyOn(document, 'hasFocus').and.returnValue(true);
    spyOnProperty(document, 'visibilityState', 'get').and.returnValue('visible');
    const gamepadsSpy = spyOn(navigator, 'getGamepads');
    let now = 1000;
    spyOn(performance, 'now').and.callFake(() => now);
    const poll = (rightStickX: number) => {
      gamepadsSpy.and.returnValue(
        [makePad([], [0, 0, rightStickX, 0])] as unknown as (Gamepad | null)[],
      );
      (service as unknown as { pollGamepad(): void }).pollGamepad();
    };

    const scrub = jasmine.createSpy('scrub');
    service.setRightStickScrubAction(scrub);

    poll(0); // arms the input window - centered, no scrub yet

    poll(1); // full right deflection
    expect(scrub).toHaveBeenCalledTimes(1);
    expect(scrub.calls.mostRecent().args[0]).toBeCloseTo(0.8, 5);

    poll(1); // same tick (performance.now() unchanged) - throttled, no extra call
    expect(scrub).toHaveBeenCalledTimes(1);

    now += 100; // past the update interval
    poll(-1); // full left deflection - opposite sign
    expect(scrub).toHaveBeenCalledTimes(2);
    expect(scrub.calls.mostRecent().args[0]).toBeCloseTo(-0.8, 5);
  });

  it('does not scrub while the right stick is within its deadzone', () => {
    spyOn(document, 'hasFocus').and.returnValue(true);
    spyOnProperty(document, 'visibilityState', 'get').and.returnValue('visible');
    const gamepadsSpy = spyOn(navigator, 'getGamepads');
    const poll = (rightStickX: number) => {
      gamepadsSpy.and.returnValue(
        [makePad([], [0, 0, rightStickX, 0])] as unknown as (Gamepad | null)[],
      );
      (service as unknown as { pollGamepad(): void }).pollGamepad();
    };

    const scrub = jasmine.createSpy('scrub');
    service.setRightStickScrubAction(scrub);

    poll(0);
    poll(0.1); // within the 0.15 deadzone

    expect(scrub).not.toHaveBeenCalled();
  });

  it('unregisters the service worker, clears caches, and reloads after L3+R3 are held for the hold duration', fakeAsync(() => {
    spyOn(document, 'hasFocus').and.returnValue(true);
    spyOnProperty(document, 'visibilityState', 'get').and.returnValue('visible');
    const gamepadsSpy = spyOn(navigator, 'getGamepads');
    let now = 1000;
    spyOn(performance, 'now').and.callFake(() => now);
    const poll = (pressed: number[]) => {
      gamepadsSpy.and.returnValue(
        [makePad(pressed)] as unknown as (Gamepad | null)[],
      );
      (service as unknown as { pollGamepad(): void }).pollGamepad();
    };

    const registration = jasmine.createSpyObj('ServiceWorkerRegistration', ['unregister']);
    spyOn(navigator.serviceWorker, 'getRegistrations').and.resolveTo([registration]);
    spyOn(caches, 'keys').and.resolveTo(['cache-a']);
    spyOn(caches, 'delete').and.resolveTo(true);
    spyOn(window.location, 'reload');

    poll([]); // arms the input window
    poll([10, 11]); // L3+R3 pressed together - starts the hold timer

    now += 1499;
    poll([10, 11]); // still under the hold duration
    expect(window.location.reload).not.toHaveBeenCalled();

    now += 1;
    poll([10, 11]); // hold duration reached - triggers
    tick(); // flush the unregister/clear-cache/reload promise chain

    expect(registration.unregister).toHaveBeenCalledTimes(1);
    expect(caches.delete).toHaveBeenCalledWith('cache-a');
    expect(window.location.reload).toHaveBeenCalledTimes(1);

    now += 1000;
    poll([10, 11]); // still held well past the duration - fires only once
    tick();
    expect(window.location.reload).toHaveBeenCalledTimes(1);
  }));

  it('resets the hard-refresh hold timer if L3 or R3 is released before the hold duration elapses', () => {
    spyOn(document, 'hasFocus').and.returnValue(true);
    spyOnProperty(document, 'visibilityState', 'get').and.returnValue('visible');
    const gamepadsSpy = spyOn(navigator, 'getGamepads');
    let now = 1000;
    spyOn(performance, 'now').and.callFake(() => now);
    const poll = (pressed: number[]) => {
      gamepadsSpy.and.returnValue(
        [makePad(pressed)] as unknown as (Gamepad | null)[],
      );
      (service as unknown as { pollGamepad(): void }).pollGamepad();
    };
    spyOn(window.location, 'reload');

    poll([]); // arms the input window
    poll([10, 11]); // starts the hold timer

    now += 1000;
    poll([10]); // R3 released early - resets the hold timer

    now += 1000;
    poll([10, 11]); // re-armed, only held for a fresh 1000ms so far

    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it('does not reload again within the cooldown window if L3+R3 are still held across the reload (e.g. a controller resting on its sticks), then allows it again once released and re-held after the cooldown', fakeAsync(() => {
    spyOn(document, 'hasFocus').and.returnValue(true);
    spyOnProperty(document, 'visibilityState', 'get').and.returnValue('visible');
    const gamepadsSpy = spyOn(navigator, 'getGamepads');
    let now = 1000;
    spyOn(performance, 'now').and.callFake(() => now);
    let wallClock = 5_000_000;
    spyOn(Date, 'now').and.callFake(() => wallClock);
    const poll = (pressed: number[]) => {
      gamepadsSpy.and.returnValue(
        [makePad(pressed)] as unknown as (Gamepad | null)[],
      );
      (service as unknown as { pollGamepad(): void }).pollGamepad();
    };

    spyOn(navigator.serviceWorker, 'getRegistrations').and.resolveTo([]);
    spyOn(caches, 'keys').and.resolveTo([]);
    spyOn(window.location, 'reload');

    poll([]); // arms the input window
    poll([10, 11]); // starts the hold timer
    now += 1500;
    poll([10, 11]); // hold duration reached - triggers the first reload
    tick();
    expect(window.location.reload).toHaveBeenCalledTimes(1);

    // A real reload would tear down this service and construct a fresh one
    // (performance.now() resets too, since it's relative to navigation
    // start) - simulate that instead of just continuing to poll the same
    // instance, since the bug this guards against is specifically about
    // state that does/doesn't survive that boundary.
    service = new GamepadNavigationService(
      'browser' as unknown as object,
      new NgZone({ enableLongStackTrace: false }),
    );
    now = 1000;

    wallClock += 2_000; // only 2s later - well within the 30s cooldown
    poll([]); // arms the input window on the "new" page load
    poll([10, 11]); // the controller never moved - still pinned
    now += 1500;
    poll([10, 11]); // hold duration reached again
    tick();

    expect(window.location.reload).toHaveBeenCalledTimes(1); // suppressed by the cooldown

    // Cooldown elapses and the controller is finally moved (released, then
    // re-held) - a genuine subsequent hard refresh should work again.
    wallClock += 40_000;
    poll([]); // release
    now += 100;
    poll([10, 11]); // re-press
    now += 1500;
    poll([10, 11]);
    tick();

    expect(window.location.reload).toHaveBeenCalledTimes(2);
  }));

  it('does not fire an aux action once it has been cleared', () => {
    spyOn(document, 'hasFocus').and.returnValue(true);
    spyOnProperty(document, 'visibilityState', 'get').and.returnValue('visible');
    const gamepadsSpy = spyOn(navigator, 'getGamepads');
    const poll = (pressed: number[]) => {
      gamepadsSpy.and.returnValue(
        [makePad(pressed)] as unknown as (Gamepad | null)[],
      );
      (service as unknown as { pollGamepad(): void }).pollGamepad();
    };

    const lb = jasmine.createSpy('lb');
    service.setAuxButtonActions({ lb });
    service.clearAuxButtonActions();

    poll([]);
    poll([4]);

    expect(lb).not.toHaveBeenCalled();
  });

  it('fires the Y aux action on each leading edge press', () => {
    spyOn(document, 'hasFocus').and.returnValue(true);
    spyOnProperty(document, 'visibilityState', 'get').and.returnValue('visible');
    const gamepadsSpy = spyOn(navigator, 'getGamepads');
    const poll = (pressed: number[]) => {
      gamepadsSpy.and.returnValue(
        [makePad(pressed)] as unknown as (Gamepad | null)[],
      );
      (service as unknown as { pollGamepad(): void }).pollGamepad();
    };

    const y = jasmine.createSpy('y');
    service.setAuxButtonActions({ y });

    poll([]);
    poll([3]);
    expect(y).toHaveBeenCalledTimes(1);

    poll([]);
    poll([3]);
    expect(y).toHaveBeenCalledTimes(2);
  });

  it('fires the Q/E/Y keyboard equivalents of the LB/RB/Y aux buttons', () => {
    const lb = jasmine.createSpy('lb');
    const rb = jasmine.createSpy('rb');
    const y = jasmine.createSpy('y');
    service.setAuxButtonActions({ lb, rb, y });

    const dispatch = (key: string) =>
      (
        service as unknown as { onKeyDown(e: KeyboardEvent): void }
      ).onKeyDown({
        key,
        target: document.body,
        preventDefault: () => undefined,
      } as unknown as KeyboardEvent);

    dispatch('q');
    expect(lb).toHaveBeenCalledTimes(1);

    dispatch('e');
    expect(rb).toHaveBeenCalledTimes(1);

    dispatch('y');
    expect(y).toHaveBeenCalledTimes(1);
  });

  it('ignores the Q/E/Y aux shortcuts while typing in a text field', () => {
    const lb = jasmine.createSpy('lb');
    service.setAuxButtonActions({ lb });
    const input = document.createElement('input');
    input.type = 'text';

    (
      service as unknown as { onKeyDown(e: KeyboardEvent): void }
    ).onKeyDown({
      key: 'q',
      target: input,
      preventDefault: () => undefined,
    } as unknown as KeyboardEvent);

    expect(lb).not.toHaveBeenCalled();
  });

  it('restores the original range value when B cancels adjustment mode', () => {
    const range = document.createElement('input');
    range.type = 'range';
    range.min = '0';
    range.max = '100';
    range.value = '50';
    const controls = service as unknown as {
      currentEl: HTMLElement;
      activateCurrent(): void;
      handleDirection(direction: string | null): void;
      goBack(): void;
    };
    controls.currentEl = range;
    controls.activateCurrent();
    controls.handleDirection('left');

    controls.goBack();

    expect(range.value).toBe('50');
    expect(range.classList).not.toContain('gamepad-adjusting');
  });
});
