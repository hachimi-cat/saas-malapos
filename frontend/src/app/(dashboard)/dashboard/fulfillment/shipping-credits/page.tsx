'use client';

import { useEffect, useState } from 'react';
import {
  Loader2,
  Wallet,
  Plus,
  Truck,
  RefreshCcw,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { shippingCreditsApi, type ShippingCreditBalance, type ShippingCreditTransaction } from '@/lib/fulfillment-api';
import { ApiRequestError } from '@/lib/api';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { FulfillmentModuleOff } from '@/components/fulfillment/module-off';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/*
 * Fulfillment → Shipping Credits. malapos port of storlaunch's page over
 * /api/v1/fulfillment/shipping-credits. Prepaid balance used to book
 * couriers; top up via a Plugipay hosted checkout. Each shipment debits
 * this balance at booking time. IDR money.
 */

const PRESET_AMOUNTS = [50_000, 100_000, 250_000, 500_000, 1_000_000];

const KIND_META: Record<ShippingCreditTransaction['kind'], { label: string; icon: LucideIcon; tone: string }> = {
  topup: { label: 'Top up', icon: ArrowUpRight, tone: 'text-emerald-400' },
  shipment_charge: { label: 'Shipment charge', icon: Truck, tone: 'text-blue-400' },
  shipment_refund: { label: 'Refund', icon: ArrowDownRight, tone: 'text-amber-400' },
  manual_adjustment: { label: 'Adjustment', icon: Sparkles, tone: 'text-muted-foreground' },
};

export default function ShippingCreditsPage() {
  const [balance, setBalance] = useState<ShippingCreditBalance | null>(null);
  const [transactions, setTransactions] = useState<ShippingCreditTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [moduleOff, setModuleOff] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState<number>(100_000);
  const [topupBusy, setTopupBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [b, t] = await Promise.all([
        shippingCreditsApi.get(),
        shippingCreditsApi.listTransactions({ limit: 30 }),
      ]);
      setBalance(b.data ?? null);
      setTransactions(t.data?.data ?? []);
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 409) setModuleOff(true);
      else setError(e instanceof ApiRequestError ? e.message : 'Failed to load shipping credits');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleTopup() {
    setTopupBusy(true);
    setError(null);
    try {
      const res = await shippingCreditsApi.topup(amount);
      if (res.data?.checkoutUrl) {
        window.location.href = res.data.checkoutUrl;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Top-up failed');
      setTopupBusy(false);
    }
  }

  if (moduleOff) return <FulfillmentModuleOff blurb="Shipping credits are the prepaid balance Fulkruma uses to book couriers. Turn on the Fulfillment module to top up." />;
  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const balanceAmount = balance?.balance ?? 0;
  const balanceLow = balanceAmount < 50_000;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight font-display">Shipping Credits</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Prepaid balance used to dispatch couriers via Biteship. Top up here so booking a
          pickup actually allocates a driver. Each shipment debits this balance based on the
          courier rate at booking time.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-[2fr_3fr]">
        <Card className={cn('p-6', balanceLow && 'border-amber-500/40')}>
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <Wallet className="h-3.5 w-3.5" />
            Current balance
          </div>
          <p className={cn('mt-2 text-3xl font-bold tabular-nums', balanceLow && 'text-amber-400')}>
            {formatCurrency(balanceAmount)}
          </p>
          {balanceLow && (
            <p className="mt-2 text-xs text-amber-300">
              Balance is low. Top up so the next pickup confirmation doesn&apos;t fail.
            </p>
          )}
          <Button
            type="button"
            variant="link"
            onClick={() => void load()}
            className="mt-3 h-auto gap-1 p-0 text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCcw className="h-3 w-3" /> Refresh
          </Button>
        </Card>

        <Card className="space-y-4 p-6">
          <div>
            <h2 className="text-sm font-semibold font-display">Top up balance</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              You&apos;ll be redirected to checkout — pay via QRIS, virtual account, e-wallet, or
              card. Credit applies as soon as payment clears.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {PRESET_AMOUNTS.map((p) => (
              <Button
                key={p}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAmount(p)}
                className={cn(
                  'rounded-full text-xs tabular-nums',
                  amount === p ? 'border-primary bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary' : 'text-muted-foreground',
                )}
              >
                {formatCurrency(p)}
              </Button>
            ))}
          </div>
          <div>
            <Label htmlFor="custom-amount" className="mb-1 block text-xs">Custom amount (IDR)</Label>
            <Input
              id="custom-amount"
              type="number"
              value={amount}
              min={10_000}
              max={10_000_000}
              step={10_000}
              onChange={(e) => setAmount(Math.max(10_000, Number(e.target.value) || 0))}
              className="max-w-xs font-mono tabular-nums"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">Min Rp 10,000 · Max Rp 10,000,000 per top-up.</p>
          </div>
          {error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}
          <Button
            type="button"
            onClick={handleTopup}
            disabled={topupBusy || amount < 10_000}
          >
            {topupBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Top up {formatCurrency(amount)}
          </Button>
        </Card>
      </div>

      <Card>
        <div className="border-b border-border p-4">
          <h2 className="text-sm font-semibold font-display">Transactions</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Most recent first.</p>
        </div>
        {transactions.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No transactions yet. Top up to get started.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {transactions.map((t) => {
              const meta = KIND_META[t.kind];
              const Icon = meta.icon;
              const isCredit = t.amount > 0;
              return (
                <li key={t.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted', meta.tone)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{meta.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(t.createdAt)}
                        {t.memo && <> · {t.memo}</>}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={cn('text-sm font-semibold tabular-nums', isCredit ? 'text-emerald-400' : 'text-foreground')}>
                      {isCredit ? '+' : ''}{formatCurrency(t.amount)}
                    </p>
                    <p className="text-[10px] text-muted-foreground tabular-nums">
                      Balance: {formatCurrency(t.balanceAfter)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
