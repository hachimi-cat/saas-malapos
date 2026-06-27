'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Camera, Loader2, Mail, Search, SlidersHorizontal, X } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { marketingFetch } from '@/lib/marketing-api';
import { CreatorAvatar } from '@/components/marketplace/creator-avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface DirectoryItem {
  id: string;
  handle: string;
  displayName: string;
  bio: string | null;
  niches: string[];
  country: string | null;
  rateCard?: Record<string, unknown>;
  fromPrice?: number | null;
  avatarKey?: string | null;
  stats?: { extras?: { profilePictureUrl?: string | null } | null }[] | null;
}
interface DirectoryResponse { data: DirectoryItem[]; cursor: string | null; hasMore: boolean }

interface Campaign { id: string; name: string; status: string }

const NICHE_OPTIONS = ['beauty', 'fashion', 'fitness', 'food', 'travel', 'tech', 'gaming', 'lifestyle', 'parenting', 'finance', 'education', 'music', 'comedy'];
const COUNTRY_OPTIONS = [
  { code: 'ID', label: 'Indonesia' }, { code: 'MY', label: 'Malaysia' }, { code: 'SG', label: 'Singapore' },
  { code: 'PH', label: 'Philippines' }, { code: 'TH', label: 'Thailand' }, { code: 'VN', label: 'Vietnam' },
  { code: 'US', label: 'United States' }, { code: 'GB', label: 'United Kingdom' },
];

export default function MerchantCreatorDirectory() {
  const [items, setItems] = useState<DirectoryItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [niche, setNiche] = useState('');
  const [country, setCountry] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [inviting, setInviting] = useState<DirectoryItem | null>(null);

  async function load(reset: boolean) {
    if (reset) setLoading(true); else setLoadingMore(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '24' });
      if (niche) params.set('niche', niche);
      if (country) params.set('country', country);
      if (!reset && cursor) params.set('cursor', cursor);
      const r = await marketingFetch(`/api/v1/account/marketing/marketplace/creators?${params.toString()}`, { credentials: 'include' });
      const b = await r.json();
      if (!r.ok) throw new Error(b?.error?.message ?? 'failed to load');
      const payload = b?.data as DirectoryResponse;
      setItems((prev) => (reset ? payload.data : [...prev, ...payload.data]));
      setCursor(payload?.cursor ?? null);
      setHasMore(!!payload?.hasMore);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); setLoadingMore(false); }
  }

  useEffect(() => { load(true); /* eslint-disable-next-line */ }, [niche, country]);

  useEffect(() => {
    marketingFetch('/api/v1/account/marketing/campaigns?status=open', { credentials: 'include' })
      .then((r) => r.ok ? r.json() : null)
      .then((b) => { if (b?.data?.campaigns) setCampaigns(b.data.campaigns as Campaign[]); })
      .catch(() => {});
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((c) =>
      c.handle.toLowerCase().includes(q) ||
      c.displayName.toLowerCase().includes(q) ||
      (c.bio ?? '').toLowerCase().includes(q) ||
      c.niches.some((n) => n.toLowerCase().includes(q))
    );
  }, [items, search]);

  const activeFilterCount = (niche ? 1 : 0) + (country ? 1 : 0);

  return (
    <div>
      <PageHeader
        title="Creator directory"
        description="Browse every verified creator on Ripllo. Invite them to an open campaign or open their profile."
      />

      {error && <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive px-4 py-2 text-sm">{error}</div>}
      {notice && <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm">{notice}</div>}

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by handle, name, niche…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-card pl-9"
          />
        </div>
        <Button type="button" variant="outline" className="ml-auto" onClick={() => setFiltersOpen((v) => !v)}>
          <SlidersHorizontal size={14} /> Filters
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium leading-none text-primary-foreground">{activeFilterCount}</span>
          )}
        </Button>
      </div>

      {filtersOpen && (
        <Card className="mb-5 grid gap-3 p-4 sm:grid-cols-3">
          <FilterSelect label="Niche" value={niche} onChange={setNiche} options={[{ value: '', label: 'All niches' }, ...NICHE_OPTIONS.map((n) => ({ value: n, label: n.charAt(0).toUpperCase() + n.slice(1) }))]} />
          <FilterSelect label="Country" value={country} onChange={setCountry} options={[{ value: '', label: 'All countries' }, ...COUNTRY_OPTIONS.map((c) => ({ value: c.code, label: c.label }))]} />
          <div className="flex items-end">
            {activeFilterCount > 0 && (
              <Button type="button" variant="outline" onClick={() => { setNiche(''); setCountry(''); }} className="text-muted-foreground">
                <X size={12} /> Clear filters
              </Button>
            )}
          </div>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <Camera size={28} className="mx-auto text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">
            {search || activeFilterCount > 0 ? 'No creators match those filters.' : 'No verified creators yet.'}
          </p>
        </div>
      ) : (
        <>
          <p className="mb-3 text-xs text-muted-foreground">
            {visible.length}{search ? ` of ${items.length} loaded` : ''} verified creator{visible.length === 1 ? '' : 's'}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((c) => (
              <CreatorCard
                key={c.id}
                c={c}
                onInvite={() => { setInviting(c); setNotice(null); }}
              />
            ))}
          </div>
          {hasMore && !search && (
            <div className="mt-8 flex justify-center">
              <Button type="button" variant="outline" onClick={() => load(false)} disabled={loadingMore}>
                {loadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Load more
              </Button>
            </div>
          )}
        </>
      )}

      {inviting && (
        <InviteDialog
          creator={inviting}
          campaigns={campaigns}
          onClose={() => setInviting(null)}
          onSent={(campaignTitle) => {
            setInviting(null);
            setNotice(`Invited @${inviting.handle} to "${campaignTitle}".`);
          }}
        />
      )}
    </div>
  );
}

function CreatorCard({ c, onInvite }: { c: DirectoryItem; onInvite: () => void }) {
  // Ripllo already returns the min base price as `fromPrice`. rateCard
  // entries are nested objects ({ basePrice, ... }), so Math.min over them
  // yields Infinity → the card showed "From Rp ∞". Use fromPrice directly.
  const minRate = c.fromPrice ?? 0;
  const country = COUNTRY_OPTIONS.find((x) => x.code === c.country)?.label ?? c.country ?? null;
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-center gap-3">
        <CreatorAvatar profile={c} stats={c.stats ?? null} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{c.displayName}</p>
          <p className="truncate text-xs text-muted-foreground">@{c.handle}{country && ` · ${country}`}</p>
        </div>
      </div>
      {c.bio && <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">{c.bio}</p>}
      <div className="mt-3 flex flex-wrap gap-1">
        {c.niches.slice(0, 3).map((n) => (
          <Badge key={n} variant="secondary" className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{n}</Badge>
        ))}
      </div>
      {minRate > 0 && (
        <p className="mt-3 border-t border-border pt-3 font-mono text-[11px] text-muted-foreground">
          From <span className="font-semibold text-foreground">Rp {minRate.toLocaleString()}</span>
        </p>
      )}
      <div className="mt-4 flex items-center gap-2 border-t border-border pt-4">
        <Button type="button" size="sm" onClick={onInvite} className="flex-1">
          <Mail size={12} /> Invite
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/dashboard/marketing/creators/${c.handle}`}>
            Profile
          </Link>
        </Button>
      </div>
    </Card>
  );
}

function InviteDialog({ creator, campaigns, onClose, onSent }: { creator: DirectoryItem; campaigns: Campaign[]; onClose: () => void; onSent: (campaignTitle: string) => void }) {
  const [campaignId, setCampaignId] = useState<string>(campaigns[0]?.id ?? '');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send() {
    setSubmitting(true);
    setErr(null);
    try {
      const r = await marketingFetch(`/api/v1/account/marketing/campaigns/${campaignId}/invitations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ creatorId: creator.id, message: message || undefined }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b?.error?.message ?? 'invite failed');
      onSent(campaigns.find((c) => c.id === campaignId)?.name ?? 'campaign');
    } catch (e) { setErr((e as Error).message); }
    finally { setSubmitting(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Invite @{creator.handle}</DialogTitle>
          <p className="text-xs text-muted-foreground">{creator.displayName}</p>
        </DialogHeader>

        {err && <div className="rounded-md border border-destructive/40 bg-destructive/10 text-destructive px-3 py-2 text-xs">{err}</div>}

        {campaigns.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            No open creator briefs. <Link href="/dashboard/marketing/creator-briefs" className="text-primary hover:underline">Create one</Link> first.
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="invite-campaign">Campaign</Label>
              <Select value={campaignId} onValueChange={setCampaignId}>
                <SelectTrigger id="invite-campaign">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {campaigns.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-message">Message (optional)</Label>
              <Textarea id="invite-message" value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="Why this creator? Any specific brief?" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="button" onClick={send} disabled={submitting || !campaignId}>
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail size={12} />} Send invite
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  const id = `filter-${label.toLowerCase()}`;
  // Radix Select forbids empty-string values, so the "All …" option (value '')
  // maps to the 'all' sentinel on the wire and back to '' in the handler.
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value === '' ? 'all' : value} onValueChange={(v) => onChange(v === 'all' ? '' : v)}>
        <SelectTrigger id={id} className="bg-background">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value === '' ? 'all' : o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
