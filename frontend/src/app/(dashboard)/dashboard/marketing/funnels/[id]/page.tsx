'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Megaphone, Plus, Trash2, ArrowDown, Mail, Clock, Split, LogOut, Save, Play, Pause, BarChart3 } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { BackLink } from '@/components/dashboard/back-link';
import { marketingFetch } from '@/lib/marketing-api';

type StepKind = 'send' | 'delay' | 'branch' | 'exit';

interface Step {
  id?: string;
  /// Stable across rerenders so branch dropdowns reference siblings
  /// even before the server mints real ids.
  clientKey: string;
  position: number;
  kind: StepKind;
  config: Record<string, unknown>;
  /// clientKey of the target step on the "true" branch (nextStepId).
  nextStepKey?: string | null;
  /// clientKey of the target step on the "false" branch (altStepId).
  altStepKey?: string | null;
}

interface Funnel {
  id: string;
  name: string;
  description: string | null;
  triggerKind: string;
  status: 'draft' | 'active' | 'paused' | 'archived';
  steps: Step[];
}

interface Channel { id: string; provider: string; displayName: string; status: string }

const KIND_META: Record<StepKind, { label: string; icon: React.ComponentType<{ size?: number }>; tone: string }> = {
  send: { label: 'Send', icon: Mail, tone: 'border-brand-500/40 bg-brand-500/5' },
  delay: { label: 'Wait', icon: Clock, tone: 'border-amber-500/40 bg-amber-500/5' },
  branch: { label: 'Branch on engagement', icon: Split, tone: 'border-blue-500/40 bg-blue-500/5' },
  exit: { label: 'Exit', icon: LogOut, tone: 'border-secondary' },
};

export default function FunnelDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const [f, c] = await Promise.all([
        marketingFetch(`/api/v1/account/marketing/funnels/${id}`, { credentials: 'include' }).then((r) => r.json()),
        marketingFetch('/api/v1/account/marketing/channels', { credentials: 'include' }).then((r) => r.json()),
      ]);
      setFunnel(f?.data ?? null);
      // Materialise clientKey from the server id and resolve branch
      // pointers (nextStepId / altStepId) from real ids back to keys.
      const fetched = (f?.data?.steps ?? []) as Array<Step & { id?: string; nextStepId?: string | null; altStepId?: string | null }>;
      const idToKey = new Map<string, string>();
      const withKeys = fetched.map((s) => {
        const clientKey = s.id ?? cryptoRandomKey();
        if (s.id) idToKey.set(s.id, clientKey);
        return { ...s, clientKey };
      });
      const resolved = withKeys.map((s) => ({
        ...s,
        nextStepKey: s.nextStepId ? idToKey.get(s.nextStepId) ?? null : null,
        altStepKey: s.altStepId ? idToKey.get(s.altStepId) ?? null : null,
      }));
      setSteps(resolved);
      setChannels((c?.data ?? []).filter((x: Channel) => x.status === 'active'));
    } catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  function addStep(kind: StepKind) {
    const nextPos = (steps[steps.length - 1]?.position ?? 0) + 1;
    let config: Record<string, unknown> = {};
    if (kind === 'delay') config = { seconds: 86400 };
    if (kind === 'send') config = { providers: [], content: { email: { subject: '', html: '' } } };
    if (kind === 'branch') config = { event: 'opened', windowSeconds: 86400 };
    setSteps([...steps, { clientKey: cryptoRandomKey(), position: nextPos, kind, config, nextStepKey: null, altStepKey: null }]);
  }
  function removeStep(idx: number) {
    setSteps(steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, position: i + 1 })));
  }
  function updateStep(idx: number, patch: Partial<Step>) {
    setSteps(steps.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }
  function updateConfig(idx: number, patch: Record<string, unknown>) {
    const next = { ...steps[idx]!, config: { ...(steps[idx]!.config ?? {}), ...patch } };
    updateStep(idx, next);
  }

  async function saveSteps() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const r = await marketingFetch(`/api/v1/account/marketing/funnels/${id}/steps`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          steps: steps.map((s, i) => ({
            clientKey: s.clientKey,
            position: i + 1,
            kind: s.kind,
            config: s.config,
            nextStepKey: s.nextStepKey ?? null,
            altStepKey: s.altStepKey ?? null,
          })),
        }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b?.error?.message ?? 'save failed');
      setNotice(`${b.data.count} step(s) saved.`);
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  async function setStatus(status: 'active' | 'paused' | 'draft') {
    try {
      const r = await marketingFetch(`/api/v1/account/marketing/funnels/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b?.error?.message ?? 'failed');
      await load();
    } catch (e) { setError((e as Error).message); }
  }

  if (!funnel) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="mx-auto max-w-6xl">
      <BackLink href="/dashboard/marketing/funnels" label="All funnels" />
      <PageHeader
        icon={Megaphone}
        title={funnel.name}
        description={funnel.description ?? `Trigger: ${funnel.triggerKind.replace(/_/g, ' ')}. Edit the step sequence below.`}
        action={
          <div className="flex items-center gap-2">
            <Link href={`/dashboard/marketing/funnels/${id}/analytics`} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"><BarChart3 size={14} /> Analytics</Link>
            {funnel.status === 'active' ? (
              <button onClick={() => setStatus('paused')} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"><Pause size={14} /> Pause</button>
            ) : (
              <button onClick={() => setStatus('active')} className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"><Play size={14} /> Activate</button>
            )}
            <button onClick={saveSteps} disabled={saving} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-brand-600 disabled:opacity-60">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save size={14} />} Save steps
            </button>
          </div>
        }
      />

      {error && <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm">{error}</div>}
      {notice && <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm">{notice}</div>}

      <div className="space-y-3">
        {steps.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No steps yet. Add a step to start building the sequence.
          </div>
        )}
        {steps.map((s, i) => {
          const Icon = KIND_META[s.kind].icon;
          return (
            <div key={i}>
              <div className={`rounded-xl border ${KIND_META[s.kind].tone} bg-card p-5`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground"><Icon size={16} /></span>
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">step {i + 1}</p>
                      <p className="font-semibold">{KIND_META[s.kind].label}</p>
                    </div>
                  </div>
                  <button onClick={() => removeStep(i)} aria-label="Remove step" className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="mt-4">
                  <StepConfig
                    step={s}
                    channels={channels}
                    siblings={steps.filter((_, j) => j !== i)}
                    onChange={(patch) => updateConfig(i, patch)}
                    onBranchChange={(branch, key) => updateStep(i, branch === 'true' ? { nextStepKey: key } : { altStepKey: key })}
                  />
                </div>
              </div>
              {i < steps.length - 1 && (
                <div className="my-1 flex justify-center text-muted-foreground"><ArrowDown size={16} /></div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border bg-card p-4">
        <span className="text-xs text-muted-foreground">Add a step:</span>
        <button onClick={() => addStep('send')} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-secondary"><Plus size={12} /> Send</button>
        <button onClick={() => addStep('delay')} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-secondary"><Plus size={12} /> Wait</button>
        <button onClick={() => addStep('branch')} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-secondary"><Plus size={12} /> Branch</button>
        <button onClick={() => addStep('exit')} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-secondary"><Plus size={12} /> Exit</button>
      </div>
    </div>
  );
}

function StepConfig({ step, channels, siblings, onChange, onBranchChange }: {
  step: Step;
  channels: Channel[];
  siblings: Step[];
  onChange: (patch: Record<string, unknown>) => void;
  onBranchChange: (branch: 'true' | 'false', key: string | null) => void;
}) {
  if (step.kind === 'delay') {
    const seconds = Number(step.config.seconds ?? 0);
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return (
      <div className="grid gap-3 sm:grid-cols-3">
        <NumberField label="Days" value={days} onChange={(v) => onChange({ seconds: v * 86400 + hours * 3600 + minutes * 60 })} />
        <NumberField label="Hours" value={hours} onChange={(v) => onChange({ seconds: days * 86400 + v * 3600 + minutes * 60 })} />
        <NumberField label="Minutes" value={minutes} onChange={(v) => onChange({ seconds: days * 86400 + hours * 3600 + v * 60 })} />
      </div>
    );
  }
  if (step.kind === 'send') {
    const providers = (step.config.providers as string[]) ?? [];
    const content = (step.config.content as Record<string, Record<string, unknown>>) ?? {};
    const email = (content.email ?? {}) as { subject?: string; html?: string };
    return (
      <div className="space-y-4">
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Channels</p>
          {channels.length === 0 ? (
            <p className="text-xs text-muted-foreground">No active channels — connect one in /dashboard/marketing/channels.</p>
          ) : (
            <div className="space-y-1.5">
              {channels.map((c) => {
                const checked = providers.includes(c.provider);
                return (
                  <label key={c.id} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${checked ? 'border-brand-500 bg-brand-500/5' : 'border-border'}`}>
                    <input type="checkbox" checked={checked} onChange={() => onChange({ providers: checked ? providers.filter((p) => p !== c.provider) : [...providers, c.provider] })} />
                    <span className="flex-1">{c.displayName}</span>
                    <span className="text-xs text-muted-foreground">{c.provider}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
        {providers.some((p) => p.startsWith('email_')) && (
          <div className="space-y-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Email subject</span>
              <input type="text" value={email.subject ?? ''} onChange={(e) => onChange({ content: { ...content, email: { ...email, subject: e.target.value } } })} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">HTML body</span>
              <textarea rows={5} value={email.html ?? ''} onChange={(e) => onChange({ content: { ...content, email: { ...email, html: e.target.value } } })} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono" />
            </label>
          </div>
        )}
        {providers.some((p) => !p.startsWith('email_')) && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Body for SMS / WA / Telegram / etc.</span>
            <textarea rows={3} value={String((content.whatsapp as { text?: string } | undefined)?.text ?? '')} onChange={(e) => {
              const txt = e.target.value;
              const next = { ...content };
              for (const key of ['whatsapp', 'telegram', 'sms', 'discord', 'slack']) (next as Record<string, Record<string, unknown>>)[key] = { text: txt };
              onChange({ content: next });
            }} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </label>
        )}
      </div>
    );
  }
  if (step.kind === 'branch') {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Trigger event</span>
          <select value={String(step.config.event ?? 'opened')} onChange={(e) => onChange({ event: e.target.value })} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
            <option value="opened">Recipient opened previous send</option>
            <option value="clicked">Recipient clicked link</option>
          </select>
        </label>
        <NumberField label="Look-back window (hours)" value={Math.floor(Number(step.config.windowSeconds ?? 86400) / 3600)} onChange={(v) => onChange({ windowSeconds: v * 3600 })} />
        <BranchTargetSelect label="If TRUE → jump to" value={step.nextStepKey ?? null} siblings={siblings} onChange={(k) => onBranchChange('true', k)} />
        <BranchTargetSelect label="If FALSE → jump to" value={step.altStepKey ?? null} siblings={siblings} onChange={(k) => onBranchChange('false', k)} />
        <p className="sm:col-span-2 text-xs text-muted-foreground">Leave a branch unset to fall through to the next sequential step.</p>
      </div>
    );
  }
  return <p className="text-sm text-muted-foreground">Funnel exit — contacts hitting this step are marked completed.</p>;
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <input type="number" min={0} value={value} onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm tabular-nums" />
    </label>
  );
}

function BranchTargetSelect({ label, value, siblings, onChange }: { label: string; value: string | null; siblings: Step[]; onChange: (key: string | null) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
      >
        <option value="">Fall through to next step</option>
        {siblings.map((s) => (
          <option key={s.clientKey} value={s.clientKey}>
            Step {s.position}: {labelForKind(s.kind)}{stepHint(s)}
          </option>
        ))}
      </select>
    </label>
  );
}

function labelForKind(k: StepKind): string {
  switch (k) {
    case 'send': return 'Send';
    case 'delay': return 'Wait';
    case 'branch': return 'Branch';
    case 'exit': return 'Exit';
  }
}

function stepHint(s: Step): string {
  if (s.kind === 'send') {
    const subj = String(((s.config.content as Record<string, Record<string, unknown>> | undefined)?.email as { subject?: string } | undefined)?.subject ?? '');
    if (subj) return ` — "${subj.slice(0, 24)}${subj.length > 24 ? '…' : ''}"`;
  }
  if (s.kind === 'delay') {
    const sec = Number(s.config.seconds ?? 0);
    if (sec >= 86400) return ` — ${Math.floor(sec / 86400)}d`;
    if (sec >= 3600) return ` — ${Math.floor(sec / 3600)}h`;
    if (sec >= 60) return ` — ${Math.floor(sec / 60)}m`;
  }
  return '';
}

function cryptoRandomKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `k_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}
