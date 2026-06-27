'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Utensils, Loader2, CheckCircle2, Hand, Clock, User, StickyNote, ShoppingBag } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { useRealtime } from '@/hooks/use-realtime';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

/*
 * "Ready to serve" — the SERVER's expo board for the dine-in serve step. The
 * kitchen cooks items to READY; this board shows everything that's ready,
 * grouped by table, so the waiter can pick it up and deliver it. Tap an item's
 * "Serve" to mark that one READY→SERVED (reuses POST /kds/items/:id/advance),
 * or "Serve all" to clear a whole table in one call (POST
 * /kds/tables/:tableId/serve). When a table has nothing ready left it drops
 * off the board; a fully-served ticket also leaves the kitchen board (its
 * order state advances server-side via syncOrderState). Polls every few
 * seconds. F&B-only; harmless elsewhere (the board just stays empty).
 */

type KdsState = 'NEW' | 'PREPARING' | 'READY' | 'SERVED';

type ReadyItem = {
  id: string;
  name: string;
  variantName: string | null;
  qty: number;
  modifiers: { name: string; price: number }[];
  note: string | null;
  kdsState: KdsState | null;
};

type ReadyTicket = {
  transactionId: string;
  number: string;
  readyAt: string;
  customerName: string | null;
  note: string | null;
  orderType: string;
  items: ReadyItem[];
};

type ReadyGroup = {
  tableId: string | null;
  tableLabel: string;
  tickets: ReadyTicket[];
};

// SSE drives instant updates; this poll is only a fallback for a dropped
// stream, so it can be slow.
const POLL_MS = 30000;

// Minutes a ticket has been waiting, from its readyAt timestamp.
function waitingMinutes(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
}

function waitingLabel(mins: number): string {
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

// Older tickets get a louder badge so a busy expo screen surfaces the wait.
function waitingBadgeCls(mins: number): string {
  if (mins >= 15) return 'bg-destructive/15 text-destructive';
  if (mins >= 8) return 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
  return 'bg-muted text-muted-foreground';
}

const ORDER_TYPE_LABEL: Record<string, string> = {
  DINE_IN: 'Dine-in',
  TAKEAWAY: 'Takeaway',
  DELIVERY: 'Delivery',
};

export default function ServePage() {
  const [groups, setGroups] = useState<ReadyGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Single in-flight key (item id or table id) so only the tapped control spins.
  const [busy, setBusy] = useState<string | null>(null);
  const initial = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await api.get<ReadyGroup[]>('/kds/ready');
      setGroups(res.data ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to load ready items');
    } finally {
      if (initial.current) {
        initial.current = false;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  // Realtime: refetch the instant a dish becomes ready / is served / a bill
  // closes out.
  useRealtime({
    onChange: (topic) => {
      if (topic === 'serve') load();
    },
  });

  const act = useCallback(
    async (key: string, path: string, fallback: string) => {
      setBusy(key);
      try {
        await api.post(path);
        await load();
      } catch (e) {
        setError(e instanceof ApiRequestError ? e.message : fallback);
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  const serveItem = (id: string) =>
    act(`item:${id}`, `/kds/items/${id}/advance`, 'Failed to serve item');
  const serveTable = (tableId: string) =>
    act(`table:${tableId}`, `/kds/tables/${tableId}/serve`, 'Failed to serve table');
  // Counter orders (takeaway/delivery) have no table to serve in one call, so
  // their "Serve all" walks the per-item endpoint over the whole order.
  const serveMany = useCallback(
    async (key: string, ids: string[]) => {
      setBusy(key);
      try {
        await Promise.all(ids.map((id) => api.post(`/kds/items/${id}/advance`)));
        await load();
      } catch (e) {
        setError(e instanceof ApiRequestError ? e.message : 'Failed to serve');
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  // The backend tags counter (takeaway/delivery) tickets with a null tableId.
  // Split them off the dine-in tables so each gets its own lane on the board.
  const tableGroups = groups.filter((g) => g.tableId !== null);
  const counterGroups = groups.filter((g) => g.tableId === null);

  const renderCard = (g: ReadyGroup, kind: 'table' | 'counter') => {
    const groupKey = kind === 'table' ? `table:${g.tableId}` : `group:${g.tickets[0]?.transactionId}`;
    const groupBusy = busy === groupKey;
    const itemCount = g.tickets.reduce((n, t) => n + t.items.length, 0);
    const multi = g.tickets.length > 1;
    // The card's left edge is colour-coded by its WORST wait, so the whole
    // pass reads at a glance — red rails get walked first.
    const maxMins = g.tickets.reduce((m, t) => Math.max(m, waitingMinutes(t.readyAt)), 0);
    const rail = maxMins >= 15 ? 'border-l-destructive' : maxMins >= 8 ? 'border-l-amber-500' : 'border-l-emerald-500';
    const headType = g.tickets[0]?.orderType;
    return (
      <Card
        key={g.tableId ?? `txn:${g.tickets[0]?.transactionId}`}
        className={`flex flex-col gap-3 rounded-xl border-l-[3px] p-4 ${rail}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-display text-lg font-bold leading-none tracking-tight">{g.tableLabel}</h3>
              {kind === 'counter' && headType && headType !== 'DINE_IN' && (
                <Badge variant="outline" className="shrink-0 border-transparent bg-sky-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-sky-600 dark:text-sky-400">
                  {ORDER_TYPE_LABEL[headType] ?? headType}
                </Badge>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{itemCount} {itemCount === 1 ? 'dish' : 'dishes'} ready</p>
          </div>
          <Badge variant="outline" className={`shrink-0 gap-1 rounded-full border-transparent px-2 py-1 text-xs font-semibold ${waitingBadgeCls(maxMins)}`} title="Longest wait on this order">
            <Clock className="h-3 w-3" /> {waitingLabel(maxMins)}
          </Badge>
        </div>

        <div className="flex flex-col gap-3">
          {g.tickets.map((t) => (
            <div key={t.transactionId} className="flex flex-col gap-1.5">
              {(t.customerName || multi) && (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                  {t.customerName && (
                    <span className="flex items-center gap-1 font-semibold text-foreground">
                      <User className="h-3 w-3 text-muted-foreground" /> {t.customerName}
                    </span>
                  )}
                  <span className="text-muted-foreground">{t.number}</span>
                </div>
              )}
              {t.note && (
                <p className="flex items-start gap-1 rounded-md bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                  <StickyNote className="mt-0.5 h-3 w-3 shrink-0" /> {t.note}
                </p>
              )}
              {t.items.map((it) => {
                const itemBusy = busy === `item:${it.id}`;
                return (
                  <div key={it.id} className="flex items-center gap-3 rounded-lg bg-muted/40 p-2">
                    <span className="grid h-8 min-w-8 shrink-0 place-items-center rounded-md bg-background px-1.5 text-sm font-bold tabular-nums">
                      {it.qty}×
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium leading-tight">
                        {it.name}
                        {it.variantName && it.variantName !== 'Default' ? (
                          <span className="text-muted-foreground"> · {it.variantName}</span>
                        ) : null}
                      </p>
                      {it.modifiers?.length > 0 && (
                        <p className="truncate text-xs text-muted-foreground">{it.modifiers.map((m) => m.name).join(', ')}</p>
                      )}
                      {it.note && <p className="truncate text-xs text-amber-700 dark:text-amber-300">{it.note}</p>}
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => serveItem(it.id)} disabled={itemBusy || groupBusy} className="h-8 shrink-0">
                      {itemBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Hand className="h-3.5 w-3.5" />}
                      Serve
                    </Button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <Button
          type="button"
          onClick={() =>
            kind === 'table'
              ? serveTable(g.tableId!)
              : serveMany(groupKey, g.tickets.flatMap((t) => t.items.map((it) => it.id)))
          }
          disabled={groupBusy}
          className="w-full"
        >
          {groupBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Serve all
        </Button>
      </Card>
    );
  };

  return (
    <div className="flex h-full min-h-[calc(100vh-7rem)] flex-col">
      <div className="flex items-center gap-3">
        <Utensils className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight font-display">Serve display</h1>
          <p className="text-sm text-muted-foreground">
            Dishes the kitchen has plated, grouped by table. Tap Serve to deliver one, or Serve all to
            clear a table. Refreshes automatically.
          </p>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
      )}

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">Loading…</div>
      ) : !groups.length ? (
        <div className="mt-10 flex flex-1 flex-col items-center justify-center text-center text-muted-foreground">
          <CheckCircle2 className="h-10 w-10 text-primary/60" />
          <p className="mt-3 font-medium">Nothing ready to serve.</p>
          <p className="text-sm">Plated dishes from the kitchen appear here automatically.</p>
        </div>
      ) : (
        <div className="mt-6 flex-1 space-y-8">
          {tableGroups.length > 0 && (
            <div>
              {counterGroups.length > 0 && (
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  <Utensils className="h-4 w-4" /> Dine-in
                </h2>
              )}
              <div className="grid auto-rows-min grid-cols-1 items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {tableGroups.map((g) => renderCard(g, 'table'))}
              </div>
            </div>
          )}
          {counterGroups.length > 0 && (
            <div>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                <ShoppingBag className="h-4 w-4" /> Takeaway &amp; delivery
              </h2>
              <div className="grid auto-rows-min grid-cols-1 items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {counterGroups.map((g) => renderCard(g, 'counter'))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
