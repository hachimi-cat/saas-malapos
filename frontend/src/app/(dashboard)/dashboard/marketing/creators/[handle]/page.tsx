'use client';

/*
 * Marketing Creator profile — detail view.
 *
 * GET ripllo /api/v1/account/marketing/marketplace/creators/:handle
 * (via the marketing passthrough) for a single verified creator's
 * public profile: bio, niches, rate card, platform links + per-platform
 * audience stats. This is the in-app replacement for the old public
 * `/creators/:handle` route, which these products don't serve.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, ExternalLink, Camera } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { ErrorBox } from '@/components/dashboard/ui';
import { BackLink } from '@/components/dashboard/back-link';
import { marketingFetch } from '@/lib/marketing-api';

interface CreatorStat {
  platform: string;
  handle: string | null;
  source: string | null;
  verified: boolean;
  followers: number | null;
  engagementRate: number | null;
  avgLikes: number | null;
  avgViews: number | null;
  lastPostAt: string | null;
}

interface CreatorProfile {
  id: string;
  handle: string;
  displayName: string;
  bio: string | null;
  avatarKey: string | null;
  niches: string[];
  country: string | null;
  languages: string[];
  rateCard: Record<string, number> | null;
  pricingGated: boolean;
  fromPrice: number | null;
  platformLinks: Record<string, string> | null;
  stats: CreatorStat[];
  createdAt: string;
}

const COUNTRY_OPTIONS = [
  { code: 'ID', label: 'Indonesia' }, { code: 'MY', label: 'Malaysia' }, { code: 'SG', label: 'Singapore' },
  { code: 'PH', label: 'Philippines' }, { code: 'TH', label: 'Thailand' }, { code: 'VN', label: 'Vietnam' },
  { code: 'US', label: 'United States' }, { code: 'GB', label: 'United Kingdom' },
];

function countryLabel(code: string | null): string | null {
  if (!code) return null;
  return COUNTRY_OPTIONS.find((c) => c.code === code)?.label ?? code;
}

function fmt(n: number | null): string {
  return n == null ? '—' : n.toLocaleString();
}

export default function CreatorProfilePage() {
  const params = useParams<{ handle: string }>();
  const handle = params?.handle ?? '';
  const [creator, setCreator] = useState<CreatorProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const r = await marketingFetch(
        `/api/v1/account/marketing/marketplace/creators/${encodeURIComponent(handle)}`,
        { credentials: 'include' },
      );
      if (r.status === 404) {
        setNotFound(true);
        return;
      }
      const b = await r.json();
      if (!r.ok) {
        setError(b?.error?.message ?? 'failed to load');
        return;
      }
      setCreator((b?.data as CreatorProfile) ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (handle) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle]);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl">
        <BackLink href="/dashboard/marketing/creators" label="Creator directory" />
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-6xl">
        <BackLink href="/dashboard/marketing/creators" label="Creator directory" />
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <Camera size={28} className="mx-auto text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">No creator found for @{handle}.</p>
        </div>
      </div>
    );
  }

  if (!creator) {
    return (
      <div className="mx-auto max-w-6xl">
        <BackLink href="/dashboard/marketing/creators" label="Creator directory" />
        {error ? <ErrorBox>{error}</ErrorBox> : null}
      </div>
    );
  }

  const country = countryLabel(creator.country);
  const rateEntries = creator.rateCard
    ? Object.entries(creator.rateCard).filter(([, v]) => v > 0)
    : [];
  const platformLinks = creator.platformLinks ? Object.entries(creator.platformLinks).filter(([, v]) => !!v) : [];

  return (
    <div className="mx-auto max-w-6xl">
      <BackLink href="/dashboard/marketing/creators" label="Creator directory" />
      <PageHeader
        icon={Camera}
        title={creator.displayName}
        description={`@${creator.handle}${country ? ` · ${country}` : ''}`}
      />

      {error && <ErrorBox>{error}</ErrorBox>}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column — identity + bio */}
        <section className="lg:col-span-2 space-y-6">
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center gap-4">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-500/15 text-2xl font-bold text-brand-500">
                {creator.displayName.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold">{creator.displayName}</h2>
                <p className="truncate text-sm text-muted-foreground">@{creator.handle}{country && ` · ${country}`}</p>
              </div>
            </div>

            {creator.bio && <p className="mt-4 text-sm text-muted-foreground whitespace-pre-wrap">{creator.bio}</p>}

            {creator.niches.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1">
                {creator.niches.map((n) => (
                  <span key={n} className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{n}</span>
                ))}
              </div>
            )}

            {creator.languages.length > 0 && (
              <p className="mt-4 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Languages:</span> {creator.languages.join(', ')}
              </p>
            )}

            {platformLinks.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
                {platformLinks.map(([platform, url]) => (
                  <a
                    key={platform}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs capitalize hover:bg-secondary"
                  >
                    {platform} <ExternalLink size={11} />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Platform stats */}
          {creator.stats.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="text-sm font-semibold tracking-tight">Audience</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {creator.stats.map((s, i) => (
                  <div key={`${s.platform}-${i}`} className="rounded-lg border border-border bg-background p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium capitalize">{s.platform}</span>
                      {s.verified && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-600">Verified</span>}
                    </div>
                    {s.handle && <p className="mt-0.5 truncate text-xs text-muted-foreground">@{s.handle}</p>}
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <dt className="text-muted-foreground">Followers</dt>
                        <dd className="font-semibold tabular-nums">{fmt(s.followers)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Engagement</dt>
                        <dd className="font-semibold tabular-nums">{s.engagementRate == null ? '—' : `${s.engagementRate}%`}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Avg likes</dt>
                        <dd className="font-semibold tabular-nums">{fmt(s.avgLikes)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Avg views</dt>
                        <dd className="font-semibold tabular-nums">{fmt(s.avgViews)}</dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Right column — rate card */}
        <aside className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="text-sm font-semibold tracking-tight">Rate card</h3>
            {creator.pricingGated ? (
              <div className="mt-3">
                {creator.fromPrice != null ? (
                  <p className="font-mono text-sm text-muted-foreground">
                    From <span className="font-semibold text-foreground">Rp {creator.fromPrice.toLocaleString()}</span>
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Pricing available on request.</p>
                )}
                <p className="mt-2 text-xs text-muted-foreground">Full rate card is gated. Invite this creator to a campaign to negotiate deliverables.</p>
              </div>
            ) : rateEntries.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {rateEntries.map(([k, v]) => (
                  <li key={k} className="flex items-center justify-between border-b border-border pb-2 text-sm last:border-0 last:pb-0">
                    <span className="capitalize text-muted-foreground">{k.replace(/_/g, ' ')}</span>
                    <span className="font-mono font-semibold">Rp {v.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">No rate card published.</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
