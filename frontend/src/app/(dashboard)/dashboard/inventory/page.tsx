'use client';

import { useCallback, useEffect, useState } from 'react';
import { Package, AlertTriangle, Plus, Minus, Check, X, CalendarClock } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { rupiah } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
 * Inventory — per-outlet stock control. Lists on-hand quantities against
 * reorder points (flagging low stock), lets staff adjust stock by a signed
 * delta (receiving, shrinkage, counts) and edit reorder points inline, and —
 * for pharmacy outlets — surfaces batches expiring within 30 days. Every
 * mutation re-fetches the levels. Real backend; no mock data.
 */

type Outlet = { id: string; name: string };

type Variant = { name: string; sku: string | null; product: { name: string } };

type Level = {
  id: string;
  outletId: string;
  variantId: string;
  quantity: number;
  reorderPoint: number;
  variant: Variant;
};

type ExpiringBatch = {
  id: string;
  batchNo: string | null;
  expiryDate: string | null;
  qtyRemaining: number;
  variant?: { name?: string; product?: { name?: string } } | null;
};

function isLow(l: Level): boolean {
  return l.reorderPoint > 0 && l.quantity <= l.reorderPoint;
}

export default function InventoryPage() {
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [outletId, setOutletId] = useState<string>('');
  const [levels, setLevels] = useState<Level[]>([]);
  const [expiring, setExpiring] = useState<ExpiringBatch[]>([]);
  const [lowOnly, setLowOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [levelsLoading, setLevelsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState<Level | null>(null);

  // Bootstrap: outlets first, then default to the first one.
  useEffect(() => {
    (async () => {
      try {
        const o = await api.get<{ outlets: Outlet[] }>('/outlets');
        setOutlets(o.data.outlets ?? []);
        setOutletId(o.data.outlets?.[0]?.id ?? '');
      } catch (e) {
        setError(e instanceof ApiRequestError ? e.message : 'Failed to load outlets');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const loadLevels = useCallback(async () => {
    if (!outletId) return;
    setLevelsLoading(true);
    try {
      const qs = new URLSearchParams({ outletId });
      if (lowOnly) qs.set('low', 'true');
      const res = await api.get<{ levels: Level[] }>(`/inventory/levels?${qs.toString()}`);
      setLevels(res.data.levels ?? []);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to load stock');
    } finally {
      setLevelsLoading(false);
    }
  }, [outletId, lowOnly]);

  const loadExpiring = useCallback(async () => {
    if (!outletId) return;
    try {
      const qs = new URLSearchParams({ outletId, days: '30' });
      const res = await api.get<{ batches: ExpiringBatch[] }>(`/inventory/expiring?${qs.toString()}`);
      setExpiring(res.data.batches ?? []);
    } catch {
      // Expiring is a pharmacy-only nicety — don't surface its errors.
      setExpiring([]);
    }
  }, [outletId]);

  useEffect(() => {
    loadLevels();
    loadExpiring();
  }, [loadLevels, loadExpiring]);

  async function refresh() {
    await Promise.all([loadLevels(), loadExpiring()]);
  }

  // Inline reorder-point edit → PUT, then refresh.
  async function saveReorder(l: Level, reorderPoint: number) {
    setError(null);
    try {
      await api.put('/inventory/reorder', { outletId, variantId: l.variantId, reorderPoint });
      await loadLevels();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to update reorder point');
    }
  }

  if (loading) return <div className="p-6 text-muted-foreground">Loading…</div>;

  if (!outlets.length) {
    return (
      <div className="mx-auto max-w-xl p-8 text-center">
        <h1 className="text-xl font-semibold">No outlet yet</h1>
        <p className="mt-2 text-muted-foreground">
          Create your first store under{' '}
          <a href="/dashboard/outlets" className="text-primary underline">Outlets</a> to track inventory.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Inventory</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            On-hand stock, reorder points and expiry tracking per outlet.
          </p>
        </div>
        <Select value={outletId} onValueChange={setOutletId}>
          <SelectTrigger className="w-auto min-w-[12rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {outlets.map((o) => (
              <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <Label className="flex cursor-pointer select-none items-center gap-2 text-sm font-normal">
          <Checkbox
            checked={lowOnly}
            onCheckedChange={(c) => setLowOnly(c === true)}
          />
          <span className="text-muted-foreground">Low stock only</span>
        </Label>
        {levelsLoading && <span className="text-xs text-muted-foreground">Refreshing…</span>}
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Variant / SKU</TableHead>
              <TableHead className="text-right">On hand</TableHead>
              <TableHead>Reorder point</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {levels.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="font-medium">{l.variant.product.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {l.variant.name !== 'Default' ? l.variant.name : ''}
                  {l.variant.name !== 'Default' && l.variant.sku ? ' · ' : ''}
                  {l.variant.sku ? <span className="font-mono text-xs">{l.variant.sku}</span> : null}
                  {l.variant.name === 'Default' && !l.variant.sku ? '—' : null}
                </TableCell>
                <TableCell className="text-right">
                  <span className="font-semibold">{l.quantity}</span>
                  {isLow(l) && (
                    <Badge variant="destructive" className="ml-2 gap-1 rounded-full font-medium">
                      <AlertTriangle className="h-3 w-3" /> Low
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <ReorderEditor value={l.reorderPoint} onSave={(v) => saveReorder(l, v)} />
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" onClick={() => setAdjusting(l)}>
                    Adjust
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!levels.length && !levelsLoading && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                  <Package className="mx-auto mb-2 h-8 w-8 opacity-50" />
                  {lowOnly ? 'No low-stock items. Everything is above its reorder point.' : 'No stock records for this outlet yet.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {expiring.length > 0 && (
        <div className="mt-8">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <CalendarClock className="h-4 w-4 text-primary" />
            Pharmacy — expiring soon
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Batches expiring within 30 days at this outlet.</p>
          <Card className="mt-3 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead className="text-right">Qty remaining</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expiring.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>
                      {b.variant?.product?.name ?? b.variant?.name ?? '—'}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{b.batchNo ?? '—'}</TableCell>
                    <TableCell>{formatDate(b.expiryDate)}</TableCell>
                    <TableCell className="text-right font-medium">{b.qtyRemaining}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}

      {adjusting && (
        <AdjustModal
          level={adjusting}
          onClose={() => setAdjusting(null)}
          onConfirm={async (qtyDelta, reason) => {
            setError(null);
            try {
              await api.post('/inventory/adjust', {
                outletId,
                variantId: adjusting.variantId,
                qtyDelta,
                reason: reason || undefined,
              });
              setAdjusting(null);
              await refresh();
            } catch (e) {
              throw e instanceof ApiRequestError ? new Error(e.message) : new Error('Adjustment failed');
            }
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

function formatDate(d: string | null): string {
  if (!d) return '—';
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return d;
  return t.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Inline reorder-point editor: click the value to edit, save on ✓ / Enter.
function ReorderEditor({ value, onSave }: { value: number; onSave: (v: number) => void | Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  async function commit() {
    const n = Math.max(0, Math.round(Number(draft) || 0));
    if (n === value) {
      setEditing(false);
      return;
    }
    setBusy(true);
    await onSave(n);
    setBusy(false);
    setEditing(false);
  }

  if (!editing) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setEditing(true)}
        className="h-8 px-2 font-normal"
        title="Edit reorder point"
      >
        {value > 0 ? value : <span className="text-muted-foreground">—</span>}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        autoFocus
        type="number"
        min={0}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
        className="h-8 w-20"
      />
      <Button
        variant="ghost"
        size="icon"
        disabled={busy}
        onClick={commit}
        className="h-8 w-8 text-primary"
      >
        <Check className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setEditing(false)}
        className="h-8 w-8 text-muted-foreground"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

function AdjustModal({
  level,
  onClose,
  onConfirm,
}: {
  level: Level;
  onClose: () => void;
  onConfirm: (qtyDelta: number, reason: string) => Promise<void>;
}) {
  const [delta, setDelta] = useState(0);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const resulting = level.quantity + delta;

  async function confirm() {
    if (delta === 0) {
      setErr('Enter a non-zero quantity change.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await onConfirm(Math.round(delta), reason);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Adjustment failed');
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust stock</DialogTitle>
        </DialogHeader>
        <p className="-mt-1 text-sm text-muted-foreground">
          {level.variant.product.name}
          {level.variant.name !== 'Default' ? ` · ${level.variant.name}` : ''}
        </p>
        <p className="text-sm text-muted-foreground">
          On hand: <span className="font-semibold text-foreground">{level.quantity}</span>
        </p>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setDelta((d) => d - 1)}>
            <Minus className="h-4 w-4" />
          </Button>
          <Input
            type="number"
            value={delta}
            onChange={(e) => setDelta(Number(e.target.value) || 0)}
            className="h-11 text-center text-lg font-semibold"
          />
          <Button variant="outline" size="icon" onClick={() => setDelta((d) => d + 1)}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-center text-sm text-muted-foreground">
          New on hand: <span className={`font-semibold ${resulting < 0 ? 'text-destructive' : 'text-foreground'}`}>{resulting}</span>
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="adjust-reason" className="text-muted-foreground">Reason (optional)</Label>
          <Input
            id="adjust-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Stock count, received delivery, damage"
          />
        </div>

        {err && <p className="text-sm text-destructive">{err}</p>}

        <Button
          disabled={busy || delta === 0}
          onClick={confirm}
          className="w-full"
          size="lg"
        >
          {busy ? 'Saving…' : `Apply ${delta > 0 ? '+' : ''}${delta}`}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
