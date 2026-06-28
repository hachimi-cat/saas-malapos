'use client';

/*
 * Audit Log — a read-only activity feed for the workspace. Surfaces the
 * domain events written to the outbox (sales, billing, …) — the same
 * append-only store that drives webhook delivery — so an operator can see
 * exactly what happened and when. Cursor-paginated ("Load more"); each row
 * expands to the raw event payload.
 */

import { useCallback, useEffect, useState } from 'react';
import { api, ApiRequestError } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface AuditEvent {
  id: string;
  type: string;
  aggregateId: string | null;
  occurredAt: string;
  data: unknown;
  metadata: unknown;
  createdAt: string;
}

// The event types worth filtering on. Kept in sync with the webhook
// EVENT_CATALOG — "All events" leaves the filter unset.
const TYPE_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'All events' },
  { value: 'malapos.sale.completed.v1', label: 'Sale completed' },
  { value: 'malapos.sale.voided.v1', label: 'Sale voided' },
  { value: 'malapos.billing.subscribed.v1', label: 'Billing subscribed' },
  { value: 'malapos.billing.canceled.v1', label: 'Billing canceled' },
];

/** "malapos.sale.completed.v1" → "Sale completed". Falls back to the raw
 *  type for anything not in the curated map so new events still read well. */
function humanizeType(type: string): string {
  const known = TYPE_FILTERS.find((t) => t.value === type);
  if (known) return known.label;
  return type
    .replace(/^malapos\./, '')
    .replace(/\.v\d+$/, '')
    .replace(/\./g, ' ')
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase());
}

// A soft accent per event family so the feed scans quickly.
function badgeClass(type: string): string {
  if (type.includes('.voided.') || type.includes('.canceled.'))
    return 'bg-destructive/10 text-destructive border-destructive/30';
  if (type.includes('.completed.') || type.includes('.subscribed.'))
    return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
  return 'bg-muted/50 text-muted-foreground border-border';
}

export default function AuditLogPage() {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState('all');
  const [selected, setSelected] = useState<AuditEvent | null>(null);

  const load = useCallback(
    async (opts: { append?: boolean; cursor?: string | null } = {}) => {
      setError(null);
      const params = new URLSearchParams({ limit: '25' });
      if (type !== 'all') params.set('type', type);
      if (opts.cursor) params.set('cursor', opts.cursor);
      try {
        const res = await api.get<AuditEvent[]>(`/audit-log?${params.toString()}`);
        const rows = res.data ?? [];
        setEvents((cur) => (opts.append && cur ? [...cur, ...rows] : rows));
        setCursor(res.meta?.cursor ?? null);
        setHasMore(Boolean(res.meta?.hasMore));
      } catch (e) {
        setError(e instanceof ApiRequestError ? e.message : 'Could not load the audit log');
        if (!opts.append) setEvents([]);
      }
    },
    [type],
  );

  // Reload from the top whenever the type filter changes.
  useEffect(() => {
    setEvents(null);
    load();
  }, [load]);

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    await load({ append: true, cursor });
    setLoadingMore(false);
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight font-display">Audit Log</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every event your workspace has emitted — sales, voids, billing — newest first.
          </p>
        </div>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="All events" />
          </SelectTrigger>
          <SelectContent>
            {TYPE_FILTERS.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </header>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 text-destructive px-4 py-2 text-sm">
          {error}
        </div>
      )}

      {events === null ? (
        <Card className="space-y-2 p-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </Card>
      ) : events.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          No events yet. Activity appears here as you ring up sales and manage billing.
        </div>
      ) : (
        <>
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-56">Event</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="w-56">When</TableHead>
                  <TableHead className="w-24 text-right">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((ev) => (
                  <TableRow key={ev.id}>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass(ev.type)}`}
                      >
                        {humanizeType(ev.type)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <code className="font-mono text-xs text-muted-foreground">
                        {ev.aggregateId ?? '—'}
                      </code>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(ev.occurredAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-xs"
                        onClick={() => setSelected(ev)}
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {hasMore && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          )}
        </>
      )}

      <Dialog open={Boolean(selected)} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">{selected?.type}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3">
              <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1.5 text-xs">
                <dt className="text-muted-foreground">Event ID</dt>
                <dd className="break-all font-mono">{selected.id}</dd>
                <dt className="text-muted-foreground">Reference</dt>
                <dd className="break-all font-mono">{selected.aggregateId ?? '—'}</dd>
                <dt className="text-muted-foreground">Occurred</dt>
                <dd>{formatDate(selected.occurredAt)}</dd>
              </dl>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Payload
                </p>
                <pre className="max-h-72 overflow-auto rounded-lg border border-border bg-muted/40 p-4 font-mono text-xs leading-relaxed">
                  {JSON.stringify(selected.data, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
