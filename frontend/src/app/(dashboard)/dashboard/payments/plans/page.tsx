'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { plansApi, Plan } from '@/lib/payments-api';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { Plus, Pencil, Trash2, Loader2, X } from 'lucide-react';

const INTERVAL_LABELS: Record<string, string> = {
  day: 'Daily',
  week: 'Weekly',
  month: 'Monthly',
  year: 'Yearly',
};

interface PlanFormProps {
  plan?: Plan;
  onClose: () => void;
  onSaved: (p: Plan) => void;
}

function PlanForm({ plan, onClose, onSaved }: PlanFormProps) {
  const [form, setForm] = useState({
    name: plan?.name ?? '',
    description: plan?.description ?? '',
    amount: String(plan?.amount ?? ''),
    currency: plan?.currency ?? 'IDR',
    interval: plan?.interval ?? 'monthly',
    intervalCount: String(plan?.intervalCount ?? '1'),
    trialPeriodDays: String(plan?.trialPeriodDays ?? ''),
    active: plan?.active ?? true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const body = {
        name: form.name,
        description: form.description || undefined,
        amount: Number(form.amount),
        currency: form.currency,
        interval: form.interval as Plan['interval'],
        intervalCount: Number(form.intervalCount),
        trialPeriodDays: form.trialPeriodDays ? Number(form.trialPeriodDays) : null,
        active: form.active,
      };
      const res = plan
        ? await plansApi.update(plan.id, body)
        : await plansApi.create(body);
      onSaved(res.data as unknown as Plan);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg || 'Failed to save plan');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{plan ? 'Edit Plan' : 'New Plan'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Plan Name</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Pro Monthly"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Optional plan description"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Amount</label>
              <input
                type="number"
                required
                min="0"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="99000"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Currency</label>
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="IDR">IDR</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Billing Interval</label>
              <select
                value={form.interval}
                onChange={(e) => setForm({ ...form, interval: e.target.value as Plan['interval'] })}
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Every N intervals</label>
              <input
                type="number"
                min="1"
                value={form.intervalCount}
                onChange={(e) => setForm({ ...form, intervalCount: e.target.value })}
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Trial Period (days)</label>
            <input
              type="number"
              min="0"
              value={form.trialPeriodDays}
              onChange={(e) => setForm({ ...form, trialPeriodDays: e.target.value })}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="0 = no trial"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="active"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
              className="h-4 w-4 rounded border-border"
            />
            <label htmlFor="active" className="text-sm">Active (accepting subscriptions)</label>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded border border-border py-2 text-sm font-medium hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex flex-1 items-center justify-center gap-2 rounded bg-primary py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {plan ? 'Save Changes' : 'Create Plan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editPlan, setEditPlan] = useState<Plan | undefined>();
  const [showCreate, setShowCreate] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    plansApi
      .list({ limit: 50 })
      .then((res) => setPlans((res.data as unknown as { data?: Plan[] })?.data ?? (res.data as unknown as Plan[])))
      .catch(() => setPlans([]))
      .finally(() => setLoading(false));
  }, []);

  function handleSaved(plan: Plan) {
    setPlans((prev) => {
      const idx = prev.findIndex((p) => p.id === plan.id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = plan;
        return updated;
      }
      return [plan, ...prev];
    });
    setShowCreate(false);
    setEditPlan(undefined);
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this plan? Existing subscriptions are unaffected.')) return;
    setDeletingId(id);
    try {
      await plansApi.delete(id);
      setPlans((prev) => prev.filter((p) => p.id !== id));
    } catch {
      alert('Failed to delete plan');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {(showCreate || editPlan) && (
        <PlanForm
          plan={editPlan}
          onClose={() => { setShowCreate(false); setEditPlan(undefined); }}
          onSaved={handleSaved}
        />
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Subscription Plans</h1>
          <p className="mt-1 text-sm text-muted-foreground">Create and manage your billing plans</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> New Plan
        </button>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : plans.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border">
          <p className="text-sm text-muted-foreground">No plans yet</p>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Plus className="h-3 w-3" /> Create your first plan
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={cn(
                'rounded-lg border bg-card p-5',
                plan.active ? 'border-border' : 'border-border opacity-60'
              )}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{plan.name}</h3>
                  {plan.description && (
                    <p className="mt-1 text-xs text-muted-foreground">{plan.description}</p>
                  )}
                </div>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-medium',
                    plan.active ? 'bg-green-500/10 text-green-400' : 'bg-muted text-muted-foreground'
                  )}
                >
                  {plan.active ? 'Active' : 'Inactive'}
                </span>
              </div>

              <div className="mt-4">
                <span className="text-2xl font-bold">
                  {plan.currency === 'IDR' ? formatCurrency(plan.amount) : `$${plan.amount}`}
                </span>
                <span className="text-sm text-muted-foreground">
                  {' '}/ {(plan.intervalCount ?? 1) > 1 ? `${plan.intervalCount} ` : ''}{plan.interval}
                </span>
              </div>

              {plan.trialPeriodDays && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {plan.trialPeriodDays}-day free trial
                </p>
              )}

              <div className="mt-1 text-xs text-muted-foreground">
                {INTERVAL_LABELS[plan.interval]} billing
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                <Link href={`/dashboard/payments/plans/${plan.id}`} className="font-mono text-xs text-primary hover:underline">{plan.id}</Link>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditPlan(plan)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(plan.id)}
                    disabled={deletingId === plan.id}
                    className="text-muted-foreground hover:text-red-400 disabled:opacity-50"
                  >
                    {deletingId === plan.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <p className="mt-2 text-xs text-muted-foreground">Created {formatDate(plan.createdAt)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
