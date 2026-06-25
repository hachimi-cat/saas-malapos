'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { payoutsApi, type Payout, type PayoutStatus, type PayoutBankAccount } from '@/lib/payments-api';
import { Loader2, Plus, X, Landmark, AlertCircle, CheckCircle2, Ban, Truck, Hourglass } from 'lucide-react';
import { DataTable, type Column, type FilterDef } from '@/components/data-table';

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
  pending: 'bg-amber-100 text-amber-900',
  in_transit: 'bg-blue-100 text-blue-900',
  paid: 'bg-green-100 text-green-900',
  failed: 'bg-red-100 text-red-900',
  cancelled: 'bg-muted text-muted-foreground',
};

const STATUS_OPTIONS = (Object.keys(STATUS_LABEL) as PayoutStatus[]).map((s) => ({
  value: s,
  label: STATUS_LABEL[s],
}));

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
    if (!confirm('Cancel this payout request?')) return;
    try {
      await payoutsApi.cancel(id);
      await reload();
    } catch (e: unknown) {
      alert((e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Cancel failed');
    }
  }

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
          <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[r.status]}`}>
            <StatusIcon status={r.status} />
            {STATUS_LABEL[r.status]}
          </span>
          {r.failureReason && <div className="mt-1 text-xs text-red-600">{r.failureReason}</div>}
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
      cell: (r) =>
        r.status === 'pending' ? (
          <button onClick={() => cancel(r.id)} className="text-xs text-red-600 hover:underline">
            Cancel
          </button>
        ) : null,
    },
  ];

  const filters: FilterDef<Payout>[] = [
    { key: 'status', label: 'Status', accessor: (r) => r.status, options: STATUS_OPTIONS },
  ];

  if (loading) return <div className="flex h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Payouts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Withdraw funds to your bank. Platform manually wires funds in manual mode — Xendit
            disbursement auto-transfers once XenPlatform is approved.
          </p>
        </div>
        <button onClick={() => setShowRequest(true)}
          disabled={!bank?.configured || (balance?.available ?? 0) <= 0}
          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          title={!bank?.configured ? 'Set a bank account first' : (balance?.available ?? 0) <= 0 ? 'No available balance' : ''}>
          <Plus className="h-3.5 w-3.5" /> Request payout
        </button>
      </header>

      {error && <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Available</p>
          <p className="mt-1 text-2xl font-bold">{balance ? fmt(balance.available, balance.currency) : '—'}</p>
          <p className="mt-1 text-xs text-muted-foreground">Free to withdraw</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Locked</p>
          <p className="mt-1 text-2xl font-bold">{balance ? fmt(balance.locked, balance.currency) : '—'}</p>
          <p className="mt-1 text-xs text-muted-foreground">In-flight payouts</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Ledger balance</p>
          <p className="mt-1 text-2xl font-bold">{balance ? fmt(balance.ledgerBalance, balance.currency) : '—'}</p>
          <p className="mt-1 text-xs text-muted-foreground">Running total</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
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
          <button onClick={() => setShowBankModal(true)}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted">
            {bank?.configured ? 'Edit' : 'Set up'}
          </button>
        </div>
      </div>

      {payouts.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center text-sm text-muted-foreground">
          No payouts yet. Request your first one once you have available balance.
        </div>
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
    </div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
        <header className="mb-3 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">Request payout</h2>
            <p className="text-xs text-muted-foreground">
              To {bank.bankName} · {bank.bankAccountNumber} · {bank.bankAccountHolder}
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
        </header>
        {error && <div className="mb-3 rounded border border-red-300 bg-red-50 p-2 text-xs text-red-700">{error}</div>}
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label htmlFor="po-amount" className="mb-1 block text-xs font-medium">
              Amount ({currency}) · available {available.toLocaleString('id-ID')}
            </label>
            <input id="po-amount" type="number" min="1" max={available} value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="500000"
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <div>
            <label htmlFor="po-note" className="mb-1 block text-xs font-medium">Note (optional)</label>
            <input id="po-note" value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. 'April earnings'"
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <div className="rounded border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            Payouts are processed manually in 1-3 business days during the manual-disbursement
            phase. You&apos;ll see status updates here as the platform wires the funds.
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg bg-muted px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/70">Cancel</button>
            <button type="submit" disabled={busy}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Request
            </button>
          </div>
        </form>
      </div>
    </div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
        <header className="mb-3 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">Default bank account</h2>
            <p className="text-xs text-muted-foreground">Used as the destination for payout requests.</p>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
        </header>
        {error && <div className="mb-3 rounded border border-red-300 bg-red-50 p-2 text-xs text-red-700">{error}</div>}
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div>
              <label htmlFor="bn-name" className="mb-1 block text-xs font-medium">Bank name</label>
              <input id="bn-name" value={bankName} onChange={(e) => setBankName(e.target.value)}
                placeholder="Bank Central Asia"
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label htmlFor="bn-code" className="mb-1 block text-xs font-medium">Code</label>
              <input id="bn-code" value={bankCode} onChange={(e) => setBankCode(e.target.value)}
                placeholder="BCA"
                className="rounded border border-border bg-background px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
          </div>
          <div>
            <label htmlFor="bn-number" className="mb-1 block text-xs font-medium">Account number</label>
            <input id="bn-number" value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)}
              placeholder="1234567890"
              className="w-full rounded border border-border bg-background px-3 py-2 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <div>
            <label htmlFor="bn-holder" className="mb-1 block text-xs font-medium">Account holder</label>
            <input id="bn-holder" value={bankAccountHolder} onChange={(e) => setBankAccountHolder(e.target.value)}
              placeholder="As printed on passbook"
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg bg-muted px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/70">Cancel</button>
            <button type="submit" disabled={busy}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
