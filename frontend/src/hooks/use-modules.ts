'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export interface ModulesState {
  payment?: boolean;
  fulfillment?: boolean;
  marketing?: boolean;
  /** Unknown/legacy keys in the stored JSON are tolerated + ignored. */
  [key: string]: boolean | undefined;
}

/**
 * Single source of truth for which Malapos partner modules are enabled.
 * Used by the dashboard shell (to hide disabled module accordions) and
 * the route guard (to redirect URL-typing merchants away from disabled
 * routes). Mirrors storlaunch's use-modules.
 *
 * GET /modules returns `{ modules: { payment, fulfillment, marketing },
 * allowed, plan }`; the client `api` unwraps the Forjio envelope so
 * `res.data` is that inner payload.
 */
export function useModules(): { modules: ModulesState; loading: boolean } {
  const [modules, setModules] = useState<ModulesState>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ modules: ModulesState }>('/modules')
      .then((res) => {
        if (cancelled) return;
        const m = (res.data?.modules as ModulesState) ?? {};
        setModules(m);
      })
      .catch(() => {
        // treat as all-disabled on error — safe default
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { modules, loading };
}

// Routes gated by the Payment (Plugipay) module. Typed URL access to any
// of these while the module is off sends the merchant to
// /dashboard/settings/modules?gated=payment.
export const PAYMENT_GATED_PREFIXES = ['/dashboard/payments', '/dashboard/gift-cards'];

export function isPaymentGatedPath(pathname: string): boolean {
  return PAYMENT_GATED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// Routes gated by the Fulfillment (Fulkruma) module. Typed URL access to
// any of these while fulfillment is off sends the merchant to
// /dashboard/settings/modules?gated=fulfillment.
export const FULFILLMENT_GATED_PREFIXES = ['/dashboard/delivery'];

export function isFulfillmentGatedPath(pathname: string): boolean {
  return FULFILLMENT_GATED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// Routes gated by the Marketing (Ripllo) module. Typed URL access to any
// of these while marketing is off sends the merchant to
// /dashboard/settings/modules?gated=marketing.
export const MARKETING_GATED_PREFIXES = ['/dashboard/marketing'];

export function isMarketingGatedPath(pathname: string): boolean {
  return MARKETING_GATED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
