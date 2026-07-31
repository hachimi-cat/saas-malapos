/*
 * Business metrics — this product's own users, workspaces and revenue.
 *
 * Part of the mandatory admin-portal standard. The point is that each
 * product answers "how is MY product doing" without an operator having to
 * open the central Huudis (users) and Plugipay (transactions) consoles and
 * mentally join them.
 *
 * The user split is load-bearing, not cosmetic. `signedIn` is the Huudis
 * SSO roster; `workspaceMembers` is membership. They OVERLAP, and summing
 * them is wrong. Pawpado is the worked example: 11 sign-ins against 3
 * provisioned workspaces meant 8 people signed up and never came back —
 * which is the single most useful number on the page, and it disappears
 * the moment you add the two together.
 *
 * Money is minor units (sen/cents) end to end. A float that survives two
 * additions is a number nobody can reconcile against a bank statement.
 */

import { fetchAppStats, huudisAppConfigured } from './huudis-app.js';

export interface BusinessMetrics {
  users: { total: number; signedIn: number; workspaceMembers: number; newInWindow: number };
  workspaces: { total: number; active: number };
  transactions: { count: number; grossMinor: number; currency: string; payers: number };
  series: { at: string; users: number; transactions: number; grossMinor: number }[];
  window: { from: string; to: string };
}

/**
 * What a product implements. Everything is optional: a product with no
 * billing simply does not provide `transactions`, and the contract still
 * reports the key zeroed so the dashboard renders identically everywhere.
 */
export interface MetricsAdapter {
  /** Workspaces/accounts this product has provisioned. */
  workspaces?: (window: MetricsWindow) => Promise<{ total: number; active: number }>;
  /** Members across those workspaces — overlaps the SSO roster by design. */
  workspaceMembers?: (window: MetricsWindow) => Promise<number>;
  transactions?: (
    window: MetricsWindow,
  ) => Promise<{ count: number; grossMinor: number; currency: string; payers: number }>;
  /** Daily buckets. Products that cannot cheaply bucket may omit it. */
  series?: (
    window: MetricsWindow,
  ) => Promise<{ at: string; users: number; transactions: number; grossMinor: number }[]>;
}

export interface MetricsWindow {
  from: Date;
  to: Date;
}

export function defaultWindow(days = 30): MetricsWindow {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  return { from, to };
}

/**
 * Each source is resolved independently and a failure degrades that slice
 * to zero rather than failing the whole page. An operator with a broken
 * billing integration still needs to see their user counts — and the
 * alternative, a metrics page that 500s whenever any one dependency is
 * unhappy, is a page nobody trusts during exactly the incident they opened
 * it for.
 */
export async function collectBusinessMetrics(
  adapter: MetricsAdapter = {},
  window: MetricsWindow = defaultWindow(),
): Promise<BusinessMetrics> {
  const safe = async <T>(fn: (() => Promise<T>) | undefined, fallback: T): Promise<T> => {
    if (!fn) return fallback;
    try {
      return await fn();
    } catch {
      return fallback;
    }
  };

  const huudis = huudisAppConfigured()
    ? await fetchAppStats().catch(() => null)
    : null;

  const [workspaces, workspaceMembers, transactions, series] = await Promise.all([
    safe(adapter.workspaces ? () => adapter.workspaces!(window) : undefined, {
      total: 0,
      active: 0,
    }),
    safe(adapter.workspaceMembers ? () => adapter.workspaceMembers!(window) : undefined, 0),
    safe(adapter.transactions ? () => adapter.transactions!(window) : undefined, {
      count: 0,
      grossMinor: 0,
      currency: process.env.DEFAULT_CURRENCY ?? 'IDR',
      payers: 0,
    }),
    safe(adapter.series ? () => adapter.series!(window) : undefined, []),
  ]);

  const signedIn = huudis?.users.total ?? 0;

  return {
    users: {
      // The union is unknowable from these two counts alone (they overlap
      // by an unknown amount), so `total` reports the larger — the floor
      // of the true population — rather than a sum that is always wrong.
      total: Math.max(signedIn, workspaceMembers),
      signedIn,
      workspaceMembers,
      newInWindow: huudis?.users.signupsLast30d ?? 0,
    },
    workspaces,
    transactions,
    series,
    window: { from: window.from.toISOString(), to: window.to.toISOString() },
  };
}
