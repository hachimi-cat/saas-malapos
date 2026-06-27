'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Check, X, Power, Handshake, FileText, Users, Coins, Ban } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { BackLink } from '@/components/dashboard/back-link';
import { ErrorBox } from '@/components/dashboard/ui';
import { marketingFetch } from '@/lib/marketing-api';
import { CampaignSelect } from '@/components/marketing/campaign-select';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Program {
  id: string;
  name: string;
  description: string | null;
  status: string;
  commissionModel: string;
  commissionRate: number;
  cookieDays: number;
  autoApprove: boolean;
  marketingCampaignId?: string | null;
}

interface Enrollment {
  id: string;
  affiliatorId: string;
  status: 'pending' | 'active' | 'rejected' | 'revoked';
  joinedAt: string;
  affiliator: { handle: string; displayName: string; primaryChannel: string; audienceSize: number; country: string | null } | null;
  link: { code: string; clickCount: number; conversionCount: number; totalGmvIdr: number } | null;
}

interface Commission {
  id: string;
  affiliatorId: string;
  status: 'pending' | 'approved' | 'paid' | 'voided';
  sourceType: string;
  grossAmountIdr: number;
  commissionAmountIdr: number;
  netToAffiliatorIdr: number;
  createdAt: string;
  affiliator: { handle: string; displayName: string } | null;
}

type Tab = 'brief' | 'affiliators' | 'commissions';

const COMMISSION_TONE: Record<string, string> = {
  pending: 'bg-amber-500/10 text-amber-600',
  approved: 'bg-blue-500/10 text-blue-600',
  paid: 'bg-emerald-500/10 text-emerald-600',
  voided: 'bg-secondary text-muted-foreground',
};

export default function ProgramDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [program, setProgram] = useState<Program | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[] | null>(null);
  const [commissions, setCommissions] = useState<Commission[] | null>(null);
  const [tab, setTab] = useState<Tab>('brief');
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);

  async function load() {
    try {
      const [p, e, c] = await Promise.all([
        marketingFetch(`/api/v1/account/marketing/programs/${id}`, { credentials: 'include' }).then((r) => r.json()),
        marketingFetch(`/api/v1/account/marketing/programs/${id}/enrollments`, { credentials: 'include' }).then((r) => r.json()),
        marketingFetch(`/api/v1/account/marketing/programs/${id}/commissions`, { credentials: 'include' }).then((r) => r.json()),
      ]);
      setProgram(p?.data ?? null);
      setEnrollments(e?.data ?? []);
      setCommissions(c?.data?.commissions ?? []);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  async function actEnrollment(eid: string, action: 'approve' | 'reject' | 'revoke') {
    let reason: string | null = null;
    if (action === 'reject' || action === 'revoke') {
      reason = window.prompt('Reason (shown to affiliator)') ?? '';
      if (!reason) return;
    }
    setWorking(eid);
    setError(null);
    try {
      const r = await marketingFetch(`/api/v1/account/marketing/programs/${id}/enrollments/${eid}/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: reason ? JSON.stringify({ reason }) : '{}',
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b?.error?.message ?? 'action failed');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(null);
    }
  }

  async function updateCampaignLinkage(id: string | null) {
    if (!program) return;
    setWorking('campaign');
    setError(null);
    try {
      const r = await marketingFetch(`/api/v1/account/marketing/programs/${program.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ marketingCampaignId: id }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b?.error?.message ?? 'save failed');
      setProgram({ ...program, marketingCampaignId: id });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(null);
    }
  }

  async function actCommission(cid: string, action: 'approve' | 'void') {
    let reason: string | null = null;
    if (action === 'void') {
      reason = window.prompt('Reason (audit log)') ?? '';
      if (!reason) return;
    }
    setWorking(cid);
    setError(null);
    try {
      const r = await marketingFetch(`/api/v1/account/marketing/programs/${id}/commissions/${cid}/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: reason ? JSON.stringify({ reason }) : '{}',
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b?.error?.message ?? 'action failed');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(null);
    }
  }

  const pendingEnrollments = useMemo(() => enrollments?.filter((e) => e.status === 'pending').length ?? 0, [enrollments]);
  const pendingCommissions = useMemo(() => commissions?.filter((c) => c.status === 'pending').length ?? 0, [commissions]);

  if (!program) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="mx-auto max-w-6xl">
      <BackLink href="/dashboard/marketing/programs" label="All programs" />
      <PageHeader
        icon={Handshake}
        title={program.name}
        description={`${program.commissionModel.replace(/_/g, ' ')} · ${(program.commissionRate * 100).toFixed(1)}% · ${program.cookieDays}d cookie · ${program.autoApprove ? 'auto-approve' : 'manual review'}`}
      />

      {error && <ErrorBox>{error}</ErrorBox>}

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="mb-5">
          <TabsTrigger value="brief"><FileText size={14} /> Brief</TabsTrigger>
          <TabsTrigger value="affiliators" className="relative">
            <Users size={14} /> Affiliators
            {typeof enrollments?.length === 'number' && enrollments.length > 0 && (
              <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium leading-none">{enrollments.length}</span>
            )}
            {pendingEnrollments > 0 && (
              <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-amber-500" />
            )}
          </TabsTrigger>
          <TabsTrigger value="commissions" className="relative">
            <Coins size={14} /> Commissions
            {typeof commissions?.length === 'number' && commissions.length > 0 && (
              <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium leading-none">{commissions.length}</span>
            )}
            {pendingCommissions > 0 && (
              <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-amber-500" />
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="brief">
        <div className="space-y-4">
          <Card className="p-6">
            {program.description ? (
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{program.description}</p>
            ) : (
              <p className="text-sm italic text-muted-foreground">No brief written yet.</p>
            )}
          </Card>
          <Card className="p-6">
            <h3 className="mb-3 text-sm font-semibold font-display">Campaign linkage</h3>
            <CampaignSelect
              value={program.marketingCampaignId ?? null}
              onChange={updateCampaignLinkage}
              disabled={working === 'campaign'}
            />
          </Card>
        </div>
        </TabsContent>

        <TabsContent value="affiliators">{
        enrollments === null ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : enrollments.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            No enrollments yet. Affiliators can join from{' '}
            <Link href="https://ripllo.com/affiliators" target="_blank" className="text-brand-500 hover:underline">ripllo.com/affiliators</Link>.
          </Card>
        ) : (
          <>
            <Card className="hidden overflow-hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Affiliator</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead className="text-right">Audience</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead className="text-right">Clicks · Conv · GMV</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {enrollments.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>
                        <div className="font-medium">{e.affiliator?.displayName ?? e.affiliatorId}</div>
                        <div className="text-xs text-muted-foreground">@{e.affiliator?.handle ?? '?'}</div>
                      </TableCell>
                      <TableCell className="capitalize">{e.affiliator?.primaryChannel ?? '—'}</TableCell>
                      <TableCell className="text-right font-mono">{e.affiliator?.audienceSize.toLocaleString() ?? '—'}</TableCell>
                      <TableCell className="capitalize">{e.status}</TableCell>
                      <TableCell className="font-mono text-xs">{e.link?.code ?? '—'}</TableCell>
                      <TableCell className="text-right text-xs">
                        {e.link ? `${e.link.clickCount} · ${e.link.conversionCount} · Rp ${e.link.totalGmvIdr.toLocaleString()}` : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {e.status === 'pending' && (
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => actEnrollment(e.id, 'approve')} disabled={working === e.id} className="h-7 w-7 text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-500" title="Approve">
                              <Check size={14} />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => actEnrollment(e.id, 'reject')} disabled={working === e.id} className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive" title="Reject">
                              <X size={14} />
                            </Button>
                          </div>
                        )}
                        {e.status === 'active' && (
                          <Button variant="ghost" size="icon" onClick={() => actEnrollment(e.id, 'revoke')} disabled={working === e.id} className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive" title="Revoke">
                            <Power size={14} />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
            <div className="space-y-3 md:hidden">
              {enrollments.map((e) => (
                <Card key={e.id} className="p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium">{e.affiliator?.displayName ?? e.affiliatorId}</div>
                      <div className="text-xs text-muted-foreground">@{e.affiliator?.handle ?? '?'}</div>
                    </div>
                    <span className="text-xs capitalize text-muted-foreground">{e.status}</span>
                  </div>
                  <dl className="mt-2 space-y-1 text-xs">
                    <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Channel</dt><dd className="capitalize">{e.affiliator?.primaryChannel ?? '—'}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Audience</dt><dd className="font-mono">{e.affiliator?.audienceSize.toLocaleString() ?? '—'}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Code</dt><dd className="font-mono">{e.link?.code ?? '—'}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Clicks · Conv · GMV</dt><dd>{e.link ? `${e.link.clickCount} · ${e.link.conversionCount} · Rp ${e.link.totalGmvIdr.toLocaleString()}` : '—'}</dd></div>
                  </dl>
                  <div className="mt-2 flex justify-end gap-1">
                    {e.status === 'pending' && (
                      <>
                        <Button variant="ghost" size="icon" onClick={() => actEnrollment(e.id, 'approve')} disabled={working === e.id} className="h-7 w-7 text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-500" title="Approve">
                          <Check size={14} />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => actEnrollment(e.id, 'reject')} disabled={working === e.id} className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive" title="Reject">
                          <X size={14} />
                        </Button>
                      </>
                    )}
                    {e.status === 'active' && (
                      <Button variant="ghost" size="icon" onClick={() => actEnrollment(e.id, 'revoke')} disabled={working === e.id} className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive" title="Revoke">
                        <Power size={14} />
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </>
        )
      }</TabsContent>

        <TabsContent value="commissions">{
        commissions === null ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : commissions.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            No commissions accrued yet. They appear here as affiliators drive sales.
          </Card>
        ) : (
          <>
            <Card className="hidden overflow-hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Affiliator</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Commission</TableHead>
                    <TableHead className="text-right">Net to affiliator</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {commissions.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="font-medium">{c.affiliator?.displayName ?? c.affiliatorId}</div>
                        <div className="text-xs text-muted-foreground">@{c.affiliator?.handle ?? '?'}</div>
                      </TableCell>
                      <TableCell className="capitalize text-xs text-muted-foreground">{c.sourceType.replace(/_/g, ' ')}</TableCell>
                      <TableCell className="text-right font-mono">Rp {c.grossAmountIdr.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono">Rp {c.commissionAmountIdr.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono">Rp {c.netToAffiliatorIdr.toLocaleString()}</TableCell>
                      <TableCell><Badge variant="outline" className={cn('rounded-full border-transparent capitalize', COMMISSION_TONE[c.status] ?? 'bg-secondary text-muted-foreground')}>{c.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {c.status === 'pending' && (
                            <Button variant="ghost" size="icon" onClick={() => actCommission(c.id, 'approve')} disabled={working === c.id} className="h-7 w-7 text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-500" title="Approve">
                              <Check size={14} />
                            </Button>
                          )}
                          {(c.status === 'pending' || c.status === 'approved') && (
                            <Button variant="ghost" size="icon" onClick={() => actCommission(c.id, 'void')} disabled={working === c.id} className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive" title="Void">
                              <Ban size={14} />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
            <div className="space-y-3 md:hidden">
              {commissions.map((c) => (
                <Card key={c.id} className="p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium">{c.affiliator?.displayName ?? c.affiliatorId}</div>
                      <div className="text-xs text-muted-foreground">@{c.affiliator?.handle ?? '?'}</div>
                    </div>
                    <Badge variant="outline" className={cn('rounded-full border-transparent capitalize', COMMISSION_TONE[c.status] ?? 'bg-secondary text-muted-foreground')}>{c.status}</Badge>
                  </div>
                  <dl className="mt-2 space-y-1 text-xs">
                    <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Source</dt><dd className="capitalize">{c.sourceType.replace(/_/g, ' ')}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Gross</dt><dd className="font-mono">Rp {c.grossAmountIdr.toLocaleString()}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Commission</dt><dd className="font-mono">Rp {c.commissionAmountIdr.toLocaleString()}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Net to affiliator</dt><dd className="font-mono">Rp {c.netToAffiliatorIdr.toLocaleString()}</dd></div>
                  </dl>
                  <div className="mt-2 flex justify-end gap-1">
                    {c.status === 'pending' && (
                      <Button variant="ghost" size="icon" onClick={() => actCommission(c.id, 'approve')} disabled={working === c.id} className="h-7 w-7 text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-500" title="Approve">
                        <Check size={14} />
                      </Button>
                    )}
                    {(c.status === 'pending' || c.status === 'approved') && (
                      <Button variant="ghost" size="icon" onClick={() => actCommission(c.id, 'void')} disabled={working === c.id} className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive" title="Void">
                        <Ban size={14} />
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </>
        )
      }</TabsContent>
      </Tabs>
    </div>
  );
}
