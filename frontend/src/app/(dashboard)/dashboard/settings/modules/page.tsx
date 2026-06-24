'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Loader2,
  CreditCard,
  CheckCircle2,
  ExternalLink,
  Truck,
  Megaphone,
} from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';

interface ModulesState {
  payment?: boolean;
  fulfillment?: boolean;
  marketing?: boolean;
  /** Unknown/legacy keys are tolerated + ignored. */
  [key: string]: boolean | undefined;
}

interface ModuleDef {
  id: 'payment' | 'fulfillment' | 'marketing';
  name: string;
  description: string;
  pricing: string;
  deepLink: string;
  icon: React.ComponentType<{ className?: string }>;
}

// Keep in sync with MODULE_KEYS (backend lib/billing.ts) + the route
// whitelist. Deep-links target the per-module feature surfaces built in
// the follow-up; the pages may not exist yet.
const MODULES: ModuleDef[] = [
  {
    id: 'payment',
    name: 'Payments',
    description:
      'Accept QRIS, virtual accounts, e-wallets & cards at the counter, with payouts, invoices & receipts. Powered by Plugipay.',
    pricing: '0.3% of GMV — rolls into your Malapos invoice.',
    deepLink: '/dashboard/payments',
    icon: CreditCard,
  },
  {
    id: 'fulfillment',
    name: 'Fulfillment',
    description:
      'Indonesian shipping (Biteship) — courier rates, labels & tracking for delivery orders. Powered by Fulkruma.',
    pricing: '0.5% of fulfilled order value — rolls into your Malapos invoice.',
    deepLink: '/dashboard/fulfillment',
    icon: Truck,
  },
  {
    id: 'marketing',
    name: 'Marketing',
    description:
      'Loyalty, discount codes, referrals & customer campaigns to bring shoppers back. Powered by Ripllo.',
    pricing: '0.3% of attributed revenue — rolls into your Malapos invoice.',
    deepLink: '/dashboard/marketing',
    icon: Megaphone,
  },
];

export default function ModulesPage() {
  const [modules, setModules] = useState<ModulesState>({});
  const [allowed, setAllowed] = useState<string[]>([]);
  const [plan, setPlan] = useState<string>('free');
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [error, setError] = useState<string>('');

  async function fetchModules() {
    setLoading(true);
    try {
      const { data } = await api.get<{ modules: ModulesState; allowed: string[]; plan: string }>(
        '/modules',
      );
      setModules(data?.modules ?? {});
      setAllowed(data?.allowed ?? []);
      setPlan(data?.plan ?? 'free');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Failed to load modules');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchModules();
  }, []);

  async function toggle(id: ModuleDef['id'], enabled: boolean) {
    setToggling(id);
    setError('');
    try {
      const { data } = await api.post<{ modules: ModulesState }>('/modules', {
        module: id,
        enabled,
      });
      setModules(data?.modules ?? {});
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.code ? `${err.code}: ${err.message}` : err.message);
      } else {
        setError('Failed to toggle module');
      }
    } finally {
      setToggling(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Modules</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Turn Forjio partner modules on or off. Each module connects Malapos to another Forjio
          product, has its own usage pricing, and is billed through your Malapos subscription
          invoice.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-4">
          {MODULES.map((m) => {
            const enabled = modules[m.id] === true;
            const canEnable = allowed.includes(m.id);
            const Icon = m.icon;
            // Lock the toggle when the merchant's tier doesn't allow
            // this module — they can still DISABLE an active one.
            const toggleDisabled = toggling === m.id || (!enabled && !canEnable);
            return (
              <div key={m.id} className="rounded-lg border border-border bg-card">
                <div className="flex items-start justify-between gap-4 px-6 py-4">
                  <div className="flex items-start gap-4">
                    <div className="mt-1 rounded-md bg-muted p-2">
                      <Icon className="h-5 w-5 text-foreground" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="font-semibold">{m.name}</h2>
                        {enabled && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
                            <CheckCircle2 className="h-3 w-3" /> Active
                          </span>
                        )}
                        {!enabled && !canEnable && (
                          <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-500">
                            Paid plan required
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{m.description}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Pricing:</span> {m.pricing}
                      </p>
                      {enabled && (
                        <Link
                          href={m.deepLink}
                          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          Open {m.name} <ExternalLink className="h-3 w-3" />
                        </Link>
                      )}
                      {!enabled && !canEnable && (
                        <Link
                          href="/dashboard/billing"
                          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          Upgrade your plan to enable <ExternalLink className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={toggleDisabled}
                    onClick={() => void toggle(m.id, !enabled)}
                    title={
                      !enabled && !canEnable
                        ? `Your current plan (${plan}) doesn't include this module`
                        : undefined
                    }
                    className={
                      'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ' +
                      (enabled ? 'bg-primary' : 'bg-muted')
                    }
                    aria-pressed={enabled}
                  >
                    <span
                      className={
                        'inline-block h-5 w-5 transform rounded-full bg-background shadow transition-transform ' +
                        (enabled ? 'translate-x-5' : 'translate-x-0.5')
                      }
                    />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
