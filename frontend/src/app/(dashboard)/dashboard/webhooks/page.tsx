'use client';

/*
 * Webhooks — deliver malapos.* events to customer endpoints.
 * The signing secret (whsec_…) is shown ONCE at creation; deliveries
 * carry `Malapos-Signature: t=<unix>,v1=<hmac-sha256(secret, t+"."+body)>`,
 * are retried 1 min … 12 h, and each attempt lands in the delivery log
 * (Recent deliveries, below). An endpoint that keeps failing is switched
 * off by Malapos; the reason shows on its row.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { toast } from 'sonner';
import { PageHeader } from '@/components/dashboard/page-header';
import { AgenticEntry, BulkEditSlot, BulkVerbSlot } from '@/components/catentio/agentic-entry';
import { ActionsDropdown, type PageAction } from '@/components/dashboard/actions-dropdown';
import { BulkBar, BulkDeleteDialog } from '@/components/dashboard/bulk-bar';
import { useCatentioStatus } from '@/hooks/use-catentio';
import { deleteMany } from '@/lib/bulk';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

// A type alias (not an interface) so rows structurally satisfy the
// bulk-edit slot's Record<string, unknown> targets.
type Subscription = {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  consecutiveFailures?: number;
  failingSince?: string | null;
  /** Set when Malapos switched the endpoint off because it kept failing. */
  disabledAt?: string | null;
  disabledReason?: string | null;
  createdAt: string;
};

/** The event types (GET /webhook-subscriptions/event-types): what the API sends. */
type CatalogEntry = { type: string; description: string };

type Attempt = {
  attemptNumber: number;
  status: 'succeeded' | 'failed';
  responseCode: number | null;
  durationMs: number;
  error: string | null;
  nextRetryAt: string | null;
  attemptedAt: string;
};

type Delivery = {
  id: string;
  subscriptionId: string;
  eventId: string;
  type: string;
  status: 'pending' | 'succeeded' | 'failed';
  attempts: number;
  nextRetryAt: string | null;
  lastAttemptAt: string | null;
  responseCode: number | null;
  lastError: string | null;
  createdAt: string;
  attemptLog: Attempt[];
};

function when(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString() : '—';
}

function DeliveryStatus({ status }: { status: Delivery['status'] }) {
  const cls =
    status === 'succeeded'
      ? 'border-emerald-500/40 text-emerald-400'
      : status === 'failed'
        ? 'border-destructive/50 text-destructive'
        : 'border-amber-500/40 text-amber-400';
  return (
    <Badge variant="outline" className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </Badge>
  );
}

export default function WebhooksPage() {
  const [subs, setSubs] = useState<Subscription[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  // Secret of the most recently created endpoint — shown once, inline.
  const [newSecret, setNewSecret] = useState<{ id: string; secret: string } | null>(null);
  const [copied, setCopied] = useState(false);
  // Batch edit (agentic sheet) + batch delete, over the row selection.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkEditing, setBulkEditing] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  // Wave-2: with the assistant ON the batch delete is the agentic verb
  // sheet over the selection (the declared `delete` action, fanned out
  // through the same api.delete the row confirm makes); with it OFF the
  // dropdown item opens BulkDeleteDialog exactly as before.
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const { enabled: assistantEnabled } = useCatentioStatus();
  const [catalog, setCatalog] = useState<CatalogEntry[] | null>(null);

  useEffect(() => {
    api
      .get<{ types: CatalogEntry[] }>('/webhook-subscriptions/event-types')
      .then(({ data }) => setCatalog(data.types ?? []))
      .catch(() => setCatalog([]));
  }, []);

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

  // Selected rows as bulk targets: `id` for the write, `url` for a
  // named failure line, and the descriptor fields so the edit sheet's
  // manual form pre-fills.
  const bulkTargets = useMemo(
    () => (subs ?? []).filter((s) => selected.has(s.id)),
    [subs, selected],
  );

  // The bulk-delete EXECUTOR — called by the Actions dropdown's confirm
  // (BulkDeleteDialog). Throwing surfaces deleteMany's partial-failure
  // sentence, which the BulkBar renders; the selection persists on a
  // partial run so the failed rest can be retried.
  async function onBulkDelete() {
    try {
      await deleteMany(
        bulkTargets.map((s) => ({ id: s.id, label: s.url })),
        (id) => api.delete(`/webhook-subscriptions/${id}`),
      );
      if (newSecret && selected.has(newSecret.id)) setNewSecret(null);
    } finally {
      await load();
    }
  }

  function toggleRow(id: string, checked: boolean) {
    setSelected((s) => {
      const next = new Set(s);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelected((s) => {
      const next = new Set(s);
      for (const sub of subs ?? []) {
        if (checked) next.add(sub.id);
        else next.delete(sub.id);
      }
      return next;
    });
  }

  // The page's batch verbs, on the Actions dropdown beside the "New X"
  // entry (bang's entry-point contract). Labels recompute per render so
  // the counts stay live.
  const pageActions: PageAction[] = [
    ...(assistantEnabled
      ? [{
          key: 'bulk-edit',
          label: bulkTargets.length > 0 ? `Bulk edit ${bulkTargets.length} selected` : 'Bulk edit',
          icon: Pencil,
          run: () => setBulkEditing(true),
          requiresSelection: true,
        }]
      : []),
    {
      key: 'bulk-delete',
      label: bulkTargets.length > 0 ? `Delete ${bulkTargets.length} selected` : 'Delete selected',
      icon: Trash2,
      run: () => (assistantEnabled ? setBulkDeleting(true) : setBulkDeleteOpen(true)),
      requiresSelection: true,
      destructive: true,
    },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Webhooks"
        description="Get an HTTPS POST whenever something happens to your sales or subscription."
        action={
          <div className="flex items-center gap-2">
            <ActionsDropdown
              actions={pageActions}
              selectionCount={bulkTargets.length}
              noun="endpoint"
            />
            <AgenticEntry
              resource="webhook-subscriptions"
              mode="create"
              onApplied={load}
              className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
              fallback={
                <Button onClick={() => setShowAdd(true)}>
                  <Plus className="h-4 w-4" /> Add endpoint
                </Button>
              }
            >
              <Plus className="h-4 w-4" /> Add endpoint
            </AgenticEntry>
          </div>
        }
      />

      {bulkEditing && (
        <BulkEditSlot
          resource="webhook-subscriptions"
          targets={bulkTargets}
          onClose={() => setBulkEditing(false)}
          onApplied={async (outcome) => {
            // A partial run leaves the sheet OPEN over the records that
            // did not go through — only the list behind it is stale, so
            // reload and leave the sheet and the ticks alone.
            if (outcome === 'applied') {
              setBulkEditing(false);
              setSelected(new Set());
            }
            await load();
          }}
        />
      )}

      {bulkDeleting && (
        <BulkVerbSlot
          resource="webhook-subscriptions"
          verb="delete"
          targets={bulkTargets}
          onClose={() => setBulkDeleting(false)}
          onApplied={async (outcome) => {
            // A partial run leaves the sheet OPEN over the records that
            // did not go through — only the list behind it is stale, so
            // reload and leave the sheet and the ticks alone.
            if (outcome === 'applied') {
              setBulkDeleting(false);
              setSelected(new Set());
            }
            await load();
          }}
        />
      )}

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
            <Button
              size="sm"
              className="shrink-0"
              onClick={() => {
                const blob = new Blob(
                  ['WEBHOOK_SIGNING_SECRET=' + newSecret.secret + '\n'],
                  { type: 'text/plain' },
                );
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'webhook-signing-secret.env';
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
              }}
            >
              Download
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
                <TableHead className="w-10">
                  <Checkbox
                    checked={
                      subs.length > 0 && subs.every((s) => selected.has(s.id))
                        ? true
                        : subs.some((s) => selected.has(s.id))
                          ? 'indeterminate'
                          : false
                    }
                    onCheckedChange={(v) => toggleAll(v === true)}
                    aria-label="Select all endpoints"
                  />
                </TableHead>
                <TableHead>Endpoint</TableHead>
                <TableHead className="w-56">Status</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subs.map((s) => (
                <TableRow key={s.id} data-state={selected.has(s.id) ? 'selected' : undefined}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(s.id)}
                      onCheckedChange={(v) => toggleRow(s.id, v === true)}
                      aria-label={`Select ${s.url}`}
                    />
                  </TableCell>
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
                          s.active ? 'text-emerald-400' : s.disabledAt ? 'text-destructive' : 'text-muted-foreground'
                        }`}
                      >
                        {s.active ? 'Active' : s.disabledAt ? 'Switched off' : 'Paused'}
                      </span>
                    </div>
                    {s.disabledAt && (
                      <p className="mt-1 max-w-xs text-xs text-muted-foreground" title={s.disabledReason ?? undefined}>
                        Malapos switched it off {when(s.disabledAt)}: {s.disabledReason}. Fix the
                        receiver, turn it back on, then retry the failed deliveries below.
                      </p>
                    )}
                    {s.active && (s.consecutiveFailures ?? 0) > 0 && (
                      <p className="mt-1 text-xs text-amber-400">
                        {s.consecutiveFailures} failed in a row since {when(s.failingSince)}
                      </p>
                    )}
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

      {subs && subs.length > 0 && (
        <RecentDeliveries subscriptions={subs} onChanged={load} />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground font-display">
            Event catalog
          </CardTitle>
        </CardHeader>
        <CardContent>
        <div className="mt-3 space-y-2">
          {catalog === null && <Skeleton className="h-16 w-full" />}
          {(catalog ?? []).map((e) => (
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
          Every delivery is an HTTPS POST
          with a <code className="rounded bg-muted/60 px-1 text-xs">Malapos-Signature</code> header (the body is{' '}
          <code className="rounded bg-muted/60 px-1 text-xs">{'{ id, type, occurredAt, accountId, data }'}</code>). Recompute the
          HMAC over the raw body with your signing secret and compare — reject anything older than ~5 minutes.
          The SDKs do it for you: <code className="rounded bg-muted/60 px-1 text-xs">verifyWebhook</code> (JS),{' '}
          <code className="rounded bg-muted/60 px-1 text-xs">verify_webhook</code> (Python),{' '}
          <code className="rounded bg-muted/60 px-1 text-xs">VerifyWebhook</code> (Go).
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
          A <code className="rounded bg-muted/60 px-1">2xx</code> within 10 seconds is success; anything else is
          retried 1 min, 5 min, 25 min, 2 h and 12 h later (6 attempts). Delivery is at-least-once — drop
          duplicates by the event <code className="rounded bg-muted/60 px-1">id</code>. An endpoint that fails 20
          times in a row over a day is switched off and your other endpoints get{' '}
          <code className="rounded bg-muted/60 px-1">malapos.webhook_subscription.disabled.v1</code>.
        </p>
        </CardContent>
      </Card>


      <BulkBar
        count={bulkTargets.length}
        noun="endpoint"
        onClear={() => { setBulkError(null); setSelected(new Set()); }}
        error={bulkError}
      />

      <BulkDeleteDialog
        count={bulkTargets.length}
        noun="endpoint"
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        onDelete={onBulkDelete}
        onError={setBulkError}
        onDone={() => setSelected(new Set())}
        description="Deliveries to each endpoint stop immediately. This can't be undone."
      />
      {showAdd && (
        <AddEndpointDialog
          catalog={catalog ?? []}
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
  catalog,
  onClose,
  onCreated,
}: {
  catalog: CatalogEntry[];
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
              catalog.map((ev) => (
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

/**
 * The delivery log (GET /webhook-subscriptions/deliveries): what was sent to
 * each endpoint, every attempt, and a Retry for anything that is not pending.
 */
function RecentDeliveries({
  subscriptions,
  onChanged,
}: {
  subscriptions: Subscription[];
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<Delivery[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<'' | Delivery['status']>('');
  const [subscriptionId, setSubscriptionId] = useState('');
  const [open, setOpen] = useState<Delivery | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const urlOf = useMemo(() => new Map(subscriptions.map((s) => [s.id, s.url])), [subscriptions]);

  const fetchPage = useCallback(
    async (after: string | null) => {
      setError(null);
      const q = new URLSearchParams({ limit: '20' });
      if (status) q.set('status', status);
      if (subscriptionId) q.set('subscriptionId', subscriptionId);
      if (after) q.set('cursor', after);
      try {
        const { data, meta } = await api.get<Delivery[]>(`/webhook-subscriptions/deliveries?${q.toString()}`);
        setRows((cur) => (after ? [...(cur ?? []), ...(data ?? [])] : data ?? []));
        setCursor(meta.cursor ?? null);
        setHasMore(Boolean(meta.hasMore));
      } catch (e) {
        setError(e instanceof ApiRequestError ? e.message : 'Could not load deliveries');
        if (!after) setRows([]);
      }
    },
    [status, subscriptionId],
  );

  useEffect(() => {
    setRows(null);
    fetchPage(null);
  }, [fetchPage]);

  async function retry(d: Delivery) {
    setBusy(d.id);
    try {
      await api.post(`/webhook-subscriptions/deliveries/${d.id}/retry`, {});
      toast.success('Queued — it goes out within a few seconds');
      await fetchPage(null);
      onChanged();
    } catch (e) {
      toast.error(e instanceof ApiRequestError ? e.message : 'Could not retry the delivery');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground font-display">
          Recent deliveries
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={subscriptionId || 'all'} onValueChange={(v) => setSubscriptionId(v === 'all' ? '' : v)}>
            <SelectTrigger aria-label="Filter by endpoint" className="h-8 w-56 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All endpoints</SelectItem>
              {subscriptions.map((s) => (
                <SelectItem key={s.id} value={s.id} className="font-mono text-xs">
                  {s.url}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status || 'all'} onValueChange={(v) => setStatus(v === 'all' ? '' : (v as Delivery['status']))}>
            <SelectTrigger aria-label="Filter by status" className="h-8 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="succeeded">Succeeded</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => fetchPage(null)} aria-label="Refresh deliveries">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {error && <p className="px-4 pb-3 text-sm text-destructive">{error}</p>}
        {rows === null ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No deliveries yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead className="w-28">Status</TableHead>
                  <TableHead className="w-20 text-right">Attempts</TableHead>
                  <TableHead>Last response</TableHead>
                  <TableHead>Next retry</TableHead>
                  <TableHead className="w-24 text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((d) => (
                  <TableRow key={d.id} className="cursor-pointer" onClick={() => setOpen(d)}>
                    <TableCell>
                      <p className="font-mono text-xs">{d.type}</p>
                      <p className="text-xs text-muted-foreground">{when(d.createdAt)}</p>
                    </TableCell>
                    <TableCell className="max-w-[16rem] truncate font-mono text-xs">
                      {urlOf.get(d.subscriptionId) ?? d.subscriptionId}
                    </TableCell>
                    <TableCell>
                      <DeliveryStatus status={d.status} />
                    </TableCell>
                    <TableCell className="text-right text-xs">{d.attempts}</TableCell>
                    <TableCell className="max-w-[14rem] truncate text-xs text-muted-foreground" title={d.lastError ?? undefined}>
                      {d.responseCode ? `HTTP ${d.responseCode}` : d.lastError ?? '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {d.status === 'pending' ? when(d.nextRetryAt) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {d.status !== 'pending' && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy === d.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            retry(d);
                          }}
                        >
                          {busy === d.id ? 'Retrying…' : 'Retry'}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {hasMore && (
          <div className="border-t border-border p-3 text-center">
            <Button variant="outline" size="sm" onClick={() => fetchPage(cursor)}>
              Load more
            </Button>
          </div>
        )}
      </CardContent>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-2xl">
          {open && (
            <>
              <DialogHeader>
                <DialogTitle className="font-mono text-sm">{open.type}</DialogTitle>
              </DialogHeader>
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>
                  Delivery <code className="font-mono">{open.id}</code> of event{' '}
                  <code className="font-mono">{open.eventId}</code> to{' '}
                  <span className="break-all font-mono">{urlOf.get(open.subscriptionId) ?? open.subscriptionId}</span>
                </p>
                <p className="flex items-center gap-2">
                  <DeliveryStatus status={open.status} />
                  {open.status === 'pending' && open.nextRetryAt && <span>next attempt {when(open.nextRetryAt)}</span>}
                </p>
              </div>
              <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>When</TableHead>
                      <TableHead>Result</TableHead>
                      <TableHead className="text-right">Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {open.attemptLog.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-xs text-muted-foreground">
                          Not attempted yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      open.attemptLog.map((a) => (
                        <TableRow key={a.attemptNumber}>
                          <TableCell className="text-xs">{a.attemptNumber}</TableCell>
                          <TableCell className="text-xs">{when(a.attemptedAt)}</TableCell>
                          <TableCell className="text-xs">
                            <span className={a.status === 'succeeded' ? 'text-emerald-400' : 'text-destructive'}>
                              {a.responseCode ? `HTTP ${a.responseCode}` : a.error ?? a.status}
                            </span>
                            {a.status === 'failed' && a.responseCode && a.error && (
                              <span className="text-muted-foreground"> — {a.error}</span>
                            )}
                            {a.nextRetryAt && (
                              <span className="block text-muted-foreground">retry at {when(a.nextRetryAt)}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-xs">{a.durationMs} ms</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(null)}>
                  Close
                </Button>
                {open.status !== 'pending' && (
                  <Button
                    disabled={busy === open.id}
                    onClick={async () => {
                      await retry(open);
                      setOpen(null);
                    }}
                  >
                    {busy === open.id ? 'Retrying…' : 'Retry now'}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
