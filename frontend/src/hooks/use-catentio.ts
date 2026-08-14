'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { api, ApiRequestError } from '@/lib/api';

/**
 * The catentio assistant BFF (backend/src/routes/catentio.ts — the
 * shared @forjio/catentio-embed router). The browser never talks to
 * catentio — every call lands on our backend, which owns the key, the
 * flag gate and the delegation token. Ported from linksnap's
 * hooks/use-catentio.ts (the reference integration); the agentic-sheet
 * plan transport follows storlaunch's.
 */

/** The resources the agentic sheet can plan against — every merchant
 *  create/edit surface in the portal. MUST stay in step with
 *  `MALAPOS_PROFILE.resources` (backend/src/lib/catentio-profile.ts):
 *  the BFF looks the resource up there and 422s on anything it doesn't
 *  know, so a key added here without a profile entry is a dead sheet. */
export const ASSISTANT_RESOURCES = [
  // core POS
  'categories',
  'products',
  'modifiers',
  'outlets',
  'tables',
  'floors',
  'suppliers',
  'customers',
  'settings',
  'webhook-subscriptions',
  // books-with-approval — records that move money or stock; the shop's
  // books, so every agent write goes through the review/approval path
  'purchase-orders',
  'po-receipts',
  'refunds',
  'sale-voids',
  'gift-cards',
  'inventory-adjustments',
  'inventory-transfers',
  'stock-batches',
  'discount-codes',
  'loyalty-program',
  'referrals-program',
  // marketing module (Ripllo)
  'blog-posts',
  'feeds',
  'pixels',
  'abandoned-cart',
  'marketing-campaigns',
  'funnels',
  // affiliate approval queue (Ripllo) — verb-only: an affiliator
  // enrolls themselves and a commission is earned by a sale, so these
  // are reviewed, never authored (see MALAPOS_PROFILE).
  'affiliate-enrollments',
  'affiliate-commissions',
  // payments module (Plugipay)
  'payment-customers',
  'plans',
  'prices',
  'checkout-sessions',
  'subscriptions',
  'payouts',
  // payments SETTINGS — the three open-form pages under
  // /dashboard/payments/settings. They reach the assistant through
  // AskAssistantEntry (a sparkle, no duplicate manual form) rather than
  // a "New X" button, because each page already IS the form.
  'providers',
  'checkout-settings',
  'payment-templates',
  // fulfillment module (Fulkruma)
  'warehouses',
  'delivery-origin',
  'shipments',
  'licenses',
  'fulfillment-adjustments',
] as const;

export type AssistantResource = (typeof ASSISTANT_RESOURCES)[number];

/** The classic pair every resource supports — the modes the engine
 *  synthesizes when a profile resource declares no `actions`. */
export type AssistantCrudMode = 'create' | 'edit';

/**
 * An action name — `AssistantCrudMode` plus whatever verbs a resource
 * declares in `MALAPOS_PROFILE.resources[…].actions` ('delete',
 * 'publish', 'unpublish', 'mark-paid', …). Deliberately `string`: the
 * BFF validates the (resource, mode) pair against the profile and 422s
 * anything undeclared, and the frontend registry throws on a verb it
 * has no builder for (`resourceSupports` in ./capabilities), so a
 * union here would only duplicate those gates. The per-resource verb
 * list lives in `RESOURCE_EXTRA_ACTIONS` (components/catentio/
 * capabilities.ts).
 */
export type AssistantMode = string;

export interface AssistantPlanResponse {
  requestId: string;
  runId: string;
  /** The agent's prose (plan block stripped). */
  message: string;
  /** Sanitized plan fields, or null when the agent declined. */
  plan: Record<string, unknown> | null;
  /** Fields the agent proposed outside the schema — dropped server-side,
   *  surfaced here so the review artifact can say so. */
  droppedFields: string[];
}

/** Fired (window-level) when an assistant chat turn completes — the
 *  agent writes records directly now, so whatever list page is open
 *  underneath must refetch or it lies about what just happened. */
export const ASSISTANT_ACTIVITY_EVENT = 'malapos:assistant-activity';

export function useAssistantActivity(
  onActivity: () => void | (() => void),
): void {
  const ref = useRef(onActivity);
  ref.current = onActivity;
  useEffect(() => {
    // A handler may return a cleanup (e.g. it scheduled a follow-up
    // timer). Run the previous one before firing again, and on unmount,
    // so nothing lands after the component is gone.
    let cleanup: (() => void) | void;
    const handler = () => {
      if (typeof cleanup === 'function') cleanup();
      cleanup = ref.current();
    };
    window.addEventListener(ASSISTANT_ACTIVITY_EVENT, handler);
    return () => {
      window.removeEventListener(ASSISTANT_ACTIVITY_EVENT, handler);
      if (typeof cleanup === 'function') cleanup();
    };
  }, []);
}

/** Is the assistant on for this account? Decides whether the entry
 *  points mount at all; the backend re-checks on every call anyway. */
export function useCatentioStatus(): { enabled: boolean; loading: boolean } {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ enabled?: boolean }>('/catentio/status')
      .then(({ data }) => {
        if (!cancelled) setEnabled(Boolean(data?.enabled));
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { enabled, loading };
}

/** The workspace's assistant preference: does it apply changes itself
 *  (true) or propose them for review (false)? The BFF is the authority
 *  — it scopes the delegation token to match — so this is only for
 *  rendering the toggle. */
export function useAssistantSettings(enabled: boolean): {
  autoApply: boolean;
  loading: boolean;
  saving: boolean;
  error: string | null;
  setAutoApply: (next: boolean) => Promise<void>;
} {
  const [autoApply, setAutoApplyState] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    api
      .get<{ autoApply?: boolean }>('/catentio/settings')
      .then(({ data }) => {
        if (cancelled) return;
        setAutoApplyState(data?.autoApply !== false);
      })
      .catch(() => {
        /* keep the default; the toggle just shows the safe value */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const setAutoApply = useCallback(
    async (next: boolean) => {
      setSaving(true);
      setError(null);
      const prev = autoApply;
      setAutoApplyState(next); // optimistic
      try {
        await api.patch('/catentio/settings', { autoApply: next });
      } catch (err) {
        setAutoApplyState(prev); // roll back — the server refused
        setError(
          err instanceof ApiRequestError
            ? err.message
            : 'Could not save the assistant setting',
        );
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [autoApply],
  );

  return { autoApply, loading, saving, error, setAutoApply };
}

export interface CreditsLedgerRow {
  at: string | null;
  kind: string;
  credits: number;
  balance_after_credits: number;
  product: string | null;
  surface: string | null;
  run_id: string | null;
}

export interface CatentioCredits {
  balance: {
    subject: string;
    balance_usd_micros: number;
    credits: number;
    monthly_grant_credits?: number;
    /** Agent spend since the UTC month start, aggregated server-side. */
    used_this_period_credits?: number;
    period_start?: string;
  };
  ledger: CreditsLedgerRow[];
}

/** The user's Forjio-wide agent-credit balance + recent ledger. Only
 *  fetched when the assistant flag is on (`enabled`); refresh() is for
 *  after a run lands, so the sidebar chip moves. */
export function useCatentioCredits(enabled: boolean): {
  credits: CatentioCredits | null;
  loading: boolean;
  refresh: () => void;
} {
  const [credits, setCredits] = useState<CatentioCredits | null>(null);
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setCredits(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .get<CatentioCredits>('/catentio/credits')
      .then(({ data }) => {
        if (!cancelled) setCredits(data);
      })
      .catch(() => {
        if (!cancelled) setCredits(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, nonce]);

  return { credits, loading, refresh: () => setNonce((n) => n + 1) };
}

export type CreditsPack = '500' | '1200' | '2600';
export type CreditsCurrency = 'IDR' | 'USD';

/** Start a credit-pack top-up. Resolves with the hosted-checkout URL to
 *  send the browser to, or noop:true when billing runs in internal mode
 *  (staging) and there is nothing to pay. `currency` is the buyer's
 *  saved preference — IDR rides the local rails, USD settles through
 *  PayPal. */
export async function startCreditsTopup(
  pack: CreditsPack,
  currency: CreditsCurrency = 'IDR',
): Promise<{ checkoutUrl: string | null; noop: boolean; credits: number }> {
  const { data } = await api.post<{
    checkoutUrl: string | null;
    noop: boolean;
    credits: number;
  }>('/catentio/credits/topup', { pack, currency });
  return data;
}

/** Ask the assistant for a field plan for one create/edit. The BFF
 *  builds the real agent prompt server-side from these structured
 *  pieces and sanitizes the returned plan against the profile registry,
 *  so callers send data, never prose. */
export async function requestAssistantPlan(body: {
  resource: AssistantResource;
  mode: AssistantMode;
  prompt: string;
  draft?: Record<string, unknown>;
  initial?: Record<string, unknown>;
  history?: { prompt: string; plan: Record<string, unknown> | null }[];
}): Promise<AssistantPlanResponse> {
  // Planning takes as long as the agent takes; the backend bounds the
  // run well inside this, so the abort must outlive it (fetch has no
  // default timeout — the signal is the only bound).
  const { data } = await api.post<AssistantPlanResponse>('/catentio/plan', body, {
    signal: AbortSignal.timeout(260_000),
  });
  // The sheet spends credits like the chat does; tell the chip.
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ASSISTANT_ACTIVITY_EVENT));
  }
  return data;
}
