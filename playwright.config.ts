import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  workers: 2,
  reporter: [['list'], ['json', { outputFile: '.validation/browser-results.json' }], ['./tests/browser/timingReporter.ts']],
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', testMatch: /(?:m1|tasks|browser-state)\.spec\.ts/, use: { ...devices['Desktop Firefox'] } },
  ],
  webServer: {
    command: 'node scripts/browser-server.mjs',
    url: 'http://127.0.0.1:4173/__browser_ready',
    reuseExistingServer: false,
  },
});
