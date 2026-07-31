import { Router } from 'express';
import { sendOk, sendErr } from '../lib/http.js';
import {
  getFeatureFlag,
  listFeatureFlags,
  updateFeatureFlag,
  type FeatureFlagPatch,
} from '../lib/feature-flags.js';

/*
 * GET   /api/v1/admin/feature-flags        — every flag
 * PATCH /api/v1/admin/feature-flags/:key   — toggle / set rollout / edit copy
 *
 * Mounted behind `adminGuard`. Part of the mandatory admin-portal
 * standard; powers `FeatureFlagsPanel` from @forjio/admin-ui.
 *
 * There is no POST. Flags are declared in code via `ensureFeatureFlag()`
 * and registered at boot, because a flag that exists in the database but
 * that nothing reads is worse than useless — it looks like a working
 * control and does nothing.
 */

const router = Router();

router.get('/', async (req, res) => {
  try {
    return sendOk(res, req, await listFeatureFlags());
  } catch (e) {
    return sendErr(res, req, 500, 'FEATURE_FLAGS_ERROR', (e as Error).message);
  }
});

router.patch('/:key', async (req, res) => {
  const key = req.params.key;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const patch: FeatureFlagPatch = {};

  if ('enabled' in body) {
    if (typeof body.enabled !== 'boolean') {
      return sendErr(res, req, 400, 'INVALID_ENABLED', '`enabled` must be a boolean.');
    }
    patch.enabled = body.enabled;
  }
  if ('rollout' in body) {
    const r = body.rollout;
    // null is meaningful here (all-or-nothing), so it is accepted rather
    // than treated as "field absent".
    if (r !== null && (typeof r !== 'number' || !Number.isInteger(r) || r < 0 || r > 100)) {
      return sendErr(
        res,
        req,
        400,
        'INVALID_ROLLOUT',
        '`rollout` must be null or an integer 0-100.',
      );
    }
    patch.rollout = r as number | null;
  }
  if ('label' in body) {
    if (typeof body.label !== 'string' || !body.label.trim()) {
      return sendErr(res, req, 400, 'INVALID_LABEL', '`label` must be a non-empty string.');
    }
    patch.label = body.label.trim();
  }
  if ('description' in body) {
    if (body.description !== null && typeof body.description !== 'string') {
      return sendErr(
        res,
        req,
        400,
        'INVALID_DESCRIPTION',
        '`description` must be a string or null.',
      );
    }
    patch.description = body.description as string | null;
  }

  if (Object.keys(patch).length === 0) {
    return sendErr(res, req, 400, 'EMPTY_PATCH', 'Nothing to update.');
  }

  try {
    // 404 before the write so a typo'd key reads as "no such flag" rather
    // than silently succeeding against nothing.
    if (!(await getFeatureFlag(key))) {
      return sendErr(res, req, 404, 'FLAG_NOT_FOUND', `No feature flag "${key}".`);
    }
    const updated = await updateFeatureFlag(key, patch, req.auth?.sub ?? null);
    if (!updated) {
      return sendErr(res, req, 404, 'FLAG_NOT_FOUND', `No feature flag "${key}".`);
    }
    return sendOk(res, req, updated);
  } catch (e) {
    return sendErr(res, req, 400, 'FEATURE_FLAG_WRITE_FAILED', (e as Error).message);
  }
});

export default router;
