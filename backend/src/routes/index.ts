import { Router } from 'express';
import type { Router as ExpressRouter } from 'express';
import { sendOk } from '../lib/http.js';
import { prisma } from '../lib/db.js';
import authRouter from './auth.js';
import huudisProxyRouter from './huudis-proxy.js';
import { adminGuard } from '../middleware/admin-guard.js';
import { requireAuth } from '../middleware/auth.js';
import adminCustomersRouter from './admin-customers.js';
import adminCrmRouter from './admin-crm.js';
import outletsRouter from './outlets.js';
import categoriesRouter from './categories.js';
import productsRouter from './products.js';
import salesRouter from './sales.js';
import inventoryRouter from './inventory.js';
import shiftsRouter from './shifts.js';
import suppliersRouter from './suppliers.js';
import purchaseOrdersRouter from './purchase-orders.js';
import customersRouter from './customers.js';
import reportsRouter from './reports.js';
import settingsRouter from './settings.js';
import modifiersRouter from './modifiers.js';
import billingRouter from './billing.js';
import modulesRouter from './modules.js';
import webhooksPlugipayRouter from './webhooks-plugipay.js';
import apiKeysRouter from './api-keys.js';
import webhookSubscriptionsRouter from './webhook-subscriptions.js';
import giftCardsRouter from './gift-cards.js';
import kdsRouter from './kds.js';

/**
 * Route factory. Ported from saas-plugipay.
 *
 * Every product's `app.ts` calls this with `createApp({
 * enableTestOnlyRoutes })`; pass `true` in tests that need the
 * `/test-only/*` mount (e.g. to stub auth context). Never enable in
 * production.
 */
export interface RoutesOptions {
  enableTestOnlyRoutes?: boolean;
}

async function checkDb(): Promise<'ok' | 'error'> {
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    return 'ok';
  } catch {
    return 'error';
  }
}

async function checkOutbox(): Promise<'ok' | 'error'> {
  try {
    await prisma.outboxEvent.count();
    return 'ok';
  } catch {
    return 'error';
  }
}

export default function routes(_opts: RoutesOptions = {}): ExpressRouter {
  const router = Router();

  /** GET /api/v1/health — no auth, returns service name + status +
   *  dependency checks. Every Forjio service exposes the same shape
   *  so uptime monitors are uniform. */
  router.get('/health', async (req, res) => {
    const [db, outbox] = await Promise.all([checkDb(), checkOutbox()]);
    sendOk(res, req, {
      service: process.env.FORJIO_SERVICE ?? 'malapos',
      status: 'ok',
      version: process.env.npm_package_version ?? '0.0.1',
      checks: { db, outbox },
    });
  });

  /** Auth — cookie-first Huudis SSO. Login/signup/password-reset/OIDC.
   *  Powers the `(auth)` pages + the `(dashboard)` gate. */
  router.use('/auth', authRouter);

  /** Huudis IAM proxy — account + workspace management. The frontend
   *  calls /api/v1/huudis/{account,account/workspaces,iam/users} and
   *  the kit forwards them to Huudis with the server-side token. */
  router.use('/huudis', huudisProxyRouter);

  /** Admin "Customers" — this product's own users, pulled from Huudis
   *  via the product's OIDC client creds. Proxied from the admin portal
   *  at /api/v1/console/customers. */
  router.use('/admin/customers', adminGuard, adminCustomersRouter);

  /** Admin CRM — the standardized Forjio stats/customers/transactions
   *  contract for the central admin portal (malapos semantics: merchant
   *  workspaces + their POS sales). */
  router.use('/admin/crm', adminGuard, adminCrmRouter);

  // ── Malapos POS domain (all behind the Huudis session / Bearer auth) ──
  router.use('/outlets', requireAuth, outletsRouter);
  router.use('/categories', requireAuth, categoriesRouter);
  router.use('/products', requireAuth, productsRouter);
  router.use('/modifiers', requireAuth, modifiersRouter);
  router.use('/sales', requireAuth, salesRouter);
  router.use('/inventory', requireAuth, inventoryRouter);
  router.use('/shifts', requireAuth, shiftsRouter);
  router.use('/suppliers', requireAuth, suppliersRouter);
  router.use('/purchase-orders', requireAuth, purchaseOrdersRouter);
  router.use('/customers', requireAuth, customersRouter);
  router.use('/gift-cards', requireAuth, giftCardsRouter);
  router.use('/kds', requireAuth, kdsRouter);
  router.use('/reports', requireAuth, reportsRouter);
  router.use('/settings', requireAuth, settingsRouter);
  // Developer surface — programmatic API keys + outbound webhook
  // subscriptions (the keys themselves authenticate API callers via
  // middleware/auth.ts Path 1; deliveries fan out from the outbox worker).
  router.use('/api-keys', requireAuth, apiKeysRouter);
  router.use('/webhook-subscriptions', requireAuth, webhookSubscriptionsRouter);
  // Billing — public /tiers; per-route requireAuth inside the router for
  // the workspace plan + Plugipay checkout/cancel.
  router.use('/billing', billingRouter);

  // Partner modules — payment/Plugipay, fulfillment/Fulkruma,
  // marketing/Ripllo. GET registry + POST toggle (requireAuth is
  // applied per-route inside the router). First enable auto-provisions
  // the partner workspace.
  router.use('/modules', modulesRouter);

  /** Inbound Plugipay webhooks (tier checkout completion). Signature-
   *  verified inside the handler; no auth middleware. */
  router.use('/webhooks/plugipay', webhooksPlugipayRouter);

  // Products mount their own routers here, e.g.:
  //   router.use('/widgets', widgetsRouter);
  //
  // Admin surfaces — mount product admin routers under `/admin`,
  // behind `adminGuard` (middleware/admin-guard.ts). The built-in
  // admin portal proxies to them via `/api/v1/console/*`:
  //   import { adminGuard } from '../middleware/admin-guard.js';
  //   router.use('/admin/widgets', adminGuard, adminWidgetsRouter);
  //
  // if (opts.enableTestOnlyRoutes) {
  //   router.use('/test-only', testOnlyRouter);
  // }

  return router;
}
