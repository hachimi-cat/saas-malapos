'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChefHat, ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';

/*
 * Kitchen Display System (KDS) for F&B. A live board of active tickets
 * (NEW → PREPARING → READY), oldest-first, each with its line items + chosen
 * modifiers. One button advances a ticket; advancing a READY ticket marks it
 * SERVED and drops it off the board. Polls every few seconds. F&B-only, but
 * harmless on other business types (the board simply stays empty).
 */

type KdsState = 'NEW' | 'PREPARING' | 'READY' | 'SERVED';

type TicketItem = {
  id: string;
  productName: string;
  variantName: string | null;
  quantity: number;
  modifiers: { name: string; price: number }[];
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

const POLL_MS = 5000;

const NEXT_LABEL: Record<KdsState, string> = {
  NEW: 'Start preparing',
  PREPARING: 'Mark ready',
  READY: 'Mark served',
  SERVED: 'Served',
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
  const [advancing, setAdvancing] = useState<string | null>(null);
  const initial = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await api.get<Ticket[]>('/kds');
      setTickets(res.data);
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

  async function advance(id: string) {
    setAdvancing(id);
    try {
      await api.post(`/kds/${id}/advance`);
      await load();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to advance ticket');
    } finally {
      setAdvancing(null);
    }
  }

  return (
    <div className="flex h-full min-h-[calc(100vh-7rem)] flex-col">
      <div className="flex items-center gap-3">
        <ChefHat className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">Kitchen display</h1>
          <p className="text-sm text-muted-foreground">
            Live tickets from the counter. Tap to advance through prep. Refreshes automatically.
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
            const colTickets = tickets.filter((t) => t.kdsState === col.state);
            return (
              <div key={col.state} className="flex flex-col">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{col.label}</h2>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{colTickets.length}</span>
                </div>
                <div className="flex flex-col gap-3">
                  {colTickets.map((t) => (
                    <div key={t.id} className={`rounded-lg border border-t-4 border-border bg-card p-4 ${col.accent}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">{t.number}</span>
                        <span className="text-xs text-muted-foreground">{waited(t.createdAt)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{t.outlet.name}</p>
                      <ul className="mt-3 space-y-1.5 text-sm">
                        {t.items.map((it) => (
                          <li key={it.id}>
                            <div className="flex justify-between gap-2">
                              <span>
                                <span className="font-medium">{it.quantity}×</span> {it.productName}
                                {it.variantName && it.variantName !== 'Default' ? (
                                  <span className="text-muted-foreground"> · {it.variantName}</span>
                                ) : null}
                              </span>
                            </div>
                            {it.modifiers?.length > 0 && (
                              <p className="pl-5 text-xs text-muted-foreground">
                                {it.modifiers.map((m) => m.name).join(', ')}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                      {t.note && <p className="mt-2 text-xs italic text-muted-foreground">“{t.note}”</p>}
                      <button
                        onClick={() => advance(t.id)}
                        disabled={advancing === t.id}
                        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                      >
                        {advancing === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                        {NEXT_LABEL[t.kdsState]}
                      </button>
                    </div>
                  ))}
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
