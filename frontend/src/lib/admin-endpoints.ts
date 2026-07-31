import type { AdminEndpoints } from '@forjio/admin-ui';

/*
 * Where Malapos serves the admin-portal standard, FROM THE BROWSER.
 *
 * This is declared rather than inherited on purpose. @forjio/admin-ui
 * defaults to `/api/v1/console/admin/*`, which is correct only for the
 * products whose BFF proxy forwards `/api/v1/console/X` straight through
 * to `/api/v1/X`. Malapos's proxy REWRITES `console/X` to `admin/X`
 * (see app/api/v1/console/[...path]/route.ts), so the default resolved to
 * `/api/v1/admin/admin/*` and every admin page 404'd in the browser while
 * the backend routes themselves answered correctly — which is exactly why
 * curling the backend did not catch it.
 *
 * Every admin page imports these instead of spelling paths out, so the
 * proxy and the pages can never drift apart again.
 */
export const MALAPOS_ADMIN_ENDPOINTS: AdminEndpoints = {
  metrics: '/api/v1/console/metrics',
  health: '/api/v1/console/system-health',
  featureFlags: '/api/v1/console/feature-flags',
  customers: '/api/v1/console/customers',
  transactions: '/api/v1/console/transactions',
};
