'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Megaphone, Plus, Trash2, ArrowDown, Mail, Clock, Split, LogOut, Save, Play, Pause, BarChart3 } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { BackLink } from '@/components/dashboard/back-link';
import { marketingFetch } from '@/lib/marketing-api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
  send: { label: 'Send', icon: Mail, tone: 'border-primary/40 bg-primary/5' },
  delay: { label: 'Wait', icon: Clock, tone: 'border-amber-500/40 bg-amber-500/5' },
  branch: { label: 'Branch on engagement', icon: Split, tone: 'border-sky-500/40 bg-sky-500/5' },
  exit: { label: 'Exit', icon: LogOut, tone: 'border-secondary' },
};

// Radix Select forbids empty-string values; this sentinel stands in for the
// "fall through to next step" (null) branch target.
const FALL_THROUGH = '__fall_through__';

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
            <Button asChild variant="outline">
              <Link href={`/dashboard/marketing/funnels/${id}/analytics`}><BarChart3 className="h-4 w-4" /> Analytics</Link>
            </Button>
            {funnel.status === 'active' ? (
              <Button variant="outline" onClick={() => setStatus('paused')}><Pause className="h-4 w-4" /> Pause</Button>
            ) : (
              <Button onClick={() => setStatus('active')} className="bg-emerald-600 text-white hover:bg-emerald-700"><Play className="h-4 w-4" /> Activate</Button>
            )}
            <Button onClick={saveSteps} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-4 w-4" />} Save steps
            </Button>
          </div>
        }
      />

      {error && <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive px-4 py-2 text-sm">{error}</div>}
      {notice && <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm">{notice}</div>}

      <div className="space-y-3">
        {steps.length === 0 && (
          <Card className="border-dashed p-8 text-center text-sm text-muted-foreground">
            No steps yet. Add a step to start building the sequence.
          </Card>
        )}
        {steps.map((s, i) => {
          const Icon = KIND_META[s.kind].icon;
          return (
            <div key={i}>
              <Card className={cn(KIND_META[s.kind].tone, 'p-5')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground"><Icon size={16} /></span>
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">step {i + 1}</p>
                      <p className="font-semibold">{KIND_META[s.kind].label}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeStep(i)} aria-label="Remove step" className="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
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
              </Card>
              {i < steps.length - 1 && (
                <div className="my-1 flex justify-center text-muted-foreground"><ArrowDown size={16} /></div>
              )}
            </div>
          );
        })}
      </div>

      <Card className="mt-6 flex flex-wrap items-center gap-2 border-dashed p-4">
        <span className="text-xs text-muted-foreground">Add a step:</span>
        <Button variant="outline" size="sm" onClick={() => addStep('send')}><Plus className="h-3.5 w-3.5" /> Send</Button>
        <Button variant="outline" size="sm" onClick={() => addStep('delay')}><Plus className="h-3.5 w-3.5" /> Wait</Button>
        <Button variant="outline" size="sm" onClick={() => addStep('branch')}><Plus className="h-3.5 w-3.5" /> Branch</Button>
        <Button variant="outline" size="sm" onClick={() => addStep('exit')}><Plus className="h-3.5 w-3.5" /> Exit</Button>
      </Card>
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
                  <label key={c.id} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${checked ? 'border-primary bg-primary/5' : 'border-border'}`}>
                    <Checkbox checked={checked} onCheckedChange={() => onChange({ providers: checked ? providers.filter((p) => p !== c.provider) : [...providers, c.provider] })} />
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
            <div className="space-y-1.5">
              <Label htmlFor="email-subject">Email subject</Label>
              <Input id="email-subject" type="text" value={email.subject ?? ''} onChange={(e) => onChange({ content: { ...content, email: { ...email, subject: e.target.value } } })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email-html">HTML body</Label>
              <Textarea id="email-html" rows={5} value={email.html ?? ''} onChange={(e) => onChange({ content: { ...content, email: { ...email, html: e.target.value } } })} className="font-mono" />
            </div>
          </div>
        )}
        {providers.some((p) => !p.startsWith('email_')) && (
          <div className="space-y-1.5">
            <Label htmlFor="text-body">Body for SMS / WA / Telegram / etc.</Label>
            <Textarea id="text-body" rows={3} value={String((content.whatsapp as { text?: string } | undefined)?.text ?? '')} onChange={(e) => {
              const txt = e.target.value;
              const next = { ...content };
              for (const key of ['whatsapp', 'telegram', 'sms', 'discord', 'slack']) (next as Record<string, Record<string, unknown>>)[key] = { text: txt };
              onChange({ content: next });
            }} />
          </div>
        )}
      </div>
    );
  }
  if (step.kind === 'branch') {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="branch-event">Trigger event</Label>
          <Select value={String(step.config.event ?? 'opened')} onValueChange={(v) => onChange({ event: v })}>
            <SelectTrigger id="branch-event">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="opened">Recipient opened previous send</SelectItem>
              <SelectItem value="clicked">Recipient clicked link</SelectItem>
            </SelectContent>
          </Select>
        </div>
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
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type="number" min={0} value={value} onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))} className="tabular-nums" />
    </div>
  );
}

function BranchTargetSelect({ label, value, siblings, onChange }: { label: string; value: string | null; siblings: Step[]; onChange: (key: string | null) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select
        value={value ?? FALL_THROUGH}
        onValueChange={(v) => onChange(v === FALL_THROUGH ? null : v)}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={FALL_THROUGH}>Fall through to next step</SelectItem>
          {siblings.map((s) => (
            <SelectItem key={s.clientKey} value={s.clientKey}>
              Step {s.position}: {labelForKind(s.kind)}{stepHint(s)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
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
