'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Ban, Check, Loader2, X } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { marketingFetch } from '@/lib/marketing-api';
import { DataTable, type Column, type FilterDef } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

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

/**
 * Batch executor over the per-row endpoints — same contract as
 * lib/bulk.ts's deleteMany: keep going past failures (stopping cannot
 * undo what already went through) and report a partial run as an error
 * naming what did NOT make it, in the server's own words.
 */
async function actMany(
  pastVerb: string,
  targets: { id: string; label: string }[],
  actOne: (id: string) => Promise<unknown>,
): Promise<void> {
  let done = 0;
  const failed: string[] = [];
  for (const t of targets) {
    try {
      await actOne(t.id);
      done++;
    } catch (e) {
      failed.push(`${t.label} (${(e as Error).message || 'unknown error'})`);
    }
  }
  if (failed.length > 0) {
    throw new Error(`${pastVerb} ${done} of ${targets.length}. These did not: ${failed.join('; ')}`);
  }
}

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

  // Throwing primitives over the per-row endpoints — the row buttons and
  // the batch loops share them.
  async function postEnrollment(programId: string, eid: string, action: 'approve' | 'reject', reason?: string) {
    const r = await marketingFetch(`/api/v1/account/marketing/programs/${programId}/enrollments/${eid}/${action}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include',
      body: reason ? JSON.stringify({ reason }) : '{}',
    });
    const b = await r.json();
    if (!r.ok) throw new Error(b?.error?.message ?? 'action failed');
  }

  async function postCommission(programId: string, cid: string, action: 'approve' | 'void', reason?: string) {
    const r = await marketingFetch(`/api/v1/account/marketing/programs/${programId}/commissions/${cid}/${action}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include',
      body: reason ? JSON.stringify({ reason }) : '{}',
    });
    const b = await r.json();
    if (!r.ok) throw new Error(b?.error?.message ?? 'action failed');
  }

  async function actEnrollment(programId: string, eid: string, action: 'approve' | 'reject', reason?: string) {
    setWorking(eid);
    setError(null);
    try {
      await postEnrollment(programId, eid, action, reason);
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setWorking(null); }
  }

  async function actCommission(programId: string, cid: string, action: 'approve' | 'void', reason?: string) {
    setWorking(cid);
    setError(null);
    try {
      await postCommission(programId, cid, action, reason);
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setWorking(null); }
  }

  // ── Batch over the queue ──
  // Enrollments are a card list (no DataTable), so the selection is
  // page-owned; commissions use the DataTable's own renderBulkBar.
  const [selEnroll, setSelEnroll] = useState<Set<string>>(new Set());
  const enrollTargets = useMemo(
    () => (enrollments ?? []).filter((e) => selEnroll.has(e.id)),
    [enrollments, selEnroll],
  );

  function toggleEnroll(id: string, checked: boolean) {
    setSelEnroll((s) => {
      const next = new Set(s);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function batchApproveEnrollments() {
    try {
      await actMany(
        'Approved',
        enrollTargets.map((e) => ({ id: e.id, label: e.affiliator?.displayName ?? e.affiliatorId })),
        (id) => {
          const row = enrollTargets.find((e) => e.id === id)!;
          return postEnrollment(row.programId, row.id, 'approve');
        },
      );
    } finally {
      // Reload either way so the queue is honest; a partial run's thrown
      // message stays on the bar.
      await load();
    }
  }

  async function batchCommissions(rows: Commission[], action: 'approve' | 'void') {
    try {
      await actMany(
        action === 'approve' ? 'Approved' : 'Voided',
        rows.map((c) => ({
          id: c.id,
          label: `${c.affiliator?.displayName ?? c.affiliatorId} — Rp ${c.commissionAmountIdr.toLocaleString()}`,
        })),
        (id) => {
          const row = rows.find((c) => c.id === id)!;
          return postCommission(row.programId, row.id, action);
        },
      );
    } finally {
      await load();
    }
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
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={selEnroll.has(e.id)}
                      onCheckedChange={(v) => toggleEnroll(e.id, v === true)}
                      aria-label={`Select ${e.affiliator?.displayName ?? e.affiliatorId}`}
                      className="mt-1 shrink-0"
                    />
                    <div>
                    <p className="font-semibold">{e.affiliator?.displayName ?? e.affiliatorId}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">@{e.affiliator?.handle ?? '?'} · {e.affiliator?.country ?? '—'} · {e.affiliator?.primaryChannel ?? '—'} · audience {e.affiliator?.audienceSize.toLocaleString() ?? '—'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">For program: <Link className="text-primary hover:underline" href={`/dashboard/marketing/programs/${e.programId}`}>{e.program?.name ?? e.programId}</Link></p>
                    </div>
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
            {enrollTargets.length > 0 && (
              <BatchActionBar
                count={enrollTargets.length}
                noun="enrollment"
                onClear={() => setSelEnroll(new Set())}
                actions={[
                  {
                    key: 'approve',
                    label: 'Approve',
                    icon: <Check className="h-3.5 w-3.5" />,
                    confirmTitle: `Approve ${enrollTargets.length} enrollment${enrollTargets.length === 1 ? '' : 's'}?`,
                    confirmBody:
                      'Each affiliator joins their program and can start earning commissions. Failures are skipped and named.',
                    cta: `Approve ${enrollTargets.length}`,
                    run: batchApproveEnrollments,
                  },
                ]}
              />
            )}
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
            renderBulkBar={(selectedRows, clear) => {
              const pending = selectedRows.filter((c) => c.status === 'pending');
              return (
                <BatchActionBar
                  count={selectedRows.length}
                  noun="commission"
                  onClear={clear}
                  actions={[
                    ...(pending.length > 0
                      ? [{
                          key: 'approve',
                          label: pending.length === selectedRows.length ? 'Approve' : `Approve ${pending.length} pending`,
                          icon: <Check className="h-3.5 w-3.5" />,
                          confirmTitle: `Approve ${pending.length} commission${pending.length === 1 ? '' : 's'}?`,
                          confirmBody:
                            'Approved commissions are batched into the next monthly payout. Already-approved rows in the selection are left alone; failures are skipped and named.',
                          cta: `Approve ${pending.length}`,
                          run: async () => {
                            await batchCommissions(pending, 'approve');
                            clear();
                          },
                        }]
                      : []),
                    {
                      key: 'void',
                      label: 'Void',
                      icon: <Ban className="h-3.5 w-3.5" />,
                      destructive: true,
                      confirmTitle: `Void ${selectedRows.length} commission${selectedRows.length === 1 ? '' : 's'}?`,
                      confirmBody:
                        'Voided commissions never pay out. This cannot be undone; failures are skipped and named.',
                      cta: `Void ${selectedRows.length}`,
                      run: async () => {
                        await batchCommissions(selectedRows, 'void');
                        clear();
                      },
                    },
                  ]}
                />
              );
            }}
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

type BatchAction = {
  key: string;
  label: string;
  icon: React.ReactNode;
  destructive?: boolean;
  confirmTitle: string;
  confirmBody: string;
  cta: string;
  run: () => Promise<void>;
};

/**
 * The approvals variant of the shared BulkBar: `N selected · Approve ·
 * Void · clear`. Same sticky-bottom shape and the same partial-failure
 * contract — each action confirms first (naming the count), and a
 * partial run's thrown sentence stays on the bar.
 */
function BatchActionBar({
  count,
  noun,
  actions,
  onClear,
}: {
  count: number;
  noun: string;
  actions: BatchAction[];
  onClear: () => void;
}) {
  const [confirming, setConfirming] = useState<BatchAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (count === 0) return null;
  const plural = count === 1 ? noun : `${noun}s`;

  const run = async (action: BatchAction) => {
    setConfirming(null);
    setBusy(true);
    setError(null);
    try {
      await action.run();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sticky bottom-4 z-30 mt-3 flex justify-center">
      <div className="flex max-w-full flex-col gap-1 rounded-xl border border-border bg-card px-4 py-2 shadow-lg">
        <div className="flex items-center gap-3 text-sm">
          <span className="font-medium">
            {count} {plural} selected
          </span>
          {actions.map((a) => (
            <button
              key={a.key}
              type="button"
              disabled={busy}
              onClick={() => {
                setError(null);
                setConfirming(a);
              }}
              className={
                a.destructive
                  ? 'inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-background px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50'
                  : 'inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-50'
              }
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : a.icon} {a.label}
            </button>
          ))}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setError(null);
              onClear();
            }}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        </div>
        {error && (
          <p className="max-w-md text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
      {confirming && (
        <AlertDialog open onOpenChange={(o) => { if (!o) setConfirming(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirming.confirmTitle}</AlertDialogTitle>
              <AlertDialogDescription>{confirming.confirmBody}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => run(confirming)}
                className={confirming.destructive ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : undefined}
              >
                {confirming.cta}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
