'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Check, X, ExternalLink, AlertTriangle, Handshake, ShieldAlert } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { BackLink } from '@/components/dashboard/back-link';
import { marketingFetch } from '@/lib/marketing-api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface Deliverable {
  id: string;
  kind: string;
  spec: string | null;
  draftKey: string | null;
  watermarkStatus: 'pending' | 'processing' | 'ready' | 'failed';
  publishedUrl: string | null;
  status: 'pending' | 'draft_submitted' | 'approved' | 'rejected' | 'live' | 'metrics_recorded';
  reviewerNotes: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
}

interface Collab {
  id: string;
  status: string;
  agreedTotalIdr: number;
  platformFeeRate: number;
  netToCreatorIdr: number;
  creatorId: string;
  campaign: { id: string; name: string; brief: string };
  deliverables: Deliverable[];
}

const DELIVERABLE_LABELS: Record<string, string> = {
  ig_post: 'Instagram post',
  ig_reel: 'Instagram Reel',
  tiktok: 'TikTok video',
  yt_short: 'YouTube short',
  yt_long: 'YouTube long-form',
  blog: 'Blog post',
  email: 'Email newsletter',
  ugc: 'UGC asset',
};

export default function MerchantCollabDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [collab, setCollab] = useState<Collab | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);

  async function load() {
    try {
      const r = await marketingFetch(`/api/v1/account/marketing/collaborations/${id}`, { credentials: 'include' });
      const b = await r.json();
      if (!r.ok) throw new Error(b?.error?.message ?? 'load failed');
      setCollab(b?.data ?? null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  async function review(dId: string, action: 'approve' | 'reject', notes?: string) {
    setWorking(dId);
    try {
      const r = await marketingFetch(`/api/v1/account/marketing/collaborations/${id}/deliverables/${dId}/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: notes ? JSON.stringify({ notes }) : '{}',
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b?.error?.message ?? 'failed');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(null);
    }
  }

  const [showDispute, setShowDispute] = useState(false);
  const [disputeNotes, setDisputeNotes] = useState('');
  const [changesFor, setChangesFor] = useState<string | null>(null);
  const [changesNotes, setChangesNotes] = useState('');

  async function fileDispute() {
    if (disputeNotes.trim().length < 20) { setError('Dispute notes must be at least 20 characters.'); return; }
    setWorking('dispute');
    setError(null);
    try {
      const r = await marketingFetch(`/api/v1/account/marketing/collaborations/${id}/dispute`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ notes: disputeNotes.trim() }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b?.error?.message ?? 'dispute failed');
      setShowDispute(false);
      setDisputeNotes('');
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setWorking(null); }
  }

  async function approveCollab() {
    setWorking('approve');
    try {
      const r = await marketingFetch(`/api/v1/account/marketing/collaborations/${id}/approve`, {
        method: 'POST',
        credentials: 'include',
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b?.error?.message ?? 'failed');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(null);
    }
  }

  if (!collab) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const allApproved = collab.deliverables.length > 0 && collab.deliverables.every((d) => d.status === 'approved' || d.status === 'live');
  const canApproveCollab = (collab.status === 'active' || collab.status === 'delivered') && allApproved;

  return (
    <div className="mx-auto max-w-6xl">
      <BackLink href="/dashboard/marketing/collaborations" label="All collaborations" />
      <PageHeader
        icon={Handshake}
        title={collab.campaign.name}
        description={`Creator crt_${collab.creatorId.replace('crt_', '')} · status: ${collab.status.replace(/_/g, ' ')} · Rp ${collab.agreedTotalIdr.toLocaleString()} (Ripllo fee ${(collab.platformFeeRate * 100).toFixed(1)}%)`}
      />

      {error && <div className="mt-2 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive px-4 py-2 text-sm">{error}</div>}

      {collab.status === 'pending_funding' && (
        <div className="mt-2 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
          <p>Escrow not yet funded. Pay the invoice that was emailed to you to activate this collaboration. The creator can&rsquo;t start until you fund.</p>
        </div>
      )}

      <Card className="mt-6 p-5">
        <h2 className="text-sm font-semibold">Brief</h2>
        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{collab.campaign.brief}</p>
      </Card>

      <h2 className="mt-8 mb-3 text-sm font-semibold tracking-tight">Deliverables ({collab.deliverables.length})</h2>
      <div className="space-y-3">
        {collab.deliverables.map((d) => (
          <Card key={d.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{DELIVERABLE_LABELS[d.kind] ?? d.kind}</p>
                {d.spec && <p className="mt-1 text-xs text-muted-foreground">{d.spec}</p>}
              </div>
              <Badge variant="secondary" className="rounded-full text-[11px] font-medium capitalize">
                {d.status.replace(/_/g, ' ')}
              </Badge>
            </div>

            {d.watermarkStatus === 'processing' && (
              <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> watermarking…
              </p>
            )}

            {d.draftKey && (
              <div className="mt-4">
                <Button asChild variant="outline" size="sm">
                  <a
                    href={`/api/v1/account/marketing/uploads/deliverable?id=${d.id}`}
                    target="_blank" rel="noopener noreferrer"
                  >
                    <ExternalLink size={12} /> View {collab.status === 'approved' || collab.status === 'paid' ? 'final' : 'watermarked draft'}
                  </a>
                </Button>
              </div>
            )}

            {d.publishedUrl && (
              <p className="mt-3 text-xs">
                <span className="text-muted-foreground">Live: </span>
                <a href={d.publishedUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{d.publishedUrl}</a>
              </p>
            )}

            {d.status === 'draft_submitted' && (
              <div className="mt-4 flex gap-2">
                <Button
                  size="sm"
                  onClick={() => review(d.id, 'approve')}
                  disabled={working === d.id}
                  className="gap-1 bg-emerald-600 font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  <Check size={12} /> Approve
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setChangesNotes(''); setChangesFor(d.id); }}
                  disabled={working === d.id}
                  className="gap-1 border-destructive/40 font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-60"
                >
                  <X size={12} /> Request changes
                </Button>
              </div>
            )}

            {d.reviewerNotes && (
              <div className="mt-3 rounded-md border border-border bg-secondary/40 p-3 text-xs">
                <p className="font-medium">Your notes</p>
                <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{d.reviewerNotes}</p>
              </div>
            )}
          </Card>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
        {(collab.status === 'active' || collab.status === 'delivered') ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setShowDispute(true); setError(null); }}
            disabled={working !== null}
            className="gap-1.5 border-amber-500/40 text-amber-600 hover:bg-amber-500/10 disabled:opacity-60"
          >
            <ShieldAlert size={12} /> File a dispute
          </Button>
        ) : <span />}
        {canApproveCollab && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                disabled={working === 'approve'}
                className="px-5 font-semibold hover:bg-primary/90 disabled:opacity-60"
              >
                {working === 'approve' && <Loader2 className="h-4 w-4 animate-spin" />}
                Approve collaboration & release payment
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Approve collaboration?</AlertDialogTitle>
                <AlertDialogDescription>
                  This snapshots net-to-creator and locks the un-watermarked files for download. Payout is released next.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={approveCollab}>Approve & release</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      <Dialog open={showDispute} onOpenChange={(o) => !o && setShowDispute(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">File a dispute</DialogTitle>
          </DialogHeader>
          <p className="-mt-2 text-xs text-muted-foreground">
            Escalates this collaboration to Forjio admin review. Escrow stays frozen
            until the dispute is resolved. Use this for repeated rejections, off-spec
            work, or non-responsive creators.
          </p>
          {error && <div className="rounded-md border border-destructive/40 bg-destructive/10 text-destructive px-3 py-2 text-xs">{error}</div>}
          <div className="space-y-1.5">
            <Label htmlFor="dispute-notes" className="text-xs font-medium text-muted-foreground">What happened? (min 20 chars)</Label>
            <Textarea
              id="dispute-notes"
              value={disputeNotes}
              onChange={(e) => setDisputeNotes(e.target.value)}
              rows={5}
              placeholder="The creator submitted three drafts that ignore the brief's key product callout. They've stopped responding to in-platform messages for 5 days…"
            />
            <p className="text-[11px] text-muted-foreground">{disputeNotes.length} / 5000</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setShowDispute(false)}>Cancel</Button>
            <Button
              type="button"
              size="sm"
              onClick={fileDispute}
              disabled={working === 'dispute' || disputeNotes.trim().length < 20}
              className="gap-1.5 bg-amber-600 font-medium text-white hover:bg-amber-700 disabled:opacity-60"
            >
              {working === 'dispute' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldAlert size={12} />} File dispute
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!changesFor} onOpenChange={(o) => !o && setChangesFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Request changes</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="changes-notes" className="text-xs font-medium text-muted-foreground">What needs to change?</Label>
            <Textarea
              id="changes-notes"
              autoFocus
              rows={4}
              value={changesNotes}
              onChange={(e) => setChangesNotes(e.target.value)}
              placeholder="Be specific so the creator can fix it in one pass…"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setChangesFor(null)}>Cancel</Button>
            <Button
              type="button"
              size="sm"
              disabled={!changesNotes.trim()}
              onClick={() => { if (changesFor) review(changesFor, 'reject', changesNotes); setChangesFor(null); }}
            >
              Send notes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
