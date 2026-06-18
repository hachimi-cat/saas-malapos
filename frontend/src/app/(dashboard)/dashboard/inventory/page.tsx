'use client';

import { useCallback, useEffect, useState } from 'react';
import { Package, AlertTriangle, Plus, Minus, Check, X, CalendarClock } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { rupiah } from '@/lib/money';

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
        setOutlets(o.data.outlets);
        setOutletId(o.data.outlets[0]?.id ?? '');
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
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Inventory</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            On-hand stock, reorder points and expiry tracking per outlet.
          </p>
        </div>
        <select
          value={outletId}
          onChange={(e) => setOutletId(e.target.value)}
          className="rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        >
          {outlets.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <label className="flex cursor-pointer select-none items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={lowOnly}
            onChange={(e) => setLowOnly(e.target.checked)}
            className="h-4 w-4 rounded border-input accent-primary"
          />
          <span className="text-muted-foreground">Low stock only</span>
        </label>
        {levelsLoading && <span className="text-xs text-muted-foreground">Refreshing…</span>}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium">Variant / SKU</th>
              <th className="px-4 py-3 text-right font-medium">On hand</th>
              <th className="px-4 py-3 font-medium">Reorder point</th>
              <th className="px-4 py-3 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {levels.map((l) => (
              <tr key={l.id} className="border-b border-border last:border-0 hover:bg-accent">
                <td className="px-4 py-3 font-medium">{l.variant.product.name}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {l.variant.name !== 'Default' ? l.variant.name : ''}
                  {l.variant.name !== 'Default' && l.variant.sku ? ' · ' : ''}
                  {l.variant.sku ? <span className="font-mono text-xs">{l.variant.sku}</span> : null}
                  {l.variant.name === 'Default' && !l.variant.sku ? '—' : null}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="font-semibold">{l.quantity}</span>
                  {isLow(l) && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-destructive px-2 py-0.5 text-xs font-medium text-destructive-foreground">
                      <AlertTriangle className="h-3 w-3" /> Low
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <ReorderEditor value={l.reorderPoint} onSave={(v) => saveReorder(l, v)} />
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => setAdjusting(l)}
                    className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
                  >
                    Adjust
                  </button>
                </td>
              </tr>
            ))}
            {!levels.length && !levelsLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                  <Package className="mx-auto mb-2 h-8 w-8 opacity-50" />
                  {lowOnly ? 'No low-stock items. Everything is above its reorder point.' : 'No stock records for this outlet yet.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {expiring.length > 0 && (
        <div className="mt-8">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <CalendarClock className="h-4 w-4 text-primary" />
            Pharmacy — expiring soon
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Batches expiring within 30 days at this outlet.</p>
          <div className="mt-3 overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">Batch</th>
                  <th className="px-4 py-3 font-medium">Expiry</th>
                  <th className="px-4 py-3 text-right font-medium">Qty remaining</th>
                </tr>
              </thead>
              <tbody>
                {expiring.map((b) => (
                  <tr key={b.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      {b.variant?.product?.name ?? b.variant?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{b.batchNo ?? '—'}</td>
                    <td className="px-4 py-3">{formatDate(b.expiryDate)}</td>
                    <td className="px-4 py-3 text-right font-medium">{b.qtyRemaining}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
      <button
        onClick={() => setEditing(true)}
        className="rounded px-2 py-1 text-sm hover:bg-background"
        title="Edit reorder point"
      >
        {value > 0 ? value : <span className="text-muted-foreground">—</span>}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        autoFocus
        type="number"
        min={0}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
        className="w-20 rounded-md border border-input bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
      <button
        disabled={busy}
        onClick={commit}
        className="rounded p-1 text-primary hover:bg-background disabled:opacity-40"
      >
        <Check className="h-4 w-4" />
      </button>
      <button onClick={() => setEditing(false)} className="rounded p-1 text-muted-foreground hover:bg-background">
        <X className="h-4 w-4" />
      </button>
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
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Adjust stock</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {level.variant.product.name}
          {level.variant.name !== 'Default' ? ` · ${level.variant.name}` : ''}
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          On hand: <span className="font-semibold text-foreground">{level.quantity}</span>
        </p>

        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={() => setDelta((d) => d - 1)}
            className="rounded-md border border-border p-2 hover:bg-accent"
          >
            <Minus className="h-4 w-4" />
          </button>
          <input
            type="number"
            value={delta}
            onChange={(e) => setDelta(Number(e.target.value) || 0)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-center text-lg font-semibold outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={() => setDelta((d) => d + 1)}
            className="rounded-md border border-border p-2 hover:bg-accent"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          New on hand: <span className={`font-semibold ${resulting < 0 ? 'text-destructive' : 'text-foreground'}`}>{resulting}</span>
        </p>

        <label className="mt-4 block text-sm">
          <span className="text-muted-foreground">Reason (optional)</span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Stock count, received delivery, damage"
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
          />
        </label>

        {err && <p className="mt-3 text-sm text-destructive">{err}</p>}

        <button
          disabled={busy || delta === 0}
          onClick={confirm}
          className="mt-5 w-full rounded-md bg-primary py-3 font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
        >
          {busy ? 'Saving…' : `Apply ${delta > 0 ? '+' : ''}${delta}`}
        </button>
      </div>
    </div>
  );
}
