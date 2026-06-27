'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Check, X, UserPlus, FileText, Mail, Users, Handshake } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { BackLink } from '@/components/dashboard/back-link';
import { ErrorBox } from '@/components/dashboard/ui';
import { CreatorPicker } from '@/components/marketplace/creator-picker';
import { marketingFetch } from '@/lib/marketing-api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface Campaign {
  id: string;
  name: string;
  brief: string;
  budgetIdr: number;
  status: string;
  discoveryMode: string;
  pricingModel: string;
  platformFeeRate: number;
}

interface Application {
  id: string;
  pitchText: string;
  proposedRate: number | null;
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
  appliedAt: string;
  reviewerNotes: string | null;
  creator: { handle: string; displayName: string; niches: string[]; country: string | null; rateCard: Record<string, number> } | null;
}

interface Invitation {
  id: string;
  creatorId: string;
  status: string;
  message: string | null;
  sentAt: string;
  respondedAt: string | null;
}

interface Collaboration {
  id: string;
  creatorId: string;
  status: string;
  agreedTotalIdr: number;
  platformFeeRate: number;
  netToCreatorIdr: number;
  createdAt: string;
  _count?: { deliverables: number };
}

type Tab = 'brief' | 'invitations' | 'applications' | 'collaborations';

const COLLAB_STATUS_TONE: Record<string, string> = {
  pending_funding: 'bg-amber-500/10 text-amber-600',
  active: 'bg-emerald-500/10 text-emerald-600',
  delivered: 'bg-sky-500/10 text-sky-400',
  approved: 'bg-emerald-500/15 text-emerald-700',
  paid: 'bg-emerald-500/20 text-emerald-700',
  disputed: 'bg-destructive/10 text-destructive',
  canceled: 'bg-secondary text-muted-foreground',
};

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [apps, setApps] = useState<Application[] | null>(null);
  const [invites, setInvites] = useState<Invitation[] | null>(null);
  const [collabs, setCollabs] = useState<Collaboration[] | null>(null);
  const [tab, setTab] = useState<Tab>('brief');
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [invitePick, setInvitePick] = useState<{ id: string; handle: string; displayName: string; bio: string | null; avatarKey: string | null; niches: string[]; country: string | null } | null>(null);
  const [inviteMsg, setInviteMsg] = useState('');
  const [actionDialog, setActionDialog] = useState<
    | { kind: 'reject'; aid: string }
    | { kind: 'accept'; aid: string }
    | null
  >(null);
  const [rejectNotes, setRejectNotes] = useState('');
  const [totalText, setTotalText] = useState('');

  async function load() {
    try {
      const [c, a, i, k] = await Promise.all([
        marketingFetch(`/api/v1/account/marketing/campaigns/${id}`, { credentials: 'include' }).then((r) => r.json()),
        marketingFetch(`/api/v1/account/marketing/campaigns/${id}/applications`, { credentials: 'include' }).then((r) => r.json()),
        marketingFetch(`/api/v1/account/marketing/campaigns/${id}/invitations`, { credentials: 'include' }).then((r) => r.ok ? r.json() : { data: [] }),
        marketingFetch(`/api/v1/account/marketing/collaborations?campaignId=${id}`, { credentials: 'include' }).then((r) => r.json()),
      ]);
      setCampaign(c?.data ?? null);
      setApps(a?.data ?? []);
      setInvites(i?.data ?? []);
      setCollabs(k?.data?.collaborations ?? []);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  async function rejectApplication(aid: string, notes: string) {
    setWorking(aid);
    setError(null);
    try {
      const r = await marketingFetch(`/api/v1/account/marketing/campaigns/${id}/applications/${aid}/reject`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ notes }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b?.error?.message ?? 'review failed');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(null);
    }
  }

  async function acceptApplication(aid: string, total: number) {
    setWorking(aid);
    setError(null);
    try {
      // Mint the collaboration via /collaborations/from-application/:appId,
      // pulling the merchant email from the session.
      const sess = await fetch('/api/v1/session', { credentials: 'include' }).then((r) => r.ok ? r.json() : null);
      const merchantEmail: string | undefined = sess?.user?.email;
      if (!merchantEmail) { setError('Could not resolve merchant email'); return; }

      const r = await marketingFetch(`/api/v1/account/marketing/collaborations/from-application/${aid}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ agreedTotalIdr: total, merchantEmail }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b?.error?.message ?? 'collab create failed');
      // Open the hosted invoice if returned.
      const url = b?.data?.funding?.hostedInvoiceUrl;
      if (url) window.open(url, '_blank');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(null);
    }
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!invitePick) {
      setError('Pick a creator first');
      return;
    }
    setWorking('invite');
    setError(null);
    try {
      const r = await marketingFetch(`/api/v1/account/marketing/campaigns/${id}/invitations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ creatorId: invitePick.id, message: inviteMsg }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b?.error?.message ?? 'invite failed');
      setShowInvite(false);
      setInvitePick(null);
      setInviteMsg('');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(null);
    }
  }

  if (!campaign) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="mx-auto max-w-6xl">
      <BackLink href="/dashboard/marketing/creator-briefs" label="All creator briefs" />
      <PageHeader
        title={campaign.name}
        description={`${campaign.status} · ${campaign.discoveryMode.replace('_', ' ')} · ${campaign.pricingModel} · Rp ${campaign.budgetIdr.toLocaleString()} · ${(campaign.platformFeeRate * 100).toFixed(1)}% Ripllo fee`}
        action={<Button onClick={() => setShowInvite(true)}><UserPlus className="h-4 w-4" /> Invite creator</Button>}
      />

      {error && <ErrorBox>{error}</ErrorBox>}

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="mb-5">
          <TabsTrigger value="brief"><FileText size={14} /> Brief</TabsTrigger>
          <TabsTrigger value="invitations" className="relative">
            <Mail size={14} /> Invitations
            {typeof invites?.length === 'number' && invites.length > 0 && (
              <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium leading-none">{invites.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="applications" className="relative">
            <Users size={14} /> Applications
            {typeof apps?.length === 'number' && apps.length > 0 && (
              <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium leading-none">{apps.length}</span>
            )}
            {(apps?.filter((a) => a.status === 'pending').length ?? 0) > 0 && (
              <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-amber-500" />
            )}
          </TabsTrigger>
          <TabsTrigger value="collaborations" className="relative">
            <Handshake size={14} /> Collaborations
            {typeof collabs?.length === 'number' && collabs.length > 0 && (
              <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium leading-none">{collabs.length}</span>
            )}
            {(collabs?.filter((c) => c.status === 'delivered').length ?? 0) > 0 && (
              <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-amber-500" />
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="brief">
          <Card className="p-6">
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{campaign.brief}</p>
          </Card>
        </TabsContent>

        <TabsContent value="invitations">{
        invites === null ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : invites.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            No invitations sent yet.
          </Card>
        ) : (
          <div className="space-y-3">
            {invites.map((inv) => (
              <Card key={inv.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm">{inv.creatorId.replace('crt_', '')}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Sent {new Date(inv.sentAt).toLocaleDateString()}</p>
                  </div>
                  <Badge variant="secondary" className="rounded-full font-medium capitalize">{inv.status}</Badge>
                </div>
                {inv.message && <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{inv.message}</p>}
              </Card>
            ))}
          </div>
        )
      }</TabsContent>

        <TabsContent value="applications">{
        apps === null ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : apps.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            No applications yet.
          </Card>
        ) : (
          <div className="space-y-3">
            {apps.map((a) => (
              <Card key={a.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{a.creator?.displayName ?? a.id}</p>
                    <p className="text-xs text-muted-foreground">@{a.creator?.handle ?? '?'} · {a.creator?.country ?? '—'} · {a.creator?.niches.join(', ') ?? ''}</p>
                    {a.proposedRate && <p className="mt-1 text-sm font-mono">Rp {a.proposedRate.toLocaleString()}</p>}
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="capitalize">{a.status}</span>
                    {a.status === 'pending' && (
                      <>
                        <Button variant="ghost" size="icon" onClick={() => { setTotalText(''); setActionDialog({ kind: 'accept', aid: a.id }); }} disabled={working === a.id} className="h-7 w-7 text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-500" title="Accept">
                          <Check size={14} />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => { setRejectNotes(''); setActionDialog({ kind: 'reject', aid: a.id }); }} disabled={working === a.id} className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive" title="Reject">
                          <X size={14} />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{a.pitchText}</p>
                {a.reviewerNotes && <p className="mt-2 text-xs italic text-muted-foreground">Notes: {a.reviewerNotes}</p>}
              </Card>
            ))}
          </div>
        )
      }</TabsContent>

        <TabsContent value="collaborations">{
        collabs === null ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : collabs.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            No active collaborations. Accept an application to spin one up.
          </Card>
        ) : (
          <div className="space-y-3">
            {collabs.map((c) => (
              <Link
                key={c.id}
                href={`/dashboard/marketing/collaborations/${c.id}`}
                className="block rounded-xl border border-border bg-card p-5 transition hover:border-primary"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm">{c.creatorId.replace('crt_', '')}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{c._count?.deliverables ?? 0} deliverable(s) · started {new Date(c.createdAt).toLocaleDateString()}</p>
                  </div>
                  <Badge variant="outline" className={cn('rounded-full border-transparent font-medium capitalize', COLLAB_STATUS_TONE[c.status] ?? 'bg-secondary text-muted-foreground')}>
                    {c.status.replace(/_/g, ' ')}
                  </Badge>
                </div>
                <div className="mt-3 grid gap-3 border-t border-border pt-3 text-sm sm:grid-cols-3">
                  <Stat label="Gross" value={`Rp ${c.agreedTotalIdr.toLocaleString()}`} />
                  <Stat label="Ripllo fee" value={`${(c.platformFeeRate * 100).toFixed(1)}%`} />
                  <Stat label="Net released" value={c.netToCreatorIdr > 0 ? `Rp ${c.netToCreatorIdr.toLocaleString()}` : '—'} />
                </div>
              </Link>
            ))}
          </div>
        )
      }</TabsContent>
      </Tabs>

      {showInvite && (
        <Dialog open onOpenChange={(o) => { if (!o) { setShowInvite(false); setInvitePick(null); } }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Invite creator</DialogTitle>
              <p className="text-xs text-muted-foreground">Browse verified creators by handle, name, or niche. Click to view their full profile before inviting.</p>
            </DialogHeader>
            <form onSubmit={invite} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Creator</Label>
                <CreatorPicker value={invitePick} onChange={setInvitePick} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invite-msg">Message (optional)</Label>
                <Textarea id="invite-msg" rows={3} value={inviteMsg} onChange={(e) => setInviteMsg(e.target.value)} placeholder="Why this creator's a fit, key dates, etc." />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setShowInvite(false); setInvitePick(null); }}>Cancel</Button>
                <Button type="submit" disabled={working === 'invite' || !invitePick}>
                  {working === 'invite' ? 'Inviting…' : 'Send invite'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={!!actionDialog} onOpenChange={(o) => !o && setActionDialog(null)}>
        <DialogContent className="max-w-sm">
          {actionDialog?.kind === 'reject' ? (
            <>
              <DialogHeader>
                <DialogTitle>Reject application</DialogTitle>
              </DialogHeader>
              <div className="space-y-1.5">
                <Label htmlFor="reject-notes" className="text-xs text-muted-foreground">Notes (shown to creator)</Label>
                <Textarea
                  id="reject-notes"
                  autoFocus
                  rows={3}
                  value={rejectNotes}
                  onChange={(e) => setRejectNotes(e.target.value)}
                  placeholder="Optional — let the creator know why."
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setActionDialog(null)}>Cancel</Button>
                <Button
                  onClick={() => { if (actionDialog) rejectApplication(actionDialog.aid, rejectNotes); setActionDialog(null); }}
                >
                  Reject
                </Button>
              </DialogFooter>
            </>
          ) : actionDialog?.kind === 'accept' ? (
            <>
              <DialogHeader>
                <DialogTitle>Accept &amp; set agreed total</DialogTitle>
              </DialogHeader>
              <div className="space-y-1.5">
                <Label htmlFor="agreed-total" className="text-xs text-muted-foreground">Agreed total (IDR)</Label>
                <Input
                  id="agreed-total"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  autoFocus
                  value={totalText}
                  onChange={(e) => setTotalText(e.target.value)}
                  placeholder="e.g. 5000000"
                />
                <p className="text-[11px] text-muted-foreground">Mints the collaboration and emails a hosted invoice to fund escrow.</p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setActionDialog(null)}>Cancel</Button>
                <Button
                  disabled={!Number(totalText) || Number(totalText) <= 0}
                  onClick={() => { if (actionDialog) acceptApplication(actionDialog.aid, Number(totalText)); setActionDialog(null); }}
                >
                  Accept
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}
