'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, Loader2, LockKeyhole, Plus, Wallet } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { rupiah, parseRupiah } from '@/lib/money';
import { PageHeader } from '@/components/dashboard/page-header';
import { CloseShiftDialog } from '@/components/shifts/close-shift-dialog';
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/*
 * Shifts — cash-drawer sessions per cashier per outlet. Open a shift with a
 * starting float, sell against it, then close it by counting the drawer:
 * the backend reconciles counted vs expected cash (openingFloat + cash
 * sales − cash refunds) and records the over/short. Current-shift card on
 * top, cursor-paged history below, row click → /dashboard/shifts/[id].
 * Real backend: /api/v1/shifts.
 */

type ShiftStatus = 'OPEN' | 'CLOSED';

export type Shift = {
  id: string;
  outletId: string;
  cashierName: string | null;
  status: ShiftStatus;
  openingFloat: number;
  openedAt: string;
  closedAt: string | null;
  expectedCash: number | null;
  countedCash: number | null;
  cashDifference: number | null;
  notes: string | null;
};

type ShiftSummary = {
  salesCount: number;
  grossTotal: number;
  byMethod: { method: string; total: number }[];
  expectedCash: number;
};

type Outlet = { id: string; name: string };

function StatusBadge({ status }: { status: ShiftStatus }) {
  const cls = status === 'OPEN' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground';
  return (
    <Badge variant="outline" className={`rounded-full border-transparent ${cls}`}>
      {status === 'OPEN' ? 'Open' : 'Closed'}
    </Badge>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

function DifferenceCell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  if (value === 0) return <span className="text-muted-foreground">Rp 0</span>;
  return (
    <span className={value > 0 ? 'text-amber-600' : 'text-destructive'}>
      {value > 0 ? '+' : '−'}{rupiah(Math.abs(value))}
    </span>
  );
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'OPEN', label: 'Open' },
  { value: 'CLOSED', label: 'Closed' },
];

export default function ShiftsPage() {
  const router = useRouter();
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [outletId, setOutletId] = useState('');
  const [loading, setLoading] = useState(true);

  // Current shift (the caller's OPEN shift at the selected outlet) + its
  // live summary (expected cash comes from the detail endpoint).
  const [current, setCurrent] = useState<Shift | null>(null);
  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  const [currentLoading, setCurrentLoading] = useState(false);

  // History list.
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState<Shift[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [opening, setOpening] = useState(false);
  const [closing, setClosing] = useState(false);

  // Bootstrap: outlets first, then default to the first one.
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<{ outlets: Outlet[] }>('/outlets');
        setOutlets(res.data.outlets ?? []);
        setOutletId(res.data.outlets?.[0]?.id ?? '');
      } catch (e) {
        setError(e instanceof ApiRequestError ? e.message : 'Failed to load outlets');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const loadCurrent = useCallback(async () => {
    if (!outletId) return;
    setCurrentLoading(true);
    try {
      const res = await api.get<{ shift: Shift | null }>(`/shifts/current?outletId=${outletId}`);
      const shift = res.data.shift;
      setCurrent(shift);
      if (shift) {
        const detail = await api.get<{ shift: Shift; summary: ShiftSummary }>(`/shifts/${shift.id}`);
        setSummary(detail.data.summary);
      } else {
        setSummary(null);
      }
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to load current shift');
    } finally {
      setCurrentLoading(false);
    }
  }, [outletId]);

  const loadList = useCallback(async () => {
    if (!outletId) return;
    setListLoading(true);
    try {
      const qs = new URLSearchParams({ outletId });
      if (status) qs.set('status', status);
      const res = await api.get<Shift[]>(`/shifts?${qs}`);
      setRows(res.data ?? []);
      setCursor(res.meta.cursor ?? null);
      setHasMore(Boolean(res.meta.hasMore));
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to load shifts');
    } finally {
      setListLoading(false);
    }
  }, [outletId, status]);

  useEffect(() => {
    setError(null);
    loadCurrent();
    loadList();
  }, [loadCurrent, loadList]);

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const qs = new URLSearchParams({ outletId, cursor });
      if (status) qs.set('status', status);
      const res = await api.get<Shift[]>(`/shifts?${qs}`);
      setRows((r) => [...r, ...(res.data ?? [])]);
      setCursor(res.meta.cursor ?? null);
      setHasMore(Boolean(res.meta.hasMore));
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to load more');
    } finally {
      setLoadingMore(false);
    }
  }

  async function refresh() {
    await Promise.all([loadCurrent(), loadList()]);
  }

  if (loading) return <div className="p-6 text-muted-foreground">Loading…</div>;

  if (!outlets.length) {
    return (
      <div className="mx-auto max-w-xl p-8 text-center">
        <h1 className="text-xl font-semibold">No outlet yet</h1>
        <p className="mt-2 text-muted-foreground">
          Create your first store under{' '}
          <a href="/dashboard/outlets" className="text-primary underline">Outlets</a> to run cash shifts.
        </p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Shifts"
        description="Open the drawer with a starting float, close it by counting the cash — over/short is reconciled per shift."
        action={
          <Select value={outletId} onValueChange={setOutletId}>
            <SelectTrigger className="w-auto min-w-[12rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {outlets.map((o) => (
                <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {error && (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Current-shift card */}
      <Card className="p-6">
        {currentLoading && !current ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking current shift…
          </div>
        ) : current ? (
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">Shift open</p>
                  <StatusBadge status="OPEN" />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Since {formatDate(current.openedAt)}
                  {current.cashierName ? ` · ${current.cashierName}` : ''}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Opening float</p>
                    <p className="font-medium">{rupiah(current.openingFloat)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Expected in drawer</p>
                    <p className="font-medium">{summary ? rupiah(summary.expectedCash) : '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Sales</p>
                    <p className="font-medium">{summary?.salesCount ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Gross total</p>
                    <p className="font-medium">{summary ? rupiah(summary.grossTotal) : '—'}</p>
                  </div>
                </div>
              </div>
            </div>
            <Button onClick={() => setClosing(true)} className="shrink-0">
              <LockKeyhole className="h-4 w-4" /> Close shift
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Wallet className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-semibold">No open shift at this outlet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Open one with the drawer&apos;s starting float before taking cash payments.
                </p>
              </div>
            </div>
            <Button onClick={() => setOpening(true)} className="shrink-0">
              <Plus className="h-4 w-4" /> Open shift
            </Button>
          </div>
        )}
      </Card>

      {/* History */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Select value={status || 'all'} onValueChange={(v) => setStatus(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-auto min-w-[10rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value || 'all'} value={o.value || 'all'}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {listLoading && <span className="text-xs text-muted-foreground">Refreshing…</span>}
      </div>

      <Card className="mt-4 overflow-hidden">
        {listLoading && !rows.length ? (
          <div className="p-10 text-center text-muted-foreground">Loading…</div>
        ) : !rows.length ? (
          <div className="p-10 text-center text-muted-foreground">No shifts at this outlet yet.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Opened</TableHead>
                <TableHead>Cashier</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Opening float</TableHead>
                <TableHead className="text-right">Expected</TableHead>
                <TableHead className="text-right">Counted</TableHead>
                <TableHead className="text-right">Over / short</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => (
                <TableRow
                  key={s.id}
                  onClick={() => router.push(`/dashboard/shifts/${s.id}`)}
                  className="cursor-pointer"
                >
                  <TableCell className="font-medium">{formatDate(s.openedAt)}</TableCell>
                  <TableCell className="text-muted-foreground">{s.cashierName ?? '—'}</TableCell>
                  <TableCell><StatusBadge status={s.status} /></TableCell>
                  <TableCell className="text-right text-muted-foreground">{rupiah(s.openingFloat)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {s.expectedCash === null ? '—' : rupiah(s.expectedCash)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {s.countedCash === null ? '—' : rupiah(s.countedCash)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    <DifferenceCell value={s.cashDifference} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {!listLoading && hasMore && (
        <div className="mt-4 text-center">
          <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
            {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
            {loadingMore ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}

      {opening && (
        <OpenShiftDialog
          outlet={outlets.find((o) => o.id === outletId) ?? outlets[0]}
          onClose={() => setOpening(false)}
          onOpened={async () => {
            setOpening(false);
            await refresh();
          }}
        />
      )}

      {closing && current && summary && (
        <CloseShiftDialog
          shiftId={current.id}
          expectedCash={summary.expectedCash}
          onClose={() => setClosing(false)}
          onClosed={async () => {
            setClosing(false);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function OpenShiftDialog({
  outlet,
  onClose,
  onOpened,
}: {
  outlet: Outlet;
  onClose: () => void;
  onOpened: () => Promise<void>;
}) {
  const [float, setFloat] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (float === null || float < 0) {
      setError('Enter the starting float (0 is fine).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post('/shifts/open', { outletId: outlet.id, openingFloat: float });
      await onOpened();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Failed to open shift');
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Open shift</DialogTitle>
          <p className="text-xs text-muted-foreground">At {outlet.name}</p>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="os-float">Starting float</Label>
            <Input
              id="os-float"
              inputMode="numeric"
              autoFocus
              value={float === null ? '' : rupiah(float)}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^\d]/g, '');
                setFloat(raw === '' ? null : parseRupiah(raw));
              }}
              placeholder="Rp 0"
            />
            <p className="text-xs text-muted-foreground">
              The cash already in the drawer when the shift starts.
            </p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="flex-row gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1" disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || float === null} className="flex-1">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? 'Opening…' : 'Open shift'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
