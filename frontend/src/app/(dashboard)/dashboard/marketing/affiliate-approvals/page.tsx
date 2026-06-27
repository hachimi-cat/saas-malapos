'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Ban, Check, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { marketingFetch } from '@/lib/marketing-api';
import { DataTable, type Column, type FilterDef } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ProgramRef { id: string; name: string }

interface PendingEnrollment {
  id: string;
  programId: string;
  affiliatorId: string;
  status: string;
  joinedAt: string;
  affiliator: { handle: string; displayName: string; primaryChannel: string; audienceSize: number; country: string | null } | null;
  program: ProgramRef | null;
}

interface Commission {
  id: string;
  programId: string;
  affiliatorId: string;
  status: 'pending' | 'approved' | 'paid' | 'voided';
  sourceType: string;
  grossAmountIdr: number;
  commissionAmountIdr: number;
  netToAffiliatorIdr: number;
  createdAt: string;
  affiliator: { handle: string; displayName: string } | null;
  program: ProgramRef | null;
}

type Tab = 'enrollments' | 'commissions';

export default function AffiliateApprovalsPage() {
  const [enrollments, setEnrollments] = useState<PendingEnrollment[] | null>(null);
  const [commissions, setCommissions] = useState<Commission[] | null>(null);
  const [tab, setTab] = useState<Tab>('enrollments');
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [actionDialog, setActionDialog] = useState<
    | { kind: 'reject-enrollment'; programId: string; eid: string }
    | { kind: 'void-commission'; programId: string; cid: string }
    | null
  >(null);
  const [reasonText, setReasonText] = useState('');

  async function load() {
    setError(null);
    try {
      // Pending enrollments: list every program, fetch enrollments, filter
      // pending. We don't have a cross-program enrollments endpoint, so we
      // fan out client-side. Programs list is small (≤ ~hundreds).
      const programsRes = await marketingFetch('/api/v1/account/marketing/programs', { credentials: 'include' });
      const programsBody = await programsRes.json();
      const programs: ProgramRef[] = programsBody?.data?.programs ?? [];
      const all: PendingEnrollment[] = [];
      await Promise.all(programs.map(async (p) => {
        const r = await marketingFetch(`/api/v1/account/marketing/programs/${p.id}/enrollments`, { credentials: 'include' });
        if (!r.ok) return;
        const b = await r.json();
        const rows: PendingEnrollment[] = b?.data?.enrollments ?? [];
        for (const row of rows) {
          if (row.status === 'pending') {
            all.push({ ...row, program: { id: p.id, name: p.name } });
          }
        }
      }));
      setEnrollments(all);

      const cRes = await marketingFetch('/api/v1/account/marketing/programs/commissions?status=pending,approved', { credentials: 'include' });
      const cBody = await cRes.json();
      setCommissions((cBody?.data?.commissions ?? []) as Commission[]);
    } catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { load(); }, []);

  async function actEnrollment(programId: string, eid: string, action: 'approve' | 'reject', reason?: string) {
    setWorking(eid);
    setError(null);
    try {
      const r = await marketingFetch(`/api/v1/account/marketing/programs/${programId}/enrollments/${eid}/${action}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include',
        body: reason ? JSON.stringify({ reason }) : '{}',
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b?.error?.message ?? 'action failed');
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setWorking(null); }
  }

  async function actCommission(programId: string, cid: string, action: 'approve' | 'void', reason?: string) {
    setWorking(cid);
    setError(null);
    try {
      const r = await marketingFetch(`/api/v1/account/marketing/programs/${programId}/commissions/${cid}/${action}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include',
        body: reason ? JSON.stringify({ reason }) : '{}',
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b?.error?.message ?? 'action failed');
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setWorking(null); }
  }

  const enrollmentCount = enrollments?.length ?? 0;
  const pendingCommissionCount = commissions?.filter((c) => c.status === 'pending').length ?? 0;

  return (
    <div>
      <PageHeader
        title="Affiliate approvals"
        description="Pending affiliator enrollments and commissions across every program. Approve or void before the next monthly payout batch."
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="mb-5">
          <TabsTrigger value="enrollments">
            Pending enrollments
            {enrollmentCount > 0 && (
              <Badge variant="outline" className="rounded-full border-transparent bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium leading-none text-amber-400">{enrollmentCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="commissions">
            Pending commissions
            {pendingCommissionCount > 0 && (
              <Badge variant="outline" className="rounded-full border-transparent bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium leading-none text-amber-400">{pendingCommissionCount}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

      {error && <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive px-4 py-2 text-sm">{error}</div>}

      <TabsContent value="enrollments">{
        enrollments === null ? (
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : enrollments.length === 0 ? (
          <Card className="p-12 text-center text-sm text-muted-foreground">
            No affiliators awaiting approval. New enrollments only land here when a program has <span className="font-mono">autoApprove=false</span>.
          </Card>
        ) : (
          <div className="space-y-3">
            {enrollments.map((e) => (
              <Card key={e.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{e.affiliator?.displayName ?? e.affiliatorId}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">@{e.affiliator?.handle ?? '?'} · {e.affiliator?.country ?? '—'} · {e.affiliator?.primaryChannel ?? '—'} · audience {e.affiliator?.audienceSize.toLocaleString() ?? '—'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">For program: <Link className="text-primary hover:underline" href={`/dashboard/marketing/programs/${e.programId}`}>{e.program?.name ?? e.programId}</Link></p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" onClick={() => actEnrollment(e.programId, e.id, 'approve')} disabled={working === e.id} className="hover:bg-primary/90">
                      <Check size={12} /> Approve
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => { setReasonText(''); setActionDialog({ kind: 'reject-enrollment', programId: e.programId, eid: e.id }); }} disabled={working === e.id} className="hover:bg-destructive/10 hover:text-destructive">
                      Reject
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )
      }</TabsContent>

      <TabsContent value="commissions">{
        commissions === null ? (
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : commissions.length === 0 ? (
          <Card className="p-12 text-center text-sm text-muted-foreground">
            No commissions awaiting review. Approved commissions are batched into the next monthly payout.
          </Card>
        ) : (
          <DataTable
            rows={commissions}
            columns={[
              {
                key: 'affiliator',
                header: 'Affiliator',
                sortable: true,
                sortValue: (c) => c.affiliator?.displayName ?? c.affiliatorId,
                searchValue: (c) => `${c.affiliator?.displayName ?? ''} ${c.affiliator?.handle ?? ''} ${c.program?.name ?? ''}`,
                cell: (c) => (
                  <div>
                    <div className="font-medium">{c.affiliator?.displayName ?? c.affiliatorId}</div>
                    <div className="text-xs text-muted-foreground">@{c.affiliator?.handle ?? '?'}</div>
                  </div>
                ),
              },
              {
                key: 'program',
                header: 'Program',
                sortable: true,
                sortValue: (c) => c.program?.name ?? c.programId,
                cell: (c) => (
                  <Link href={`/dashboard/marketing/programs/${c.programId}`} className="text-primary hover:underline">
                    {c.program?.name ?? c.programId}
                  </Link>
                ),
              },
              {
                key: 'gross',
                header: 'Gross',
                align: 'right',
                sortable: true,
                sortValue: (c) => c.grossAmountIdr,
                cell: (c) => <span className="font-mono">Rp {c.grossAmountIdr.toLocaleString()}</span>,
              },
              {
                key: 'net',
                header: 'Net',
                align: 'right',
                sortable: true,
                sortValue: (c) => c.netToAffiliatorIdr,
                cell: (c) => <span className="font-mono">Rp {c.netToAffiliatorIdr.toLocaleString()}</span>,
              },
              {
                key: 'status',
                header: 'Status',
                sortable: true,
                sortValue: (c) => c.status,
                cell: (c) => <span className="capitalize">{c.status}</span>,
              },
              {
                key: 'actions',
                header: '',
                align: 'right',
                cell: (c) => (
                  <div className="flex justify-end gap-1">
                    {c.status === 'pending' && (
                      <Button variant="ghost" size="icon" onClick={() => actCommission(c.programId, c.id, 'approve')} disabled={working === c.id} className="h-7 w-7 text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-500" title="Approve">
                        <Check size={14} />
                      </Button>
                    )}
                    {(c.status === 'pending' || c.status === 'approved') && (
                      <Button variant="ghost" size="icon" onClick={() => { setReasonText(''); setActionDialog({ kind: 'void-commission', programId: c.programId, cid: c.id }); }} disabled={working === c.id} className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive" title="Void">
                        <Ban size={14} />
                      </Button>
                    )}
                  </div>
                ),
              },
            ] as Column<Commission>[]}
            filters={[
              {
                key: 'status',
                label: 'Status',
                accessor: (c) => c.status,
                options: [
                  { value: 'pending', label: 'Pending' },
                  { value: 'approved', label: 'Approved' },
                ],
              },
            ] as FilterDef<Commission>[]}
            rowKey={(c) => c.id}
            searchPlaceholder="Search affiliator, program…"
            defaultSort={{ key: 'gross', dir: 'desc' }}
            empty="No commissions match."
          />
        )
      }</TabsContent>
      </Tabs>

      <Dialog open={!!actionDialog} onOpenChange={(o) => !o && setActionDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{actionDialog?.kind === 'reject-enrollment' ? 'Reject enrollment' : 'Void commission'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="reason" className="text-xs text-muted-foreground">
              {actionDialog?.kind === 'reject-enrollment' ? 'Reason (shown to affiliator)' : 'Reason (audit log)'}
            </Label>
            <Textarea
              id="reason"
              autoFocus
              rows={3}
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              placeholder={actionDialog?.kind === 'reject-enrollment' ? 'Shown to the affiliator. Optional.' : 'Recorded in the audit log. Optional.'}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (actionDialog?.kind === 'reject-enrollment') actEnrollment(actionDialog.programId, actionDialog.eid, 'reject', reasonText);
                else if (actionDialog?.kind === 'void-commission') actCommission(actionDialog.programId, actionDialog.cid, 'void', reasonText);
                setActionDialog(null);
              }}
            >
              {actionDialog?.kind === 'reject-enrollment' ? 'Reject' : 'Void'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
