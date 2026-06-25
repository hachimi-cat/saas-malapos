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
    <div>
      <BackLink href="/dashboard/marketing/programs" label="All programs" />
      <PageHeader
        icon={Handshake}
        title={program.name}
        description={`${program.commissionModel.replace(/_/g, ' ')} · ${(program.commissionRate * 100).toFixed(1)}% · ${program.cookieDays}d cookie · ${program.autoApprove ? 'auto-approve' : 'manual review'}`}
      />

      {error && <ErrorBox>{error}</ErrorBox>}

      <div className="mb-5 flex items-center gap-1 border-b border-border">
        <TabButton active={tab === 'brief'} onClick={() => setTab('brief')} icon={FileText} label="Brief" />
        <TabButton active={tab === 'affiliators'} onClick={() => setTab('affiliators')} icon={Users} label="Affiliators" count={enrollments?.length} pendingCount={pendingEnrollments} />
        <TabButton active={tab === 'commissions'} onClick={() => setTab('commissions')} icon={Coins} label="Commissions" count={commissions?.length} pendingCount={pendingCommissions} />
      </div>

      {tab === 'brief' && (
        <div className="space-y-4">
          <section className="rounded-xl border border-border bg-card p-6">
            {program.description ? (
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{program.description}</p>
            ) : (
              <p className="text-sm italic text-muted-foreground">No brief written yet.</p>
            )}
          </section>
          <section className="rounded-xl border border-border bg-card p-6">
            <h3 className="mb-3 text-sm font-semibold">Campaign linkage</h3>
            <CampaignSelect
              value={program.marketingCampaignId ?? null}
              onChange={updateCampaignLinkage}
              disabled={working === 'campaign'}
            />
          </section>
        </div>
      )}

      {tab === 'affiliators' && (
        enrollments === null ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : enrollments.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No enrollments yet. Affiliators can join from{' '}
            <Link href="/affiliators" target="_blank" className="text-brand-500 hover:underline">/affiliators</Link>.
          </div>
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">Affiliator</th>
                    <th className="px-4 py-3 text-left">Channel</th>
                    <th className="px-4 py-3 text-right">Audience</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Code</th>
                    <th className="px-4 py-3 text-right">Clicks · Conv · GMV</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {enrollments.map((e) => (
                    <tr key={e.id} className="border-t border-border">
                      <td className="px-4 py-3">
                        <div className="font-medium">{e.affiliator?.displayName ?? e.affiliatorId}</div>
                        <div className="text-xs text-muted-foreground">@{e.affiliator?.handle ?? '?'}</div>
                      </td>
                      <td className="px-4 py-3 capitalize">{e.affiliator?.primaryChannel ?? '—'}</td>
                      <td className="px-4 py-3 text-right font-mono">{e.affiliator?.audienceSize.toLocaleString() ?? '—'}</td>
                      <td className="px-4 py-3 capitalize">{e.status}</td>
                      <td className="px-4 py-3 font-mono text-xs">{e.link?.code ?? '—'}</td>
                      <td className="px-4 py-3 text-right text-xs">
                        {e.link ? `${e.link.clickCount} · ${e.link.conversionCount} · Rp ${e.link.totalGmvIdr.toLocaleString()}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {e.status === 'pending' && (
                          <div className="flex justify-end gap-1">
                            <button onClick={() => actEnrollment(e.id, 'approve')} disabled={working === e.id} className="rounded p-1 text-emerald-500 hover:bg-emerald-500/10" title="Approve">
                              <Check size={14} />
                            </button>
                            <button onClick={() => actEnrollment(e.id, 'reject')} disabled={working === e.id} className="rounded p-1 text-destructive hover:bg-destructive/10" title="Reject">
                              <X size={14} />
                            </button>
                          </div>
                        )}
                        {e.status === 'active' && (
                          <button onClick={() => actEnrollment(e.id, 'revoke')} disabled={working === e.id} className="rounded p-1 text-destructive hover:bg-destructive/10" title="Revoke">
                            <Power size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="space-y-3 md:hidden">
              {enrollments.map((e) => (
                <li key={e.id} className="rounded-xl border border-border bg-card p-4">
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
                        <button onClick={() => actEnrollment(e.id, 'approve')} disabled={working === e.id} className="rounded p-1 text-emerald-500 hover:bg-emerald-500/10" title="Approve">
                          <Check size={14} />
                        </button>
                        <button onClick={() => actEnrollment(e.id, 'reject')} disabled={working === e.id} className="rounded p-1 text-destructive hover:bg-destructive/10" title="Reject">
                          <X size={14} />
                        </button>
                      </>
                    )}
                    {e.status === 'active' && (
                      <button onClick={() => actEnrollment(e.id, 'revoke')} disabled={working === e.id} className="rounded p-1 text-destructive hover:bg-destructive/10" title="Revoke">
                        <Power size={14} />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )
      )}

      {tab === 'commissions' && (
        commissions === null ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : commissions.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No commissions accrued yet. They appear here as affiliators drive sales.
          </div>
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">Affiliator</th>
                    <th className="px-4 py-3 text-left">Source</th>
                    <th className="px-4 py-3 text-right">Gross</th>
                    <th className="px-4 py-3 text-right">Commission</th>
                    <th className="px-4 py-3 text-right">Net to affiliator</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {commissions.map((c) => (
                    <tr key={c.id} className="border-t border-border">
                      <td className="px-4 py-3">
                        <div className="font-medium">{c.affiliator?.displayName ?? c.affiliatorId}</div>
                        <div className="text-xs text-muted-foreground">@{c.affiliator?.handle ?? '?'}</div>
                      </td>
                      <td className="px-4 py-3 capitalize text-xs text-muted-foreground">{c.sourceType.replace(/_/g, ' ')}</td>
                      <td className="px-4 py-3 text-right font-mono">Rp {c.grossAmountIdr.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-mono">Rp {c.commissionAmountIdr.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-mono">Rp {c.netToAffiliatorIdr.toLocaleString()}</td>
                      <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${COMMISSION_TONE[c.status] ?? 'bg-secondary text-muted-foreground'}`}>{c.status}</span></td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          {c.status === 'pending' && (
                            <button onClick={() => actCommission(c.id, 'approve')} disabled={working === c.id} className="rounded p-1 text-emerald-500 hover:bg-emerald-500/10" title="Approve">
                              <Check size={14} />
                            </button>
                          )}
                          {(c.status === 'pending' || c.status === 'approved') && (
                            <button onClick={() => actCommission(c.id, 'void')} disabled={working === c.id} className="rounded p-1 text-destructive hover:bg-destructive/10" title="Void">
                              <Ban size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="space-y-3 md:hidden">
              {commissions.map((c) => (
                <li key={c.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium">{c.affiliator?.displayName ?? c.affiliatorId}</div>
                      <div className="text-xs text-muted-foreground">@{c.affiliator?.handle ?? '?'}</div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${COMMISSION_TONE[c.status] ?? 'bg-secondary text-muted-foreground'}`}>{c.status}</span>
                  </div>
                  <dl className="mt-2 space-y-1 text-xs">
                    <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Source</dt><dd className="capitalize">{c.sourceType.replace(/_/g, ' ')}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Gross</dt><dd className="font-mono">Rp {c.grossAmountIdr.toLocaleString()}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Commission</dt><dd className="font-mono">Rp {c.commissionAmountIdr.toLocaleString()}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Net to affiliator</dt><dd className="font-mono">Rp {c.netToAffiliatorIdr.toLocaleString()}</dd></div>
                  </dl>
                  <div className="mt-2 flex justify-end gap-1">
                    {c.status === 'pending' && (
                      <button onClick={() => actCommission(c.id, 'approve')} disabled={working === c.id} className="rounded p-1 text-emerald-500 hover:bg-emerald-500/10" title="Approve">
                        <Check size={14} />
                      </button>
                    )}
                    {(c.status === 'pending' || c.status === 'approved') && (
                      <button onClick={() => actCommission(c.id, 'void')} disabled={working === c.id} className="rounded p-1 text-destructive hover:bg-destructive/10" title="Void">
                        <Ban size={14} />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label, count, pendingCount }: { active: boolean; onClick: () => void; icon: React.ComponentType<{ size?: number }>; label: string; count?: number; pendingCount?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition ${active ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
    >
      <Icon size={14} />
      {label}
      {typeof count === 'number' && count > 0 && (
        <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium leading-none">{count}</span>
      )}
      {typeof pendingCount === 'number' && pendingCount > 0 && (
        <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-amber-500" title={`${pendingCount} need attention`} />
      )}
    </button>
  );
}
