'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Loader2, Archive, CheckCircle2, Plus } from 'lucide-react';
import { plansApi, Plan } from '@/lib/payments-api';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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
      setPlan(res.data as unknown as Plan);
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

  if (!plan) return <div className="p-8 text-sm text-destructive">{error ?? 'Not found'}</div>;

  const prices = plan.prices ?? [];
  const intervalCount = plan.intervalCount ?? 1;

  return (
    <div className="space-y-6">
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
            <h1 className="text-2xl font-semibold tracking-tight font-display">{plan.name}</h1>
            <Badge
              variant="outline"
              className={cn(
                'rounded-full border-transparent px-2 py-0.5 text-xs font-medium',
                plan.active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-muted text-muted-foreground',
              )}
            >
              {plan.active ? 'Active' : 'Archived'}
            </Badge>
          </div>
          <p className="mt-1 font-mono text-[13px] text-muted-foreground">{plan.id}</p>
          {plan.description && <p className="mt-2 max-w-[62ch] text-sm text-muted-foreground">{plan.description}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={toggleActive} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : plan.active ? null : <CheckCircle2 className="h-4 w-4" />}
            {plan.active ? 'Deactivate' : 'Activate'}
          </Button>
          {plan.active && (
            <Button
              type="button"
              variant="outline"
              onClick={archive}
              disabled={busy}
              className="border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20"
            >
              <Archive className="h-4 w-4" /> Archive
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs font-mono text-destructive">
          {error}
        </div>
      )}
      {info && (
        <div className="rounded-md border border-border bg-emerald-500/10 px-3 py-2 text-xs font-mono text-emerald-400">
          {info}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[2fr_1fr]">
        <Card className="rounded-lg border border-border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold font-display">Prices</h2>
            <Button
              type="button"
              variant="link"
              onClick={() => setShowAddPrice((s) => !s)}
              className="h-auto gap-1 p-0 text-xs"
            >
              <Plus className="h-3 w-3" /> Add price
            </Button>
          </div>

          {showAddPrice && (
            <div className="mb-4 rounded-md border border-primary/40 bg-primary/5 p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="newCurrency" className="text-[11px]">Currency</Label>
                  <Input
                    id="newCurrency"
                    value={newCurrency}
                    onChange={(e) => setNewCurrency(e.target.value.toUpperCase())}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="newAmount" className="text-[11px]">Unit amount</Label>
                  <Input
                    id="newAmount"
                    type="number"
                    placeholder="99000"
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="newTaxMode" className="text-[11px]">Tax mode</Label>
                  <Select
                    value={newTaxMode}
                    onValueChange={(v) => setNewTaxMode(v as 'inclusive' | 'exclusive')}
                  >
                    <SelectTrigger id="newTaxMode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inclusive">Inclusive</SelectItem>
                      <SelectItem value="exclusive">Exclusive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={addPrice}
                  disabled={busy || !newAmount}
                >
                  {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                  Add flat price
                </Button>
                <Button
                  type="button"
                  variant="link"
                  onClick={() => setShowAddPrice(false)}
                  className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </Button>
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
              <Table className="text-sm">
                <TableHeader>
                  <TableRow className="border-b border-border text-left">
                    <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground">Price ID</TableHead>
                    <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground">Model</TableHead>
                    <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground">Amount</TableHead>
                    <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground">Currency</TableHead>
                    <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground">Status</TableHead>
                    <TableHead className="px-3 py-2"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border">
                  {prices.map((pr) => (
                    <TableRow key={pr.id} className="hover:bg-muted/30">
                      <TableCell className="px-3 py-2 font-mono text-xs">{pr.id}</TableCell>
                      <TableCell className="px-3 py-2 text-xs capitalize">{pr.model}</TableCell>
                      <TableCell className="px-3 py-2 font-semibold tabular-nums">
                        {pr.currency === 'IDR' ? formatCurrency(pr.unitAmount) : `${pr.currency} ${pr.unitAmount}`}
                      </TableCell>
                      <TableCell className="px-3 py-2 font-mono text-xs">{pr.currency}</TableCell>
                      <TableCell className="px-3 py-2">
                        <Badge
                          variant="outline"
                          className={cn(
                            'rounded-full border-transparent px-2 py-0.5 text-xs font-medium',
                            pr.active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {pr.active ? 'Active' : 'Archived'}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-3 py-2 text-right">
                        <Button
                          type="button"
                          variant="link"
                          onClick={() => togglePrice(pr.id, !pr.active)}
                          disabled={busy}
                          className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                        >
                          {pr.active ? 'Archive' : 'Unarchive'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ul className="space-y-3 md:hidden">
              {prices.map((pr) => (
                <li key={pr.id} className="rounded-lg border border-border bg-card/50 p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold tabular-nums">
                      {pr.currency === 'IDR' ? formatCurrency(pr.unitAmount) : `${pr.currency} ${pr.unitAmount}`}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        'rounded-full border-transparent px-2 py-0.5 text-xs font-medium',
                        pr.active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {pr.active ? 'Active' : 'Archived'}
                    </Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    <span className="capitalize">{pr.model}</span> · <span className="font-mono">{pr.currency}</span>
                  </div>
                  <div className="mt-1 break-all font-mono text-[10px] text-muted-foreground/70">{pr.id}</div>
                  <div className="mt-2 text-right">
                    <Button
                      type="button"
                      variant="link"
                      onClick={() => togglePrice(pr.id, !pr.active)}
                      disabled={busy}
                      className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                    >
                      {pr.active ? 'Archive' : 'Unarchive'}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            </>
          )}
        </Card>

        <Card className="rounded-lg border border-border bg-card p-6">
          <h2 className="mb-4 text-base font-semibold font-display">Schedule</h2>
          <div className="space-y-3">
            <Kv label="Interval" value={`Every ${intervalCount > 1 ? `${intervalCount} ${plan.interval}s` : plan.interval}`} />
            <Kv label="Trial days" value={String(plan.trialDays ?? plan.trialPeriodDays ?? 0)} />
            <Kv label="Created" value={formatDate(plan.createdAt)} />
          </div>
        </Card>
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
