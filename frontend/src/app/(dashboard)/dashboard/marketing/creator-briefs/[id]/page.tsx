'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Check, X, Megaphone, UserPlus, FileText, Mail, Users, Handshake } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { BackLink } from '@/components/dashboard/back-link';
import { ErrorBox } from '@/components/dashboard/ui';
import { CreatorPicker } from '@/components/marketplace/creator-picker';
import { marketingFetch } from '@/lib/marketing-api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
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
  delivered: 'bg-blue-500/10 text-blue-600',
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

  async function review(aid: string, action: 'accept' | 'reject') {
    setWorking(aid);
    setError(null);
    try {
      if (action === 'reject') {
        const notes = window.prompt('Notes (shown to creator)') ?? '';
        const r = await marketingFetch(`/api/v1/account/marketing/campaigns/${id}/applications/${aid}/reject`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ notes }),
        });
        const b = await r.json();
        if (!r.ok) throw new Error(b?.error?.message ?? 'review failed');
        await load();
        return;
      }
      // Accept: prompt for agreed total + merchant email, then mint the
      // collaboration via /collaborations/from-application/:appId.
      const totalStr = window.prompt('Agreed total (IDR) for this collaboration?');
      if (!totalStr) return;
      const total = Number(totalStr);
      if (!Number.isFinite(total) || total <= 0) { setError('Invalid total'); return; }
      // Pull merchant email from the session.
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
        icon={Megaphone}
        title={campaign.name}
        description={`${campaign.status} · ${campaign.discoveryMode.replace('_', ' ')} · ${campaign.pricingModel} · Rp ${campaign.budgetIdr.toLocaleString()} · ${(campaign.platformFeeRate * 100).toFixed(1)}% Ripllo fee`}
        action={<Button onClick={() => setShowInvite(true)}><UserPlus className="h-4 w-4" /> Invite creator</Button>}
      />

      {error && <ErrorBox>{error}</ErrorBox>}

      <div className="mb-5 flex items-center gap-1 border-b border-border">
        <TabButton active={tab === 'brief'} onClick={() => setTab('brief')} icon={FileText} label="Brief" />
        <TabButton active={tab === 'invitations'} onClick={() => setTab('invitations')} icon={Mail} label="Invitations" count={invites?.length} />
        <TabButton active={tab === 'applications'} onClick={() => setTab('applications')} icon={Users} label="Applications" count={apps?.length} pendingCount={apps?.filter((a) => a.status === 'pending').length} />
        <TabButton active={tab === 'collaborations'} onClick={() => setTab('collaborations')} icon={Handshake} label="Collaborations" count={collabs?.length} pendingCount={collabs?.filter((c) => c.status === 'delivered').length} />
      </div>

      {tab === 'brief' && (
        <Card className="p-6">
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{campaign.brief}</p>
        </Card>
      )}

      {tab === 'invitations' && (
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
      )}

      {tab === 'applications' && (
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
                        <Button variant="ghost" size="icon" onClick={() => review(a.id, 'accept')} disabled={working === a.id} className="h-7 w-7 text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-500" title="Accept">
                          <Check size={14} />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => review(a.id, 'reject')} disabled={working === a.id} className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive" title="Reject">
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
      )}

      {tab === 'collaborations' && (
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
                className="block rounded-xl border border-border bg-card p-5 transition hover:border-brand-500"
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
      )}

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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}
