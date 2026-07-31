import { describe, it, expect, vi, beforeEach } from 'vitest';

/*
 * The migrations check on the admin portal's System metrics page.
 *
 * The regression this pins was found live on TWO production databases.
 * Prisma appends a NEW `_prisma_migrations` row when a rolled-back
 * migration is reapplied and leaves the failed one in place forever, so a
 * check that judges every row independently reports a migration that broke
 * once and was fixed months ago as a permanent outage:
 *
 *   linksnap   20260424210000_workspace_forjio_internal  resolved 2026-05-21
 *   storlaunch 20260518_manual_order_tracking_url        resolved
 *
 * Both were serving traffic against a correct schema while their System
 * metrics page showed a red "down". A status page that cries wolf about
 * something fixed in May is one nobody reads in November.
 */

const queryRawUnsafe = vi.fn();
vi.mock('../lib/db.js', () => ({ prisma: { $queryRawUnsafe: queryRawUnsafe } }));
vi.mock('../lib/huudis-app.js', () => ({
  huudisAppConfigured: () => false,
  fetchAppStats: vi.fn(),
}));

const row = (
  migration_name: string,
  finished_at: Date | null,
  rolled_back_at: Date | null,
) => ({ migration_name, finished_at, rolled_back_at });

const OLD = new Date('2026-04-27T00:00:00Z');
const NEW = new Date('2026-05-21T00:00:00Z');

/** Drive collectSystemHealth() and return just the migrations check. */
async function migrationsCheck(ledger: ReturnType<typeof row>[]) {
  queryRawUnsafe.mockImplementation(async (sql: string) =>
    sql.includes('_prisma_migrations') ? ledger : [{ '?column?': 1 }],
  );
  const { collectSystemHealth } = await import('../lib/system-health.js');
  const health = await collectSystemHealth();
  return {
    check: health.checks.find((c) => c.key === 'migrations')!,
    overall: health.status,
  };
}

beforeEach(() => {
  vi.resetModules();
  queryRawUnsafe.mockReset();
});

describe('migrations health check', () => {
  it('is ok when a rolled-back migration was later reapplied', async () => {
    const { check, overall } = await migrationsCheck([
      row('20260101_init', OLD, null),
      // The exact linksnap/storlaunch shape: a failed attempt, then a
      // successful one for the SAME migration.
      row('20260424_workspace', null, NEW),
      row('20260424_workspace', NEW, null),
    ]);
    expect(check.status).toBe('ok');
    expect(overall).toBe('ok');
    expect(check.detail).toContain('2 applied');
  });

  it('is down when the latest attempt is still rolled back', async () => {
    const { check, overall } = await migrationsCheck([
      row('20260101_init', OLD, null),
      row('20260424_workspace', NEW, null),
      // Reapplied, then rolled back again — the newest word is "broken".
      row('20260424_workspace', null, new Date('2026-06-01T00:00:00Z')),
    ]);
    expect(check.status).toBe('down');
    expect(check.detail).toContain('20260424_workspace');
    expect(overall).toBe('down');
  });

  it('is degraded when a migration started and never finished', async () => {
    const { check } = await migrationsCheck([
      row('20260101_init', OLD, null),
      row('20260702_pending', null, null),
    ]);
    expect(check.status).toBe('degraded');
    expect(check.detail).toContain('20260702_pending');
  });

  it('reports a broken migration even when many newer ones follow it', async () => {
    // The old query took `ORDER BY started_at DESC LIMIT 20`, so a genuinely
    // broken migration stopped being reported once twenty newer ones landed
    // on top of it — the exact inverse of the false alarm above, and the
    // more dangerous of the two.
    const ledger = [row('20260101_broken', null, OLD)];
    for (let i = 0; i < 30; i += 1) {
      ledger.push(row(`2026060${i}_later`, NEW, null));
    }
    const { check } = await migrationsCheck(ledger);
    expect(check.status).toBe('down');
    expect(check.detail).toContain('20260101_broken');
  });

  it('says so plainly when the ledger is empty', async () => {
    const { check } = await migrationsCheck([]);
    expect(check.detail).toBe('no migrations recorded');
  });
});
