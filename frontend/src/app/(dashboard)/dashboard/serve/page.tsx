'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Utensils, Loader2, CheckCircle2, Hand, Clock, User, StickyNote } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { useRealtime } from '@/hooks/use-realtime';

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
      setGroups(res.data);
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

  return (
    <div className="flex h-full min-h-[calc(100vh-7rem)] flex-col">
      <div className="flex items-center gap-3">
        <Utensils className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">Ready to serve</h1>
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
        <div className="mt-6 grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {groups.map((g) => {
            const key = g.tableId ?? `txn:${g.tickets[0]?.transactionId}`;
            const tableBusy = busy === `table:${g.tableId}`;
            const itemCount = g.tickets.reduce((n, t) => n + t.items.length, 0);
            return (
              <div
                key={key}
                className="flex flex-col rounded-lg border border-t-4 border-border border-t-emerald-500 bg-card p-4"
              >
                {/* Table label is the headline — it's where the server walks
                    the plate. Big + bold so it's scannable across the pass. */}
                <div className="flex items-start justify-between gap-2">
                  <span className="text-2xl font-bold leading-none">{g.tableLabel}</span>
                  <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    {itemCount} ready
                  </span>
                </div>

                <div className="mt-3 flex flex-1 flex-col gap-3">
                  {g.tickets.map((t) => {
                    const mins = waitingMinutes(t.readyAt);
                    return (
                    <div key={t.transactionId}>
                      {/* Ticket meta line: wait time + order type + receipt #,
                          then customer + note when present. */}
                      <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                        <span
                          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold ${waitingBadgeCls(mins)}`}
                          title="Waiting time"
                        >
                          <Clock className="h-3 w-3" /> {waitingLabel(mins)}
                        </span>
                        <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-muted-foreground">
                          {ORDER_TYPE_LABEL[t.orderType] ?? t.orderType}
                        </span>
                        <span className="font-medium text-muted-foreground">{t.number}</span>
                      </div>
                      {(t.customerName || t.note) && (
                        <div className="mb-1.5 space-y-0.5">
                          {t.customerName && (
                            <p className="flex items-center gap-1 text-xs font-medium text-foreground">
                              <User className="h-3 w-3 shrink-0 text-muted-foreground" />
                              {t.customerName}
                            </p>
                          )}
                          {t.note && (
                            <p className="flex items-start gap-1 text-xs italic text-muted-foreground">
                              <StickyNote className="mt-0.5 h-3 w-3 shrink-0" />
                              <span>“{t.note}”</span>
                            </p>
                          )}
                        </div>
                      )}
                      <ul className="space-y-1.5 text-sm">
                        {t.items.map((it) => {
                          const itemBusy = busy === `item:${it.id}`;
                          return (
                            <li
                              key={it.id}
                              className="flex items-start justify-between gap-2 rounded-md border border-border/60 bg-background/40 p-2"
                            >
                              <span className="min-w-0">
                                <span className="font-medium">{it.qty}×</span> {it.name}
                                {it.variantName && it.variantName !== 'Default' ? (
                                  <span className="text-muted-foreground"> · {it.variantName}</span>
                                ) : null}
                                {it.modifiers?.length > 0 && (
                                  <span className="block text-xs text-muted-foreground">
                                    {it.modifiers.map((m) => m.name).join(', ')}
                                  </span>
                                )}
                              </span>
                              <button
                                type="button"
                                onClick={() => serveItem(it.id)}
                                disabled={itemBusy || tableBusy}
                                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-40"
                              >
                                {itemBusy ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Hand className="h-3.5 w-3.5" />
                                )}
                                Serve
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                    );
                  })}
                </div>

                {g.tableId && (
                  <button
                    type="button"
                    onClick={() => serveTable(g.tableId!)}
                    disabled={tableBusy}
                    className="mt-3 inline-flex items-center justify-center gap-2 rounded-md bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    {tableBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Serve all
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
