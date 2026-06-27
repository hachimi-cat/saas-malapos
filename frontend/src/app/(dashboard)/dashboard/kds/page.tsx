'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChefHat, ArrowRight, Loader2, CheckCircle2, Undo2, StickyNote } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { useRealtime } from '@/hooks/use-realtime';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

/*
 * Kitchen Display System (KDS) for F&B. A live board of active tickets
 * (NEW → PREPARING → READY), oldest-first, each with its line items + chosen
 * modifiers. Every ITEM carries its own status and can be advanced or undone
 * independently: tap an item to push it forward a step, or hit ↩ to pull it
 * back. The ticket lives in the column of its LEAST-advanced active item
 * (derived server-side as Transaction.kdsState); once every item is served the
 * ticket drops off the board. Whole-ticket advance/undo buttons move every
 * item at once for speed. Polls every few seconds. F&B-only, but harmless on
 * other business types (the board simply stays empty).
 */

type KdsState = 'NEW' | 'PREPARING' | 'READY' | 'SERVED';

type TicketItem = {
  id: string;
  productName: string;
  variantName: string | null;
  quantity: number;
  modifiers: { name: string; price: number }[];
  note: string | null;
  kdsState: KdsState | null;
};

type Ticket = {
  id: string;
  number: string;
  kdsState: KdsState;
  createdAt: string;
  note: string | null;
  items: TicketItem[];
  outlet: { id: string; name: string };
};

// SSE pushes board changes instantly; this poll is only a belt-and-suspenders
// fallback for a dropped stream, so it can be slow.
const POLL_MS = 30000;

const NEXT_LABEL: Record<KdsState, string> = {
  NEW: 'Start preparing',
  PREPARING: 'Mark ready',
  READY: 'Mark served',
  SERVED: 'Served',
};

// Per-item badge: short label + color for the item's own status.
const ITEM_BADGE: Record<KdsState, { label: string; cls: string }> = {
  NEW: { label: 'New', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  PREPARING: { label: 'Preparing', cls: 'bg-primary/15 text-primary' },
  READY: { label: 'Ready', cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  SERVED: { label: 'Served', cls: 'bg-muted text-muted-foreground' },
};

const COLUMNS: { state: KdsState; label: string; accent: string }[] = [
  { state: 'NEW', label: 'New', accent: 'border-t-amber-500' },
  { state: 'PREPARING', label: 'Preparing', accent: 'border-t-primary' },
  { state: 'READY', label: 'Ready', accent: 'border-t-emerald-500' },
];

function waited(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m ago`;
}

export default function KdsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // A single in-flight key (item id or ticket id) so the tapped control spins
  // and the rest stay live.
  const [busy, setBusy] = useState<string | null>(null);
  const initial = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await api.get<Ticket[]>('/kds');
      setTickets(res.data ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to load tickets');
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

  // Realtime: refetch the instant a kitchen-ticket mutation fires.
  useRealtime({
    onChange: (topic) => {
      if (topic === 'kds') load();
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

  const advanceItem = (id: string) => act(`item:${id}`, `/kds/items/${id}/advance`, 'Failed to advance item');
  const backItem = (id: string) => act(`item:${id}`, `/kds/items/${id}/back`, 'Failed to undo item');
  // Advance/undo every item in ONE column-card together (a ticket's items that
  // currently share a state). Items move column individually, so the card's
  // button just walks the per-item endpoint over the items shown in that card.
  const cardAct = useCallback(
    async (key: string, items: TicketItem[], dir: 'advance' | 'back') => {
      setBusy(key);
      try {
        await Promise.all(items.map((it) => api.post(`/kds/items/${it.id}/${dir}`)));
        await load();
      } catch (e) {
        setError(e instanceof ApiRequestError ? e.message : `Failed to ${dir} items`);
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  return (
    <div className="flex h-full min-h-[calc(100vh-7rem)] flex-col">
      <div className="flex items-center gap-3">
        <ChefHat className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight font-display">Kitchen display</h1>
          <p className="text-sm text-muted-foreground">
            Live tickets from the counter. Tap an item to advance it, ↩ to undo. Refreshes automatically.
          </p>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
      )}

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">Loading…</div>
      ) : !tickets.length ? (
        <div className="mt-10 flex flex-1 flex-col items-center justify-center text-center text-muted-foreground">
          <CheckCircle2 className="h-10 w-10 text-primary/60" />
          <p className="mt-3 font-medium">All caught up</p>
          <p className="text-sm">New orders from an F&amp;B sale appear here automatically.</p>
        </div>
      ) : (
        <div className="mt-6 grid flex-1 grid-cols-1 gap-4 md:grid-cols-3">
          {COLUMNS.map((col) => {
            // A ticket appears in EVERY column where it has an item in that
            // column's state. Each card carries only that state's items, so a
            // prepared item moves to the next column on its own instead of the
            // whole ticket-card dragging along behind it.
            const colTickets = tickets.filter((t) => t.items.some((it) => it.kdsState === col.state));
            return (
              <div key={col.state} className="flex flex-col">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground font-display">{col.label}</h2>
                  <Badge variant="outline" className="rounded-full border-transparent bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">{colTickets.length}</Badge>
                </div>
                <div className="flex flex-col gap-3">
                  {colTickets.map((t) => {
                    const cardItems = t.items.filter((it) => it.kdsState === col.state);
                    const ticketBusy = busy === `ticket:${t.id}:${col.state}`;
                    return (
                    <Card key={t.id} className={`rounded-lg border-t-4 p-4 ${col.accent}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">{t.number}</span>
                        <span className="text-xs text-muted-foreground">{waited(t.createdAt)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{t.outlet.name}</p>
                      <ul className="mt-3 space-y-1.5 text-sm">
                        {cardItems.map((it) => {
                          const st = it.kdsState;
                          const itemBusy = busy === `item:${it.id}`;
                          const badge = st ? ITEM_BADGE[st] : null;
                          // Kitchen advances NEW -> PREPARING -> READY and stops. The
                          // READY -> SERVED step belongs to the server (Ready-to-serve
                          // board), so the kitchen can't accidentally mark food served.
                          const canAdvance = st != null && st !== 'SERVED' && st !== 'READY';
                          const canBack = st != null && st !== 'NEW';
                          return (
                            <li
                              key={it.id}
                              className="rounded-md border border-border/60 bg-background/40 p-2"
                            >
                              <div className="flex items-start justify-between gap-2">
                                {/* Tap the item body to advance it a step. */}
                                <button
                                  type="button"
                                  onClick={() => canAdvance && advanceItem(it.id)}
                                  disabled={!canAdvance || itemBusy}
                                  title={canAdvance && st ? NEXT_LABEL[st] : undefined}
                                  className="flex flex-1 items-start gap-2 text-left disabled:cursor-default"
                                >
                                  {itemBusy ? (
                                    <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                                  ) : badge ? (
                                    <Badge className={`mt-0.5 shrink-0 border-transparent px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badge.cls}`}>
                                      {badge.label}
                                    </Badge>
                                  ) : null}
                                  <span>
                                    <span className="font-medium">{it.quantity}×</span> {it.productName}
                                    {it.variantName && it.variantName !== 'Default' ? (
                                      <span className="text-muted-foreground"> · {it.variantName}</span>
                                    ) : null}
                                    {it.modifiers?.length > 0 && (
                                      <span className="block text-xs text-muted-foreground">
                                        {it.modifiers.map((m) => m.name).join(', ')}
                                      </span>
                                    )}
                                  </span>
                                </button>
                                {/* Undo this item one step. */}
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => canBack && backItem(it.id)}
                                  disabled={!canBack || itemBusy}
                                  title="Move back a step"
                                  aria-label="Move item back a step"
                                  className="h-8 w-8 shrink-0 text-muted-foreground disabled:opacity-30"
                                >
                                  <Undo2 className="h-4 w-4" />
                                </Button>
                              </div>
                              {/* Per-item instruction from the cashier — highlighted
                                  so the line cook can't miss it. */}
                              {it.note && (
                                <p className="mt-1.5 flex items-start gap-1 rounded bg-amber-500/15 px-1.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                                  <StickyNote className="mt-0.5 h-3 w-3 shrink-0" />
                                  <span>{it.note}</span>
                                </p>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                      {t.note && <p className="mt-2 text-xs italic text-muted-foreground">“{t.note}”</p>}
                      <div className="mt-3 flex items-stretch gap-2">
                        {col.state === 'READY' ? (
                          // Kitchen is done with these — the server marks them
                          // served from the Ready-to-serve board. No "served" here.
                          <span className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 py-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-4 w-4" /> Ready — waiting for server
                          </span>
                        ) : (
                          <Button
                            onClick={() => cardAct(`ticket:${t.id}:${col.state}`, cardItems, 'advance')}
                            disabled={ticketBusy}
                            className="flex-1"
                          >
                            {ticketBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                            {NEXT_LABEL[col.state]}
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => cardAct(`ticket:${t.id}:${col.state}`, cardItems, 'back')}
                          disabled={ticketBusy || col.state === 'NEW'}
                          title="Move these items back a step"
                          aria-label="Move these items back a step"
                          className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-30"
                        >
                          <Undo2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </Card>
                    );
                  })}
                  {!colTickets.length && (
                    <p className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                      No tickets
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
