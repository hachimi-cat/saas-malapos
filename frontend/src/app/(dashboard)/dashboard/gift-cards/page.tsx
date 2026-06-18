'use client';

import { useEffect, useState } from 'react';
import { CreditCard, Plus, X, Loader2, Ban, Copy, Check } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { rupiah, parseRupiah } from '@/lib/money';

/*
 * Gift cards / store credit. Issue a prepaid balance (anonymous gift card, or
 * link a customer for store credit), see the roster with live balances, and
 * void a card. Cards are redeemed at checkout as a GIFT_CARD tender (enter the
 * code on the sell screen). Built against the real backend; no mock data.
 */

type GiftCardStatus = 'ACTIVE' | 'REDEEMED' | 'VOID';

type GiftCard = {
  id: string;
  code: string;
  initialBalance: number;
  balance: number;
  status: GiftCardStatus;
  customerId: string | null;
  note: string | null;
  createdAt: string;
};

function StatusBadge({ status }: { status: GiftCardStatus }) {
  const cls =
    status === 'ACTIVE'
      ? 'bg-primary/10 text-primary'
      : status === 'REDEEMED'
      ? 'bg-muted text-muted-foreground'
      : 'bg-destructive/10 text-destructive';
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', { dateStyle: 'medium' });
}

export default function GiftCardsPage() {
  const [rows, setRows] = useState<GiftCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<GiftCard[]>('/gift-cards');
      setRows(res.data);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to load gift cards');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function voidCard(id: string) {
    try {
      const res = await api.post<{ giftCard: GiftCard }>(`/gift-cards/${id}/void`);
      setRows((r) => r.map((c) => (c.id === id ? res.data.giftCard : c)));
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to void');
    }
  }

  function copy(code: string) {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(code);
      setTimeout(() => setCopied((c) => (c === code ? null : c)), 1500);
    });
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <CreditCard className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">Gift cards & store credit</h1>
            <p className="text-sm text-muted-foreground">
              Issue a prepaid balance and let customers spend it at checkout as a gift-card tender.
            </p>
          </div>
        </div>
        <button
          onClick={() => setIssuing(true)}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Issue card
        </button>
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
        {loading ? (
          <div className="p-10 text-center text-muted-foreground">Loading…</div>
        ) : error ? (
          <div className="p-10 text-center text-sm text-destructive">{error}</div>
        ) : !rows.length ? (
          <div className="p-10 text-center text-muted-foreground">No gift cards yet. Issue your first one.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Issued</th>
                <th className="px-4 py-3 text-right font-medium">Initial</th>
                <th className="px-4 py-3 text-right font-medium">Balance</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => copy(c.code)}
                      className="inline-flex items-center gap-1.5 font-mono font-medium hover:text-primary"
                      title="Copy code"
                    >
                      {c.code}
                      {copied === c.code ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                    </button>
                    {c.note && <p className="text-xs text-muted-foreground">{c.note}</p>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(c.createdAt)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{rupiah(c.initialBalance)}</td>
                  <td className="px-4 py-3 text-right font-medium">{rupiah(c.balance)}</td>
                  <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                  <td className="px-4 py-3 text-right">
                    {c.status === 'ACTIVE' && (
                      <button
                        onClick={() => voidCard(c.id)}
                        className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
                      >
                        <Ban className="h-3.5 w-3.5" /> Void
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {issuing && (
        <IssueModal
          onClose={() => setIssuing(false)}
          onIssued={(card) => {
            setRows((r) => [card, ...r]);
            setIssuing(false);
          }}
        />
      )}
    </div>
  );
}

function IssueModal({ onClose, onIssued }: { onClose: () => void; onIssued: (c: GiftCard) => void }) {
  const [amount, setAmount] = useState(0);
  const [code, setCode] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ giftCard: GiftCard }>('/gift-cards', {
        amount,
        code: code.trim() || undefined,
        note: note.trim() || undefined,
      });
      onIssued(res.data.giftCard);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to issue');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Issue gift card</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>

        <div className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="text-muted-foreground">Amount</span>
            <input
              inputMode="numeric"
              value={amount ? rupiah(amount) : ''}
              onChange={(e) => setAmount(parseRupiah(e.target.value))}
              placeholder="Rp 0"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted-foreground">Code (optional — generated if blank)</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. printed-card code"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 font-mono outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted-foreground">Note (optional)</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
        </div>

        {error && <div className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

        <button
          onClick={submit}
          disabled={busy || amount <= 0}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary py-3 font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {busy ? 'Issuing…' : `Issue ${amount > 0 ? rupiah(amount) : 'card'}`}
        </button>
      </div>
    </div>
  );
}
