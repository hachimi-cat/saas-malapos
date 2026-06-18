'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ScanLine, Receipt, Boxes, Package, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { rupiah } from '@/lib/money';

/*
 * Dashboard overview — today's pulse + quick jumps. Pulls the reports
 * summary (gross/count) for today and the recent sales feed. The auth
 * gate + portal shell live in the route-group layout.
 */

type Summary = { salesCount: number; gross: number; avgTicket: number };
type Sale = { id: string; number: string; total: number; status: string; createdAt: string };
type Low = { id: string };

function todayRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return { from: start.toISOString(), to: now.toISOString() };
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [recent, setRecent] = useState<Sale[]>([]);
  const [lowCount, setLowCount] = useState<number | null>(null);
  const [hasOutlet, setHasOutlet] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { from, to } = todayRange();
      const [s, r, low, outlets] = await Promise.allSettled([
        api.get<Summary>(`/reports/summary?from=${from}&to=${to}`),
        api.get<Sale[]>('/sales?limit=8'),
        api.get<{ lowStock: Low[] }>('/reports/low-stock'),
        api.get<{ outlets: unknown[] }>('/outlets'),
      ]);
      if (s.status === 'fulfilled') setSummary(s.value.data);
      if (r.status === 'fulfilled') setRecent((r.value.data as Sale[]) ?? []);
      if (low.status === 'fulfilled') setLowCount(low.value.data.lowStock?.length ?? 0);
      if (outlets.status === 'fulfilled') setHasOutlet((outlets.value.data.outlets?.length ?? 0) > 0);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Today&apos;s sales at a glance.</p>
        </div>
        <Link
          href="/dashboard/sell"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          <ScanLine className="h-4 w-4" /> Open sell screen
        </Link>
      </header>

      {hasOutlet === false && (
        <div className="mb-6 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
          <p className="font-medium">Finish setup to start selling</p>
          <p className="mt-1 text-muted-foreground">
            Create an <Link href="/dashboard/outlets" className="text-primary underline">outlet</Link> and add a few{' '}
            <Link href="/dashboard/products" className="text-primary underline">products</Link>, then head to the sell screen.
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Sales today" value={loading ? '…' : String(summary?.salesCount ?? 0)} icon={<Receipt className="h-4 w-4" />} />
        <Stat label="Gross today" value={loading ? '…' : rupiah(summary?.gross ?? 0)} icon={<ScanLine className="h-4 w-4" />} />
        <Stat label="Avg ticket" value={loading ? '…' : rupiah(summary?.avgTicket ?? 0)} icon={<Package className="h-4 w-4" />} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Recent sales</h2>
            <Link href="/dashboard/sales" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              All sales <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="overflow-hidden rounded-lg border border-border">
            {recent.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No sales yet.</p>}
            {recent.map((s) => (
              <div key={s.id} className="flex items-center justify-between border-b border-border px-4 py-2.5 text-sm last:border-0">
                <span className="font-medium">{s.number}</span>
                <span className="text-xs text-muted-foreground">{new Date(s.createdAt).toLocaleString('id-ID')}</span>
                <span className="font-semibold">{rupiah(s.total)}</span>
              </div>
            ))}
          </div>
        </section>

        <aside>
          <h2 className="mb-2 text-sm font-semibold">Inventory</h2>
          <Link href="/dashboard/inventory" className="block rounded-lg border border-border bg-card p-4 hover:border-primary">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Boxes className="h-4 w-4" /> Low-stock items
            </div>
            <p className={`mt-1 text-2xl font-bold ${lowCount ? 'text-destructive' : ''}`}>{loading ? '…' : (lowCount ?? 0)}</p>
            <p className="text-xs text-muted-foreground">Tap to review &amp; restock</p>
          </Link>
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {icon} {label}
      </div>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}
