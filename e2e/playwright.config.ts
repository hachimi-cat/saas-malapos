import { defineConfig } from '@playwright/test';

/**
 * Base (local dev) Playwright config.
 *
 * CI overrides with playwright.ci.config.ts (staging, public http
 * on the shared box, no webServer). See .github/workflows/ci-cd.yml.
 */

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3190';

const isRemote = !!(process.env.FRONTEND_URL || process.env.BACKEND_URL || process.env.CI);

export default defineConfig({
  testDir: './tests',
  fullyParallel: !isRemote,
  forbidOnly: !!process.env.CI,
  retries: isRemote ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: FRONTEND_URL,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { viewport: { width: 1280, height: 800 } } },
  ],
});
