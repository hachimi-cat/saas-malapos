'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { payoutsApi, type Payout, type PayoutStatus, type PayoutBankAccount } from '@/lib/payments-api';
import { Loader2, Plus, Landmark, AlertCircle, CheckCircle2, Ban, Truck, Hourglass } from 'lucide-react';
import { DataTable, type Column, type FilterDef } from '@/components/data-table';
import { PageHeader } from '@/components/dashboard/page-header';
import { AgenticEntry } from '@/components/catentio/agentic-entry';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

/**
 * /dashboard/payments/payouts — request payouts, track status, manage default bank.
 */

const STATUS_LABEL: Record<PayoutStatus, string> = {
  pending: 'Pending',
  in_transit: 'In transit',
  paid: 'Paid',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const STATUS_COLOR: Record<PayoutStatus, string> = {
  pending: 'bg-amber-500/10 text-amber-400',
  in_transit: 'bg-sky-500/10 text-sky-400',
  paid: 'bg-emerald-500/10 text-emerald-400',
  failed: 'bg-destructive/10 text-destructive',
  cancelled: 'bg-muted text-muted-foreground',
};

const STATUS_OPTIONS = (Object.keys(STATUS_LABEL) as PayoutStatus[]).map((s) => ({
  value: s,
  label: STATUS_LABEL[s],
}));

type TransitionKind = 'in-transit' | 'paid' | 'failed';

function StatusIcon({ status }: { status: PayoutStatus }) {
  const map = {
    pending: Hourglass,
    in_transit: Truck,
    paid: CheckCircle2,
    failed: AlertCircle,
    cancelled: Ban,
  } as const;
  const Icon = map[status];
  return <Icon className="h-3 w-3" />;
}

export default function PayoutsPage() {
  const [balance, setBalance] = useState<{ ledgerBalance: number; locked: number; available: number; currency: string | null } | null>(null);
  const [bank, setBank] = useState<PayoutBankAccount | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showRequest, setShowRequest] = useState(false);
  const [showBankModal, setShowBankModal] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [b, bank, list] = await Promise.all([
        payoutsApi.getBalance(),
        payoutsApi.getBankAccount(),
        payoutsApi.list({ limit: 100 }),
      ]);
      setBalance(b.data);
      setBank(bank.data);
      setPayouts(list.data ?? []);
    } catch (e: unknown) {
      setError((e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Failed to load payouts');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const fmt = useMemo(() => (amount: number, currency?: string | null) =>
    new Intl.NumberFormat(currency === 'USD' ? 'en-US' : 'id-ID', {
      style: 'currency',
      currency: currency || balance?.currency || 'IDR',
      minimumFractionDigits: 0,
    }).format(amount), [balance?.currency]);

  async function cancel(id: string) {
    try {
      await payoutsApi.cancel(id);
      await reload();
    } catch (e: unknown) {
      alert((e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Cancel failed');
    }
  }

  // Status transitions (mirrors the Plugipay payout machine):
  //   pending → in_transit (mark-in-transit), pending|in_transit → paid,
  //   anything unpaid → failed. Money verbs — each opens an explicit
  //   confirm dialog naming the payout and amount before the POST.
  const [transition, setTransition] = useState<{ kind: TransitionKind; payout: Payout } | null>(null);

  const columns: Column<Payout>[] = [
    {
      key: 'requested',
      header: 'Requested',
      sortable: true,
      sortValue: (r) => new Date(r.requestedAt ?? r.createdAt).getTime(),
      searchValue: (r) => `${r.reference ?? ''} ${r.bankName} ${r.bankAccountHolder}`,
      cell: (r) => (
        <Link href={`/dashboard/payments/payouts/${r.id}`} className="text-primary hover:underline">
          {new Date(r.requestedAt ?? r.createdAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
        </Link>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      sortable: true,
      sortValue: (r) => r.amount,
      cell: (r) => <span className="font-mono">{fmt(r.amount, r.currency)}</span>,
    },
    {
      key: 'to',
      header: 'To',
      cell: (r) => (
        <div>
          <div className="text-xs">{r.bankName}</div>
          <div className="text-xs text-muted-foreground">··· {r.bankAccountNumber.slice(-4)} · {r.bankAccountHolder}</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      sortValue: (r) => r.status,
      cell: (r) => (
        <div>
          <Badge variant="outline" className={`gap-1 rounded-full border-transparent font-medium ${STATUS_COLOR[r.status]}`}>
            <StatusIcon status={r.status} />
            {STATUS_LABEL[r.status]}
          </Badge>
          {r.failureReason && <div className="mt-1 text-xs text-destructive">{r.failureReason}</div>}
        </div>
      ),
    },
    {
      key: 'reference',
      header: 'Reference',
      sortable: true,
      sortValue: (r) => r.reference ?? '',
      cell: (r) => <span className="font-mono text-xs text-muted-foreground">{r.reference ?? '—'}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (r) => (
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
          {r.status === 'pending' && (
            <Button
              variant="link"
              className="h-auto p-0 text-xs text-sky-500"
              onClick={() => setTransition({ kind: 'in-transit', payout: r })}
            >
              Mark in transit
            </Button>
          )}
          {(r.status === 'pending' || r.status === 'in_transit') && (
            <>
              <Button
                variant="link"
                className="h-auto p-0 text-xs text-emerald-500"
                onClick={() => setTransition({ kind: 'paid', payout: r })}
              >
                Mark paid
              </Button>
              <Button
                variant="link"
                className="h-auto p-0 text-xs text-destructive"
                onClick={() => setTransition({ kind: 'failed', payout: r })}
              >
                Mark failed
              </Button>
            </>
          )}
          {r.status === 'pending' && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="link" className="h-auto p-0 text-xs text-destructive">
                  Cancel
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel this payout request?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The pending payout request will be withdrawn and its locked funds returned to your available balance.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep request</AlertDialogCancel>
                  <AlertDialogAction onClick={() => cancel(r.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Cancel payout</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      ),
    },
  ];

  const filters: FilterDef<Payout>[] = [
    { key: 'status', label: 'Status', accessor: (r) => r.status, options: STATUS_OPTIONS },
  ];

  if (loading) return <Card className="flex h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></Card>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payouts"
        description="Withdraw funds to your bank. Platform manually wires funds in manual mode — Xendit disbursement auto-transfers once XenPlatform is approved."
        action={
          <div className="flex items-center gap-2">
            <AgenticEntry
              resource="payouts"
              mode="create"
              onApplied={reload}
              // Same gate as the manual button — no bank / no balance
              // means the server refuses the create anyway.
              disabled={!bank?.configured || (balance?.available ?? 0) <= 0}
              title={!bank?.configured ? 'Set a bank account first' : (balance?.available ?? 0) <= 0 ? 'No available balance' : ''}
              className={cn(buttonVariants(), 'shrink-0')}
              fallback={
                <Button onClick={() => setShowRequest(true)}
                  disabled={!bank?.configured || (balance?.available ?? 0) <= 0}
                  className="shrink-0"
                  title={!bank?.configured ? 'Set a bank account first' : (balance?.available ?? 0) <= 0 ? 'No available balance' : ''}>
                  <Plus className="h-3.5 w-3.5" /> Request payout
                </Button>
              }
            >
              <Plus className="h-3.5 w-3.5" /> Request payout
            </AgenticEntry>
          </div>
        }
      />

      {error && <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-6">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Available</p>
          <p className="mt-1 text-2xl font-bold">{balance ? fmt(balance.available, balance.currency) : '—'}</p>
          <p className="mt-1 text-xs text-muted-foreground">Free to withdraw</p>
        </Card>
        <Card className="p-6">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Locked</p>
          <p className="mt-1 text-2xl font-bold">{balance ? fmt(balance.locked, balance.currency) : '—'}</p>
          <p className="mt-1 text-xs text-muted-foreground">In-flight payouts</p>
        </Card>
        <Card className="p-6">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Ledger balance</p>
          <p className="mt-1 text-2xl font-bold">{balance ? fmt(balance.ledgerBalance, balance.currency) : '—'}</p>
          <p className="mt-1 text-xs text-muted-foreground">Running total</p>
        </Card>
      </div>

      <Card className="p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Landmark className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">Default bank account</p>
              {bank?.configured ? (
                <div className="mt-1 text-sm text-muted-foreground">
                  {bank.bankName} {bank.bankCode ? `(${bank.bankCode})` : ''} · {bank.bankAccountNumber} · {bank.bankAccountHolder}
                </div>
              ) : (
                <p className="mt-1 text-sm text-amber-700">Set a default bank account to request payouts.</p>
              )}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowBankModal(true)} className="shrink-0">
            {bank?.configured ? 'Edit' : 'Set up'}
          </Button>
        </div>
      </Card>

      {payouts.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">
          No payouts yet. Request your first one once you have available balance.
        </Card>
      ) : (
        <DataTable
          rows={payouts}
          columns={columns}
          filters={filters}
          rowKey={(r) => r.id}
          searchPlaceholder="Search reference, bank…"
          defaultSort={{ key: 'requested', dir: 'desc' }}
          empty="No payouts match."
        />
      )}

      {showRequest && balance && bank?.configured && (
        <RequestModal
          available={balance.available}
          currency={balance.currency ?? 'IDR'}
          bank={bank}
          onClose={() => setShowRequest(false)}
          onDone={async () => { setShowRequest(false); await reload(); }}
        />
      )}
      {showBankModal && (
        <BankModal
          initial={bank}
          onClose={() => setShowBankModal(false)}
          onDone={async () => { setShowBankModal(false); await reload(); }}
        />
      )}
      {transition && (
        <TransitionModal
          kind={transition.kind}
          payout={transition.payout}
          amountLabel={fmt(transition.payout.amount, transition.payout.currency)}
          onClose={() => setTransition(null)}
          onDone={async () => { setTransition(null); await reload(); }}
        />
      )}
    </div>
  );
}

const TRANSITION_COPY: Record<TransitionKind, { title: string; body: string; cta: string }> = {
  'in-transit': {
    title: 'Mark payout in transit?',
    body: 'Confirms the platform has wired the disbursement to the bank. The payout leaves "pending" — it can still be marked paid or failed.',
    cta: 'Mark in transit',
  },
  paid: {
    title: 'Mark payout paid?',
    body: 'Confirms the bank settled the transfer. This posts the ledger debit and is final — a paid payout cannot be reopened.',
    cta: 'Mark paid',
  },
  failed: {
    title: 'Mark payout failed?',
    body: 'Records the transfer as failed and releases the locked funds back to the available balance.',
    cta: 'Mark failed',
  },
};

function TransitionModal({ kind, payout, amountLabel, onClose, onDone }: {
  kind: TransitionKind;
  payout: Payout;
  amountLabel: string;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [reference, setReference] = useState(payout.reference ?? '');
  const [failureReason, setFailureReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const copy = TRANSITION_COPY[kind];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (kind === 'failed' && !failureReason.trim()) {
      setError('A failure reason is required.');
      return;
    }
    setBusy(true); setError('');
    try {
      if (kind === 'in-transit') await payoutsApi.markInTransit(payout.id, reference.trim() || null);
      else if (kind === 'paid') await payoutsApi.markPaid(payout.id, reference.trim() || null);
      else await payoutsApi.markFailed(payout.id, failureReason.trim());
      await onDone();
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Transition failed');
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{amountLabel}</span>
            {' '}to {payout.bankName} ··· {payout.bankAccountNumber.slice(-4)} · {payout.bankAccountHolder}
          </p>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{copy.body}</p>
        {error && <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive">{error}</div>}
        <form onSubmit={submit} className="space-y-3">
          {kind === 'failed' ? (
            <div className="space-y-1.5">
              <Label htmlFor="tr-reason">Failure reason</Label>
              <Input
                id="tr-reason"
                autoFocus
                value={failureReason}
                onChange={(e) => setFailureReason(e.target.value)}
                placeholder="e.g. Bank rejected — account closed"
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="tr-reference">Bank reference (optional)</Label>
              <Input
                id="tr-reference"
                autoFocus
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. transfer receipt number"
                className="font-mono"
              />
            </div>
          )}
          <DialogFooter className="flex-row gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1" disabled={busy}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={busy || (kind === 'failed' && !failureReason.trim())}
              className={`flex-1 ${kind === 'failed' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}`}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {copy.cta}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RequestModal({ available, currency, bank, onClose, onDone }: {
  available: number; currency: string; bank: PayoutBankAccount;
  onClose: () => void; onDone: () => Promise<void>;
}) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = parseInt(amount, 10);
    if (!n || n <= 0) { setError('Amount must be a positive integer'); return; }
    if (n > available) { setError(`Amount exceeds available ${available}`); return; }
    setBusy(true); setError('');
    try {
      await payoutsApi.create({ amount: n, currency, note: note.trim() || undefined });
      await onDone();
    } catch (e: unknown) {
      setError((e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Request failed');
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Request payout</DialogTitle>
          <p className="text-xs text-muted-foreground">
            To {bank.bankName} · {bank.bankAccountNumber} · {bank.bankAccountHolder}
          </p>
        </DialogHeader>
        {error && <div className="mb-3 rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive">{error}</div>}
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="po-amount">
              Amount ({currency}) · available {available.toLocaleString('id-ID')}
            </Label>
            <Input id="po-amount" type="number" min="1" max={available} value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="500000" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="po-note">Note (optional)</Label>
            <Input id="po-note" value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. 'April earnings'" />
          </div>
          <div className="rounded border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            Payouts are processed manually in 1-3 business days during the manual-disbursement
            phase. You&apos;ll see status updates here as the platform wires the funds.
          </div>
          <DialogFooter className="flex-row gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={busy} className="flex-1">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BankModal({ initial, onClose, onDone }: { initial: PayoutBankAccount | null; onClose: () => void; onDone: () => Promise<void> }) {
  const [bankCode, setBankCode] = useState(initial?.bankCode ?? '');
  const [bankName, setBankName] = useState(initial?.bankName ?? '');
  const [bankAccountNumber, setBankAccountNumber] = useState(initial?.bankAccountNumber ?? '');
  const [bankAccountHolder, setBankAccountHolder] = useState(initial?.bankAccountHolder ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!bankName.trim() || !bankAccountNumber.trim() || !bankAccountHolder.trim()) {
      setError('Bank name, account number, and account holder are required');
      return;
    }
    setBusy(true); setError('');
    try {
      await payoutsApi.updateBankAccount({
        bankCode: bankCode.trim() || null,
        bankName: bankName.trim(),
        bankAccountNumber: bankAccountNumber.trim(),
        bankAccountHolder: bankAccountHolder.trim(),
      });
      await onDone();
    } catch (e: unknown) {
      setError((e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Save failed');
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Default bank account</DialogTitle>
          <p className="text-xs text-muted-foreground">Used as the destination for payout requests.</p>
        </DialogHeader>
        {error && <div className="mb-3 rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive">{error}</div>}
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="bn-name">Bank name</Label>
              <Input id="bn-name" value={bankName} onChange={(e) => setBankName(e.target.value)}
                placeholder="Bank Central Asia" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bn-code">Code</Label>
              <Input id="bn-code" value={bankCode} onChange={(e) => setBankCode(e.target.value)}
                placeholder="BCA" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bn-number">Account number</Label>
            <Input id="bn-number" value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)}
              placeholder="1234567890" className="font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bn-holder">Account holder</Label>
            <Input id="bn-holder" value={bankAccountHolder} onChange={(e) => setBankAccountHolder(e.target.value)}
              placeholder="As printed on passbook" />
          </div>
          <DialogFooter className="flex-row gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={busy} className="flex-1">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
