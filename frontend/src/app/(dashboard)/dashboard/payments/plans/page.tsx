'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { plansApi, Plan } from '@/lib/payments-api';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{plan ? 'Edit Plan' : 'New Plan'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Plan Name</Label>
            <Input
              id="name"
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Pro Monthly"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              placeholder="Optional plan description"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                type="number"
                required
                min="0"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="99000"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="currency">Currency</Label>
              <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                <SelectTrigger id="currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="IDR">IDR</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="interval">Billing Interval</Label>
              <Select
                value={form.interval}
                onValueChange={(v) => setForm({ ...form, interval: v as Plan['interval'] })}
              >
                <SelectTrigger id="interval">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="intervalCount">Every N intervals</Label>
              <Input
                id="intervalCount"
                type="number"
                min="1"
                value={form.intervalCount}
                onChange={(e) => setForm({ ...form, intervalCount: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="trialPeriodDays">Trial Period (days)</Label>
            <Input
              id="trialPeriodDays"
              type="number"
              min="0"
              value={form.trialPeriodDays}
              onChange={(e) => setForm({ ...form, trialPeriodDays: e.target.value })}
              placeholder="0 = no trial"
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="active"
              checked={form.active}
              onCheckedChange={(c) => setForm({ ...form, active: c === true })}
            />
            <Label htmlFor="active" className="text-sm">Active (accepting subscriptions)</Label>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="flex-1"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {plan ? 'Save Changes' : 'Create Plan'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
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
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" /> New Plan
        </Button>
      </div>

      {loading ? (
        <Card className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </Card>
      ) : plans.length === 0 ? (
        <Card className="flex h-48 flex-col items-center justify-center gap-3 border-dashed">
          <p className="text-sm text-muted-foreground">No plans yet</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowCreate(true)}
            className="text-xs text-primary hover:underline"
          >
            <Plus className="h-3 w-3" /> Create your first plan
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <Card
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
                <Badge
                  variant="outline"
                  className={cn(
                    'rounded-full border-transparent px-2 py-0.5 text-xs font-medium',
                    plan.active ? 'bg-green-500/10 text-green-400' : 'bg-muted text-muted-foreground'
                  )}
                >
                  {plan.active ? 'Active' : 'Inactive'}
                </Badge>
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
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditPlan(plan)}
                    className="h-auto w-auto text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(plan.id)}
                    disabled={deletingId === plan.id}
                    className="h-auto w-auto text-muted-foreground hover:text-red-400 disabled:opacity-50"
                  >
                    {deletingId === plan.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <p className="mt-2 text-xs text-muted-foreground">Created {formatDate(plan.createdAt)}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
