import { defineConfig, devices } from '@playwright/test'

const PORT = 3100
const DB = process.env.E2E_DATABASE_URL ?? 'postgres://tempo:tempo@localhost:5432/tempo'

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'en-US',
    timezoneId: 'America/New_York',
  },
  projects: [{
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      // Use a pre-installed Chromium when one is provided (e.g. in CI images).
      ...(process.env.PW_CHROMIUM ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } } : {}),
    },
  }],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    timeout: 180_000,
    reuseExistingServer: true,
    env: {
      DATABASE_URL: DB,
      DIRECT_DATABASE_URL: DB,
      NEXT_PUBLIC_SITE_URL: `http://localhost:${PORT}`,
      DEV_FAKE_AUTH: '1',
      PLATFORM_ADMIN_EMAILS: 'admin@example.com',
      CRON_SECRET: 'e2e-secret',
    },
  },
})
