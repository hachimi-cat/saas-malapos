'use client';

/**
 * Shared creator-detail body. Renders the SAME view brands see on
 * /dashboard/creators/[handle], used by:
 *   - brand-side detail page (with merchant-only "Invite to campaign"
 *     button + "Public view" link in the actions slot)
 *   - creator-side `Public profile` preview (read-only — no actions,
 *     a header banner instead, see (creator)/creators/dashboard/preview).
 *
 * The brand page passes `actions` to render its CTA buttons. The
 * creator preview omits actions and instead renders its own banner at
 * the page level.
 *
 * NB: pulled out of the brand page so the creator preview doesn't
 * drift from what brands actually see — bang's explicit ask is "this
 * is how brands see your profile" and the only way to keep that
 * promise tight is to share the same render path.
 */
import { useEffect, useState } from 'react';
import { ExternalLink, Verified } from 'lucide-react';
import {
  PlatformStatsPanel,
  sortStats,
  type PlatformStat,
} from '@/components/marketplace/platform-stats-panel';
import { CreatorAvatar } from '@/components/marketplace/creator-avatar';

export interface RateEntry {
  basePrice: number;
  currency?: string;
  usageRights: 'organic' | 'paid_amplification' | 'whitelisting';
  revisionsIncluded: number;
}

export interface ExclusivityRow { days: number; uplift: number }

export interface RateCardModifiers {
  usageRightsUpcharge?: { paid_amplification?: number; whitelisting?: number };
  extraRevisionRate?: number;
  rushSurcharge?: number;
  exclusivity?: ExclusivityRow[];
  notes?: string;
}

export type CreatorStatsRow = PlatformStat;

export interface CreatorDetail {
  id: string;
  handle: string;
  displayName: string;
  bio: string | null;
  /** S3 key for the creator-uploaded avatar (highest-priority
   *  avatar source — see CreatorAvatar). */
  avatarKey: string | null;
  niches: string[];
  country: string | null;
  languages: string[];
  rateCard: Record<string, RateEntry> | null;
  rateCardModifiers?: RateCardModifiers | null;
  stats?: CreatorStatsRow[];
  createdAt: string;
}

const DELIVERABLE_LABELS: Record<string, string> = {
  ig_post: 'Instagram post',
  ig_reel: 'Instagram Reel',
  // Editor writes `ig_story`; legacy `ig_story_set` migrated 2026-05-26.
  ig_story: 'Instagram Story',
  tiktok: 'TikTok video',
  yt_short: 'YouTube short',
  yt_long: 'YouTube long-form',
  blog: 'Blog post',
  email: 'Email newsletter',
};

const USAGE_LABELS: Record<RateEntry['usageRights'], string> = {
  organic: 'Organic only',
  paid_amplification: 'Paid amplification',
  whitelisting: 'Whitelisting',
};

/** Forward-compat: rename `ig_story_set` → `ig_story` on read. The DB
 *  migration is authoritative for stored rows; this catches a stale
 *  client writing during the deploy window. */
function migrateLegacyRateCard<T>(card: Record<string, T> | null | undefined): Record<string, T> {
  if (!card) return {};
  const out: Record<string, T> = { ...card };
  if ('ig_story_set' in out) {
    if (!('ig_story' in out)) out.ig_story = out.ig_story_set!;
    delete out.ig_story_set;
  }
  return out;
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const d = ms / 86_400_000;
  if (d < 1) return `${Math.round(ms / 3_600_000)}h ago`;
  if (d < 30) return `${Math.round(d)}d ago`;
  if (d < 365) return `${Math.round(d / 30)}mo ago`;
  return `${Math.round(d / 365)}y ago`;
}

interface Props {
  c: CreatorDetail;
  /** Time-series follower history keyed by platform. Optional — when
   *  missing, the PlatformStatsPanel renders the empty-state. */
  historyByPlatform?: Record<string, { day: string; followers: number }[]>;
  /** Right-side action buttons (brand page passes Invite + Public view;
   *  creator preview omits this). */
  actions?: React.ReactNode;
  /** Optional handle-fetched history if the caller didn't pre-fetch. */
  autoFetchHistory?: boolean;
}

export function CreatorDetailView({
  c,
  historyByPlatform: historyProp,
  actions,
  autoFetchHistory = false,
}: Props) {
  const [history, setHistory] = useState<Record<string, { day: string; followers: number }[]>>(historyProp ?? {});
  useEffect(() => {
    if (historyProp) {
      setHistory(historyProp);
      return;
    }
    if (!autoFetchHistory) return;
    let cancelled = false;
    fetch(`/api/v1/ripllo/creator-stats/${encodeURIComponent(c.handle)}/history?days=30`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (cancelled) return;
        const snaps = (b?.data?.snapshots ?? []) as Array<{ day: string; platform: string; followers: number }>;
        const grouped: Record<string, { day: string; followers: number }[]> = {};
        for (const s of snaps) {
          if (!grouped[s.platform]) grouped[s.platform] = [];
          grouped[s.platform]!.push({ day: s.day, followers: s.followers });
        }
        setHistory(grouped);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [c.handle, historyProp, autoFetchHistory]);

  const stats = sortStats((c.stats ?? []) as CreatorStatsRow[]);
  const primary: CreatorStatsRow | undefined = stats[0];
  const rateEntries = Object.entries(migrateLegacyRateCard(c.rateCard as Record<string, RateEntry> | null)).filter(([, e]) => e.basePrice > 0);
  const m = c.rateCardModifiers ?? {};

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 sm:p-6 sm:flex-row sm:items-start">
        <CreatorAvatar profile={c} stats={c.stats ?? null} size={80} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{c.displayName}</h1>
            <span className="font-mono text-sm text-muted-foreground">@{c.handle}</span>
            {/* Verified badge — both OAuth (legacy) and Apify scrape
                qualify as "verified by ripllo" per bang's 2026-05-26
                call. Social Blade fallback rows get NO badge. */}
            {primary && (primary.source?.startsWith('oauth_') || primary.source === 'scrape_apify') && (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-600"
                title="Data scraped + verified by ripllo from the live public profile page."
              >
                <Verified size={10} /> verified
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {c.country && `${c.country}`}
            {c.languages?.length > 0 && ` · ${c.languages.join(', ').toUpperCase()}`}
            {primary?.lastPostAt && ` · last post ${timeAgo(primary.lastPostAt)}`}
          </p>
          {c.bio && <p className="mt-3 max-w-2xl text-sm">{c.bio}</p>}
          {primary?.extras?.website && (
            <a href={primary.extras.website} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 break-all text-xs text-primary hover:underline">
              {primary.extras.website.replace(/^https?:\/\//, '').replace(/\/$/, '')} <ExternalLink size={10} className="shrink-0" />
            </a>
          )}
          {c.niches?.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {c.niches.map((n) => (
                <span key={n} className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{n}</span>
              ))}
            </div>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap gap-2 sm:flex-nowrap">{actions}</div>
        )}
      </div>

      {/* Multi-platform stats. */}
      {stats.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Platform analytics</h2>
          {stats.map((s) => (
            <PlatformStatsPanel
              key={s.platform}
              stat={s}
              rich
              history={history[s.platform] ?? []}
            />
          ))}
        </section>
      )}

      {/* Rate card */}
      {rateEntries.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Rate card</h2>
          <div className="mt-3 hidden overflow-hidden rounded-xl border border-border bg-card md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Deliverable</th>
                  <th className="px-4 py-2.5 text-left font-medium">Default usage</th>
                  <th className="px-4 py-2.5 text-right font-medium">Revisions</th>
                  <th className="px-4 py-2.5 text-right font-medium">Base price</th>
                </tr>
              </thead>
              <tbody>
                {rateEntries.map(([kind, e]) => (
                  <tr key={kind} className="border-t border-border">
                    <td className="px-4 py-2.5">{DELIVERABLE_LABELS[kind] ?? kind.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-2.5 text-xs">{USAGE_LABELS[e.usageRights]}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">{e.revisionsIncluded}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold">{e.currency ?? 'Rp'} {e.basePrice.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="mt-3 space-y-2 md:hidden">
            {rateEntries.map(([kind, e]) => (
              <li key={kind} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-medium">{DELIVERABLE_LABELS[kind] ?? kind.replace(/_/g, ' ')}</p>
                  <p className="font-mono text-sm font-semibold">{e.currency ?? 'Rp'} {e.basePrice.toLocaleString()}</p>
                </div>
                <dl className="mt-2 space-y-1 text-xs">
                  <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Default usage</dt><dd>{USAGE_LABELS[e.usageRights]}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Revisions</dt><dd className="font-mono">{e.revisionsIncluded}</dd></div>
                </dl>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Modifiers */}
      {(m.usageRightsUpcharge || m.extraRevisionRate || m.rushSurcharge !== undefined || (m.exclusivity?.length ?? 0) > 0) && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Modifiers</h2>
          <div className="mt-3 grid gap-2 rounded-xl border border-border bg-card p-4 text-sm sm:grid-cols-2">
            {m.usageRightsUpcharge?.paid_amplification != null && (
              <Mod label="Paid amplification" val={`+${(m.usageRightsUpcharge.paid_amplification * 100).toFixed(0)}%`} />
            )}
            {m.usageRightsUpcharge?.whitelisting != null && (
              <Mod label="Whitelisting" val={`+${(m.usageRightsUpcharge.whitelisting * 100).toFixed(0)}%`} />
            )}
            {m.extraRevisionRate != null && <Mod label="Extra revision" val={`Rp ${m.extraRevisionRate.toLocaleString()}/ea`} />}
            {m.rushSurcharge != null && <Mod label="Rush surcharge" val={`+${(m.rushSurcharge * 100).toFixed(0)}%`} />}
            {m.exclusivity?.map((e) => (
              <Mod key={e.days} label={`Exclusivity · ${e.days}d`} val={`+${(e.uplift * 100).toFixed(0)}%`} />
            ))}
            {m.notes && <p className="col-span-2 mt-2 text-xs text-muted-foreground">{m.notes}</p>}
          </div>
        </section>
      )}
    </div>
  );
}

function Mod({ label, val }: { label: string; val: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-xs font-semibold">{val}</span>
    </div>
  );
}
