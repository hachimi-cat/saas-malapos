'use client';

import { useEffect, useState } from 'react';
import { Loader2, Plus, Pencil, Trash2, CheckCircle2, AlertCircle, Building2 } from 'lucide-react';
import { warehousesApi, type Warehouse } from '@/lib/fulfillment-api';
import { ApiRequestError } from '@/lib/api';
import { FulfillmentModuleOff } from '@/components/fulfillment/module-off';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

/*
 * Fulfillment → Warehouses. malapos port of storlaunch's fulfillment/
 * warehouses page over /api/v1/fulfillment/warehouses. These are the
 * FULKRUMA warehouses (where physical stock is stored + shipped from) —
 * distinct from malapos's own POS inventory at /dashboard/inventory.
 */

export default function WarehousesPage() {
  const [list, setList] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [moduleOff, setModuleOff] = useState(false);
  const [editing, setEditing] = useState<Warehouse | 'new' | null>(null);
  const [error, setError] = useState('');

  async function refresh() {
    const res = await warehousesApi.list();
    setList(res.data ?? []);
  }

  useEffect(() => {
    refresh()
      .catch((e) => {
        if (e instanceof ApiRequestError && e.status === 409) setModuleOff(true);
        else setError('Failed to load warehouses');
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(w: Warehouse) {
    try {
      await warehousesApi.delete(w.id);
      await refresh();
    } catch (e) {
      alert(e instanceof ApiRequestError ? e.message : 'Delete failed');
    }
  }

  async function handleSetDefault(w: Warehouse) {
    await warehousesApi.update(w.id, { isDefault: true });
    await refresh();
  }

  if (moduleOff) return <FulfillmentModuleOff blurb="Warehouses are where Fulkruma stores + ships your physical stock. Turn on the Fulfillment module to manage them." />;
  if (loading) return <div className="flex h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight font-display">Warehouses</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Where you store + ship from. Each variant tracks stock per warehouse.
          </p>
        </div>
        <Button onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" /> Add warehouse
        </Button>
      </header>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4" />{error}
        </div>
      )}

      {list.length === 0 ? (
        <Card className="p-12 text-center">
          <Building2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No warehouses yet.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {list.map((w) => (
            <Card key={w.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{w.name}</span>
                    {w.isDefault && (
                      <Badge variant="outline" className="rounded border-transparent bg-primary/10 text-[10px] uppercase text-primary">Default</Badge>
                    )}
                  </div>
                  {w.address && <div className="mt-0.5 text-xs text-muted-foreground">{w.address}{w.city ? `, ${w.city}` : ''}{w.postal ? ` ${w.postal}` : ''}</div>}
                  {w.phone && <div className="text-xs text-muted-foreground">{w.phone}</div>}
                </div>
                <div className="flex items-center gap-1">
                  {!w.isDefault && (
                    <Button variant="ghost" size="icon" onClick={() => handleSetDefault(w)} title="Set default" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => setEditing(w)} title="Edit" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" title="Delete" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete &ldquo;{w.name}&rdquo;?</AlertDialogTitle>
                        <AlertDialogDescription>Stock records are preserved.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => handleDelete(w)}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <WarehouseModal
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { await refresh(); setEditing(null); }}
        />
      )}
    </div>
  );
}

function WarehouseModal({ initial, onClose, onSaved }: {
  initial: Warehouse | null; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    address: initial?.address ?? '',
    city: initial?.city ?? '',
    postal: initial?.postal ?? '',
    phone: initial?.phone ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name) { setErr('Name required'); return; }
    setBusy(true); setErr('');
    try {
      if (initial) await warehousesApi.update(initial.id, form);
      else await warehousesApi.create(form);
      await onSaved();
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.message : 'Save failed');
    } finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit' : 'Add'} warehouse</DialogTitle>
        </DialogHeader>
        {err && <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{err}</div>}
        <form onSubmit={submit} className="space-y-3">
          <Field label="Name" required value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Main Warehouse" />
          <Field label="Address" value={form.address ?? ''} onChange={(v) => setForm({ ...form, address: v })} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="City" value={form.city ?? ''} onChange={(v) => setForm({ ...form, city: v })} />
            <Field label="Postal" value={form.postal ?? ''} onChange={(v) => setForm({ ...form, postal: v })} />
          </div>
          <Field label="Phone" value={form.phone ?? ''} onChange={(v) => setForm({ ...form, phone: v })} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, required, value, onChange, placeholder }: {
  label: string; required?: boolean; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const id = `wh-${label.toLowerCase()}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}{required && <span className="text-destructive"> *</span>}</Label>
      <Input id={id} type="text" required={required} value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
