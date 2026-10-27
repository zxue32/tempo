import { defineConfig, devices } from '@playwright/test'

// Runs e2e/live/live.spec.ts against a deployed site: LIVE_URL=https://… npx playwright test -c e2e/live/live.config.ts
export default defineConfig({
  testDir: '.',
  testMatch: 'live.spec.ts',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: [['list'], ['json', { outputFile: '../../test-results/live/report.json' }]],
  use: {
    baseURL: process.env.LIVE_URL,
    trace: 'off',
    screenshot: 'only-on-failure',
    locale: 'en-US',
    timezoneId: 'America/New_York',
  },
  projects: [{
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      ...(process.env.PW_CHROMIUM ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } } : {}),
    },
  }],
})
