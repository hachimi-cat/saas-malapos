'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Receipt, Loader2 } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { rupiah } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
 * Sales history — the merchant's ledger of every transaction. Filter by
 * outlet + status, page through with a cursor "Load more", and click a row
 * to open the full sale-detail page (line items, tax, payments, change,
 * cashier, shipment) at /dashboard/sales/[id]. Void + refund affordances
 * live on that detail page. Real backend.
 */

type SaleStatus = 'COMPLETED' | 'VOIDED' | 'PARKED' | 'PARTIALLY_REFUNDED' | 'REFUNDED';

type Outlet = { id: string; name: string };

type Payment = { method: string; amount: number; tendered?: number; change?: number; reference?: string | null };

type SaleRow = {
  id: string;
  number: string;
  total: number;
  status: SaleStatus;
  createdAt: string;
  cashierName: string | null;
  payments: Payment[];
  _count: { items: number };
};

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'PARKED', label: 'Parked' },
  { value: 'VOIDED', label: 'Voided' },
  { value: 'PARTIALLY_REFUNDED', label: 'Partially refunded' },
  { value: 'REFUNDED', label: 'Refunded' },
];

function statusLabel(status: SaleStatus): string {
  if (status === 'PARTIALLY_REFUNDED') return 'Partially refunded';
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function StatusBadge({ status }: { status: SaleStatus }) {
  const cls =
    status === 'COMPLETED'
      ? 'bg-primary/10 text-primary'
      : status === 'PARKED'
      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
      : status === 'REFUNDED' || status === 'PARTIALLY_REFUNDED'
      ? 'bg-destructive/10 text-destructive'
      : 'bg-muted text-muted-foreground';
  return (
    <Badge variant="outline" className={`rounded-full border-transparent ${cls}`}>
      {statusLabel(status)}
    </Badge>
  );
}

function methodLabel(m: string): string {
  return m === 'QRIS' ? 'QRIS' : m.charAt(0) + m.slice(1).toLowerCase();
}

function paymentSummary(payments: Payment[]): string {
  if (!payments.length) return '—';
  return Array.from(new Set(payments.map((p) => methodLabel(p.method)))).join(', ');
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function SalesPage() {
  const router = useRouter();
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [outletId, setOutletId] = useState('');
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load outlets once.
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<{ outlets: Outlet[] }>('/outlets');
        setOutlets(res.data.outlets ?? []);
      } catch {
        // Outlet filter is optional; surface load errors via the list fetch.
      }
    })();
  }, []);

  // (Re)load the list whenever a filter changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams();
        if (outletId) qs.set('outletId', outletId);
        if (status) qs.set('status', status);
        const res = await api.get<SaleRow[]>(`/sales${qs.toString() ? `?${qs}` : ''}`);
        if (cancelled) return;
        setRows(res.data ?? []);
        setCursor(res.meta.cursor ?? null);
        setHasMore(Boolean(res.meta.hasMore));
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof ApiRequestError ? e.message : 'Failed to load sales');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [outletId, status]);

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const qs = new URLSearchParams();
      if (outletId) qs.set('outletId', outletId);
      if (status) qs.set('status', status);
      qs.set('cursor', cursor);
      const res = await api.get<SaleRow[]>(`/sales?${qs}`);
      setRows((r) => [...r, ...(res.data ?? [])]);
      setCursor(res.meta.cursor ?? null);
      setHasMore(Boolean(res.meta.hasMore));
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to load more');
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <Receipt className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">Sales</h1>
          <p className="text-sm text-muted-foreground">Every transaction across your outlets. Click a row for the full receipt.</p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
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
        <Select
          value={status || 'all'}
          onValueChange={(v) => setStatus(v === 'all' ? '' : v)}
        >
          <SelectTrigger className="w-auto min-w-[10rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value || 'all'}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="mt-4 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-muted-foreground">Loading…</div>
        ) : error ? (
          <div className="p-10 text-center text-sm text-destructive">{error}</div>
        ) : !rows.length ? (
          <div className="p-10 text-center text-muted-foreground">No sales match these filters yet.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Receipt #</TableHead>
                <TableHead>Date / time</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.id}
                  onClick={() => router.push(`/dashboard/sales/${row.id}`)}
                  className="cursor-pointer"
                >
                  <TableCell className="font-medium">{row.number}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(row.createdAt)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{row._count.items}</TableCell>
                  <TableCell className="text-muted-foreground">{paymentSummary(row.payments)}</TableCell>
                  <TableCell className="text-right font-medium">{rupiah(row.total)}</TableCell>
                  <TableCell><StatusBadge status={row.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {!loading && !error && hasMore && (
        <div className="mt-4 text-center">
          <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
            {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
            {loadingMore ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  );
}
