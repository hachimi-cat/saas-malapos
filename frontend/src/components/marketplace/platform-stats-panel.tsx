/**
 * Shared platform-stats render — the per-platform panel that lists
 * followers / engagement / avg likes / avg comments, plus the platform-
 * specific extras (avgViews for TikTok + YouTube, postsPerWeek for YT).
 *
 * Why one panel: we used to render Instagram-only with bespoke
 * `s.platform === 'instagram'` blocks across 5 files. After the Apify-
 * primary scrape cascade landed (services/creator-stats-apify.ts), every
 * creator may now have IG / TikTok / YouTube rows simultaneously, and
 * the frontend has to iterate `stats[]` and render every connected
 * platform. This component is that render — call it inside a list /
 * grid that's already restricted to platforms the creator has actually
 * connected (i.e. iterate `stats.filter(...)`, don't render skeleton
 * cards for missing platforms — bang's rule, no YouTube data exists
 * today so we can't fake YouTube panels for creators who haven't
 * connected it).
 *
 * Source/verification badge is driven by `stat.source`:
 *   oauth_*         → "Verified by Ripllo" (legacy — OAuth path is
 *                     dormant since the Forjio Meta business ban
 *                     2026-05-25; see [[reference_meta_business_dead]])
 *   scrape_apify    → "Verified by Ripllo" (Apify residential-proxy
 *                     scrape of the live profile page — ripllo's
 *                     primary verification path post-Meta)
 *   scrape_socialblade → "Estimated · Social Blade" (fallback —
 *                     SB indexing lags + skips small creators)
 *   anything else / undefined → no badge
 *
 * Engagement-rate semantics differ per platform (see
 * creator-stats-apify.ts docblock) — IG + TT use `(likes + comments)
 * / followers`, YT uses `(likes + comments) / views` falling back to
 * `/ followers`. We just render the number; the back end handled the
 * cross-platform unification.
 */
import { formatEngagementRate } from '@/lib/format';
import { HistoryChart, type HistoryPoint } from './history-chart';
import { socialImageSrc } from '@/lib/social-image';

export type StatPlatform =
  | 'instagram'
  | 'tiktok'
  | 'youtube'
  | 'threads'
  | 'twitter';

/** Order brands generally care about, IG first. Only platforms the
 *  creator has a row for actually render — see `sortStats`. */
export const PLATFORM_ORDER: readonly StatPlatform[] = [
  'instagram',
  'tiktok',
  'youtube',
  'threads',
  'twitter',
] as const;

/** Human label per platform; falls back to the raw key. */
const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  threads: 'Threads',
  twitter: 'X / Twitter',
};

/** A short brand-color glyph for the panel header — lucide doesn't have
 *  TikTok / YouTube brand marks at the right weight, so a single bold
 *  letter chip avoids importing a brand-icon dep and looks consistent
 *  across all platforms. */
const PLATFORM_GLYPH: Record<string, { letter: string; tint: string }> = {
  instagram: { letter: 'IG', tint: 'from-fuchsia-500 to-amber-500' },
  tiktok: { letter: 'TT', tint: 'from-zinc-900 to-zinc-700' },
  youtube: { letter: 'YT', tint: 'from-red-600 to-red-500' },
  threads: { letter: 'TH', tint: 'from-zinc-900 to-zinc-700' },
  twitter: { letter: 'X', tint: 'from-sky-500 to-sky-700' },
};

export interface TopPost {
  permalink: string | null;
  thumbnail: string | null;
  title?: string | null;
  likes: number | null;
  comments: number | null;
  views?: number | null;
  duration?: string | null;
  productType?: string;
  timestamp?: string | null;
}

export interface PlatformStat {
  platform: string;
  handle: string;
  source?: string;
  followers: number;
  engagementRate: number | null;
  avgLikes: number | null;
  avgComments: number | null;
  avgViews?: number | null;
  mediaCount?: number | null;
  lastPostAt?: string | null;
  postsPerWeek?: number | null;
  refreshedAt?: string;
  audience?: {
    topCountries?: { code: string; pct: number }[];
  };
  extras?: {
    bio?: string | null;
    profilePictureUrl?: string | null;
    website?: string | null;
    mediaTypeMix?: Record<string, number>;
    topPosts?: TopPost[];
    avgPlays?: number | null;
    [k: string]: unknown;
  };
}

/** Sort a stats[] array by canonical platform order, dropping anything
 *  not in PLATFORM_ORDER. Use this everywhere a multi-platform render
 *  iterates `stats` so the IG panel comes first when present. */
export function sortStats<T extends { platform: string }>(stats: T[]): T[] {
  const out: T[] = [];
  for (const p of PLATFORM_ORDER) {
    const row = stats.find((s) => s.platform === p);
    if (row) out.push(row);
  }
  return out;
}

/** Best-followers platform — used by the brand directory list view to
 *  pick ONE primary stat row per creator to render in a dense card. */
export function primaryStat<T extends { platform: string; followers: number }>(
  stats: T[] | undefined,
): T | null {
  if (!stats || stats.length === 0) return null;
  const inOrder = sortStats(stats);
  if (inOrder.length === 0) return null;
  // Max followers wins; ties go to PLATFORM_ORDER (IG first).
  let best = inOrder[0]!;
  for (const s of inOrder) {
    if ((s.followers ?? 0) > (best.followers ?? 0)) best = s;
  }
  return best;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const d = ms / 86_400_000;
  if (d < 1) return `${Math.round(ms / 3_600_000)}h ago`;
  if (d < 30) return `${Math.round(d)}d ago`;
  if (d < 365) return `${Math.round(d / 30)}mo ago`;
  return `${Math.round(d / 365)}y ago`;
}

interface PanelProps {
  stat: PlatformStat;
  /** When true, also render the top-posts grid + cadence row + audience
   *  countries — for detail pages. Cards / dense lists pass false. */
  rich?: boolean;
  /** Time-series follower history for this platform — when present
   *  and `rich` is true, renders a SB-style 30-day chart at the top
   *  of the panel. Pass `[]` to render the empty-state placeholder
   *  (encourages "data will populate soon" messaging). Pass `undefined`
   *  to omit the chart entirely (used by dense list views). */
  history?: HistoryPoint[];
}

/** Source/verification badge — derived from `stat.source`. */
function SourceBadge({ source }: { source: string | undefined }) {
  if (!source) return null;
  // `oauth_*` (legacy) and `scrape_apify` (current primary) both surface
  // as "Verified by Ripllo" — ripllo is the verifier in both cases.
  // OAuth was deeper proof (account-ownership) but Meta cut us off
  // 2026-05-25 and the public Apify scrape is the new ground truth.
  if (source.startsWith('oauth_') || source === 'scrape_apify') {
    return (
      <span
        className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-600"
        title="Data scraped + verified by ripllo from the live public profile page."
      >
        Verified by Ripllo
      </span>
    );
  }
  if (source === 'scrape_socialblade') {
    return (
      <span
        className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-600"
        title="Public-data estimate (Social Blade). Connect this platform for verified stats."
      >
        Estimated · Social Blade
      </span>
    );
  }
  return null;
}

/** Compact platform-letter glyph for the panel header. */
function PlatformGlyph({ platform }: { platform: string }) {
  const g = PLATFORM_GLYPH[platform];
  if (!g) {
    return (
      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-secondary text-[10px] font-bold uppercase">
        {platform.slice(0, 2)}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br ${g.tint} text-[10px] font-bold text-white`}
    >
      {g.letter}
    </span>
  );
}

/**
 * The per-platform panel. Always renders followers / engagement / avg
 * likes / avg comments. Adds avgViews on TikTok + YouTube, and
 * postsPerWeek on YouTube. The `rich` toggle adds cadence, post-type
 * mix, top-posts grid, and audience-country row (used on detail pages).
 */
export function PlatformStatsPanel({ stat, rich = false, history }: PanelProps) {
  const x = stat.extras ?? {};
  const platform = stat.platform;
  const label = PLATFORM_LABELS[platform] ?? platform;
  const showAvgViews =
    (platform === 'tiktok' || platform === 'youtube') && stat.avgViews != null;
  const showCadence = platform === 'youtube' && stat.postsPerWeek != null;
  // IG-only "Reels" hint, kept from the legacy panel — Reels surface as
  // an extra "avgPlays" stat the IG OAuth path stamps. Non-IG plays are
  // already covered by avgViews.
  const hasReels = platform === 'instagram' && (x.avgPlays ?? 0) > 0;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <PlatformGlyph platform={platform} />
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {label}
            </p>
            <p className="mt-0.5 truncate font-mono text-sm">@{stat.handle}</p>
          </div>
        </div>
        {/* Source/verification badge only on the rich detail view —
            the dense list cards (rich=false) drop it. Bang's call
            2026-05-26: the amber "Estimated · Social Blade" chip was
            visual noise on directory cards. Detail page still shows
            it so brands can see the data lineage. */}
        {rich && <SourceBadge source={stat.source} />}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
        <Stat n={fmt(stat.followers)} l={platform === 'youtube' ? 'Subscribers' : 'Followers'} />
        <Stat n={formatEngagementRate(stat.engagementRate, 2)} l="Engagement" />
        <Stat n={stat.avgLikes != null ? fmt(stat.avgLikes) : '—'} l="Avg likes" />
        <Stat n={stat.avgComments != null ? fmt(stat.avgComments) : '—'} l="Avg comments" />
        {showAvgViews ? (
          <Stat n={fmt(stat.avgViews!)} l="Avg views" />
        ) : hasReels ? (
          <Stat n={fmt(x.avgPlays!)} l="Avg plays" hint="Reels" />
        ) : (
          <Stat n={stat.mediaCount != null ? fmt(stat.mediaCount) : '—'} l={platform === 'youtube' ? 'Videos' : 'Total posts'} />
        )}
      </div>

      {rich && history !== undefined && (
        <div className="mt-5">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {platform === 'youtube' ? 'Subscribers' : 'Followers'} · last {history.length || 30}d
          </p>
          <HistoryChart
            points={history}
            metricLabel={platform === 'youtube' ? 'Subscribers' : 'Followers'}
          />
        </div>
      )}

      {rich && (showCadence || (stat.postsPerWeek != null && platform !== 'youtube') || (x.mediaTypeMix && Object.keys(x.mediaTypeMix).length > 0)) && (
        <div className="mt-4 space-y-2">
          {stat.postsPerWeek != null && (
            <p className="text-xs text-muted-foreground">
              Posts{' '}
              <span className="font-semibold text-foreground">
                {stat.postsPerWeek.toFixed(1)}× per week
              </span>{' '}
              on average
            </p>
          )}
          {x.mediaTypeMix && Object.keys(x.mediaTypeMix).length > 0 && (
            <MediaTypeBar mix={x.mediaTypeMix} />
          )}
        </div>
      )}

      {rich && x.topPosts && x.topPosts.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Top performing posts
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {x.topPosts.slice(0, 6).map((p, i) => (
              <PostTile key={p.permalink ?? `tile-${i}`} post={p} platform={platform} />
            ))}
          </div>
        </div>
      )}

      {rich && stat.audience?.topCountries && stat.audience.topCountries.length > 0 && (
        <p className="mt-4 text-[11px] text-muted-foreground">
          Top countries:{' '}
          {stat.audience.topCountries
            .slice(0, 3)
            .map((cc) => `${cc.code} ${(cc.pct * 100).toFixed(0)}%`)
            .join(' · ')}
        </p>
      )}

      <p className="mt-3 flex flex-wrap items-center gap-x-2 text-[10px] text-muted-foreground">
        {stat.lastPostAt && <span>Last post {timeAgo(stat.lastPostAt)}</span>}
        {stat.refreshedAt && <span>· Refreshed {new Date(stat.refreshedAt).toLocaleString()}</span>}
      </p>
    </div>
  );
}

function Stat({ n, l, hint }: { n: string; l: string; hint?: string }) {
  return (
    <div className="rounded-md border border-border bg-background px-2.5 py-2">
      <p className="font-mono text-sm font-semibold tabular-nums">{n}</p>
      <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{l}</p>
      {hint && <p className="mt-0.5 text-[10px] text-muted-foreground/80">{hint}</p>}
    </div>
  );
}

const TYPE_LABEL: Record<string, string> = {
  REELS: 'Reels',
  FEED: 'Feed',
  CAROUSEL_ALBUM: 'Carousels',
  IMAGE: 'Photos',
  VIDEO: 'Videos',
  STORY: 'Stories',
  IGTV: 'IGTV',
  OTHER: 'Other',
};
const TYPE_COLOR: Record<string, string> = {
  REELS: 'bg-fuchsia-500',
  FEED: 'bg-sky-500',
  CAROUSEL_ALBUM: 'bg-emerald-500',
  IMAGE: 'bg-teal-500',
  VIDEO: 'bg-rose-500',
  STORY: 'bg-amber-500',
  IGTV: 'bg-violet-500',
  OTHER: 'bg-zinc-400',
};

function MediaTypeBar({ mix }: { mix: Record<string, number> }) {
  const entries = Object.entries(mix)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;
  return (
    <div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-secondary/40">
        {entries.map(([k, v]) => (
          <div
            key={k}
            className={`h-full ${TYPE_COLOR[k] ?? TYPE_COLOR.OTHER}`}
            style={{ width: `${v * 100}%` }}
            title={`${TYPE_LABEL[k] ?? k}: ${(v * 100).toFixed(0)}%`}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        {entries.map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-1">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${TYPE_COLOR[k] ?? TYPE_COLOR.OTHER}`} />
            {TYPE_LABEL[k] ?? k} {(v * 100).toFixed(0)}%
          </span>
        ))}
      </div>
    </div>
  );
}

/** One post/video tile inside the top-posts grid. Renders TT + YT view
 *  counts when available (those platforms include `views` in extras). */
function PostTile({ post, platform }: { post: TopPost; platform: string }) {
  // IG/FB CDNs (cdninstagram.com / fbcdn.net) refuse cross-origin
  // image loads — route those through /api/v1/img-proxy. YT/TT URLs
  // pass through unchanged. socialImageSrc is null-safe.
  const proxiedThumb = socialImageSrc(post.thumbnail);
  const inner = (
    <>
      {proxiedThumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={proxiedThumb}
          alt={post.title ?? ''}
          className="h-full w-full object-cover transition group-hover:scale-105"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-1 text-center text-[10px] text-muted-foreground">
          {post.title ? <span className="line-clamp-3 break-words">{post.title}</span> : <span>no thumb</span>}
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 py-1 text-[10px] font-medium text-white">
        {post.views != null ? `▶ ${fmt(post.views)} · ` : ''}
        ♥ {post.likes != null ? fmt(post.likes) : '—'}
        {post.comments != null ? ` · 💬 ${fmt(post.comments)}` : ''}
      </div>
      {(post.productType === 'REELS' || (platform === 'tiktok')) && (
        <span className="absolute right-1 top-1 rounded-sm bg-black/70 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white">
          {platform === 'tiktok' ? 'TT' : 'Reel'}
        </span>
      )}
    </>
  );
  const className =
    'group relative block aspect-square overflow-hidden rounded-md border border-border bg-secondary/30';
  if (post.permalink) {
    return (
      <a href={post.permalink} target="_blank" rel="noopener noreferrer" className={className}>
        {inner}
      </a>
    );
  }
  return <div className={className}>{inner}</div>;
}
