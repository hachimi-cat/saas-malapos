'use client';

import { useEffect, useMemo, useState } from 'react';
import { TrendingUp, Package, AlertTriangle, BarChart3 } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { rupiah } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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

/*
 * Reports — the back-office read surface for Malapos. Pick an outlet (or all)
 * and a date range, then read the numbers: sales summary + payment-method mix,
 * a sales-by-day bar chart, top sellers, and a low-stock watchlist. Every
 * panel reads the real /reports/* endpoints; no mock data. Re-fetches whenever
 * the outlet or range changes.
 */

type Outlet = { id: string; name: string };

type Summary = {
  salesCount: number;
  gross: number;
  subtotalSum: number;
  discounts: number;
  tax: number;
  net: number;
  avgTicket: number;
  byMethod: { method: string; total: number; count: number }[];
};

type TopProduct = { variantId: string; productName: string; variantName: string; qty: number; revenue: number };
type DayPoint = { date: string; count: number; total: number };
type LowStock = {
  id: string;
  quantity: number;
  reorderPoint: number;
  variant: { name: string; product: { name: string } };
};

type Range = 'today' | '7' | '30';

const RANGES: { key: Range; label: string; days: number }[] = [
  { key: 'today', label: 'Today', days: 1 },
  { key: '7', label: '7 days', days: 7 },
  { key: '30', label: '30 days', days: 30 },
];

/** Compute [from, to] ISO strings for a preset. `to` = now; `from` = start of the window. */
function rangeToIso(range: Range): { from: string; to: string; days: number } {
  const to = new Date();
  const from = new Date();
  if (range === 'today') {
    from.setHours(0, 0, 0, 0);
  } else {
    const days = range === '7' ? 7 : 30;
    from.setDate(from.getDate() - (days - 1));
    from.setHours(0, 0, 0, 0);
  }
  const days = range === 'today' ? 1 : range === '7' ? 7 : 30;
  return { from: from.toISOString(), to: to.toISOString(), days };
}

export default function ReportsPage() {
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [outletId, setOutletId] = useState<string>(''); // '' = all outlets
  const [range, setRange] = useState<Range>('30');

  const [summary, setSummary] = useState<Summary | null>(null);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [salesByDay, setSalesByDay] = useState<DayPoint[]>([]);
  const [lowStock, setLowStock] = useState<LowStock[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load the outlet list once for the selector.
  useEffect(() => {
    (async () => {
      try {
        const o = await api.get<{ outlets: Outlet[] }>('/outlets');
        setOutlets(o.data.outlets ?? []);
      } catch {
        // The selector falls back to "All outlets" only; report fetch surfaces real errors.
      }
    })();
  }, []);

  // Re-fetch all report data whenever the outlet or range changes.
  useEffect(() => {
    const { from, to, days } = rangeToIso(range);
    const outletQ = outletId ? `&outletId=${encodeURIComponent(outletId)}` : '';
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [s, tp, sbd, ls] = await Promise.all([
          api.get<Summary>(`/reports/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${outletQ}`),
          api.get<{ topProducts: TopProduct[] }>(
            `/reports/top-products?limit=10&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${outletQ}`,
          ),
          api.get<{ salesByDay: DayPoint[] }>(
            `/reports/sales-by-day?days=${days}${outletId ? `&outletId=${encodeURIComponent(outletId)}` : ''}`,
          ),
          api.get<{ lowStock: LowStock[] }>(
            `/reports/low-stock${outletId ? `?outletId=${encodeURIComponent(outletId)}` : ''}`,
          ),
        ]);
        if (cancelled) return;
        setSummary(s.data);
        setTopProducts(tp.data.topProducts ?? []);
        setSalesByDay(sbd.data.salesByDay ?? []);
        setLowStock(ls.data.lowStock ?? []);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof ApiRequestError ? e.message : 'Failed to load reports');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [outletId, range]);

  const maxDayTotal = useMemo(() => salesByDay.reduce((m, d) => Math.max(m, d.total), 0), [salesByDay]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Reports</h1>
          <p className="text-sm text-muted-foreground">Sales performance, payment mix, and stock health.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={outletId || 'all'}
            onValueChange={(v) => setOutletId(v === 'all' ? '' : v)}
          >
            <SelectTrigger className="w-auto min-w-[10rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All outlets</SelectItem>
              {outlets.map((o) => (
                <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex rounded-md border border-border bg-card p-0.5">
            {RANGES.map((r) => (
              <Button
                key={r.key}
                size="sm"
                variant={range === r.key ? 'default' : 'ghost'}
                onClick={() => setRange(r.key)}
                className={range === r.key ? '' : 'text-muted-foreground'}
              >
                {r.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && !summary ? (
        <div className="mt-10 text-center text-muted-foreground">Loading…</div>
      ) : (
        <div className={`mt-6 space-y-6 ${loading ? 'opacity-60' : ''}`}>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard label="Gross sales" value={rupiah(summary?.gross ?? 0)} />
            <StatCard label="Net" value={rupiah(summary?.net ?? 0)} />
            <StatCard label="Tax" value={rupiah(summary?.tax ?? 0)} />
            <StatCard label="Sales count" value={(summary?.salesCount ?? 0).toLocaleString('id-ID')} />
            <StatCard label="Avg ticket" value={rupiah(summary?.avgTicket ?? 0)} />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Payment method breakdown */}
            <Panel title="Payment methods" icon={<TrendingUp className="h-4 w-4 text-primary" />}>
              {summary && summary.byMethod.length ? (
                <PaymentBreakdown rows={summary.byMethod} />
              ) : (
                <Empty>No payments in this range.</Empty>
              )}
            </Panel>

            {/* Sales by day */}
            <Panel
              title="Sales by day"
              icon={<BarChart3 className="h-4 w-4 text-primary" />}
              className="lg:col-span-2"
            >
              {salesByDay.length ? (
                <SalesByDayChart points={salesByDay} max={maxDayTotal} />
              ) : (
                <Empty>No sales recorded.</Empty>
              )}
            </Panel>
          </div>

          {/* Top products */}
          <Panel title="Top products" icon={<Package className="h-4 w-4 text-primary" />}>
            {topProducts.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topProducts.map((p, i) => (
                    <TableRow key={p.variantId}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell>
                        <span className="font-medium">{p.productName}</span>
                        {p.variantName !== 'Default' && (
                          <span className="text-muted-foreground"> · {p.variantName}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{p.qty.toLocaleString('id-ID')}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{rupiah(p.revenue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <Empty>No sales in this range yet.</Empty>
            )}
          </Panel>

          {/* Low stock — only when there's something to flag */}
          {lowStock.length > 0 && (
            <Panel title="Low stock" icon={<AlertTriangle className="h-4 w-4 text-destructive" />}>
              <ul className="divide-y divide-border/60">
                {lowStock.map((l) => (
                  <li key={l.id} className="flex items-center justify-between py-2 text-sm">
                    <span>
                      <span className="font-medium">{l.variant.product.name}</span>
                      {l.variant.name !== 'Default' && (
                        <span className="text-muted-foreground"> · {l.variant.name}</span>
                      )}
                    </span>
                    <span className="tabular-nums">
                      <span className={l.quantity <= l.reorderPoint ? 'font-semibold text-destructive' : 'font-medium'}>
                        {l.quantity}
                      </span>
                      <span className="text-muted-foreground"> / {l.reorderPoint} reorder</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </Card>
  );
}

function Panel({
  title,
  icon,
  className = '',
  children,
}: {
  title: string;
  icon: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={`p-4 ${className}`}>
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      {children}
    </Card>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{children}</p>;
}

function PaymentBreakdown({ rows }: { rows: { method: string; total: number; count: number }[] }) {
  const max = rows.reduce((m, r) => Math.max(m, r.total), 0) || 1;
  const label = (m: string) =>
    m === 'CASH' ? 'Cash' : m === 'QRIS' ? 'QRIS' : m === 'CARD' ? 'Card' : m;
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.method}>
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{label(r.method)}</span>
            <span className="tabular-nums">{rupiah(r.total)}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-accent">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.max(2, (r.total / max) * 100)}%` }}
            />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{r.count.toLocaleString('id-ID')} sale{r.count === 1 ? '' : 's'}</p>
        </div>
      ))}
    </div>
  );
}

function SalesByDayChart({ points, max }: { points: DayPoint[]; max: number }) {
  const safeMax = max || 1;
  const fmt = (iso: string) => {
    // iso is 'YYYY-MM-DD'; render as day-of-month for compactness.
    const d = new Date(`${iso}T00:00:00`);
    return Number.isNaN(d.getTime()) ? iso.slice(5) : String(d.getDate());
  };
  return (
    <div className="flex h-48 items-end gap-1 overflow-x-auto pb-1">
      {points.map((p) => (
        <div key={p.date} className="group flex min-w-[10px] flex-1 flex-col items-center justify-end">
          <div className="relative flex w-full flex-1 items-end">
            <div
              className="w-full rounded-t bg-primary/80 transition-colors group-hover:bg-primary"
              style={{ height: `${Math.max(2, (p.total / safeMax) * 100)}%` }}
              title={`${p.date} — ${rupiah(p.total)} · ${p.count} sale${p.count === 1 ? '' : 's'}`}
            />
          </div>
          <span className="mt-1 select-none text-[10px] text-muted-foreground">{fmt(p.date)}</span>
        </div>
      ))}
    </div>
  );
}
