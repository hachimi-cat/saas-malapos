import { Router } from 'express';
import { sendOk, sendErr } from '../lib/http.js';
import {
  fetchAppUsers,
  fetchAppStats,
  huudisAppConfigured,
} from '../lib/huudis-app.js';

/*
 * GET /api/v1/admin/customers — this product's own users, pulled from
 * Huudis (`/app/users`) using the product's OIDC client credentials.
 * Mounted behind `adminGuard`. Powers the admin "Customers" view.
 */

const router = Router();

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}

router.get('/', async (req, res) => {
  if (!huudisAppConfigured()) {
    return sendErr(
      res,
      req,
      503,
      'HUUDIS_NOT_CONFIGURED',
      'HUUDIS_CLIENT_ID / HUUDIS_CLIENT_SECRET must be set to list customers.',
    );
  }
  try {
    const status = str(req.query.status) as 'all' | 'active' | 'disabled' | undefined;
    const limitRaw = str(req.query.limit);
    const [page, stats] = await Promise.all([
      fetchAppUsers({
        q: str(req.query.q),
        status,
        limit: limitRaw ? Number(limitRaw) : undefined,
        cursor: str(req.query.cursor),
      }),
      fetchAppStats().catch(() => null),
    ]);
    return sendOk(res, req, { ...page, stats });
  } catch (e) {
    return sendErr(res, req, 502, 'HUUDIS_ERROR', (e as Error).message);
  }
});

export default router;
