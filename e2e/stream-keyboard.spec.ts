import { expect, test } from '@playwright/test';

const futureExpiry = Date.now() + 60 * 60 * 1000;
const idToken = [
  'eyJhbGciOiJub25lIn0',
  'eyJzdWIiOiJhdXRoMHxlMmUtdXNlciIsIm5hbWUiOiJFMiBFLiBVc2VyIn0',
  '',
].join('.');

test.beforeEach(async ({ context, page }) => {
  await context.addInitScript(
    ({ expiresAt, token }) => {
      localStorage.setItem(
        'device_auth_tokens',
        JSON.stringify({
          accessToken: 'e2e-access-token',
          idToken: token,
          refreshToken: 'e2e-refresh-token',
          expiresAt,
        }),
      );
    },
    { expiresAt: futureExpiry, token: idToken },
  );

  await page.route('http://localhost:3000/user/auth0/**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        id: 1,
        auth0Id: 'auth0|e2e-user',
        agoraUserId: 101,
      }),
    });
  });

  await page.route('http://localhost:3000/stream/ensure', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        appId: 'e2e-app',
        rtcToken: 'e2e-rtc-token',
        rtmToken: 'e2e-rtm-token',
        expireAt: Date.now() + 60 * 60 * 1000,
        agoraUid: 101,
      }),
    });
  });

  await page.goto('/stream');
  await expect(page.locator('.input-panel')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Go live' })).toBeEnabled({
    timeout: 15_000,
  });
  await page.getByRole('button', { name: 'Show stream inputs' }).click();
});

test('discovers browser media and exposes keyboard-accessible selectors', async ({
  page,
}) => {
  const video = page.getByLabel('Main stream video');
  const microphone = page.getByLabel('Facecam audio', { exact: true });

  await expect(video).toBeVisible();
  await expect(video).toBeEnabled();
  await expect(video.locator('option')).not.toHaveCount(0);
  await expect(microphone).toBeVisible();
  await expect(microphone).toBeEnabled();
  await expect(microphone.locator('option')).not.toHaveCount(0);

  await expect
    .poll(() =>
      page.locator('#local-player').evaluate((element: HTMLVideoElement) => {
        const stream = element.srcObject as MediaStream | null;
        return stream?.getVideoTracks().some((track) => track.readyState === 'live');
      }),
    )
    .toBe(true);
});

test('keeps keyboard focus synchronized and preserves native select keys', async ({
  page,
}) => {
  const video = page.getByLabel('Main stream video');
  const mainAudio = page.getByLabel('Main stream audio');
  const gameLevel = page.getByLabel(/Main audio level/);

  await expect(page.getByRole('button', { name: 'Go live' })).toBeEnabled();
  await video.focus();
  await expect(video).toBeFocused();
  await expect(video).toHaveClass(/gamepad-focused/);

  await page.keyboard.press('Tab');
  await expect(mainAudio).toBeFocused();
  await expect(mainAudio).toHaveClass(/gamepad-focused/);

  await page.keyboard.press('Tab');
  await expect(gameLevel).toBeFocused();
  await expect(gameLevel).toHaveClass(/gamepad-focused/);
  await expect(video).not.toHaveClass(/gamepad-focused/);

  await page.keyboard.press('Shift+Tab');
  await expect(mainAudio).toBeFocused();

  await page.keyboard.press('ArrowDown');
  await expect(mainAudio).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(gameLevel).toBeVisible();

  await page.keyboard.press('s');
  await expect(page.locator(':focus')).toHaveClass(/gamepad-focused/);
  await page.keyboard.press('w');
  await expect(page.locator(':focus')).toHaveClass(/gamepad-focused/);
});

test('collapses the input panel and keeps fullscreen clear of search', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Hide stream inputs' }).click();
  await expect(page.locator('.input-panel')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Show stream inputs' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Show stream inputs' }).click();
  await expect(page.locator('.input-panel')).toBeVisible();

  const overlaps = await page.evaluate(() => {
    const fullscreen = document
      .querySelector<HTMLButtonElement>('[aria-label="Toggle preview fullscreen"]')!
      .getBoundingClientRect();
    const search = document
      .querySelector<HTMLButtonElement>('[aria-label="Search"]')!
      .getBoundingClientRect();
    return !(
      fullscreen.right <= search.left ||
      fullscreen.left >= search.right ||
      fullscreen.bottom <= search.top ||
      fullscreen.top >= search.bottom
    );
  });
  expect(overlaps).toBe(false);
});

test('uses readable native controls in light and dark color schemes', async ({
  page,
}) => {
  const select = page.getByLabel('Main stream video');
  const option = select.locator('option').first();
  const schemes = [
    {
      name: 'dark' as const,
      color: 'rgb(255, 255, 255)',
      background: 'rgb(37, 37, 37)',
    },
    {
      name: 'light' as const,
      color: 'rgb(23, 23, 23)',
      background: 'rgb(255, 255, 255)',
    },
  ];

  for (const scheme of schemes) {
    await page.emulateMedia({ colorScheme: scheme.name });
    await expect(select).toHaveCSS('color-scheme', scheme.name);
    await expect(select).toHaveCSS('color', scheme.color);
    await expect(select).toHaveCSS('background-color', scheme.background);
    await expect(option).toHaveCSS('color', scheme.color);
    await expect(option).toHaveCSS('background-color', scheme.background);
  }
});

test('swaps source assignments, levels, and mute states', async ({ page }) => {
  await expect(page.getByLabel('Main stream video')).toHaveValue(
    'e2e-webcam-video',
  );
  await expect(page.getByLabel('Facecam video')).toHaveValue(
    'e2e-console-video',
  );
  const mainAudioBefore = await page
    .getByLabel('Main stream audio')
    .inputValue();
  const facecamAudioBefore = await page
    .getByLabel('Facecam audio', { exact: true })
    .inputValue();
  await page.getByLabel(/Main audio level/).fill('40');
  await page.getByRole('button', { name: 'Mute main audio' }).click();
  await page.getByLabel(/Facecam audio level/).fill('75');

  await page
    .getByRole('button', { name: 'Swap Main stream and Facecam sources' })
    .click();

  await expect(page.getByLabel('Main stream video')).toHaveValue(
    'e2e-console-video',
  );
  await expect(page.getByLabel('Facecam video')).toHaveValue(
    'e2e-webcam-video',
  );
  await expect(page.getByLabel('Main stream audio')).toHaveValue(
    facecamAudioBefore,
  );
  await expect(page.getByLabel('Facecam audio', { exact: true })).toHaveValue(
    mainAudioBefore,
  );
  await expect(page.getByLabel(/Main audio level/)).toHaveValue('75');
  await expect(page.getByLabel(/Facecam audio level/)).toHaveValue('40');
  await expect(
    page.getByRole('button', { name: 'Mute main audio' }),
  ).toHaveAttribute('aria-pressed', 'false');
  await expect(
    page.getByRole('button', { name: 'Unmute Facecam audio' }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('publishes selected preview tracks and completes repeated backend lifecycles', async ({
  page,
}) => {
  let publishRequests = 0;
  let heartbeatRequests = 0;
  let recordingStops = 0;
  let processRequests = 0;

  await page.route('http://localhost:3000/stream/publish', async (route) => {
    publishRequests += 1;
    expect(route.request().postDataJSON()).toMatchObject({
      isStreaming: true,
    });
    await route.fulfill({ status: 204 });
  });
  await page.route('http://localhost:3000/stream/heartbeat', async (route) => {
    heartbeatRequests += 1;
    await route.fulfill({ status: 204 });
  });
  await page.route('http://localhost:3000/stream/unpublish', async (route) => {
    recordingStops += 1;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ filename: `e2e-session-${recordingStops}.mp4` }),
    });
  });
  await page.route('http://localhost:3000/stream/process', async (route) => {
    processRequests += 1;
    expect(route.request().postDataJSON()).toEqual({
      fileName: 'e2e-session-2.mp4',
    });
    await route.fulfill({ status: 204 });
  });

  const goLive = page.getByRole('button', { name: 'Go live' });
  const stop = page.getByRole('button', { name: 'Stop streaming' });

  await expect(goLive).toBeEnabled();
  const offlineButtonRadius = await goLive.evaluate(
    (element) => getComputedStyle(element).borderRadius,
  );
  await goLive.click();
  await expect(page.getByText('LIVE', { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      stop.evaluate((element) => getComputedStyle(element).borderRadius),
    )
    .toBe(offlineButtonRadius);
  await expect(page.getByLabel('Main stream video')).toBeEnabled();
  await expect(page.getByLabel('Main stream audio')).toBeEnabled();
  await expect(page.getByLabel('Facecam video')).toBeEnabled();
  await expect(page.getByLabel('Facecam audio', { exact: true })).toBeEnabled();
  await expect
    .poll(() =>
      page.locator('.primary-preview').evaluate((element: HTMLVideoElement) => {
        const stream = element.srcObject as MediaStream | null;
        return {
          audioTracks: stream?.getAudioTracks().length ?? 0,
          muted: element.muted,
          volume: element.volume,
        };
      }),
    )
    .toEqual({ audioTracks: 0, muted: true, volume: 0 });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const state = (
          window as unknown as {
            __SKRIIN_E2E_RTC_STATE__: {
              publishes: number;
              receivedKinds: string[];
            };
          }
        ).__SKRIIN_E2E_RTC_STATE__;
        return {
          publishes: state.publishes,
          kinds: [...state.receivedKinds].sort(),
        };
      }),
    )
    .toEqual({ publishes: 1, kinds: ['audio', 'video'] });
  await expect.poll(() => publishRequests).toBe(1);
  await expect.poll(() => heartbeatRequests).toBeGreaterThan(0);
  await page.getByLabel('Main stream audio').selectOption('');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const state = (
          window as unknown as {
            __SKRIIN_E2E_RTC_STATE__: {
              publishes: number;
              unpublishes: number;
            };
          }
        ).__SKRIIN_E2E_RTC_STATE__;
        return {
          publishes: state.publishes,
          unpublishes: state.unpublishes,
        };
      }),
    )
    .toEqual({ publishes: 1, unpublishes: 0 });

  await stop.click();
  await page.getByRole('button', { name: 'No Thanks' }).click();
  await expect(page.getByText('OFFLINE', { exact: true })).toBeVisible();
  await expect.poll(() => recordingStops).toBe(1);
  await expect
    .poll(() =>
      page.locator('.primary-preview').evaluate((element: HTMLVideoElement) => {
        const stream = element.srcObject as MediaStream | null;
        return stream?.getVideoTracks()[0]?.readyState;
      }),
    )
    .toBe('live');
  await expect(
    page.getByRole('meter', { name: 'Final mix level' }),
  ).toHaveAttribute('aria-valuenow', /^-?\d+/);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const tracks = (
          window as unknown as {
            __SKRIIN_E2E_RTC_STATE__: {
              tracks: Array<{
                source: MediaStreamTrack;
                closeCalls: number;
              }>;
            };
          }
        ).__SKRIIN_E2E_RTC_STATE__.tracks;
        return tracks.slice(0, 2).map((track) => ({
          readyState: track.source.readyState,
          closeCalls: track.closeCalls,
        }));
      }),
    )
    .toEqual([
      { readyState: 'ended', closeCalls: 1 },
      { readyState: 'ended', closeCalls: 1 },
    ]);

  await goLive.click();
  await expect(page.getByText('LIVE', { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __SKRIIN_E2E_RTC_STATE__: { publishes: number };
            }
          ).__SKRIIN_E2E_RTC_STATE__.publishes,
      ),
    )
    .toBe(2);

  await stop.click();
  await page.getByRole('button', { name: 'Process Video' }).click();
  await expect.poll(() => recordingStops).toBe(2);
  await expect.poll(() => processRequests).toBe(1);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const state = (
          window as unknown as {
            __SKRIIN_E2E_RTC_STATE__: {
              unpublishes: number;
              tracks: Array<{
                source: MediaStreamTrack;
                closeCalls: number;
              }>;
            };
          }
        ).__SKRIIN_E2E_RTC_STATE__;
        return {
          unpublishes: state.unpublishes,
          allTracksClosed: state.tracks.every(
            (track) =>
              track.closeCalls === 1 && track.source.readyState === 'ended',
          ),
        };
      }),
    )
    .toEqual({ unpublishes: 2, allTracksClosed: true });
});

test('configures Console preview, mixer controls, and preview-only overlay', async ({
  page,
}) => {
  await page.route('http://localhost:3000/stream/publish', (route) =>
    route.fulfill({ status: 204 }),
  );
  await page.route('http://localhost:3000/stream/heartbeat', (route) =>
    route.fulfill({ status: 204 }),
  );

  const source = page.getByLabel('Main stream video');
  await expect(source.getByRole('option', { name: 'Yuan SC400N2 Video' })).toHaveCount(
    1,
  );
  await source.selectOption({ label: 'Yuan SC400N2 Video' });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Go live' })).toBeEnabled({
    timeout: 15_000,
  });
  await page.getByRole('button', { name: 'Show stream inputs' }).click();

  await expect(page.getByLabel('Main stream video')).toHaveValue(
    'e2e-console-video',
  );
  await expect(page.getByLabel('Facecam video')).toHaveValue(
    'e2e-webcam-video',
  );
  await expect
    .poll(() =>
      page.evaluate(() => {
        const preview = document.querySelector<HTMLVideoElement>(
          '.primary-preview',
        )?.srcObject as MediaStream | null;
        return preview?.getVideoTracks()[0]?.readyState;
      }),
    )
    .toBe('live');

  await expect(page.getByLabel(/Main audio level/)).toHaveValue('62.5');
  await expect(page.getByLabel(/Facecam audio level/)).toHaveValue('100');
  const overlayInput = page.getByLabel('Facecam video');
  await expect(overlayInput.getByRole('option', { name: 'E2E Webcam' })).toHaveCount(
    1,
  );
  if ((await overlayInput.inputValue()) !== 'e2e-webcam-video') {
    await overlayInput.selectOption('e2e-webcam-video');
  }
  await expect(overlayInput).toHaveValue('e2e-webcam-video');
  await expect(page.getByLabel('Main stream audio')).toHaveValue('e2e-game-audio');
  await expect(page.getByLabel('Facecam audio', { exact: true })).toHaveValue(
    'e2e-microphone-audio',
  );

  const previewStyle = await page.locator('.primary-preview').evaluate(
    (element) => {
      const style = getComputedStyle(element);
      return {
        objectFit: style.objectFit,
        transform: style.transform,
        filter: style.filter,
      };
    },
  );
  expect(previewStyle).toEqual({
    objectFit: 'contain',
    transform: 'none',
    filter: 'none',
  });

  await page.getByLabel(/Main audio level/).fill('40');
  await page.getByLabel(/Facecam audio level/).fill('75');
  await expect(
    page.getByRole('button', { name: 'Mute main audio' }),
  ).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Mute main audio' }).click();
  await expect(
    page.getByRole('button', { name: 'Unmute main audio' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByRole('button', { name: 'Mute Facecam audio' }),
  ).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Mute Facecam audio' }).click();
  await expect(
    page.getByRole('button', { name: 'Unmute Facecam audio' }),
  ).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Go live' }).click();
  await expect(page.getByText('LIVE', { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const state = (
          window as unknown as {
            __SKRIIN_E2E_RTC_STATE__: {
              receivedKinds: string[];
            };
          }
        ).__SKRIIN_E2E_RTC_STATE__;
        return [...state.receivedKinds].sort();
      }),
    )
    .toEqual(['audio', 'video']);
});
