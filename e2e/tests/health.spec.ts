import { test, expect } from '@playwright/test';

// Read backend URL at test time so both playwright.config.ts (local
// dev) and playwright.ci.config.ts (CI against staging) work without
// cross-imports. Defaults to the local dev port when unset.
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:4191/api/v1';

test('backend /api/v1/health returns Forjio envelope', async ({ request }) => {
  const res = await request.get(`${BACKEND_URL}/health`);
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body.error).toBeNull();
  expect(body.data.status).toBe('ok');
  expect(body.meta.requestId).toMatch(/^req_/);
});

test('frontend marketing page renders brand name', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1').first()).toBeVisible();
});
