'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Megaphone, Loader2, Plus } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { marketingFetch } from '@/lib/marketing-api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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

  return (
    <div>
      <PageHeader
        icon={Megaphone}
        title="Funnels"
        description="Trigger-driven multi-step automations. Welcome series, abandoned-cart recovery, win-back, post-purchase nurture."
        action={<Button onClick={() => setShowNew(true)}><Plus className="h-4 w-4" /> New funnel</Button>}
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
              <li key={f.id}>
                <Link href={`/dashboard/marketing/funnels/${f.id}`} className="flex items-center gap-3 border-b border-border px-5 py-3.5 last:border-b-0 hover:bg-secondary/50">
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
              </li>
            ))}
          </ul>
        </Card>
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
