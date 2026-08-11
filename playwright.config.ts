import { defineConfig, devices } from '@playwright/test';

// Playwright enables colored reporter output. Remove an inherited NO_COLOR so
// Node does not warn in every worker about the conflicting environment flags.
delete process.env['NO_COLOR'];

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://[::1]:4201',
    trace: 'retain-on-failure',
  },
  webServer: {
    command:
      'npm start -- --configuration e2e --host ::1 --port 4201',
    url: 'http://[::1]:4201',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chrome',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        permissions: ['camera', 'microphone'],
        launchOptions: {
          args: [
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
          ],
        },
      },
    },
  ],
});
