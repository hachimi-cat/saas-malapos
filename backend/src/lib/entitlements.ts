import { prisma } from './db.js';
import { ApiError } from './http.js';
import {
  EARLY_ACCESS,
  checkLimit,
  effectiveTier,
  tierDef,
  type BillingTier,
} from './billing.js';

/*
 * Plan-limit enforcement. The tier table (src/lib/billing.ts) is the
 * single source of truth for caps; this resolves a workspace's
 * effective tier and throws 403 LIMIT_REACHED when a create would push
 * a counted resource past its cap.
 *
 * EARLY ACCESS: while `EARLY_ACCESS` is on, no plan is charged, so
 * limits are NOT enforced (every workspace is effectively unlimited).
 * The check still RESOLVES the tier so callers behave identically once
 * the flag flips — only the throw is suppressed.
 */

/** The tier a workspace is entitled to right now (free when no row). */
export async function currentTier(accountId: string): Promise<BillingTier> {
  const sub = await prisma.billingSubscription.findUnique({ where: { accountId } });
  return effectiveTier(sub);
}

/** Throw 403 LIMIT_REACHED if creating one more of `field`'s resource
 *  would exceed the workspace's tier cap. No-op during early access. */
export async function enforceLimit(
  accountId: string,
  field: 'outletLimit' | 'productLimit' | 'memberLimit',
  currentCount: number,
): Promise<void> {
  if (EARLY_ACCESS) return;
  const tier = await currentTier(accountId);
  const { allowed, limit } = checkLimit(tier, field, currentCount);
  if (!allowed) {
    const noun = field === 'outletLimit' ? 'outlets' : field === 'productLimit' ? 'products' : 'seats';
    throw new ApiError(
      403,
      'LIMIT_REACHED',
      `Your ${tierDef(tier).name} plan allows up to ${limit} ${noun}. Upgrade to add more.`,
    );
  }
}
