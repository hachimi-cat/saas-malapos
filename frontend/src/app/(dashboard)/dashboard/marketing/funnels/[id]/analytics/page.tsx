'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { BarChart3, Loader2, Users, CheckCircle2, LogOut, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { BackLink } from '@/components/dashboard/back-link';
import { marketingFetch } from '@/lib/marketing-api';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';

interface StepRow {
  stepId: string;
  position: number;
  kind: 'send' | 'delay' | 'branch' | 'exit';
  touched: number;
  currentlyHere: number;
  sent: number;
  opened: number;
  clicked: number;
  openRate: number;
  clickRate: number;
}

interface Analytics {
  windowDays: number;
  totals: { total: number; active: number; completed: number; exited: number; errored: number };
  medianCompletionSeconds: number;
  steps: StepRow[];
}

const WINDOWS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
];

export default function FunnelAnalyticsPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [data, setData] = useState<Analytics | null>(null);
  const [funnelName, setFunnelName] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [windowDays, setWindowDays] = useState(30);

  async function load() {
    try {
      const [a, f] = await Promise.all([
        marketingFetch(`/api/v1/account/marketing/funnels/${id}/analytics?since=${windowDays}`, { credentials: 'include' }).then((r) => r.json()),
        marketingFetch(`/api/v1/account/marketing/funnels/${id}`, { credentials: 'include' }).then((r) => r.json()),
      ]);
      setData(a?.data ?? null);
      setFunnelName(f?.data?.name ?? 'Funnel');
    } catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id, windowDays]);

  if (!data) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const peakTouched = Math.max(1, ...data.steps.map((s) => s.touched));

  return (
    <div className="mx-auto max-w-6xl">
      <BackLink href={`/dashboard/marketing/funnels/${id}`} label="Back to funnel" />
      <PageHeader
        icon={BarChart3}
        title={`${funnelName} — analytics`}
        description={`Per-step performance over the last ${data.windowDays} days. Drop-off is the gap between sequential touched columns.`}
        action={
          <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
            {WINDOWS.map((w) => (
              <Button
                key={w.days}
                size="sm"
                variant={windowDays === w.days ? 'default' : 'ghost'}
                onClick={() => setWindowDays(w.days)}
                className="h-7 px-2.5 text-xs"
              >
                {w.label}
              </Button>
            ))}
          </div>
        }
      />

      {error && <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive px-4 py-2 text-sm">{error}</div>}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Tile icon={Users} label="Enrolled" value={data.totals.total} tone="bg-blue-500/10 text-blue-500" />
        <Tile icon={Loader2} label="Active" value={data.totals.active} tone="bg-amber-500/10 text-amber-500" />
        <Tile icon={CheckCircle2} label="Completed" value={data.totals.completed} tone="bg-emerald-500/10 text-emerald-500" />
        <Tile icon={LogOut} label="Exited" value={data.totals.exited} tone="bg-secondary text-foreground" />
        <Tile icon={AlertTriangle} label="Errored" value={data.totals.errored} tone="bg-rose-500/10 text-rose-500" />
      </div>

      {data.medianCompletionSeconds > 0 && (
        <Card className="mb-6 px-4 py-3 text-sm text-muted-foreground">
          Median time-to-completion: <span className="font-medium text-foreground">{formatDuration(data.medianCompletionSeconds)}</span>
        </Card>
      )}

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border px-4 py-3">
          <CardTitle className="text-sm">Step-by-step funnel</CardTitle>
        </CardHeader>
        {data.steps.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">No steps configured.</div>
        ) : (
          <ol className="divide-y divide-border">
            {data.steps.map((s, idx) => {
              const prev = idx > 0 ? data.steps[idx - 1]! : null;
              const dropOff = prev && prev.touched > 0 ? Math.max(0, prev.touched - s.touched) : 0;
              const dropPct = prev && prev.touched > 0 ? dropOff / prev.touched : 0;
              const fillPct = (s.touched / peakTouched) * 100;
              return (
                <li key={s.stepId} className="px-4 py-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium">
                      <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-xs font-semibold">{s.position}</span>
                      {labelForKind(s.kind)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {s.touched.toLocaleString()} touched · {s.currentlyHere.toLocaleString()} parked
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full bg-primary" style={{ width: `${fillPct}%` }} />
                  </div>
                  {s.kind === 'send' && s.sent > 0 && (
                    <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
                      <Stat label="Sent" value={s.sent} />
                      <Stat label="Open rate" value={`${(s.openRate * 100).toFixed(1)}%`} sub={`${s.opened} opened`} />
                      <Stat label="Click rate" value={`${(s.clickRate * 100).toFixed(1)}%`} sub={`${s.clicked} clicked`} />
                    </div>
                  )}
                  {idx > 0 && dropOff > 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      ↘ {dropOff.toLocaleString()} dropped off from previous step ({(dropPct * 100).toFixed(0)}%)
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </Card>
    </div>
  );
}

function Tile({ icon: Icon, label, value, tone }: { icon: React.ComponentType<{ size?: number }>; label: string; value: number; tone: string }) {
  return (
    <Card className="p-3">
      <div className={`mb-2 inline-flex h-7 w-7 items-center justify-center rounded-md ${tone}`}>
        <Icon size={14} />
      </div>
      <div className="text-2xl font-semibold tabular-nums">{value.toLocaleString()}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </Card>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-md border border-border bg-background px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function labelForKind(k: StepRow['kind']): string {
  switch (k) {
    case 'send': return 'Send message';
    case 'delay': return 'Wait';
    case 'branch': return 'Branch on engagement';
    case 'exit': return 'Exit';
  }
}

function formatDuration(seconds: number): string {
  if (seconds >= 86400) return `${(seconds / 86400).toFixed(1)}d`;
  if (seconds >= 3600) return `${(seconds / 3600).toFixed(1)}h`;
  if (seconds >= 60) return `${(seconds / 60).toFixed(1)}m`;
  return `${seconds}s`;
}
