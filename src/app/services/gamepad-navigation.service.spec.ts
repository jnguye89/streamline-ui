import { NgZone } from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { GamepadNavigationService } from './gamepad-navigation.service';

describe('GamepadNavigationService', () => {
  let service: GamepadNavigationService;
  let location: jasmine.SpyObj<Location>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(() => {
    location = jasmine.createSpyObj<Location>('Location', ['back']);
    router = jasmine.createSpyObj<Router>('Router', ['navigateByUrl'], {
      url: '/stream',
    });
    service = new GamepadNavigationService(
      'browser' as unknown as object,
      new NgZone({ enableLongStackTrace: false }),
      location,
      router,
    );
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
    expect(location.back).not.toHaveBeenCalled();
  });

  it('moves to adjacent primary routes for shoulder-button navigation', () => {
    const controls = service as unknown as {
      changeRoute(offset: -1 | 1): void;
    };

    controls.changeRoute(-1);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/podcast');

    controls.changeRoute(1);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/watch');
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
    expect(location.back).not.toHaveBeenCalled();
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
    expect(location.back).not.toHaveBeenCalled();
  });
});
