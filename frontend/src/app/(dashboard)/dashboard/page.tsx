'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ScanLine, Receipt, Boxes, Package, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { rupiah } from '@/lib/money';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Today&apos;s sales at a glance.</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/sell">
            <ScanLine /> Open sell screen
          </Link>
        </Button>
      </div>

      {hasOutlet === false && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="space-y-1.5">
            <CardTitle className="text-base">Finish setup to start selling</CardTitle>
            <CardDescription>
              Create an{' '}
              <Link href="/dashboard/outlets" className="font-medium text-primary underline-offset-4 hover:underline">
                outlet
              </Link>{' '}
              and add a few{' '}
              <Link href="/dashboard/products" className="font-medium text-primary underline-offset-4 hover:underline">
                products
              </Link>
              , then head to the sell screen.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Sales today" value={loading ? '—' : String(summary?.salesCount ?? 0)} icon={Receipt} />
        <Stat label="Gross today" value={loading ? '—' : rupiah(summary?.gross ?? 0)} icon={ScanLine} />
        <Stat label="Avg ticket" value={loading ? '—' : rupiah(summary?.avgTicket ?? 0)} icon={Package} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
            <div className="space-y-1.5">
              <CardTitle>Recent sales</CardTitle>
              <CardDescription>Your latest transactions today.</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/sales">
                View all <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {recent.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">No sales yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Receipt</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead className="pr-6 text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recent.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="pl-6 font-medium">{s.number}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(s.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                      </TableCell>
                      <TableCell className="pr-6 text-right font-medium tabular-nums">{rupiah(s.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardDescription className="text-sm font-medium text-foreground">Low-stock items</CardDescription>
            <Boxes className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="flex-1">
            <div className={`text-3xl font-bold tabular-nums ${lowCount ? 'text-destructive' : ''}`}>
              {loading ? '—' : (lowCount ?? 0)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Items below their reorder point.</p>
          </CardContent>
          <CardFooter>
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link href="/dashboard/inventory">Review &amp; restock</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardDescription className="text-sm font-medium text-foreground">{label}</CardDescription>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}
