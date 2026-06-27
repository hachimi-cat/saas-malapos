'use client';

import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Store } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
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
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
 * Outlets manager — the store-setup surface. List every outlet (name,
 * address, phone, tax rate, active state) and create / edit / delete them.
 * Tax is stored server-side in basis points of 10000 (11% = 1100); the form
 * speaks plain percent and converts on the wire. Built against the real
 * backend; no mock data.
 */

type Outlet = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  timezone: string | null;
  taxRateBps: number;
  taxInclusive: boolean;
  receiptHeader: string | null;
  receiptFooter: string | null;
  isActive: boolean;
  createdAt: string;
};

type FormState = {
  name: string;
  address: string;
  phone: string;
  timezone: string;
  taxPercent: string;
  taxInclusive: boolean;
  receiptHeader: string;
  receiptFooter: string;
};

const empty: FormState = {
  name: '',
  address: '',
  phone: '',
  timezone: '',
  taxPercent: '',
  taxInclusive: false,
  receiptHeader: '',
  receiptFooter: '',
};

function toForm(o: Outlet): FormState {
  return {
    name: o.name,
    address: o.address ?? '',
    phone: o.phone ?? '',
    timezone: o.timezone ?? '',
    taxPercent: o.taxRateBps ? String(o.taxRateBps / 100) : '',
    taxInclusive: o.taxInclusive,
    receiptHeader: o.receiptHeader ?? '',
    receiptFooter: o.receiptFooter ?? '',
  };
}

export default function OutletsPage() {
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Outlet | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    try {
      const res = await api.get<{ outlets: Outlet[] }>('/outlets');
      setOutlets(res.data.outlets ?? []);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to load outlets');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function remove(o: Outlet) {
    setError(null);
    try {
      await api.delete(`/outlets/${o.id}`);
      await load();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to delete outlet');
    }
  }

  if (loading) return <div className="p-6 text-muted-foreground">Loading…</div>;

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight font-display">Outlets</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your stores and their tax, timezone, and receipt settings.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Add outlet
        </Button>
      </div>

      {outlets.length === 0 ? (
        <Card className="p-12 text-center">
          <Store className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="mt-3 text-base font-medium font-display">No outlets yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Add your first store to start selling.
          </p>
          <Button onClick={() => setCreating(true)} className="mt-4">
            <Plus className="h-4 w-4" /> Add outlet
          </Button>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Tax</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {outlets.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium">{o.name}</TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">{o.address || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{o.phone || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {o.taxRateBps > 0 ? (
                      <>
                        {(o.taxRateBps / 100).toFixed(o.taxRateBps % 100 ? 2 : 0)}%
                        {o.taxInclusive && <span className="ml-1 text-xs">(incl.)</span>}
                      </>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>
                    {o.isActive ? (
                      <Badge variant="outline" className="rounded-full border-primary/40 bg-primary/10 font-medium text-primary">
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="rounded-full bg-muted font-medium text-muted-foreground">
                        Inactive
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditing(o)}
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Delete"
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete outlet &ldquo;{o.name}&rdquo;?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This can&apos;t be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => remove(o)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {(creating || editing) && (
        <OutletModal
          outlet={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={async () => {
            setCreating(false);
            setEditing(null);
            await load();
          }}
        />
      )}

      {error && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-md bg-destructive px-4 py-2 text-sm text-destructive-foreground shadow-lg">
          {error}
        </div>
      )}
    </div>
  );
}

function OutletModal({
  outlet,
  onClose,
  onSaved,
}: {
  outlet: Outlet | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(outlet ? toForm(outlet) : empty);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    if (!form.name.trim()) {
      setErr('Name is required.');
      return;
    }
    setBusy(true);
    setErr(null);

    const pct = parseFloat(form.taxPercent);
    const taxRateBps = Number.isFinite(pct) ? Math.round(pct * 100) : 0;

    const body = {
      name: form.name.trim(),
      address: form.address.trim() || null,
      phone: form.phone.trim() || null,
      timezone: form.timezone.trim() || null,
      taxRateBps,
      taxInclusive: form.taxInclusive,
      receiptHeader: form.receiptHeader.trim() || null,
      receiptFooter: form.receiptFooter.trim() || null,
    };

    try {
      if (outlet) {
        await api.patch<{ outlet: Outlet }>(`/outlets/${outlet.id}`, body);
      } else {
        await api.post<{ outlet: Outlet }>('/outlets', body);
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.message : 'Failed to save outlet');
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{outlet ? 'Edit outlet' : 'New outlet'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Name">
            <Input
              autoFocus
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Main Store"
            />
          </Field>

          <Field label="Address">
            <Input
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
              placeholder="Jl. Sudirman No. 1"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone">
              <Input
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                placeholder="+62…"
              />
            </Field>
            <Field label="Timezone">
              <Input
                value={form.timezone}
                onChange={(e) => set('timezone', e.target.value)}
                placeholder="Asia/Jakarta"
              />
            </Field>
          </div>

          <Field label="Tax rate (%)">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.taxPercent}
              onChange={(e) => set('taxPercent', e.target.value)}
              placeholder="11"
            />
          </Field>

          <Label className="flex cursor-pointer items-center gap-2 text-sm font-normal">
            <Checkbox
              checked={form.taxInclusive}
              onCheckedChange={(c) => set('taxInclusive', c === true)}
            />
            <span>Prices include tax</span>
          </Label>

          <Field label="Receipt header">
            <Textarea
              value={form.receiptHeader}
              onChange={(e) => set('receiptHeader', e.target.value)}
              rows={2}
              placeholder="Shown at the top of printed receipts"
            />
          </Field>

          <Field label="Receipt footer">
            <Textarea
              value={form.receiptFooter}
              onChange={(e) => set('receiptFooter', e.target.value)}
              rows={2}
              placeholder="Thank you for shopping with us!"
            />
          </Field>
        </div>

        {err && <p className="text-sm text-destructive">{err}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={save}>
            {busy ? 'Saving…' : outlet ? 'Save changes' : 'Create outlet'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 text-sm">
      <Label className="text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
