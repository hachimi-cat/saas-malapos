import { Router } from 'express';
import { sendOk, sendErr } from '../lib/http.js';
import { prisma } from '../lib/db.js';
import {
  fetchAppUsers,
  fetchAppStats,
  huudisAppConfigured,
} from '../lib/huudis-app.js';

/*
 * GET /api/v1/admin/customers — the admin-portal standard's Customers
 * contract (`AdminCustomer` in @forjio/admin-ui).
 *
 * This REPLACES the old passthrough, which returned the raw Huudis
 * `/app/users` roster and nothing else. A list of email addresses answers
 * "who signed in" and none of "is this till actually ringing sales",
 * which is what an operator opens the page for.
 *
 * ── malapos has no roster table ──────────────────────────────────────
 *
 * The other products keep a `RosterMembership` linking a Huudis sub to an
 * accountId. malapos does not; the only place a Huudis identity meets an
 * account is `Shift.cashierSub` — who has opened a till.
 *
 * That link is WEAKER and the page says so rather than hiding it: a
 * merchant owner who provisioned an outlet but never personally worked
 * the counter has no shift, so they show as `no-till` with dashes. That
 * is the honest reading — malapos genuinely does not know which account
 * they belong to — and it beats inventing a join or silently dropping
 * them from the list.
 */

const router = Router();

const NEW_WINDOW_MS = 30 * 86_400_000;

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
    const limitRaw = str(req.query.limit);
    const [page, stats] = await Promise.all([
      fetchAppUsers({
        q: str(req.query.q),
        status: str(req.query.status) as 'all' | 'active' | 'disabled' | undefined,
        limit: limitRaw ? Number(limitRaw) : 200,
        cursor: str(req.query.cursor),
      }),
      fetchAppStats().catch(() => null),
    ]);

    const subs = page.users.map((u) => u.id);

    // Which accounts each identity has opened a till for. `distinct`
    // rather than a groupBy because we want the pairs, not a count.
    const shifts = subs.length
      ? await prisma.shift.findMany({
          where: { cashierSub: { in: subs } },
          distinct: ['cashierSub', 'accountId'],
          select: { cashierSub: true, accountId: true },
        })
      : [];

    const accountsBySub = new Map<string, string[]>();
    for (const s of shifts) {
      (accountsBySub.get(s.cashierSub) ?? accountsBySub.set(s.cashierSub, []).get(s.cashierSub)!).push(
        s.accountId,
      );
    }
    const accountIds = [...new Set(shifts.map((s) => s.accountId))];

    const [sales, outlets] = await Promise.all([
      accountIds.length
        ? prisma.transaction.groupBy({
            by: ['accountId'],
            // COMPLETED only. A PARKED sale is an open bill nobody has
            // paid yet, and a VOIDED one never happened — counting either
            // as revenue reports money the merchant does not have.
            where: { accountId: { in: accountIds }, status: 'COMPLETED' },
            _count: { _all: true },
            _sum: { total: true },
            _max: { createdAt: true },
          })
        : [],
      accountIds.length
        ? prisma.outlet.groupBy({
            by: ['accountId'],
            where: { accountId: { in: accountIds } },
            _count: { _all: true },
          })
        : [],
    ]);

    const salesBy = new Map(sales.map((r) => [r.accountId, r]));
    const outletsBy = new Map(outlets.map((r) => [r.accountId, r._count._all]));

    const now = Date.now();
    const customers = page.users.map((u) => {
      const accts = accountsBySub.get(u.id) ?? [];
      const count = accts.reduce((n, a) => n + (salesBy.get(a)?._count._all ?? 0), 0);
      const grossIdr = accts.reduce((n, a) => n + (salesBy.get(a)?._sum.total ?? 0), 0);
      const outletCount = accts.reduce((n, a) => n + (outletsBy.get(a) ?? 0), 0);
      const lastSaleAt = accts
        .map((a) => salesBy.get(a)?._max.createdAt)
        .filter((d): d is Date => !!d)
        .sort((x, y) => y.getTime() - x.getTime())[0];

      const tags: string[] = [];
      if (u.disabled) tags.push('disabled');
      if (!u.emailVerified) tags.push('unverified');
      if (accts.length === 0) tags.push('no-till');
      if (count > 0) tags.push('selling');
      if (now - new Date(u.firstSignInAt).getTime() < NEW_WINDOW_MS) tags.push('new');

      return {
        id: u.id,
        email: u.email,
        name: u.name,
        status: u.disabled ? 'disabled' : 'active',
        signedUpAt: u.firstSignInAt,
        lastSeenAt: u.lastSignInAt,
        workspaceId: accts[0] ?? null,
        tags,
        metrics: [
          { label: 'Outlets', value: outletCount ? String(outletCount) : '—' },
          { label: 'Sales', value: count.toLocaleString('en-GB') },
          {
            label: 'Revenue',
            value: grossIdr ? `Rp ${grossIdr.toLocaleString('id-ID')}` : '—',
          },
          {
            label: 'Last sale',
            value: lastSaleAt ? lastSaleAt.toISOString().slice(0, 10) : '—',
          },
        ],
      };
    });

    return sendOk(res, req, {
      customers,
      total: stats?.users.total ?? customers.length,
    });
  } catch (e) {
    return sendErr(res, req, 502, 'CUSTOMERS_ERROR', (e as Error).message);
  }
});

export default router;
