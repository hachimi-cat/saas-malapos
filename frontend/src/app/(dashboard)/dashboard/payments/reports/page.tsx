'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { reportsApi, type PnlReport, type CashFlowReport } from '@/lib/payments-api';
import { Loader2, Download, TrendingUp, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * /dashboard/payments/reports — P&L + Cash Flow over a date range, with CSV export.
 *
 * MVP scope (Phase C):
 * - Preset ranges (This month, Last month, YTD, Last 90d) + custom.
 * - P&L tab: revenue − expenses = net profit.
 * - Cash Flow tab: opening / closing / net change + category breakdown.
 * - CSV export button: downloads raw ledger entries for the period.
 *
 * COGS (variant cost × units sold) is intentionally not included yet —
 * that joins stock movements with variant costPrice and belongs in a
 * follow-up once we have enough physical sales to validate the numbers.
 */

type TabId = 'pnl' | 'cashflow';

interface Preset { id: string; label: string; from: Date; to: Date }

function startOfMonth(d: Date) { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)); }
function endOfDay(d: Date) { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59)); }
function addDays(d: Date, n: number) { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; }

function buildPresets(): Preset[] {
  const now = new Date();
  const thisMonth = startOfMonth(now);
  const lastMonth = new Date(Date.UTC(thisMonth.getUTCFullYear(), thisMonth.getUTCMonth() - 1, 1));
  const endLastMonth = endOfDay(new Date(Date.UTC(thisMonth.getUTCFullYear(), thisMonth.getUTCMonth(), 0)));
  const ytd = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const ninety = addDays(now, -90);
  return [
    { id: 'thisMonth', label: 'This month', from: thisMonth, to: endOfDay(now) },
    { id: 'lastMonth', label: 'Last month', from: lastMonth, to: endLastMonth },
    { id: 'ytd', label: 'Year-to-date', from: ytd, to: endOfDay(now) },
    { id: 'last90', label: 'Last 90 days', from: ninety, to: endOfDay(now) },
  ];
}

export default function ReportsPage() {
  const presets = useMemo(() => buildPresets(), []);
  const [tab, setTab] = useState<TabId>('pnl');
  const [presetId, setPresetId] = useState<string>('thisMonth');
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null);
  const [pnl, setPnl] = useState<PnlReport | null>(null);
  const [cashFlow, setCashFlow] = useState<CashFlowReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);

  const activeRange = useMemo(() => {
    if (custom) return { from: custom.from, to: custom.to };
    const p = presets.find((x) => x.id === presetId) ?? presets[0];
    return { from: p.from.toISOString(), to: p.to.toISOString() };
  }, [presets, presetId, custom]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [p, c] = await Promise.all([
        reportsApi.pnl(activeRange),
        reportsApi.cashFlow(activeRange),
      ]);
      setPnl(p.data);
      setCashFlow(c.data);
    } catch (e: unknown) {
      setError((e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Failed to load reports');
    } finally { setLoading(false); }
  }, [activeRange]);

  useEffect(() => { load(); }, [load]);

  const fmt = useMemo(() => (amount: number, currency?: string | null) =>
    new Intl.NumberFormat(currency === 'USD' ? 'en-US' : 'id-ID', {
      style: 'currency',
      currency: currency || pnl?.currency || cashFlow?.currency || 'IDR',
      minimumFractionDigits: 0,
    }).format(amount), [pnl, cashFlow]);

  async function downloadCsv() {
    setDownloading(true);
    try {
      const blob = await reportsApi.downloadLedgerCsv(activeRange);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ledger-${activeRange.from.slice(0, 10)}-to-${activeRange.to.slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setError((e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Download failed');
    } finally { setDownloading(false); }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            P&L and cash-flow reports derived from the ledger. Export raw entries as CSV for your accountant.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={downloadCsv} disabled={downloading || loading}
          className="shrink-0 gap-1.5 whitespace-nowrap">
          {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Export CSV
        </Button>
      </header>

      {error && <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {/* Range + custom inputs */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-9 items-center gap-1 rounded-lg border border-border bg-muted/30 p-1">
          {presets.map((p) => (
            <Button key={p.id} type="button" variant="ghost" size="sm"
              onClick={() => { setPresetId(p.id); setCustom(null); }}
              className={`h-7 rounded-md px-3 text-xs font-medium ${presetId === p.id && !custom ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>
              {p.label}
            </Button>
          ))}
        </div>
        <div className="flex h-9 items-center gap-2 rounded-lg border border-border bg-muted/30 px-2">
          <Label htmlFor="rpt-from" className="text-xs font-normal text-muted-foreground">From</Label>
          <Input id="rpt-from" type="date" value={custom?.from?.slice(0, 10) ?? (presets.find((x) => x.id === presetId)?.from.toISOString().slice(0, 10) ?? '')}
            onChange={(e) => setCustom({ from: new Date(`${e.target.value}T00:00:00Z`).toISOString(), to: custom?.to ?? activeRange.to })}
            className="h-auto w-auto rounded border border-border bg-background px-2 py-1 text-xs" />
          <Label htmlFor="rpt-to" className="text-xs font-normal text-muted-foreground">To</Label>
          <Input id="rpt-to" type="date" value={custom?.to?.slice(0, 10) ?? (presets.find((x) => x.id === presetId)?.to.toISOString().slice(0, 10) ?? '')}
            onChange={(e) => setCustom({ from: custom?.from ?? activeRange.from, to: new Date(`${e.target.value}T23:59:59Z`).toISOString() })}
            className="h-auto w-auto rounded border border-border bg-background px-2 py-1 text-xs" />
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)}>
        <TabsList className="flex w-full gap-1 rounded-lg border border-border bg-muted/30 p-1">
          <TabsTrigger value="pnl" className="flex-1 rounded-md px-3 py-1.5 text-xs font-medium">
            P&amp;L Statement
          </TabsTrigger>
          <TabsTrigger value="cashflow" className="flex-1 rounded-md px-3 py-1.5 text-xs font-medium">
            Cash Flow
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="flex h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : tab === 'pnl' ? (
        <PnlView report={pnl} fmt={fmt} />
      ) : (
        <CashFlowView report={cashFlow} fmt={fmt} />
      )}
    </div>
  );
}

function PnlView({ report, fmt }: { report: PnlReport | null; fmt: (n: number, c?: string | null) => string }) {
  if (!report) return null;
  const r = report;
  return (
    <div className="space-y-4">
      <Card className="rounded-xl border border-border bg-card p-6">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Net profit</p>
        <p className={`mt-1 text-3xl font-bold ${r.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {fmt(r.netProfit, r.currency)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {r.entryCount} ledger entries in period
        </p>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="rounded-xl border border-border bg-card p-6">
          <p className="mb-3 text-sm font-semibold">Revenue</p>
          <Row label="Sales" value={fmt(r.revenue.sales, r.currency)} />
          <Row label="Refunds" value={`− ${fmt(r.revenue.refunds, r.currency)}`} />
          <div className="mt-3 border-t border-border pt-2">
            <Row label="Net revenue" value={fmt(r.revenue.net, r.currency)} strong />
          </div>
        </Card>
        <Card className="rounded-xl border border-border bg-card p-6">
          <p className="mb-3 text-sm font-semibold">Expenses</p>
          <Row label="Platform fees" value={fmt(r.expenses.platformFees, r.currency)} />
          <Row label="Channel fees" value={fmt(r.expenses.channelFees, r.currency)} />
          <Row label="Shipping costs" value={fmt(r.expenses.shippingCosts, r.currency)} />
          {r.expenses.shippingRefunds > 0 && (
            <Row label="Shipping refunds" value={`− ${fmt(r.expenses.shippingRefunds, r.currency)}`} />
          )}
          <div className="mt-3 border-t border-border pt-2">
            <Row label="Total expenses" value={fmt(r.expenses.total, r.currency)} strong />
          </div>
        </Card>
      </div>
    </div>
  );
}

function CashFlowView({ report, fmt }: { report: CashFlowReport | null; fmt: (n: number, c?: string | null) => string }) {
  if (!report) return null;
  const cf = report;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-xl border border-border bg-card p-6">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Opening balance</p>
          <p className="mt-1 text-xl font-bold">{fmt(cf.openingBalance, cf.currency)}</p>
        </Card>
        <Card className="rounded-xl border border-border bg-card p-6">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Net change</p>
          <p className={`mt-1 flex items-center gap-1 text-xl font-bold ${cf.netChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            <TrendingUp className="h-4 w-4" /> {cf.netChange >= 0 ? '+' : '−'}{fmt(Math.abs(cf.netChange), cf.currency)}
          </p>
        </Card>
        <Card className="rounded-xl border border-border bg-card p-6">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Closing balance</p>
          <p className="mt-1 text-xl font-bold">{fmt(cf.closingBalance, cf.currency)}</p>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="rounded-xl border border-border bg-card p-6">
          <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-green-600">
            <ArrowDownCircle className="h-4 w-4" /> Inflows · {fmt(cf.totalIn, cf.currency)}
          </p>
          {Object.keys(cf.inflows).length === 0 ? (
            <p className="text-xs text-muted-foreground">No inflows in this period.</p>
          ) : (
            Object.entries(cf.inflows).map(([k, v]) => (
              <Row key={k} label={categoryLabel(k)} value={fmt(v, cf.currency)} />
            ))
          )}
        </Card>
        <Card className="rounded-xl border border-border bg-card p-6">
          <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-red-600">
            <ArrowUpCircle className="h-4 w-4" /> Outflows · {fmt(cf.totalOut, cf.currency)}
          </p>
          {Object.keys(cf.outflows).length === 0 ? (
            <p className="text-xs text-muted-foreground">No outflows in this period.</p>
          ) : (
            Object.entries(cf.outflows).map(([k, v]) => (
              <Row key={k} label={categoryLabel(k)} value={fmt(v, cf.currency)} />
            ))
          )}
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1 text-sm ${strong ? 'font-semibold' : ''}`}>
      <span className={strong ? '' : 'text-muted-foreground'}>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

function categoryLabel(key: string): string {
  const map: Record<string, string> = {
    sale: 'Sales',
    refund: 'Refunds',
    platform_fee: 'Platform fees',
    channel_fee: 'Channel fees',
    shipping_cost: 'Shipping costs',
    shipping_refund: 'Shipping refunds',
    payout: 'Payouts',
    adjustment: 'Adjustments',
    uncategorized: 'Uncategorized',
  };
  return map[key] ?? key;
}
