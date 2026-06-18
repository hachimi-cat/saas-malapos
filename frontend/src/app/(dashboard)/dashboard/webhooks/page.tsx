'use client';

/*
 * Webhooks — deliver malapos.* events to customer endpoints.
 * The signing secret (whsec_…) is shown ONCE at creation; deliveries
 * carry `Malapos-Signature: t=<unix>,v1=<hmac-sha256(secret, t+"."+body)>`.
 */

import { useCallback, useEffect, useState } from 'react';
import { api, ApiRequestError } from '@/lib/api';

interface Subscription {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
}

const EVENT_CATALOG: { type: string; description: string }[] = [
  { type: 'malapos.sale.completed.v1', description: 'A sale was finalized and paid at the point of sale.' },
  { type: 'malapos.sale.voided.v1', description: 'A previously recorded sale was voided.' },
  { type: 'malapos.billing.subscribed.v1', description: 'A workspace started or upgraded a paid subscription.' },
  { type: 'malapos.billing.canceled.v1', description: 'A workspace canceled its subscription.' },
];

export default function WebhooksPage() {
  const [subs, setSubs] = useState<Subscription[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  // Secret of the most recently created endpoint — shown once, inline.
  const [newSecret, setNewSecret] = useState<{ id: string; secret: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data } = await api.get<{ subscriptions: Subscription[] }>(
        '/webhook-subscriptions',
      );
      setSubs(data.subscriptions);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Could not load webhooks');
      setSubs([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleActive(sub: Subscription) {
    try {
      await api.patch(`/webhook-subscriptions/${sub.id}`, { active: !sub.active });
      load();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Could not update endpoint');
    }
  }

  async function remove(sub: Subscription) {
    if (!window.confirm(`Remove the endpoint ${sub.url}? Deliveries stop immediately.`)) return;
    try {
      await api.delete(`/webhook-subscriptions/${sub.id}`);
      if (newSecret?.id === sub.id) setNewSecret(null);
      load();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Could not remove endpoint');
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Webhooks</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Get an HTTPS POST whenever something happens to your sales or subscription.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Add endpoint
        </button>
      </header>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm">
          {error}
        </div>
      )}

      {newSecret && (
        <div className="rounded-xl border border-primary/40 bg-primary/5 p-4">
          <p className="text-sm font-semibold">Signing secret — shown once</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Use it to verify the <code className="rounded bg-muted/60 px-1">Malapos-Signature</code>{' '}
            header on every delivery. If you lose it, remove the endpoint and add it again.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 break-all rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs">
              {newSecret.secret}
            </code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(newSecret.secret);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button
              onClick={() => setNewSecret(null)}
              className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {subs === null ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
      ) : subs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          No endpoints yet. Add one to receive malapos.* events.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          {subs.map((s) => (
            <div
              key={s.id}
              className="flex flex-wrap items-center gap-3 border-b border-border/60 px-4 py-3 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-sm">{s.url}</p>
                <p className="mt-0.5 flex flex-wrap gap-1">
                  {s.events.map((e) => (
                    <span
                      key={e}
                      className="rounded-full border border-border bg-muted/40 px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
                    >
                      {e === '*' ? 'all events (*)' : e}
                    </span>
                  ))}
                </p>
              </div>
              <button
                onClick={() => toggleActive(s)}
                role="switch"
                aria-checked={s.active}
                title={s.active ? 'Deliveries on — click to pause' : 'Paused — click to resume'}
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                  s.active ? 'bg-primary' : 'bg-muted-foreground/30'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                    s.active ? 'left-[18px]' : 'left-0.5'
                  }`}
                />
              </button>
              <span
                className={`w-14 shrink-0 text-xs font-medium ${
                  s.active ? 'text-emerald-600' : 'text-muted-foreground'
                }`}
              >
                {s.active ? 'Active' : 'Paused'}
              </span>
              <button
                onClick={() => remove(s)}
                className="shrink-0 text-xs text-destructive hover:underline"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <section className="rounded-xl border border-border p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Event catalog
        </h2>
        <div className="mt-3 space-y-2">
          {EVENT_CATALOG.map((e) => (
            <div key={e.type} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <code className="font-mono text-xs font-medium">{e.type}</code>
              <span className="text-xs text-muted-foreground">{e.description}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-border p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Verifying signatures
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Every delivery is an HTTPS POST of <code className="rounded bg-muted/60 px-1 text-xs">{'{ id, type, occurredAt, data }'}</code>{' '}
          with a <code className="rounded bg-muted/60 px-1 text-xs">Malapos-Signature</code> header. Recompute the
          HMAC with your signing secret and compare — reject anything older than ~5 minutes.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-muted/40 p-4 font-mono text-xs leading-relaxed">
{`Malapos-Signature: t=<unix>,v1=<hex>

// Node.js
const crypto = require('node:crypto');
const [t, v1] = header.split(',').map((kv) => kv.split('=')[1]);
const expected = crypto
  .createHmac('sha256', WEBHOOK_SECRET)   // your whsec_… secret
  .update(\`\${t}.\${rawBody}\`)             // unix timestamp + "." + raw JSON body
  .digest('hex');
const valid =
  crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1)) &&
  Math.abs(Date.now() / 1000 - Number(t)) < 300;`}
        </pre>
        <p className="mt-2 text-xs text-muted-foreground">
          Delivery is at-most-once in v1 (failures are logged, not retried) — reconcile with{' '}
          <code className="rounded bg-muted/60 px-1">GET /api/v1/sales</code> if you need certainty.
        </p>
      </section>

      {showAdd && (
        <AddEndpointDialog
          onClose={() => setShowAdd(false)}
          onCreated={(created) => {
            setShowAdd(false);
            setNewSecret({ id: created.id, secret: created.secret });
            setCopied(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function AddEndpointDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (created: { id: string; secret: string }) => void;
}) {
  const [url, setUrl] = useState('');
  const [allEvents, setAllEvents] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(type: string) {
    setSelected((cur) =>
      cur.includes(type) ? cur.filter((t) => t !== type) : [...cur, type],
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!allEvents && selected.length === 0) {
      setError('Pick at least one event (or subscribe to all).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post<Subscription & { secret: string }>(
        '/webhook-subscriptions',
        { url, events: allEvents ? ['*'] : selected },
      );
      onCreated({ id: data.id, secret: data.secret });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not add endpoint');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-3 rounded-xl border border-border bg-background p-5 shadow-xl"
      >
        <h2 className="text-lg font-semibold">Add webhook endpoint</h2>
        <p className="text-xs text-muted-foreground">
          You&apos;ll get the signing secret right after — it&apos;s shown only once.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <input
          required
          autoFocus
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/webhooks/malapos"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        <fieldset className="space-y-2 rounded-lg border border-border p-3">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={allEvents}
              onChange={(e) => setAllEvents(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              All events <code className="font-mono text-xs text-muted-foreground">(*)</code>
            </span>
          </label>
          {!allEvents &&
            EVENT_CATALOG.map((ev) => (
              <label key={ev.type} className="flex items-start gap-2 pl-5 text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(ev.type)}
                  onChange={() => toggle(ev.type)}
                  className="mt-0.5"
                />
                <code className="font-mono text-xs">{ev.type}</code>
              </label>
            ))}
        </fieldset>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm">
            Cancel
          </button>
          <button
            disabled={busy}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy ? 'Adding…' : 'Add endpoint'}
          </button>
        </div>
      </form>
    </div>
  );
}
