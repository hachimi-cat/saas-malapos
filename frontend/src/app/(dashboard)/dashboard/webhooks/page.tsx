'use client';

/*
 * Webhooks — deliver malapos.* events to customer endpoints.
 * The signing secret (whsec_…) is shown ONCE at creation; deliveries
 * carry `Malapos-Signature: t=<unix>,v1=<hmac-sha256(secret, t+"."+body)>`.
 */

import { useCallback, useEffect, useState } from 'react';
import { api, ApiRequestError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

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
      setSubs(data.subscriptions ?? []);
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
    try {
      await api.delete(`/webhook-subscriptions/${sub.id}`);
      if (newSecret?.id === sub.id) setNewSecret(null);
      load();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Could not remove endpoint');
    }
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight font-display">Webhooks</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Get an HTTPS POST whenever something happens to your sales or subscription.
          </p>
        </div>
        <Button onClick={() => setShowAdd(true)}>Add endpoint</Button>
      </header>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 text-destructive px-4 py-2 text-sm">
          {error}
        </div>
      )}

      {newSecret && (
        <Card className="border-primary/40 bg-primary/5 p-4">
          <p className="text-sm font-semibold">Signing secret — shown once</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Use it to verify the <code className="rounded bg-muted/60 px-1">Malapos-Signature</code>{' '}
            header on every delivery. If you lose it, remove the endpoint and add it again.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 break-all rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs">
              {newSecret.secret}
            </code>
            <Button
              size="sm"
              className="shrink-0"
              onClick={() => {
                navigator.clipboard.writeText(newSecret.secret);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? 'Copied!' : 'Copy'}
            </Button>
            <Button variant="outline" size="sm" className="shrink-0" onClick={() => setNewSecret(null)}>
              Dismiss
            </Button>
          </div>
        </Card>
      )}

      {subs === null ? (
        <Card className="space-y-2 p-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </Card>
      ) : subs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          No endpoints yet. Add one to receive malapos.* events.
        </div>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Endpoint</TableHead>
                <TableHead className="w-36">Status</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subs.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <p className="truncate font-mono text-sm">{s.url}</p>
                    <p className="mt-1 flex flex-wrap gap-1">
                      {s.events.map((e) => (
                        <Badge
                          key={e}
                          variant="outline"
                          className="rounded-full bg-muted/40 px-2 py-0.5 font-mono text-xs font-normal text-muted-foreground"
                        >
                          {e === '*' ? 'all events (*)' : e}
                        </Badge>
                      ))}
                    </p>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={s.active}
                        onCheckedChange={() => toggleActive(s)}
                        title={
                          s.active
                            ? 'Deliveries on — click to pause'
                            : 'Paused — click to resume'
                        }
                      />
                      <span
                        className={`text-xs font-medium ${
                          s.active ? 'text-emerald-400' : 'text-muted-foreground'
                        }`}
                      >
                        {s.active ? 'Active' : 'Paused'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="link"
                          size="sm"
                          className="h-auto p-0 text-xs text-destructive"
                        >
                          Remove
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove endpoint?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Deliveries to{' '}
                            <span className="break-all font-mono text-foreground">{s.url}</span>{' '}
                            stop immediately. This can&apos;t be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Keep endpoint</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => remove(s)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Remove endpoint
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground font-display">
            Event catalog
          </CardTitle>
        </CardHeader>
        <CardContent>
        <div className="mt-3 space-y-2">
          {EVENT_CATALOG.map((e) => (
            <div key={e.type} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <code className="font-mono text-xs font-medium">{e.type}</code>
              <span className="text-xs text-muted-foreground">{e.description}</span>
            </div>
          ))}
        </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground font-display">
            Verifying signatures
          </CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

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
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <form onSubmit={submit} className="space-y-3">
          <DialogHeader>
            <DialogTitle>Add webhook endpoint</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            You&apos;ll get the signing secret right after — it&apos;s shown only once.
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Input
            required
            autoFocus
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/webhooks/malapos"
          />
          <fieldset className="space-y-2 rounded-lg border border-border p-3">
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={allEvents}
                onCheckedChange={(c) => setAllEvents(c === true)}
                className="mt-0.5"
              />
              <span>
                All events <code className="font-mono text-xs text-muted-foreground">(*)</code>
              </span>
            </label>
            {!allEvents &&
              EVENT_CATALOG.map((ev) => (
                <label key={ev.type} className="flex items-start gap-2 pl-5 text-sm">
                  <Checkbox
                    checked={selected.includes(ev.type)}
                    onCheckedChange={() => toggle(ev.type)}
                    className="mt-0.5"
                  />
                  <code className="font-mono text-xs">{ev.type}</code>
                </label>
              ))}
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Adding…' : 'Add endpoint'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
