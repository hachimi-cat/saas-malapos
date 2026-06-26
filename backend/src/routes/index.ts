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
import tablesRouter from './tables.js';
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
import deliveryRouter from './delivery.js';
import marketingRouter from './marketing.js';
import marketingProxyRouter from './marketing-proxy.js';
import marketingMediaRouter from './marketing-media.js';
import marketingBlogRouter from './marketing/blog.js';
import marketingFeedsRouter from './marketing/feeds.js';
import marketingPixelsRouter from './marketing/pixels.js';
import marketingAbandonedCartRouter from './marketing/abandoned-cart.js';
import marketingReferralsRouter from './marketing/referrals.js';
import paymentsRouter from './payments.js';
import paymentPlansRouter from './payment/plans.js';
import paymentSubscriptionsRouter from './payment/subscriptions.js';
import paymentInvoicesRouter from './payment/invoices.js';
import paymentReceiptsRouter from './payment/receipts.js';
import paymentCustomersRouter from './payment/customers.js';
import paymentCheckoutSessionsRouter from './payment/checkout-sessions.js';
import paymentPayoutsRouter from './payment/payouts.js';
import paymentLedgerRouter from './payment/ledger.js';
import paymentReportsRouter from './payment/reports.js';
import paymentSettingsProxyRouter from './payment/plugipay-settings-proxy.js';
import fulfillmentShipmentsRouter from './fulfillment/shipments.js';
import fulfillmentShippingRouter from './fulfillment/shipping.js';
import fulfillmentWarehousesRouter from './fulfillment/warehouses.js';
import fulfillmentInventoryRouter from './fulfillment/inventory.js';
import fulfillmentShippingCreditsRouter from './fulfillment/shipping-credits.js';
import fulfillmentLicensesRouter from './fulfillment/licenses.js';
import fulfillmentDeliveriesRouter from './fulfillment/deliveries.js';
import webhooksPlugipayRouter from './webhooks-plugipay.js';
import webhooksFulkrumaRouter from './webhooks-fulkruma.js';
import apiKeysRouter from './api-keys.js';
import webhookSubscriptionsRouter from './webhook-subscriptions.js';
import giftCardsRouter from './gift-cards.js';
import kdsRouter from './kds.js';
import eventsRouter from './events.js';
import uploadsRouter from './uploads.js';

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
  router.use('/tables', requireAuth, tablesRouter);
  router.use('/inventory', requireAuth, inventoryRouter);
  router.use('/shifts', requireAuth, shiftsRouter);
  router.use('/suppliers', requireAuth, suppliersRouter);
  router.use('/purchase-orders', requireAuth, purchaseOrdersRouter);
  router.use('/customers', requireAuth, customersRouter);
  router.use('/gift-cards', requireAuth, giftCardsRouter);
  router.use('/kds', requireAuth, kdsRouter);
  // Realtime SSE stream powering the live F&B boards (KDS / floor / serve).
  // Account-scoped; emits a `change` event whenever a mutation touches a board.
  router.use('/events', requireAuth, eventsRouter);
  // Presigned direct-to-Spaces image uploads (product images).
  router.use('/uploads', requireAuth, uploadsRouter);
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

  /** Fulfillment (Fulkruma) delivery surface — proxy over the gated
   *  per-merchant Fulkruma client. requireAuth is applied per-route
   *  inside the router; calls 409 when the Fulfillment module is off. */
  router.use('/delivery', deliveryRouter);

  /** Fulfillment (Fulkruma) merchant resource surface — the full Fulkruma
   *  merchant menu (Digital deliveries, Licenses, Shipments, Shipping
   *  credits, Inventory, Warehouses, Shipping). Each is a pure proxy over
   *  the gated per-merchant Fulkruma client (requireMerchantClient → 409
   *  FULFILLMENT_MODULE_DISABLED when the module is off). requireAuth is
   *  applied at the mount here. These coexist with the POS sell-flow
   *  delivery surface on `/delivery` above (routes/delivery.ts) — no route
   *  collision: that surface stays the create-from-sale path. */
  router.use('/fulfillment/shipments', requireAuth, fulfillmentShipmentsRouter);
  router.use('/fulfillment/shipping-credits', requireAuth, fulfillmentShippingCreditsRouter);
  router.use('/fulfillment/shipping', requireAuth, fulfillmentShippingRouter);
  router.use('/fulfillment/warehouses', requireAuth, fulfillmentWarehousesRouter);
  router.use('/fulfillment/inventory', requireAuth, fulfillmentInventoryRouter);
  router.use('/fulfillment/licenses', requireAuth, fulfillmentLicensesRouter);
  router.use('/fulfillment/deliveries', requireAuth, fulfillmentDeliveriesRouter);

  /** Marketing (Ripllo) surface — discount-code CRUD + cart-preview
   *  validate + loyalty program config + member balance/history. Pure
   *  proxy over the gated per-merchant Ripllo client; requireAuth is
   *  applied per-route inside the router; calls 409 when the Marketing
   *  module is off. The sell-flow loyalty/discount stamping lives in
   *  lib/sell.ts + lib/refund.ts. */
  router.use('/marketing', requireAuth, marketingRouter);

  /** Marketing (Ripllo) full merchant surface — the storlaunch-parity
   *  Ripllo menu (campaigns, creators, briefs, contracts, programs,
   *  affiliate approvals, inbox, audience, channels, compose, funnels,
   *  referrals, abandoned-cart, pixels, feeds, blog). A generic
   *  passthrough forwards the WHOLE Ripllo merchant API verbatim
   *  (routes/marketing-proxy.ts) and a handful of thin typed routes wrap
   *  the SDK for the surfaces the portal consumes with typed clients
   *  (blog/feeds/pixels/abandoned-cart/referrals). Each is gated by
   *  requireMarketingClient → 409 MARKETING_MODULE_DISABLED when the
   *  module is off. requireAuth is applied at the mount here.
   *
   *  These live in the disjoint `/account/*` namespace, so they NEVER
   *  shadow the typed `/marketing/*` routes above (discount-codes +
   *  POS-native loyalty), which stay the source of truth for the
   *  sell-flow stamping. No route collision. */
  router.use('/account/marketing', requireAuth, marketingProxyRouter);
  /** Same-origin binary image passthrough (creator avatars + post
   *  thumbnails) — disjoint from the JSON-only `/account/marketing`
   *  catch-all so it can stream bytes. requireAuth accepts the BFF
   *  session cookie sent by same-origin `<img src>`. */
  router.use('/account/marketing-media', requireAuth, marketingMediaRouter);
  router.use('/account/blog/posts', requireAuth, marketingBlogRouter);
  router.use('/account/feeds', requireAuth, marketingFeedsRouter);
  router.use('/account/pixels', requireAuth, marketingPixelsRouter);
  router.use('/account/abandoned-cart', requireAuth, marketingAbandonedCartRouter);
  router.use('/account/referrals', requireAuth, marketingReferralsRouter);

  /** Payment (Plugipay) module — dynamic-QRIS at the sell screen + a
   *  workspace payments overview. Pure proxy over the gated per-merchant
   *  Plugipay client; requireAuth is applied per-route inside the router;
   *  calls 409 when the Payment module is off. The QRIS-settle webhook
   *  lives in /webhooks/plugipay (merchant-order branch). */
  router.use('/payments', paymentsRouter);

  /** Payment (Plugipay) merchant resource surface — the full Plugipay
   *  merchant menu (Checkout sessions, Plans, Subscriptions, Invoices,
   *  Receipts, Customers, Payouts, Ledger, Reports, and a generic
   *  settings passthrough for Providers/Payment methods/Templates). Each
   *  is a pure proxy over the gated per-merchant Plugipay client
   *  (requireMerchantClient → 409 PAYMENT_MODULE_DISABLED when the module
   *  is off). requireAuth is applied at the mount here. These coexist
   *  with the POS dynamic-QRIS surface on `/payments` above. */
  router.use('/payments/checkout-sessions', requireAuth, paymentCheckoutSessionsRouter);
  router.use('/payments/plans', requireAuth, paymentPlansRouter);
  router.use('/payments/subscriptions', requireAuth, paymentSubscriptionsRouter);
  router.use('/payments/invoices', requireAuth, paymentInvoicesRouter);
  router.use('/payments/receipts', requireAuth, paymentReceiptsRouter);
  router.use('/payments/customers', requireAuth, paymentCustomersRouter);
  router.use('/payments/payouts', requireAuth, paymentPayoutsRouter);
  router.use('/payments/ledger', requireAuth, paymentLedgerRouter);
  router.use('/payments/reports', requireAuth, paymentReportsRouter);
  router.use('/payments/plugipay-settings', requireAuth, paymentSettingsProxyRouter);

  /** Inbound Plugipay webhooks (tier checkout completion). Signature-
   *  verified inside the handler; no auth middleware. */
  router.use('/webhooks/plugipay', webhooksPlugipayRouter);

  /** Inbound Fulkruma webhooks (shipment status → sale delivery status).
   *  Signature-verified inside the handler; no auth middleware. */
  router.use('/webhooks/fulkruma', webhooksFulkrumaRouter);

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
