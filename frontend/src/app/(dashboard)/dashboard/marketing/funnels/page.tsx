'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Megaphone, Loader2, Plus } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { marketingFetch } from '@/lib/marketing-api';

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
    <div className="mx-auto max-w-6xl">
      <PageHeader
        icon={Megaphone}
        title="Funnels"
        description="Trigger-driven multi-step automations. Welcome series, abandoned-cart recovery, win-back, post-purchase nurture."
        action={<button onClick={() => setShowNew(true)} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-brand-600"><Plus size={14} /> New funnel</button>}
      />

      {error && <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm">{error}</div>}

      {rows === null ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center text-sm text-muted-foreground">No funnels yet.</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
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
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                    f.status === 'active' ? 'bg-emerald-500/10 text-emerald-600' :
                    f.status === 'paused' ? 'bg-amber-500/10 text-amber-600' :
                    f.status === 'archived' ? 'bg-secondary text-muted-foreground' :
                    'bg-blue-500/10 text-blue-600'
                  }`}>{f.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <form onSubmit={submit} className="w-full max-w-lg rounded-xl bg-card p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold">New funnel</h2>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Name</span>
          <input type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. New subscriber welcome series" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Description</span>
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Trigger</span>
          <select value={trigger} onChange={(e) => setTrigger(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
            {Object.entries(TRIGGER_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-md border border-border py-2 text-sm">Cancel</button>
          <button type="submit" disabled={working} className="flex-1 rounded-md bg-primary py-2 text-sm font-semibold text-primary-foreground hover:bg-brand-600 disabled:opacity-60">{working ? 'Creating…' : 'Create'}</button>
        </div>
      </form>
    </div>
  );
}
