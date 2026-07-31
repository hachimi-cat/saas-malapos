/*
 * System health — the operator's view of this deployment.
 *
 * Part of the mandatory admin-portal standard. Before it, zero of the
 * thirteen Forjio products had a health page in their admin portal; the
 * shape here is catentio's customer-portal System Health, generalised so
 * every product can serve it.
 *
 * Two rules the callers must not break:
 *
 *   - `skipped` is NOT `ok`. An integration with no credentials
 *     configured reports 'skipped'. "We never checked" and "it is
 *     healthy" must never look the same to someone deciding whether to
 *     page themselves at 3am.
 *   - `queues: null` means this product HAS no queues. `queues: []`
 *     means it has them and they are drained. Collapsing the two throws
 *     away a real fact.
 *
 * Every check is wrapped so one failing probe degrades its own row rather
 * than 500-ing the whole page — a health endpoint that goes down with the
 * thing it monitors is the one you cannot use.
 */

import os from 'node:os';
import { statfs } from 'node:fs/promises';
import { prisma } from './db.js';
import { huudisAppConfigured } from './huudis-app.js';

export type CheckStatus = 'ok' | 'degraded' | 'down' | 'skipped';

export interface HealthCheck {
  key: string;
  label: string;
  status: CheckStatus;
  latencyMs: number | null;
  detail: string | null;
}

export interface SystemHealth {
  status: 'ok' | 'degraded' | 'down';
  checks: HealthCheck[];
  host: {
    uptimeSeconds: number | null;
    memory: { usedBytes: number; totalBytes: number } | null;
    disk: { usedBytes: number; totalBytes: number } | null;
  };
  deploy: { version: string | null; builtAt: string | null; commit: string | null };
  queues: { name: string; depth: number; oldestAgeSeconds: number | null }[] | null;
  checkedAt: string;
}

/** A product-supplied probe. Return `null` to declare the check
 *  inapplicable — it will be reported as 'skipped', not omitted. */
export type ExtraCheck = () => Promise<Omit<HealthCheck, 'latencyMs'> | null>;

/** Anything slower than this is alive but not well. */
const DEGRADED_MS = 1_000;
const PROBE_TIMEOUT_MS = 5_000;

async function timed(
  key: string,
  label: string,
  fn: () => Promise<{ status?: CheckStatus; detail?: string | null } | void>,
): Promise<HealthCheck> {
  const started = Date.now();
  try {
    const out = await Promise.race([
      fn(),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error(`timed out after ${PROBE_TIMEOUT_MS}ms`)), PROBE_TIMEOUT_MS),
      ),
    ]);
    const latencyMs = Date.now() - started;
    const explicit = (out ?? {}) as { status?: CheckStatus; detail?: string | null };
    return {
      key,
      label,
      status: explicit.status ?? (latencyMs > DEGRADED_MS ? 'degraded' : 'ok'),
      latencyMs,
      detail:
        explicit.detail ??
        (latencyMs > DEGRADED_MS ? `slow: ${latencyMs}ms` : null),
    };
  } catch (e) {
    return {
      key,
      label,
      status: 'down',
      latencyMs: Date.now() - started,
      detail: (e as Error).message,
    };
  }
}

async function diskUsage(): Promise<{ usedBytes: number; totalBytes: number } | null> {
  try {
    // statfs is unavailable on some platforms and inside some sandboxes;
    // a missing disk reading is not a health failure.
    const s = await statfs('/');
    const totalBytes = Number(s.blocks) * Number(s.bsize);
    const freeBytes = Number(s.bfree) * Number(s.bsize);
    if (!totalBytes) return null;
    return { usedBytes: totalBytes - freeBytes, totalBytes };
  } catch {
    return null;
  }
}

/**
 * `_prisma_migrations` is Prisma's own bookkeeping table. Reading it
 * directly is the only way to answer "did this deploy actually finish its
 * migrations" from inside the running process — a service happily serving
 * traffic against a half-migrated schema is the failure this catches.
 */
async function migrationCheck(): Promise<{ status?: CheckStatus; detail?: string | null }> {
  // Oldest-first and UNBOUNDED, both deliberately. Oldest-first so the last
  // row seen for a migration name is its most recent attempt; unbounded
  // because a `LIMIT 20` means a genuinely broken migration stops being
  // reported the moment twenty newer ones land on top of it. The table
  // holds one row per migration attempt — tens of rows, not a scan worth
  // optimising away.
  const rows = await prisma.$queryRawUnsafe<
    { migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]
  >(
    'SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at ASC',
  );

  // Judge only the LATEST attempt per migration. Prisma appends a NEW row
  // when a rolled-back migration is reapplied and leaves the failed one in
  // place forever, so treating every row as current turns "a migration
  // broke once and was fixed in May" into a permanent red status page —
  // which is exactly how an operator learns to stop believing it. Verified
  // on linksnap and storlaunch, both of which reported 'down' while
  // serving traffic perfectly well against a correct schema.
  const latest = new Map<string, { finished_at: Date | null; rolled_back_at: Date | null }>();
  for (const r of rows) latest.set(r.migration_name, r);
  const entries = [...latest.entries()];

  const failed = entries.filter(([, r]) => r.rolled_back_at != null);
  const pending = entries.filter(([, r]) => r.finished_at == null && r.rolled_back_at == null);
  const first = failed[0];
  if (first) {
    return { status: 'down', detail: `${failed.length} rolled back: ${first[0]}` };
  }
  const stuck = pending[0];
  if (stuck) {
    return { status: 'degraded', detail: `${pending.length} unfinished: ${stuck[0]}` };
  }
  const newest = rows[rows.length - 1];
  return {
    detail: newest
      ? `${latest.size} applied · latest ${newest.migration_name}`
      : 'no migrations recorded',
  };
}

/**
 * Probe an HTTP integration. A NON-2xx that still answers means the
 * dependency is reachable and talking — that is 'degraded', not 'down',
 * and the distinction is what tells an operator whether to look at the
 * network or at the service.
 */
export function httpCheck(url: string, init?: RequestInit) {
  return async (): Promise<{ status?: CheckStatus; detail?: string | null }> => {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    if (res.ok) return {};
    return { status: 'degraded', detail: `HTTP ${res.status}` };
  };
}

export async function collectSystemHealth(
  extra: Record<string, ExtraCheck> = {},
): Promise<SystemHealth> {
  const checks: HealthCheck[] = [];

  checks.push(
    await timed('db', 'Database', async () => {
      await prisma.$queryRawUnsafe('SELECT 1');
    }),
  );
  checks.push(await timed('migrations', 'Migrations', migrationCheck));

  // Integrations. Only ones this product actually configures are probed;
  // the rest report 'skipped' so the row is present and honest.
  if (huudisAppConfigured()) {
    const issuer = process.env.HUUDIS_ISSUER ?? 'https://huudis.com';
    checks.push(
      await timed('huudis', 'Huudis (identity)', httpCheck(`${issuer}/.well-known/openid-configuration`)),
    );
  } else {
    checks.push({
      key: 'huudis',
      label: 'Huudis (identity)',
      status: 'skipped',
      latencyMs: null,
      detail: 'HUUDIS_CLIENT_ID / HUUDIS_CLIENT_SECRET not set',
    });
  }

  for (const [key, probe] of Object.entries(extra)) {
    const started = Date.now();
    try {
      const out = await probe();
      checks.push(
        out
          ? { ...out, latencyMs: Date.now() - started }
          : { key, label: key, status: 'skipped', latencyMs: null, detail: 'not configured' },
      );
    } catch (e) {
      checks.push({
        key,
        label: key,
        status: 'down',
        latencyMs: Date.now() - started,
        detail: (e as Error).message,
      });
    }
  }

  // Overall status ignores 'skipped' — an unconfigured integration is not
  // an outage.
  const live = checks.filter((c) => c.status !== 'skipped');
  const status: SystemHealth['status'] = live.some((c) => c.status === 'down')
    ? 'down'
    : live.some((c) => c.status === 'degraded')
      ? 'degraded'
      : 'ok';

  const total = os.totalmem();
  return {
    status,
    checks,
    host: {
      uptimeSeconds: Math.round(process.uptime()),
      memory: total ? { usedBytes: total - os.freemem(), totalBytes: total } : null,
      disk: await diskUsage(),
    },
    deploy: {
      version: process.env.APP_VERSION ?? process.env.npm_package_version ?? null,
      builtAt: process.env.BUILD_TIME ?? null,
      commit: process.env.GIT_COMMIT ?? null,
    },
    // Template has no queue subsystem — null, not []. A product with a
    // worker overrides this by passing its own depths through `extra` and
    // replacing this field.
    queues: null,
    checkedAt: new Date().toISOString(),
  };
}
