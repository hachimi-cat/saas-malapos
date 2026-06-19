'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Megaphone,
  Loader2,
  Tag,
  Plus,
  X,
  RefreshCw,
  Gift,
  ExternalLink,
  Archive,
} from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { rupiah } from '@/lib/money';

/*
 * Marketing dashboard — the Marketing (Ripllo) module's deep-link target
 * (/dashboard/marketing), the "Discount codes" sub-page: list / create /
 * archive over the gated per-merchant Ripllo client. The loyalty program
 * + member lookup live on the Marketing → Loyalty sub-page.
 *
 * When the Marketing module is OFF the backend returns 409
 * MARKETING_MODULE_DISABLED and this page shows the enable empty state.
 * Built against the real backend; no mock data.
 */

type DiscountType = 'percent' | 'fixed' | 'shipping_percent' | 'shipping_fixed';

type DiscountCode = {
  id: string;
  code: string;
  description: string | null;
  type: DiscountType;
  value: number;
  active: boolean;
  redemptionCount: number;
  minPurchaseAmount: number | null;
  maxUsesTotal: number | null;
  expiresAt: string | null;
};

function formatType(type: DiscountType, value: number): string {
  switch (type) {
    case 'percent':
      return `${value}% off`;
    case 'fixed':
      return `${rupiah(value)} off`;
    case 'shipping_percent':
      return `${value}% off shipping`;
    case 'shipping_fixed':
      return `${rupiah(value)} off shipping`;
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function MarketingPage() {
  const [codes, setCodes] = useState<DiscountCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [moduleOff, setModuleOff] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    setModuleOff(false);
    try {
      const codesRes = await api.get<DiscountCode[]>('/marketing/discount-codes');
      setCodes(codesRes.data ?? []);
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 409) {
        setModuleOff(true);
      } else {
        setError(e instanceof ApiRequestError ? e.message : 'Failed to load marketing');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function archive(id: string) {
    try {
      await api.delete(`/marketing/discount-codes/${id}`);
      void load();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to archive code');
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (moduleOff) {
    return (
      <div className="mx-auto max-w-6xl">
        <div className="rounded-lg border border-border bg-card px-8 py-16 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Megaphone className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-lg font-semibold">Enable the Marketing module</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Marketing uses Ripllo to run discount codes and a points-based loyalty program across
            your outlets. Turn on the Marketing module to reward repeat customers and stamp
            redemptions at the till.
          </p>
          <Link
            href="/dashboard/settings/modules"
            className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Go to Modules <ExternalLink className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Megaphone className="h-6 w-6 text-primary" /> Marketing
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Discount codes for your customers. Powered by Ripllo.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/marketing/loyalty"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
          >
            <Gift className="h-4 w-4" /> Loyalty
          </Link>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> New code
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ── Discount codes ───────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <Tag className="h-4 w-4 text-muted-foreground" /> Discount codes
          </h2>
          <span className="text-xs text-muted-foreground">{codes.length} total</span>
        </div>
        {codes.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-muted-foreground">
            No discount codes yet. Create one to give customers a reason to come back.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {codes.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-4 px-6 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-medium">{c.code}</span>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        c.active
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {c.active ? 'Active' : 'Archived'}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {formatType(c.type, c.value)}
                    {c.minPurchaseAmount ? ` · min ${rupiah(c.minPurchaseAmount)}` : ''}
                    {` · ${c.redemptionCount} used`}
                    {c.expiresAt ? ` · expires ${formatDate(c.expiresAt)}` : ''}
                  </div>
                </div>
                {c.active && (
                  <button
                    type="button"
                    onClick={() => void archive(c.id)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-muted"
                  >
                    <Archive className="h-3.5 w-3.5" /> Archive
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {createOpen && (
        <CreateCodeModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

// ── Create discount-code modal ────────────────────────────────────────
function CreateCodeModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [code, setCode] = useState('');
  const [type, setType] = useState<DiscountType>('percent');
  const [value, setValue] = useState('');
  const [minPurchase, setMinPurchase] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/marketing/discount-codes', {
        code: code.trim().toUpperCase(),
        type,
        value: Number(value) || 0,
        minPurchaseAmount: minPurchase ? Number(minPurchase) : null,
      });
      onCreated();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Failed to create code');
    } finally {
      setSubmitting(false);
    }
  }

  const isPercent = type === 'percent' || type === 'shipping_percent';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-10">
      <div className="w-full max-w-md rounded-lg border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-semibold">New discount code</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 px-6 py-4">
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Code</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="WELCOME10"
              className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm uppercase focus:border-primary focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Type</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as DiscountType)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            >
              <option value="percent">Percent off</option>
              <option value="fixed">Fixed amount off (IDR)</option>
            </select>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                {isPercent ? 'Percent' : 'Amount (IDR)'}
              </span>
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                inputMode="numeric"
                placeholder={isPercent ? '10' : '15000'}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                Min. purchase (IDR)
              </span>
              <input
                value={minPurchase}
                onChange={(e) => setMinPurchase(e.target.value)}
                inputMode="numeric"
                placeholder="optional"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            </label>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!code.trim() || !value || submitting}
            onClick={() => void submit()}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Create code
          </button>
        </div>
      </div>
    </div>
  );
}
