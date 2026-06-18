import { defineConfig, devices } from '@playwright/test';

/**
 * Staging E2E config. Ported from saas-linksnap.
 *
 * CI's `e2e-staging` job invokes playwright with
 * `--config=playwright.ci.config.ts` after deploying to staging. No
 * webServer — we connect to the staging host over PUBLIC http
 * (`staging-<brand>.forjio.com` on the shared box; see
 * .github/workflows/ci-cd.yml). CI passes FRONTEND_URL/BACKEND_URL.
 *
 * Local dev keeps using the base `playwright.config.ts` with its
 * own webServer. This file is CI-only.
 */
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://staging-malapos.forjio.com';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: true,
  retries: 2,
  workers: 1,
  reporter: 'list',
  timeout: 90_000,

  use: {
    baseURL: FRONTEND_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 30_000,
    navigationTimeout: 45_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // No webServer — CI connects to the public staging host on the shared box.
});
