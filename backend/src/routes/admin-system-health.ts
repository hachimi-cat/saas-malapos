import { Router } from 'express';
import { sendOk, sendErr } from '../lib/http.js';
import { collectSystemHealth, httpCheck } from '../lib/system-health.js';
import { plugipayConfigured } from '../lib/plugipay.js';

/*
 * GET /api/v1/admin/system-health — malapos's operator health view.
 *
 * Mounted behind `adminGuard`; powers `SystemHealthPanel`. Mandatory
 * admin-portal standard.
 *
 * Distinct from the unauthenticated `/health` liveness probe: this one
 * reaches the database and every configured integration, so it is
 * authenticated (it reveals dependency topology) and the panel polls it
 * at 30s. An UNCONFIGURED integration reports 'skipped', never omitted —
 * for a POS, "QRIS payments are not wired up" and "QRIS is healthy" are
 * the difference between a merchant taking money and not.
 */

const router = Router();

function familyProbe(key: string, label: string, base: string | undefined, configured: boolean) {
  return async () => {
    if (!configured || !base) return null;
    const out = await httpCheck(`${base.replace(/\/$/, '')}/health`)();
    return { key, label, status: out.status ?? ('ok' as const), detail: out.detail ?? null };
  };
}

router.get('/', async (req, res) => {
  try {
    return sendOk(
      res,
      req,
      await collectSystemHealth({
        plugipay: familyProbe(
          'plugipay',
          'Plugipay (billing + QRIS)',
          process.env.PLUGIPAY_BASE_URL,
          plugipayConfigured(),
        ),
      }),
    );
  } catch (e) {
    return sendErr(res, req, 500, 'HEALTH_COLLECT_FAILED', (e as Error).message);
  }
});

export default router;
