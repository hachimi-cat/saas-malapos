'use client';

import { useEffect, useState } from 'react';
import {
  Search,
  Plus,
  Users,
  Star,
  Pencil,
  Trash2,
  Receipt,
  Gift,
  ArrowDownUp,
} from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { rupiah } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/*
 * Customers + loyalty. A debounced search over /customers and a roster table
 * (name, phone, points, lifetime spend, visits). "Add customer" creates a thin
 * contact record; clicking a row opens a detail drawer with the loyalty
 * balance, recent transactions and the points ledger, plus adjust/redeem/edit/
 * delete actions. Built against the real backend; no mock data. Delete surfaces
 * the server's 409 message when the customer has sales history.
 */

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  note: string | null;
  loyaltyPoints: number;
  totalSpent: number;
  visits: number;
  createdAt: string;
};

type Transaction = {
  id: string;
  number: string;
  total: number;
  createdAt: string;
  status: string;
};

type LoyaltyEntry = {
  id: string;
  points: number;
  reason: string | null;
  createdAt: string;
};

const dateFmt = (s: string | null | undefined) => {
  if (!s) return '—';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
};

export default function CustomersPage() {
  const [query, setQuery] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Debounced search → re-fetch first page.
  useEffect(() => {
    const t = setTimeout(() => {
      void load(query, null, false);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function load(q: string, fromCursor: string | null, append: boolean) {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (fromCursor) params.set('cursor', fromCursor);
      const qs = params.toString();
      const res = await api.get<{ items: Customer[] }>(`/customers${qs ? `?${qs}` : ''}`);
      const items = res.data.items ?? [];
      setCustomers((prev) => (append ? [...prev, ...items] : items));
      setCursor(res.meta.cursor ?? null);
      setHasMore(Boolean(res.meta.hasMore));
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to load customers');
      if (!append) setCustomers([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  function refresh() {
    void load(query, null, false);
  }

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight font-display">Customers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your customer roster and loyalty points.
          </p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" /> Add customer
        </Button>
      </div>

      <div className="relative mt-5 w-full max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, phone or email…"
          className="pl-9"
        />
      </div>

      <Card className="mt-4 overflow-hidden">
        {loading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : error ? (
          <p className="p-8 text-center text-sm text-destructive">{error}</p>
        ) : customers.length === 0 ? (
          <div className="p-10 text-center">
            <Users className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">
              {query.trim() ? 'No customers match your search.' : 'No customers yet. Add your first one.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-right">Points</TableHead>
                  <TableHead className="text-right">Total spent</TableHead>
                  <TableHead className="text-right">Visits</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((c) => (
                  <TableRow
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className="cursor-pointer"
                  >
                    <TableCell>
                      <p className="font-medium">{c.name}</p>
                      {c.email && <p className="text-xs text-muted-foreground">{c.email}</p>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.phone || '—'}</TableCell>
                    <TableCell className="text-right">
                      <span className="inline-flex items-center gap-1 font-medium text-primary">
                        <Star className="h-3.5 w-3.5" /> {c.loyaltyPoints ?? 0}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-medium">{rupiah(c.totalSpent ?? 0)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{c.visits ?? 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {hasMore && !loading && (
        <div className="mt-3 text-center">
          <Button
            variant="outline"
            disabled={loadingMore}
            onClick={() => cursor && load(query, cursor, true)}
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}

      {adding && (
        <CustomerForm
          title="Add customer"
          onClose={() => setAdding(false)}
          onSave={async (body) => {
            const res = await api.post<{ customer: Customer }>('/customers', body);
            setAdding(false);
            refresh();
            flash(`Added ${res.data.customer?.name ?? 'customer'}`);
          }}
        />
      )}

      {selectedId && (
        <CustomerDetail
          id={selectedId}
          onClose={() => setSelectedId(null)}
          onChanged={refresh}
          onDeleted={() => {
            setSelectedId(null);
            refresh();
            flash('Customer deleted');
          }}
          flash={flash}
        />
      )}

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function CustomerForm({
  title,
  initial,
  onClose,
  onSave,
}: {
  title: string;
  initial?: Partial<Customer>;
  onClose: () => void;
  onSave: (body: { name: string; phone?: string; email?: string; note?: string }) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) {
      setErr('Name is required');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await onSave({
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        note: note.trim() || undefined,
      });
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.message : 'Save failed');
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Name">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Phone (optional)">
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </Field>
          <Field label="Email (optional)">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Note (optional)">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="resize-none"
            />
          </Field>
        </div>
        {err && <p className="text-sm text-destructive">{err}</p>}
        <Button disabled={busy} onClick={submit} className="w-full">
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function CustomerDetail({
  id,
  onClose,
  onChanged,
  onDeleted,
  flash,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
  onDeleted: () => void;
  flash: (msg: string) => void;
}) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [entries, setEntries] = useState<LoyaltyEntry[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [adjusting, setAdjusting] = useState(false);
  const [redeeming, setRedeeming] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [detail, loyalty] = await Promise.all([
        api.get<{ customer: Customer; recentTransactions?: Transaction[] }>(`/customers/${id}`),
        api.get<{ entries?: LoyaltyEntry[]; balance?: number }>(`/customers/${id}/loyalty`),
      ]);
      // Render defensively — fields may be nested or named differently.
      const d = detail.data as Record<string, unknown>;
      setCustomer((d.customer as Customer) ?? null);
      const tx =
        (d.recentTransactions as Transaction[]) ??
        (d.transactions as Transaction[]) ??
        ((d.customer as Record<string, unknown> | undefined)?.recentTransactions as Transaction[]) ??
        [];
      setTransactions(Array.isArray(tx) ? tx : []);
      const l = loyalty.data as Record<string, unknown>;
      const en = (l.entries as LoyaltyEntry[]) ?? (l.ledger as LoyaltyEntry[]) ?? [];
      setEntries(Array.isArray(en) ? en : []);
      setBalance(typeof l.balance === 'number' ? l.balance : null);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to load customer');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function doDelete() {
    setBusy(true);
    setDeleteErr(null);
    try {
      await api.delete(`/customers/${id}`);
      onDeleted();
    } catch (e) {
      setDeleteErr(e instanceof ApiRequestError ? e.message : 'Delete failed');
      setBusy(false);
    }
  }

  const points = balance ?? customer?.loyaltyPoints ?? 0;

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader className="pr-8 text-left">
          <SheetTitle className="truncate font-display">{customer?.name ?? 'Customer'}</SheetTitle>
          {customer?.phone && <p className="text-sm text-muted-foreground">{customer.phone}</p>}
          {customer?.email && <p className="text-sm text-muted-foreground">{customer.email}</p>}
        </SheetHeader>

        {loading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : error ? (
          <p className="p-8 text-center text-sm text-destructive">{error}</p>
        ) : (
          <>
            {/* Summary */}
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Stat icon={<Star className="h-4 w-4" />} label="Points" value={String(points)} />
              <Stat label="Lifetime spend" value={rupiah(customer?.totalSpent ?? 0)} />
              <Stat label="Visits" value={String(customer?.visits ?? 0)} />
            </div>
            {customer?.note && (
              <p className="mt-3 rounded-md border border-border bg-background p-3 text-sm text-muted-foreground">
                {customer.note}
              </p>
            )}

            {/* Actions */}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setAdjusting(true)}>
                <ArrowDownUp className="h-4 w-4" /> Adjust points
              </Button>
              <Button variant="outline" size="sm" onClick={() => setRedeeming(true)}>
                <Gift className="h-4 w-4" /> Redeem
              </Button>
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setConfirmingDelete(true); setDeleteErr(null); }}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            </div>

            {confirmingDelete && (
              <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-3">
                <p className="text-sm">Delete this customer permanently?</p>
                {deleteErr && <p className="mt-1 text-sm text-destructive">{deleteErr}</p>}
                <div className="mt-2 flex gap-2">
                  <Button variant="destructive" size="sm" disabled={busy} onClick={doDelete}>
                    {busy ? 'Deleting…' : 'Delete'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setConfirmingDelete(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Recent transactions */}
            <Section title="Recent transactions" icon={<Receipt className="h-4 w-4" />}>
              {transactions.length === 0 ? (
                <p className="py-3 text-sm text-muted-foreground">No transactions yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {transactions.map((t) => (
                    <li key={t.id} className="flex items-center justify-between py-2 text-sm">
                      <div>
                        <p className="font-medium">{t.number ?? t.id}</p>
                        <p className="text-xs text-muted-foreground">
                          {dateFmt(t.createdAt)}
                          {t.status ? ` · ${t.status}` : ''}
                        </p>
                      </div>
                      <span className="font-medium">{rupiah(t.total ?? 0)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            {/* Loyalty ledger */}
            <Section title="Loyalty ledger" icon={<Star className="h-4 w-4" />}>
              {entries.length === 0 ? (
                <p className="py-3 text-sm text-muted-foreground">No loyalty activity yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {entries.map((e) => (
                    <li key={e.id} className="flex items-center justify-between py-2 text-sm">
                      <div>
                        <p>{e.reason || 'Adjustment'}</p>
                        <p className="text-xs text-muted-foreground">{dateFmt(e.createdAt)}</p>
                      </div>
                      <span className={`font-semibold ${(e.points ?? 0) < 0 ? 'text-destructive' : 'text-primary'}`}>
                        {(e.points ?? 0) > 0 ? '+' : ''}{e.points ?? 0}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </>
        )}

        {editing && customer && (
          <CustomerForm
            title="Edit customer"
            initial={customer}
            onClose={() => setEditing(false)}
            onSave={async (body) => {
              await api.patch<{ customer: Customer }>(`/customers/${id}`, body);
              setEditing(false);
              await load();
              onChanged();
              flash('Customer updated');
            }}
          />
        )}

        {adjusting && (
          <PointsModal
            title="Adjust points"
            hint="Use a negative number to deduct points."
            allowNegative
            onClose={() => setAdjusting(false)}
            onSubmit={async (points, reason) => {
              await api.post(`/customers/${id}/loyalty/adjust`, { points, reason: reason || undefined });
              setAdjusting(false);
              await load();
              onChanged();
              flash('Points adjusted');
            }}
          />
        )}

        {redeeming && (
          <PointsModal
            title="Redeem points"
            hint="Points to redeem (positive)."
            onClose={() => setRedeeming(false)}
            onSubmit={async (points) => {
              await api.post(`/customers/${id}/loyalty/redeem`, { points });
              setRedeeming(false);
              await load();
              onChanged();
              flash('Points redeemed');
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function PointsModal({
  title,
  hint,
  allowNegative,
  onClose,
  onSubmit,
}: {
  title: string;
  hint: string;
  allowNegative?: boolean;
  onClose: () => void;
  onSubmit: (points: number, reason: string) => Promise<void>;
}) {
  const [points, setPoints] = useState<string>('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    const n = Number(points);
    if (!Number.isFinite(n) || n === 0) {
      setErr('Enter a nonzero number');
      return;
    }
    if (!allowNegative && n <= 0) {
      setErr('Enter a positive number');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await onSubmit(n, reason.trim());
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.message : 'Failed');
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{hint}</p>
        <div className="space-y-3">
          <Field label="Points">
            <Input
              autoFocus
              type="number"
              value={points}
              onChange={(e) => setPoints(e.target.value)}
            />
          </Field>
          {allowNegative && (
            <Field label="Reason (optional)">
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
          )}
        </div>
        {err && <p className="text-sm text-destructive">{err}</p>}
        <Button disabled={busy} onClick={submit} className="w-full">
          {busy ? 'Saving…' : 'Confirm'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Stat({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <p className="flex items-center gap-1 text-xs text-muted-foreground">{icon}{label}</p>
      <p className="mt-1 text-base font-semibold">{value}</p>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground font-display">
        {icon} {title}
      </h3>
      <div className="mt-1">{children}</div>
    </div>
  );
}
