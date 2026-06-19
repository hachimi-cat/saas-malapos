import { Router } from 'express';
import { z } from 'zod';
import { RiplloError } from '@forjio/ripllo-node';
import { sendOk, sendCreated, sendList, sendErr } from '../lib/http.js';
import { h as asyncHandler } from '../lib/async-handler.js';
import { requireMarketingClient } from '../services/ripllo-module-service.js';

/*
 * /api/v1/marketing — the Marketing (Ripllo) module surface for Malapos.
 *
 * A pure proxy over the gated per-merchant Ripllo client
 * (services/ripllo-module-service.requireMarketingClient → throws
 * marketing_module_disabled/409 when the module is off). Ripllo owns all
 * discount-code + loyalty state; Malapos mirrors NOTHING — it just relays
 * (the family "proxy don't mirror" rule). Two surfaces:
 *
 *   /discount-codes          CRUD + cart-preview validate (storlaunch parity)
 *   /loyalty/program         GET/PUT the merchant's points program
 *   /loyalty/members/:id     a customer's balance + ledger history
 *
 * Mounted behind requireAuth in routes/index.ts. The sell-flow stamping
 * (earn on sale, redeem at checkout, void on refund) lives in lib/sell.ts
 * + lib/refund.ts — this router is the merchant-portal management surface.
 */

const router = Router();

/** Translate a thrown Ripllo/module error into the Malapos envelope.
 *  The module gate throws a plain Error with code/status; the SDK throws
 *  RiplloError. Everything else bubbles to the express error handler. */
function sendRiplloErr(
  res: Parameters<typeof sendErr>[0],
  req: Parameters<typeof sendErr>[1],
  err: unknown,
) {
  const e = err as Error & { status?: number; code?: string; name?: string };
  if (e.code === 'marketing_module_disabled') {
    return sendErr(res, req, 409, 'MARKETING_MODULE_DISABLED', e.message);
  }
  if (e instanceof RiplloError || e.name === 'RiplloError') {
    const status = e.status && e.status >= 400 ? e.status : 502;
    return sendErr(res, req, status, e.code || 'RIPLLO_ERROR', e.message);
  }
  if (e.status && e.code) return sendErr(res, req, e.status, e.code, e.message);
  return sendErr(res, req, 502, 'RIPLLO_ERROR', e.message || 'Marketing request failed');
}

// ── Discount codes ──────────────────────────────────────────────────

const discountTypes = ['percent', 'fixed', 'shipping_percent', 'shipping_fixed'] as const;
const discountScopes = ['cart', 'products', 'tags'] as const;

const createCodeSchema = z.object({
  code: z.string().trim().min(1).max(50),
  description: z.string().max(500).optional().nullable(),
  type: z.enum(discountTypes),
  value: z.number().int().positive(),
  currency: z.string().length(3).optional(),
  scope: z.enum(discountScopes).optional(),
  productIds: z.array(z.string()).optional(),
  tagFilter: z.array(z.string()).optional(),
  minPurchaseAmount: z.number().int().nonnegative().optional().nullable(),
  maxUsesTotal: z.number().int().positive().optional().nullable(),
  maxUsesPerCustomer: z.number().int().positive().optional().nullable(),
  startsAt: z.string().datetime().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
  active: z.boolean().optional(),
  public: z.boolean().optional(),
});

const updateCodeSchema = createCodeSchema.partial().extend({
  code: z.undefined().optional(),
});

router.get(
  '/discount-codes',
  asyncHandler(async (req, res) => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 100);
      const cursor = req.query.cursor ? String(req.query.cursor) : undefined;
      const active = req.query.active !== undefined ? String(req.query.active) === 'true' : undefined;
      const client = await requireMarketingClient(req.auth!.accountId as string);
      const page = await client.discountCodes.list({ limit, cursor, active });
      return sendList(res, req, page.items, page.nextCursor, page.hasMore);
    } catch (err) {
      return sendRiplloErr(res, req, err);
    }
  }),
);

router.get(
  '/discount-codes/:id',
  asyncHandler(async (req, res) => {
    try {
      const client = await requireMarketingClient(req.auth!.accountId as string);
      const row = await client.discountCodes.get(String(req.params.id));
      return sendOk(res, req, row);
    } catch (err) {
      return sendRiplloErr(res, req, err);
    }
  }),
);

router.post(
  '/discount-codes',
  asyncHandler(async (req, res) => {
    try {
      const body = createCodeSchema.parse(req.body ?? {});
      const client = await requireMarketingClient(req.auth!.accountId as string);
      // Malapos is IDR-only at the POS; default the currency so the
      // merchant never has to think about it.
      const row = await client.discountCodes.create({ currency: 'IDR', ...body });
      return sendCreated(res, req, row);
    } catch (err) {
      if ((err as { code?: string })?.code === 'CODE_EXISTS') {
        return sendErr(res, req, 409, 'CODE_EXISTS', 'A discount code with that name already exists');
      }
      return sendRiplloErr(res, req, err);
    }
  }),
);

router.patch(
  '/discount-codes/:id',
  asyncHandler(async (req, res) => {
    try {
      const body = updateCodeSchema.parse(req.body ?? {});
      const client = await requireMarketingClient(req.auth!.accountId as string);
      const row = await client.discountCodes.update(String(req.params.id), body);
      return sendOk(res, req, row);
    } catch (err) {
      return sendRiplloErr(res, req, err);
    }
  }),
);

router.delete(
  '/discount-codes/:id',
  asyncHandler(async (req, res) => {
    try {
      const client = await requireMarketingClient(req.auth!.accountId as string);
      const row = await client.discountCodes.archive(String(req.params.id));
      return sendOk(res, req, row);
    } catch (err) {
      return sendRiplloErr(res, req, err);
    }
  }),
);

/** Cart preview — dry-run a code against a cart (mirrors storlaunch's
 *  /validate-discount). The POS calls this before ringing up to show the
 *  applied discount; the binding redemption happens at sale completion
 *  inside lib/sell.ts. */
const validateSchema = z.object({
  code: z.string().trim().min(1).max(50),
  subtotal: z.number().int().nonnegative(),
  customerId: z.string().trim().nullish(),
  shippingCost: z.number().int().nonnegative().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().nullish(),
        price: z.number().int().nonnegative(),
        quantity: z.number().int().positive(),
        tags: z.array(z.string()).optional(),
      }),
    )
    .optional(),
});

router.post(
  '/discount-codes/validate',
  asyncHandler(async (req, res) => {
    try {
      const body = validateSchema.parse(req.body ?? {});
      const client = await requireMarketingClient(req.auth!.accountId as string);
      const result = await client.discountCodes.validate({
        // The client is already scoped to the merchant's Ripllo workspace
        // via forMerchant() (X-Ripllo-On-Behalf-Of). ValidateInput still
        // carries an accountId in the body; the Ripllo backend keys the
        // validation off the on-behalf-of scope, so we forward the malapos
        // workspace id here purely to satisfy the SDK's input shape.
        accountId: req.auth!.accountId as string,
        code: body.code,
        subtotal: body.subtotal,
        currency: 'IDR',
        shippingCost: body.shippingCost,
        customerId: body.customerId ?? null,
        items: body.items,
      });
      return sendOk(res, req, result);
    } catch (err) {
      return sendRiplloErr(res, req, err);
    }
  }),
);

// ── Loyalty program ─────────────────────────────────────────────────

const loyaltyProgramSchema = z.object({
  enabled: z.boolean().optional(),
  earnRatePoints: z.number().nonnegative(),
  redeemValueIdr: z.number().nonnegative(),
  marketingCampaignId: z.string().nullish(),
});

router.get(
  '/loyalty/program',
  asyncHandler(async (req, res) => {
    try {
      const client = await requireMarketingClient(req.auth!.accountId as string);
      const program = await client.loyalty.getProgram();
      return sendOk(res, req, program);
    } catch (err) {
      return sendRiplloErr(res, req, err);
    }
  }),
);

router.put(
  '/loyalty/program',
  asyncHandler(async (req, res) => {
    try {
      const body = loyaltyProgramSchema.parse(req.body ?? {});
      const client = await requireMarketingClient(req.auth!.accountId as string);
      const program = await client.loyalty.putProgram(body);
      return sendOk(res, req, program);
    } catch (err) {
      return sendRiplloErr(res, req, err);
    }
  }),
);

/** Member lookup — balance + recent ledger for one customer. The POS
 *  uses this to show points at the till + offer redemption. customerId is
 *  the Malapos Customer id (Ripllo keys its member rows on it via the
 *  earn/redeem externalRef flow). */
router.get(
  '/loyalty/members/:customerId',
  asyncHandler(async (req, res) => {
    try {
      const customerId = String(req.params.customerId);
      const client = await requireMarketingClient(req.auth!.accountId as string);
      const [balance, history] = await Promise.all([
        client.loyalty.balance(customerId),
        client.loyalty.history(customerId, { limit: 50 }),
      ]);
      return sendOk(res, req, { balance, history: history.items });
    } catch (err) {
      return sendRiplloErr(res, req, err);
    }
  }),
);

export default router;
