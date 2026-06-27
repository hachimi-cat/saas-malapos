'use client';

import { useEffect, useState } from 'react';
import { CreditCard, Plus, Loader2, Ban, Copy, Check } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { rupiah, parseRupiah } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
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
  // 'plugipay' when the Payments module is on (card lives in the merchant's
  // Plugipay workspace), 'local' otherwise. The backend route is module-aware
  // and returns the same shape either way, so the page is source-blind.
  source?: 'plugipay' | 'local';
};

function StatusBadge({ status }: { status: GiftCardStatus }) {
  const cls =
    status === 'ACTIVE'
      ? 'bg-primary/10 text-primary'
      : status === 'REDEEMED'
      ? 'bg-muted text-muted-foreground'
      : 'bg-destructive/10 text-destructive';
  return (
    <Badge variant="outline" className={`rounded-full border-transparent px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </Badge>
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
      setRows(res.data ?? []);
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
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <CreditCard className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight font-display">Gift cards & store credit</h1>
            <p className="text-sm text-muted-foreground">
              Issue a prepaid balance and let customers spend it at checkout as a gift-card tender.
            </p>
          </div>
        </div>
        <Button onClick={() => setIssuing(true)} className="font-semibold">
          <Plus className="h-4 w-4" /> Issue card
        </Button>
      </div>

      <Card className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
        {loading ? (
          <div className="p-10 text-center text-muted-foreground">Loading…</div>
        ) : error ? (
          <div className="p-10 text-center text-sm text-destructive">{error}</div>
        ) : !rows.length ? (
          <div className="p-10 text-center text-muted-foreground">No gift cards yet. Issue your first one.</div>
        ) : (
          <Table className="text-sm">
            <TableHeader>
              <TableRow className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <TableHead className="px-4 py-3 font-medium">Code</TableHead>
                <TableHead className="px-4 py-3 font-medium">Issued</TableHead>
                <TableHead className="px-4 py-3 text-right font-medium">Initial</TableHead>
                <TableHead className="px-4 py-3 text-right font-medium">Balance</TableHead>
                <TableHead className="px-4 py-3 font-medium">Status</TableHead>
                <TableHead className="px-4 py-3" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id} className="border-b border-border last:border-0">
                  <TableCell className="px-4 py-3">
                    <button
                      onClick={() => copy(c.code)}
                      className="inline-flex items-center gap-1.5 font-mono font-medium hover:text-primary"
                      title="Copy code"
                    >
                      {c.code}
                      {copied === c.code ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                    </button>
                    {c.note && <p className="text-xs text-muted-foreground">{c.note}</p>}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-muted-foreground">{formatDate(c.createdAt)}</TableCell>
                  <TableCell className="px-4 py-3 text-right text-muted-foreground">{rupiah(c.initialBalance)}</TableCell>
                  <TableCell className="px-4 py-3 text-right font-medium">{rupiah(c.balance)}</TableCell>
                  <TableCell className="px-4 py-3"><StatusBadge status={c.status} /></TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    {c.status === 'ACTIVE' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => voidCard(c.id)}
                        className="gap-1 border-destructive/40 text-xs text-destructive hover:bg-destructive/10"
                      >
                        <Ban className="h-3.5 w-3.5" /> Void
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

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
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Issue gift card</DialogTitle>
        </DialogHeader>

        <div className="mt-4 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="gc-amount" className="font-normal text-muted-foreground">Amount</Label>
            <Input
              id="gc-amount"
              inputMode="numeric"
              value={amount ? rupiah(amount) : ''}
              onChange={(e) => setAmount(parseRupiah(e.target.value))}
              placeholder="Rp 0"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gc-code" className="font-normal text-muted-foreground">Code (optional — generated if blank)</Label>
            <Input
              id="gc-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. printed-card code"
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gc-note" className="font-normal text-muted-foreground">Note (optional)</Label>
            <Input
              id="gc-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        {error && <div className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

        <Button
          onClick={submit}
          disabled={busy || amount <= 0}
          className="mt-5 w-full py-3 font-semibold"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {busy ? 'Issuing…' : `Issue ${amount > 0 ? rupiah(amount) : 'card'}`}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
