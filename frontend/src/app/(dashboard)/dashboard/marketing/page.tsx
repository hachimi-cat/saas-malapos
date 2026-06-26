'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Megaphone,
  Loader2,
  Tag,
  Plus,
  RefreshCw,
  Gift,
  ExternalLink,
  Archive,
} from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { rupiah } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
} from '@/components/ui/dialog';

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
        <Card className="px-8 py-16 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Megaphone className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-lg font-semibold">Enable the Marketing module</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Marketing uses Ripllo to run discount codes and a points-based loyalty program across
            your outlets. Turn on the Marketing module to reward repeat customers and stamp
            redemptions at the till.
          </p>
          <Button asChild className="mt-6">
            <Link href="/dashboard/settings/modules">
              Go to Modules <ExternalLink className="h-4 w-4" />
            </Link>
          </Button>
        </Card>
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
          <Button asChild variant="outline">
            <Link href="/dashboard/marketing/loyalty">
              <Gift className="h-4 w-4" /> Loyalty
            </Link>
          </Button>
          <Button variant="outline" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New code
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ── Discount codes ───────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border px-6 py-4">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Tag className="h-4 w-4 text-muted-foreground" /> Discount codes
          </CardTitle>
          <span className="text-xs text-muted-foreground">{codes.length} total</span>
        </CardHeader>
        {codes.length === 0 ? (
          <CardContent className="px-6 py-12 text-center text-sm text-muted-foreground">
            No discount codes yet. Create one to give customers a reason to come back.
          </CardContent>
        ) : (
          <div className="divide-y divide-border">
            {codes.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-4 px-6 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-medium">{c.code}</span>
                    {c.active ? (
                      <Badge
                        variant="outline"
                        className="rounded-full border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
                      >
                        Active
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                      >
                        Archived
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {formatType(c.type, c.value)}
                    {c.minPurchaseAmount ? ` · min ${rupiah(c.minPurchaseAmount)}` : ''}
                    {` · ${c.redemptionCount} used`}
                    {c.expiresAt ? ` · expires ${formatDate(c.expiresAt)}` : ''}
                  </div>
                </div>
                {c.active && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void archive(c.id)}
                    className="shrink-0"
                  >
                    <Archive className="h-3.5 w-3.5" /> Archive
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

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
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New discount code</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="code">Code</Label>
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="WELCOME10"
              className="font-mono uppercase"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="type">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as DiscountType)}>
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">Percent off</SelectItem>
                <SelectItem value="fixed">Fixed amount off (IDR)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="value">{isPercent ? 'Percent' : 'Amount (IDR)'}</Label>
              <Input
                id="value"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                inputMode="numeric"
                placeholder={isPercent ? '10' : '15000'}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="minPurchase">Min. purchase (IDR)</Label>
              <Input
                id="minPurchase"
                value={minPurchase}
                onChange={(e) => setMinPurchase(e.target.value)}
                inputMode="numeric"
                placeholder="optional"
              />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!code.trim() || !value || submitting}
            onClick={() => void submit()}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Create code
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
