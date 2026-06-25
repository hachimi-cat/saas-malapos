'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Camera, ExternalLink, Loader2, Mail, Search, SlidersHorizontal, Users, X } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { marketingFetch } from '@/lib/marketing-api';

interface DirectoryItem {
  id: string;
  handle: string;
  displayName: string;
  bio: string | null;
  niches: string[];
  country: string | null;
  rateCard?: Record<string, number>;
}
interface DirectoryResponse { data: DirectoryItem[]; cursor: string | null; hasMore: boolean }

interface Campaign { id: string; title: string; status: string }

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
      .then((b) => { if (b?.data) setCampaigns(b.data as Campaign[]); })
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
        icon={Users}
        title="Creator directory"
        description="Browse every verified creator on Ripllo. Invite them to an open campaign or open their public profile."
        action={
          <Link
            href="/creators/directory"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
          >
            Public view <ExternalLink size={12} />
          </Link>
        }
      />

      {error && <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm">{error}</div>}
      {notice && <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm">{notice}</div>}

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search by handle, name, niche…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:border-brand-500 focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-secondary"
        >
          <SlidersHorizontal size={14} /> Filters
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-brand-500 px-1.5 py-0.5 text-[10px] font-medium leading-none text-primary-foreground">{activeFilterCount}</span>
          )}
        </button>
      </div>

      {filtersOpen && (
        <div className="mb-5 grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-3">
          <FilterSelect label="Niche" value={niche} onChange={setNiche} options={[{ value: '', label: 'All niches' }, ...NICHE_OPTIONS.map((n) => ({ value: n, label: n.charAt(0).toUpperCase() + n.slice(1) }))]} />
          <FilterSelect label="Country" value={country} onChange={setCountry} options={[{ value: '', label: 'All countries' }, ...COUNTRY_OPTIONS.map((c) => ({ value: c.code, label: c.label }))]} />
          <div className="flex items-end">
            {activeFilterCount > 0 && (
              <button type="button" onClick={() => { setNiche(''); setCountry(''); }} className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground hover:bg-secondary">
                <X size={12} /> Clear filters
              </button>
            )}
          </div>
        </div>
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
              <button type="button" onClick={() => load(false)} disabled={loadingMore} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-5 py-2 text-sm hover:bg-secondary disabled:opacity-60">
                {loadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Load more
              </button>
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
  const minRate = c.rateCard ? Math.min(...Object.values(c.rateCard).filter((v) => v > 0)) : 0;
  const country = COUNTRY_OPTIONS.find((x) => x.code === c.country)?.label ?? c.country ?? null;
  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500/15 text-base font-bold text-brand-500">
          {c.displayName.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{c.displayName}</p>
          <p className="truncate text-xs text-muted-foreground">@{c.handle}{country && ` · ${country}`}</p>
        </div>
      </div>
      {c.bio && <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">{c.bio}</p>}
      <div className="mt-3 flex flex-wrap gap-1">
        {c.niches.slice(0, 3).map((n) => (
          <span key={n} className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{n}</span>
        ))}
      </div>
      {minRate > 0 && (
        <p className="mt-3 border-t border-border pt-3 font-mono text-[11px] text-muted-foreground">
          From <span className="font-semibold text-foreground">Rp {minRate.toLocaleString()}</span>
        </p>
      )}
      <div className="mt-4 flex items-center gap-2 border-t border-border pt-4">
        <button type="button" onClick={onInvite} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-brand-600">
          <Mail size={12} /> Invite
        </button>
        <Link href={`/creators/${c.handle}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-secondary">
          Profile <ExternalLink size={11} />
        </Link>
      </div>
    </div>
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
      onSent(campaigns.find((c) => c.id === campaignId)?.title ?? 'campaign');
    } catch (e) { setErr((e as Error).message); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold">Invite @{creator.handle}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{creator.displayName}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-secondary"><X size={14} /></button>
        </div>

        {err && <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">{err}</div>}

        {campaigns.length === 0 ? (
          <div className="mt-5 rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            No open creator briefs. <Link href="/dashboard/marketing/creator-briefs" className="text-brand-500 hover:underline">Create one</Link> first.
          </div>
        ) : (
          <>
            <label className="mt-5 block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Campaign</span>
              <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-brand-500 focus:outline-none">
                {campaigns.map((c) => (<option key={c.id} value={c.id}>{c.title}</option>))}
              </select>
            </label>
            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Message (optional)</span>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="Why this creator? Any specific brief?" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary">Cancel</button>
              <button type="button" onClick={send} disabled={submitting || !campaignId} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-brand-600 disabled:opacity-60">
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail size={12} />} Send invite
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-brand-500 focus:outline-none">
        {options.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
      </select>
    </label>
  );
}
