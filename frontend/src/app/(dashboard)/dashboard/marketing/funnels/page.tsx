'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Megaphone, Loader2, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { BulkBar } from '@/components/dashboard/bulk-bar';
import { marketingFetch } from '@/lib/marketing-api';
import { cn } from '@/lib/utils';
import {
  PageAssistant,
  AgenticEntry,
  BulkEditSlot,
} from '@/components/catentio/agentic-entry';
import { useCatentioStatus } from '@/hooks/use-catentio';
import { deleteMany } from '@/lib/bulk';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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

interface Funnel {
  id: string;
  name: string;
  description: string | null;
  triggerKind: string;
  status: 'draft' | 'active' | 'paused' | 'archived';
  enrollmentsActive: number;
  enrollmentsCompleted: number;
  createdAt: string;
  _count?: { steps: number; enrollments: number };
}

const TRIGGER_LABELS: Record<string, string> = {
  list_added: 'Contact added to a list',
  tag_added: 'Contact tagged',
  signup_form: 'Form signup',
  abandoned_cart: 'Abandoned cart',
  manual_add: 'Manual enrollment',
  webhook_event: 'Inbound webhook',
};

export default function FunnelsPage() {
  const [rows, setRows] = useState<Funnel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  // Card-list selection (this list had none): a checkbox per card, the
  // bulk bar below while the selection is non-empty.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkEditing, setBulkEditing] = useState(false);
  // Row-delete in-flight guard.
  const [working, setWorking] = useState<string | null>(null);
  const { enabled: assistantEnabled } = useCatentioStatus();

  async function load() {
    try {
      const r = await marketingFetch('/api/v1/account/marketing/funnels', { credentials: 'include' });
      const b = await r.json();
      setRows(b?.data ?? []);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => { load(); }, []);

  // Counted against the CURRENT rows, so a funnel that was deleted (or
  // vanished on reload) drops out of the selection on its own.
  const bulkTargets = useMemo(
    () => (rows ?? []).filter((f) => selected.has(f.id)),
    [rows, selected],
  );

  function toggleRow(id: string, checked: boolean) {
    setSelected((s) => {
      const next = new Set(s);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  // deleteMany's deleteOne: marketingFetch does not throw on a non-2xx,
  // so surface the proxy's envelope message as the thrown Error.
  async function deleteFunnel(id: string) {
    const r = await marketingFetch(`/api/v1/account/marketing/funnels/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!r.ok) {
      let message = `delete failed (${r.status})`;
      try {
        const b = await r.json();
        message = b?.error?.message ?? message;
      } catch {
        /* non-JSON error body */
      }
      throw new Error(message);
    }
  }

  // Row delete — the AlertDialog is the confirm; reload either way so
  // the list is honest, surfacing the server's refusal on the page.
  async function onRowDelete(f: Funnel) {
    setWorking(f.id);
    setError(null);
    try {
      await deleteFunnel(f.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(null);
      await load();
    }
  }

  // Bulk-delete executor — the bar's confirm AND the page assistant's
  // picker both call this; each owns its own confirm dialog.
  async function onBulkDelete() {
    try {
      await deleteMany(
        bulkTargets.map((f) => ({ id: f.id, label: f.name })),
        deleteFunnel,
      );
    } finally {
      // Reload either way so the list is honest; a partial
      // run's thrown message stays on the bar.
      await load();
    }
  }

  return (
    <div>
      <PageHeader
        title="Funnels"
        description="Trigger-driven multi-step automations. Welcome series, abandoned-cart recovery, win-back, post-purchase nurture."
        action={
          <div className="flex items-center gap-2">
            <PageAssistant
              resource="funnels"
              noun="funnel"
              selection={bulkTargets as unknown as Record<string, unknown>[]}
              onDeleteSelected={onBulkDelete}
              onApplied={load}
            />
            <AgenticEntry
              resource="funnels"
              mode="create"
              onApplied={load}
              fallback={<Button onClick={() => setShowNew(true)}><Plus className="h-4 w-4" /> New funnel</Button>}
            >
              <span className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90">
                <Plus className="h-4 w-4" /> New funnel
              </span>
            </AgenticEntry>
          </div>
        }
      />

      {error && <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive px-4 py-2 text-sm">{error}</div>}

      {rows === null ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">No funnels yet.</Card>
      ) : (
        <Card className="overflow-hidden">
          <ul>
            {rows.map((f) => (
              <li key={f.id} className="flex items-center border-b border-border last:border-b-0">
                <span className="flex shrink-0 items-center pl-5">
                  <Checkbox
                    checked={selected.has(f.id)}
                    onCheckedChange={(v) => toggleRow(f.id, v === true)}
                    aria-label={`Select ${f.name}`}
                  />
                </span>
                <Link href={`/dashboard/marketing/funnels/${f.id}`} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3.5 hover:bg-secondary/50">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground"><Megaphone size={16} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{f.name}</p>
                    <p className="text-xs text-muted-foreground">{TRIGGER_LABELS[f.triggerKind] ?? f.triggerKind} · {f._count?.steps ?? 0} step(s)</p>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">{f.enrollmentsActive} active · {f.enrollmentsCompleted} done</span>
                  <Badge variant="outline" className={cn('rounded-full border-transparent px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider',
                    f.status === 'active' ? 'bg-emerald-500/10 text-emerald-600' :
                    f.status === 'paused' ? 'bg-amber-500/10 text-amber-600' :
                    f.status === 'archived' ? 'bg-secondary text-muted-foreground' :
                    'bg-sky-500/10 text-sky-400'
                  )}>{f.status}</Badge>
                </Link>
                <span className="flex shrink-0 items-center pr-3">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={working === f.id}
                        title="Delete funnel"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete &ldquo;{f.name}&rdquo;?</AlertDialogTitle>
                        <AlertDialogDescription>
                          The funnel, its steps and its enrollments are removed. This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Keep funnel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => onRowDelete(f)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete funnel
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {bulkTargets.length > 0 && (
        <BulkBar
          count={bulkTargets.length}
          noun="funnel"
          onEdit={assistantEnabled ? () => setBulkEditing(true) : undefined}
          onDelete={onBulkDelete}
          onClear={() => setSelected(new Set())}
        />
      )}

      {bulkEditing && (
        <BulkEditSlot
          resource="funnels"
          targets={bulkTargets as unknown as Record<string, unknown>[]}
          onClose={() => setBulkEditing(false)}
          onApplied={async () => {
            setBulkEditing(false);
            setSelected(new Set());
            await load();
          }}
        />
      )}

      {showNew && <NewFunnelModal onClose={() => setShowNew(false)} onCreated={async (id) => { setShowNew(false); window.location.href = `/dashboard/marketing/funnels/${id}`; }} />}
    </div>
  );
}

function NewFunnelModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [trigger, setTrigger] = useState('list_added');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setWorking(true);
    setError(null);
    try {
      const r = await marketingFetch('/api/v1/account/marketing/funnels', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, description: description || null, triggerKind: trigger, triggerConfig: {}, status: 'draft' }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b?.error?.message ?? 'create failed');
      onCreated(b.data.id);
    } catch (e) { setError((e as Error).message); }
    finally { setWorking(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New funnel</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="funnel-name">Name</Label>
            <Input id="funnel-name" type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. New subscriber welcome series" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="funnel-desc">Description</Label>
            <Textarea id="funnel-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="funnel-trigger">Trigger</Label>
            <Select value={trigger} onValueChange={setTrigger}>
              <SelectTrigger id="funnel-trigger">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TRIGGER_LABELS).map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={working}>{working ? 'Creating…' : 'Create'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
