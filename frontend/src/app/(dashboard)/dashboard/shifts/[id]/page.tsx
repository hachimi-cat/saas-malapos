'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Loader2, LockKeyhole } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { rupiah } from '@/lib/money';
import { CloseShiftDialog } from '@/components/shifts/close-shift-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

/*
 * Shift detail — one cash-drawer session in full: who ran it, when, the
 * cash reconciliation (opening float → expected → counted → over/short)
 * and the sales summary (count, gross, tender breakdown). An OPEN shift
 * can be closed from here too. Real backend: GET /shifts/:id (the
 * summary's expectedCash is computed live while the shift is open).
 */

type ShiftStatus = 'OPEN' | 'CLOSED';

type Shift = {
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

function methodLabel(m: string): string {
  return m === 'QRIS' ? 'QRIS' : m.charAt(0) + m.slice(1).toLowerCase();
}

export default function ShiftDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [shift, setShift] = useState<Shift | null>(null);
  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  const [outletName, setOutletName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ shift: Shift; summary: ShiftSummary }>(`/shifts/${id}`);
      setShift(res.data.shift);
      setSummary(res.data.summary);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to load shift');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Outlet name for the header — the shift row only carries the id.
  useEffect(() => {
    if (!shift) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<{ outlets: Outlet[] }>('/outlets');
        if (cancelled) return;
        setOutletName(res.data.outlets?.find((o) => o.id === shift.outletId)?.name ?? null);
      } catch {
        /* header just omits the outlet */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shift]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (!shift) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/shifts" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Shifts
        </Link>
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error ?? 'Shift not found'}
        </div>
      </div>
    );
  }

  const expected = shift.status === 'OPEN' ? summary?.expectedCash ?? null : shift.expectedCash;

  return (
    <div className="space-y-6">
      <nav className="text-xs text-muted-foreground">
        <Link href="/dashboard/shifts" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Shifts
        </Link>
        <span className="mx-1.5 text-muted-foreground/50">/</span>
        <span className="font-mono text-foreground">{shift.id}</span>
      </nav>

      {/* Header: gross + status + meta + actions */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tabular-nums tracking-tight">
            {summary ? rupiah(summary.grossTotal) : '—'}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <StatusBadge status={shift.status} />
            <span className="text-xs text-muted-foreground">
              {formatDate(shift.openedAt)}
              {shift.closedAt ? ` → ${formatDate(shift.closedAt)}` : ' → now'}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {outletName ?? '—'} · Cashier {shift.cashierName ?? '—'}
          </p>
        </div>
        {shift.status === 'OPEN' && (
          <Button onClick={() => setClosing(true)}>
            <LockKeyhole className="h-4 w-4" /> Close shift
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {/* Cash reconciliation */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cash reconciliation</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Opening float</dt>
                <dd className="font-medium">{rupiah(shift.openingFloat)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">
                  Expected in drawer{shift.status === 'OPEN' ? ' (live)' : ''}
                </dt>
                <dd className="font-medium">{expected === null ? '—' : rupiah(expected)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Counted at close</dt>
                <dd className="font-medium">{shift.countedCash === null ? '—' : rupiah(shift.countedCash)}</dd>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-2">
                <dt className="text-muted-foreground">Over / short</dt>
                <dd className="font-semibold">
                  {shift.cashDifference === null ? (
                    '—'
                  ) : shift.cashDifference === 0 ? (
                    <span className="text-primary">Balanced</span>
                  ) : (
                    <span className={shift.cashDifference > 0 ? 'text-amber-600' : 'text-destructive'}>
                      {shift.cashDifference > 0 ? 'Over' : 'Short'} {rupiah(Math.abs(shift.cashDifference))}
                    </span>
                  )}
                </dd>
              </div>
            </dl>
            {shift.notes && (
              <div className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                {shift.notes}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sales summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sales this shift</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Completed sales</dt>
                <dd className="font-medium">{summary?.salesCount ?? '—'}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Gross total</dt>
                <dd className="font-medium">{summary ? rupiah(summary.grossTotal) : '—'}</dd>
              </div>
            </dl>
            {summary && summary.byMethod.length > 0 && (
              <div className="mt-3 border-t border-border pt-3">
                <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">By tender</p>
                <dl className="space-y-1.5 text-sm">
                  {summary.byMethod.map((m) => (
                    <div key={m.method} className="flex items-center justify-between">
                      <dt className="text-muted-foreground">{methodLabel(m.method)}</dt>
                      <dd className="font-medium">{rupiah(m.total)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {closing && expected !== null && (
        <CloseShiftDialog
          shiftId={shift.id}
          expectedCash={expected}
          onClose={() => setClosing(false)}
          onClosed={async () => {
            setClosing(false);
            setLoading(true);
            await load();
          }}
        />
      )}
    </div>
  );
}
