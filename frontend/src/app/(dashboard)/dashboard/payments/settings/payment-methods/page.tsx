'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, Check, Loader2 } from 'lucide-react';
import {
  plugipaySettingsApi,
  type CheckoutSettings,
  type PaymentMethodDef,
} from '@/lib/plugipay-settings-api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const GROUP_LABELS: Record<PaymentMethodDef['group'], string> = {
  qr: 'QR payments',
  ewallet: 'E-wallets',
  va: 'Virtual accounts',
  debit: 'Direct debit & online banking',
  card: 'Cards',
  retail: 'Retail outlets',
  bnpl: 'Pay later',
  offline: 'Offline & manual',
  paypal: 'PayPal',
};

const ADAPTER_LABEL: Record<string, string> = {
  managed: 'Plugipay managed',
  xendit: 'BYO Xendit',
  midtrans: 'Midtrans',
  paypal: 'PayPal',
  manual: 'Offline & manual',
};

export default function PaymentMethodsSettingsPage() {
  const [settings, setSettings] = React.useState<CheckoutSettings | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);

  const [enabled, setEnabled] = React.useState<Set<string>>(new Set());
  const [order, setOrder] = React.useState<string[]>([]);
  const [methodAdapter, setMethodAdapter] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    plugipaySettingsApi
      .getCheckoutSettings()
      .then((s) => {
        setSettings(s);
        setEnabled(new Set(s.enabledMethods));
        setOrder(s.methodOrder.length > 0 ? s.methodOrder : s.enabledMethods);
        setMethodAdapter(s.methodAdapter);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  function toggle(id: string) {
    setError(null);
    setInfo(null);
    const next = new Set(enabled);
    if (next.has(id)) {
      next.delete(id);
      setOrder((prev) => prev.filter((x) => x !== id));
      setMethodAdapter((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
    } else {
      next.add(id);
      setOrder((prev) => (prev.includes(id) ? prev : [...prev, id]));
    }
    setEnabled(next);
  }

  function move(id: string, delta: -1 | 1) {
    setOrder((prev) => {
      const idx = prev.indexOf(id);
      if (idx < 0) return prev;
      const to = idx + delta;
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[to]] = [next[to]!, next[idx]!];
      return next;
    });
  }

  function setProviderFor(id: string, kind: string) {
    setMethodAdapter((prev) => ({ ...prev, [id]: kind }));
  }

  async function save() {
    if (!settings) return;
    setError(null);
    setInfo(null);
    setSaving(true);
    try {
      const next = await plugipaySettingsApi.updateCheckoutSettings({
        enabledMethods: Array.from(enabled),
        methodOrder: order.filter((id) => enabled.has(id)),
        methodAdapter,
      });
      setSettings(next);
      setInfo('Payment methods saved');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const catalog = settings?.catalog ?? [];
  const support = settings?.methodSupport ?? {};

  const grouped = React.useMemo(() => {
    const byGroup: Record<PaymentMethodDef['group'], PaymentMethodDef[]> = {
      qr: [],
      ewallet: [],
      va: [],
      debit: [],
      card: [],
      retail: [],
      bnpl: [],
      offline: [],
      paypal: [],
    };
    for (const m of catalog) byGroup[m.group].push(m);
    return byGroup;
  }, [catalog]);

  return (
    <div className="space-y-6">
      <nav className="text-xs text-muted-foreground">
        <span>Settings</span>
        <span className="mx-1.5 text-muted-foreground/50">/</span>
        <span className="text-foreground">Payment methods</span>
      </nav>

      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight font-display">Payment methods</h1>
          <p className="mt-1 max-w-[62ch] text-sm text-muted-foreground">
            Enable methods, reorder them, and choose which provider handles each one. Only methods
            your connected providers can actually process appear at checkout.
          </p>
        </div>
        <Button type="button" onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save changes
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs font-mono text-destructive">
          {error}
        </div>
      )}
      {info && (
        <div className="rounded-md border border-border bg-emerald-500/10 px-3 py-2 text-xs font-mono text-emerald-400">
          {info}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Methods</CardTitle>
            <CardDescription className="text-xs">
              <Link href="/dashboard/payments/settings/providers" className="underline hover:text-foreground">
                Connect more providers
              </Link>{' '}
              to unlock grayed rows.
            </CardDescription>
          </CardHeader>
          <CardContent>
          <div className="space-y-5">
            {(Object.keys(GROUP_LABELS) as PaymentMethodDef['group'][]).map((g) => {
              const rows = grouped[g];
              if (!rows || rows.length === 0) return null;
              return (
                <div key={g}>
                  <p className="mb-2 text-xs font-mono uppercase tracking-wide text-muted-foreground">
                    {GROUP_LABELS[g]}
                  </p>
                  <div className="divide-y divide-border rounded-md border border-border">
                    {rows.map((m) => {
                      const supporters = support[m.id] ?? [];
                      const isAvailable = supporters.length > 0;
                      const isEnabled = enabled.has(m.id);
                      const orderIdx = order.indexOf(m.id);
                      const currentAdapter = methodAdapter[m.id] ?? supporters[0] ?? '';
                      return (
                        <div
                          key={m.id}
                          className={`flex items-center gap-3 px-4 py-2.5 ${isAvailable ? '' : 'opacity-50'}`}
                        >
                          <Checkbox
                            checked={isEnabled}
                            disabled={!isAvailable}
                            onCheckedChange={() => toggle(m.id)}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">{m.label}</p>
                            <p className="text-xs text-muted-foreground">
                              {isAvailable
                                ? isEnabled
                                  ? `Position ${orderIdx + 1}`
                                  : `Can route through ${supporters.map((s) => ADAPTER_LABEL[s] ?? s).join(' or ')}`
                                : 'No connected provider supports this'}
                            </p>
                          </div>
                          {isEnabled && supporters.length > 1 && (
                            <Select
                              value={currentAdapter}
                              onValueChange={(v) => setProviderFor(m.id, v)}
                            >
                              <SelectTrigger className="h-auto w-auto gap-1 px-2 py-1 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {supporters.map((s) => (
                                  <SelectItem key={s} value={s}>
                                    {ADAPTER_LABEL[s] ?? s}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                          {isEnabled && (
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => move(m.id, -1)}
                                disabled={orderIdx <= 0}
                                className="h-7 w-7 text-muted-foreground hover:text-foreground disabled:opacity-30"
                                aria-label="Move up"
                              >
                                <ArrowUp className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => move(m.id, 1)}
                                disabled={orderIdx === order.length - 1}
                                className="h-7 w-7 text-muted-foreground hover:text-foreground disabled:opacity-30"
                                aria-label="Move down"
                              >
                                <ArrowDown className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                          {isEnabled && <Check className="h-4 w-4 text-primary" strokeWidth={2.5} />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
