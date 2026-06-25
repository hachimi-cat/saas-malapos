'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Loader2, Archive, CheckCircle2, Plus } from 'lucide-react';
import { plansApi, Plan } from '@/lib/payments-api';
import { formatCurrency, formatDate, cn } from '@/lib/utils';

const btnSecondary =
  'inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50';
const btnDanger =
  'inline-flex items-center gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/20 disabled:opacity-50';

export default function PlanDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [plan, setPlan] = React.useState<Plan | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const res = await plansApi.get(id);
      const body = res.data as unknown as { data?: Plan } | Plan;
      setPlan(((body as { data?: Plan }).data ?? body) as Plan);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function archive() {
    if (!confirm('Archive this plan? Existing subscribers keep their current plan, but no new subscriptions can be created on it.')) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await plansApi.delete(id);
      setInfo('Plan archived');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Archive failed');
    } finally {
      setBusy(false);
    }
  }

  const [showAddPrice, setShowAddPrice] = React.useState(false);
  const [newCurrency, setNewCurrency] = React.useState('IDR');
  const [newAmount, setNewAmount] = React.useState('');
  const [newTaxMode, setNewTaxMode] = React.useState<'inclusive' | 'exclusive'>('inclusive');

  async function addPrice() {
    if (!newAmount) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await plansApi.addPrice(id, {
        currency: newCurrency.toUpperCase(),
        model: 'flat',
        unitAmount: Number(newAmount),
        taxMode: newTaxMode,
      });
      setInfo('Price added');
      setNewAmount('');
      setShowAddPrice(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add price');
    } finally {
      setBusy(false);
    }
  }

  async function togglePrice(priceId: string, active: boolean) {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await plansApi.updatePrice(priceId, { active });
      setInfo(active ? 'Price activated' : 'Price archived');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive() {
    if (!plan) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await plansApi.update(id, { active: !plan.active });
      setInfo(plan.active ? 'Plan deactivated' : 'Plan activated');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!plan) return <div className="p-8 text-sm text-red-400">{error ?? 'Not found'}</div>;

  const prices = plan.prices ?? [];
  const intervalCount = plan.intervalCount ?? 1;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <nav className="text-xs text-muted-foreground">
        <Link href="/dashboard/payments/plans" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Plans
        </Link>
        <span className="mx-1.5 text-muted-foreground/50">/</span>
        <span className="font-mono text-foreground">{plan.id}</span>
      </nav>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{plan.name}</h1>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-xs font-medium',
                plan.active ? 'bg-green-500/10 text-green-400' : 'bg-muted text-muted-foreground',
              )}
            >
              {plan.active ? 'Active' : 'Archived'}
            </span>
          </div>
          <p className="mt-1 font-mono text-[13px] text-muted-foreground">{plan.id}</p>
          {plan.description && <p className="mt-2 max-w-[62ch] text-sm text-muted-foreground">{plan.description}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={toggleActive} disabled={busy} className={btnSecondary}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : plan.active ? null : <CheckCircle2 className="h-4 w-4" />}
            {plan.active ? 'Deactivate' : 'Activate'}
          </button>
          {plan.active && (
            <button type="button" onClick={archive} disabled={busy} className={btnDanger}>
              <Archive className="h-4 w-4" /> Archive
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-xs font-mono text-red-400">
          {error}
        </div>
      )}
      {info && (
        <div className="rounded-md border border-border bg-green-500/10 px-3 py-2 text-xs font-mono text-green-400">
          {info}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold">Prices</h2>
            <button
              type="button"
              onClick={() => setShowAddPrice((s) => !s)}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <Plus className="h-3 w-3" /> Add price
            </button>
          </div>

          {showAddPrice && (
            <div className="mb-4 rounded-md border border-primary/40 bg-primary/5 p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-[11px] font-medium">Currency</label>
                  <input
                    value={newCurrency}
                    onChange={(e) => setNewCurrency(e.target.value.toUpperCase())}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium">Unit amount</label>
                  <input
                    type="number"
                    placeholder="99000"
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium">Tax mode</label>
                  <select
                    value={newTaxMode}
                    onChange={(e) => setNewTaxMode(e.target.value as 'inclusive' | 'exclusive')}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  >
                    <option value="inclusive">Inclusive</option>
                    <option value="exclusive">Exclusive</option>
                  </select>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={addPrice}
                  disabled={busy || !newAmount}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                  Add flat price
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddPrice(false)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {prices.length === 0 ? (
            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold tabular-nums">
                  {plan.currency === 'IDR' ? formatCurrency(plan.amount) : `${plan.currency} ${plan.amount}`}
                </span>
                <span className="text-xs text-muted-foreground">
                  / {intervalCount > 1 ? `${intervalCount} ${plan.interval}s` : plan.interval}
                </span>
              </div>
            </div>
          ) : (
            <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Price ID</th>
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Model</th>
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Amount</th>
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Currency</th>
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Status</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {prices.map((pr) => (
                    <tr key={pr.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2 font-mono text-xs">{pr.id}</td>
                      <td className="px-3 py-2 text-xs capitalize">{pr.model}</td>
                      <td className="px-3 py-2 font-semibold tabular-nums">
                        {pr.currency === 'IDR' ? formatCurrency(pr.unitAmount) : `${pr.currency} ${pr.unitAmount}`}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{pr.currency}</td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-xs font-medium',
                            pr.active ? 'bg-green-500/10 text-green-400' : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {pr.active ? 'Active' : 'Archived'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => togglePrice(pr.id, !pr.active)}
                          disabled={busy}
                          className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                        >
                          {pr.active ? 'Archive' : 'Unarchive'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="space-y-3 md:hidden">
              {prices.map((pr) => (
                <li key={pr.id} className="rounded-lg border border-border bg-card/50 p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold tabular-nums">
                      {pr.currency === 'IDR' ? formatCurrency(pr.unitAmount) : `${pr.currency} ${pr.unitAmount}`}
                    </span>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-medium',
                        pr.active ? 'bg-green-500/10 text-green-400' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {pr.active ? 'Active' : 'Archived'}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    <span className="capitalize">{pr.model}</span> · <span className="font-mono">{pr.currency}</span>
                  </div>
                  <div className="mt-1 break-all font-mono text-[10px] text-muted-foreground/70">{pr.id}</div>
                  <div className="mt-2 text-right">
                    <button
                      type="button"
                      onClick={() => togglePrice(pr.id, !pr.active)}
                      disabled={busy}
                      className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                    >
                      {pr.active ? 'Archive' : 'Unarchive'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            </>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="mb-4 text-base font-semibold">Schedule</h2>
          <div className="space-y-3">
            <Kv label="Interval" value={`Every ${intervalCount > 1 ? `${intervalCount} ${plan.interval}s` : plan.interval}`} />
            <Kv label="Trial days" value={String(plan.trialDays ?? plan.trialPeriodDays ?? 0)} />
            <Kv label="Created" value={formatDate(plan.createdAt)} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Kv({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-0.5 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  );
}
