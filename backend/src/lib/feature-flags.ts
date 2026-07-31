/*
 * Feature flags — the store + the evaluation helper.
 *
 * Part of the mandatory admin-portal standard (see
 * forjio/documentation/2. Technical/13-Admin-Portal-Standard.md). Before
 * the standard this existed in exactly one of thirteen Forjio products.
 *
 * Two separate audiences use this file:
 *   - the admin routes, which LIST and WRITE flags (behind adminGuard);
 *   - product code, which asks `isEnabled('some.flag', subjectId)` on a
 *     request path and must never pay a database round trip for it.
 *
 * Hence the cache. It is deliberately tiny and deliberately short-lived:
 * a flag flip has to take effect without a redeploy, and an operator
 * watching an incident will not wait five minutes to see their toggle
 * land.
 */

import { createHash } from 'node:crypto';
import { prisma } from './db.js';
import { newId } from './ids.js';

export interface FeatureFlagRow {
  key: string;
  label: string;
  description: string | null;
  enabled: boolean;
  rollout: number | null;
  updatedAt: string;
  updatedBy: string | null;
}

export interface FeatureFlagPatch {
  enabled?: boolean;
  rollout?: number | null;
  label?: string;
  description?: string | null;
}

/** How long a cached flag set is trusted. Short enough that a toggle feels
 *  immediate, long enough that a hot request path is not querying Postgres
 *  per call. */
const CACHE_TTL_MS = 10_000;

let cache: { at: number; flags: Map<string, FeatureFlagRow> } | null = null;

function toRow(f: {
  key: string;
  label: string;
  description: string | null;
  enabled: boolean;
  rollout: number | null;
  updatedAt: Date;
  updatedBy: string | null;
}): FeatureFlagRow {
  return {
    key: f.key,
    label: f.label,
    description: f.description,
    enabled: f.enabled,
    rollout: f.rollout,
    updatedAt: f.updatedAt.toISOString(),
    updatedBy: f.updatedBy,
  };
}

async function loadAll(): Promise<Map<string, FeatureFlagRow>> {
  const rows = await prisma.featureFlag.findMany({ orderBy: { key: 'asc' } });
  return new Map(rows.map((r) => [r.key, toRow(r)]));
}

/** Drop the cache. Called after every write so the operator who just
 *  flipped a flag sees it on their next read rather than up to TTL later. */
export function invalidateFeatureFlagCache(): void {
  cache = null;
}

async function cached(): Promise<Map<string, FeatureFlagRow>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.flags;
  const flags = await loadAll();
  cache = { at: Date.now(), flags };
  return flags;
}

/** Every flag, for the admin portal. Always a fresh read — an operator
 *  screen must never show a cached toggle state. */
export async function listFeatureFlags(): Promise<FeatureFlagRow[]> {
  const flags = await loadAll();
  cache = { at: Date.now(), flags };
  return [...flags.values()];
}

/**
 * Is this flag on for this subject?
 *
 * `subjectId` is whatever the rollout should be stable across — a user id,
 * an account id, a workspace id. Stability matters more than uniformity:
 * the same subject must get the same answer on every request, or a 50%
 * rollout means every user sees the feature flicker on and off. Hashing
 * the subject (rather than `Math.random()`) is what buys that.
 *
 * An unknown key is FALSE, never an error. A missing flag is the safest
 * possible answer and a typo in app code must not take a request down.
 */
export async function isEnabled(
  key: string,
  subjectId?: string | null,
): Promise<boolean> {
  const flag = (await cached()).get(key);
  if (!flag || !flag.enabled) return false;
  if (flag.rollout == null) return true;
  if (flag.rollout <= 0) return false;
  if (flag.rollout >= 100) return true;
  // No subject to be stable across → fall back to all-or-nothing rather
  // than randomising, which would make the flag non-deterministic.
  if (!subjectId) return true;
  const h = createHash('sha256').update(`${key}:${subjectId}`).digest();
  return h.readUInt16BE(0) % 100 < flag.rollout;
}

/** Synchronous read of the already-cached set, for code that cannot await.
 *  Returns `false` when the cache is cold rather than blocking. */
export function isEnabledCached(key: string, subjectId?: string | null): boolean {
  const flag = cache?.flags.get(key);
  if (!flag || !flag.enabled) return false;
  if (flag.rollout == null) return true;
  if (flag.rollout <= 0) return false;
  if (flag.rollout >= 100) return true;
  if (!subjectId) return true;
  const h = createHash('sha256').update(`${key}:${subjectId}`).digest();
  return h.readUInt16BE(0) % 100 < flag.rollout;
}

export async function getFeatureFlag(key: string): Promise<FeatureFlagRow | null> {
  const row = await prisma.featureFlag.findUnique({ where: { key } });
  return row ? toRow(row) : null;
}

/**
 * Apply a patch and write an audit row in the SAME transaction — an audit
 * trail that can be missing exactly when the write succeeded is worse than
 * none, because it is trusted.
 */
export async function updateFeatureFlag(
  key: string,
  patch: FeatureFlagPatch,
  actor: string | null,
): Promise<FeatureFlagRow | null> {
  if (patch.rollout != null && (patch.rollout < 0 || patch.rollout > 100)) {
    throw new Error('rollout must be between 0 and 100');
  }
  const before = await prisma.featureFlag.findUnique({ where: { key } });
  if (!before) return null;

  const updated = await prisma.$transaction(async (tx) => {
    const after = await tx.featureFlag.update({
      where: { key },
      data: { ...patch, updatedBy: actor },
    });
    await tx.featureFlagAudit.create({
      data: {
        id: newId('ffa'),
        key,
        actor,
        before: { enabled: before.enabled, rollout: before.rollout },
        after: { enabled: after.enabled, rollout: after.rollout },
      },
    });
    return after;
  });

  invalidateFeatureFlagCache();
  return toRow(updated);
}

/**
 * Register a flag the product's code depends on. Idempotent, and it does
 * NOT overwrite `enabled`/`rollout` on an existing row — a redeploy must
 * never silently re-enable something an operator turned off during an
 * incident. Label and description are refreshed, since those are
 * developer-authored copy.
 */
export async function ensureFeatureFlag(def: {
  key: string;
  label: string;
  description?: string | null;
  defaultEnabled?: boolean;
}): Promise<void> {
  await prisma.featureFlag.upsert({
    where: { key: def.key },
    create: {
      key: def.key,
      label: def.label,
      description: def.description ?? null,
      enabled: def.defaultEnabled ?? false,
    },
    update: { label: def.label, description: def.description ?? null },
  });
  invalidateFeatureFlagCache();
}
