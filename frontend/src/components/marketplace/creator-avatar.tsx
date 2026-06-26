'use client';

/**
 * Avatar render for creator surfaces — brand-side directory, brand-side
 * detail page, public profile pages.
 *
 * Why this exists: before this component, brand pages rendered avatars
 * straight from `primary.extras.profilePictureUrl` (the Apify-scraped
 * IG profile pic, served from cdninstagram.com which 403s cross-origin)
 * and ignored the creator-uploaded `CreatorProfile.avatarKey` entirely.
 * Result: every creator's avatar was broken on the brand side.
 *
 * Priority chain:
 *   1. `avatarKey` — uploaded by the creator to S3, fetched signed via
 *      `/api/v1/uploads/avatar?key=...` (same pattern as creator-picker).
 *   2. `socialPic` — first available platform `extras.profilePictureUrl`,
 *      proxied through `socialImageSrc` if the host is hot-link-blocked.
 *   3. initial-letter placeholder — first letter of `fallback` in the
 *      brand-primary tint.
 *
 * Pass either:
 *   - `{ avatarKey, socialPic, fallback, size? }` — raw values.
 *   - `{ profile, stats?, size? }` — convenience overload; component
 *     extracts avatarKey from profile, social pic from the first stats
 *     row that has `extras.profilePictureUrl`, and the fallback from
 *     `profile.displayName`.
 */
import { useEffect, useState } from 'react';
import { socialImageSrc, RIPLLO_BASE } from '@/lib/social-image';

interface StatLike {
  platform?: string;
  extras?: {
    profilePictureUrl?: string | null;
    [k: string]: unknown;
  } | null;
}

interface ProfileLike {
  displayName: string;
  avatarKey?: string | null;
}

interface RawProps {
  avatarKey?: string | null;
  socialPic?: string | null;
  fallback: string;
  size?: number;
  className?: string;
}

interface ProfileProps {
  profile: ProfileLike;
  stats?: StatLike[] | null;
  size?: number;
  className?: string;
}

type Props = RawProps | ProfileProps;

function isProfileProps(p: Props): p is ProfileProps {
  return 'profile' in p && p.profile !== undefined;
}

/** First platform stats row that carries a usable profilePictureUrl.
 *  Iteration order matters less than the rule "any > none"; the brand-
 *  side detail page picks `stats[0]` anyway via sortStats. */
function pickSocialPic(stats: StatLike[] | null | undefined): string | null {
  if (!stats || stats.length === 0) return null;
  for (const s of stats) {
    const u = s?.extras?.profilePictureUrl;
    if (typeof u === 'string' && u.length > 0) return u;
  }
  return null;
}

export function CreatorAvatar(props: Props) {
  const size = props.size ?? 64;
  const className = props.className ?? '';
  const avatarKey = isProfileProps(props) ? props.profile.avatarKey ?? null : props.avatarKey ?? null;
  const socialPic = isProfileProps(props) ? pickSocialPic(props.stats ?? null) : props.socialPic ?? null;
  const fallback = isProfileProps(props) ? props.profile.displayName : props.fallback;

  // Resolved signed-GET for the S3 avatar. Empty until the fetch
  // resolves (or stays empty if avatarKey is missing / the fetch
  // fails — both flow into the social pic / initial fallback).
  const [s3Src, setS3Src] = useState<string | null>(null);
  // Track which path is currently rendering for graceful onError
  // chaining — if the S3 signed URL 4xxs (e.g. key deleted, expired
  // signature) we want to fall through to the social pic, not show a
  // broken-image icon.
  const [stage, setStage] = useState<'s3' | 'social' | 'initial'>(
    avatarKey ? 's3' : socialPic ? 'social' : 'initial',
  );

  useEffect(() => {
    if (!avatarKey) {
      setS3Src(null);
      setStage(socialPic ? 'social' : 'initial');
      return;
    }
    let cancelled = false;
    setStage('s3');
    fetch(`${RIPLLO_BASE}/api/v1/uploads/avatar?key=${encodeURIComponent(avatarKey)}`, {
      credentials: 'include',
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (cancelled) return;
        const url = b?.data?.url;
        if (typeof url === 'string' && url.length > 0) {
          setS3Src(url);
        } else {
          setS3Src(null);
          setStage(socialPic ? 'social' : 'initial');
        }
      })
      .catch(() => {
        if (cancelled) return;
        setS3Src(null);
        setStage(socialPic ? 'social' : 'initial');
      });
    return () => { cancelled = true; };
  }, [avatarKey, socialPic]);

  const proxiedSocial = socialImageSrc(socialPic);
  const initial = (fallback?.charAt(0) ?? '?').toUpperCase();

  // Initial-letter placeholder uses the theme `--primary` HSL so it
  // tracks brand color across the family without a static hex.
  const initialClasses =
    'flex shrink-0 items-center justify-center rounded-full font-bold text-primary';
  const initialBg = { background: 'hsl(var(--primary) / 0.15)' };
  // Font scales linearly with size so 80px renders ~2× the 40px glyph.
  const fontSize = Math.max(12, Math.round(size * 0.4));

  // Decide what to render in the bubble. Outer span owns the box; we
  // render <img> when a usable src is available for the current stage,
  // else fall through to the initial-letter placeholder. The img's
  // onError advances stage so an S3 4xx demotes to social, social 4xx
  // demotes to initial — never a broken-image icon.
  let src: string | null = null;
  if (stage === 's3') src = s3Src;
  else if (stage === 'social') src = proxiedSocial;

  return (
    <span
      style={{ width: size, height: size, ...(src ? {} : initialBg) }}
      className={`${initialClasses} overflow-hidden border border-border bg-card ${className}`}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover"
          onError={() => {
            if (stage === 's3') {
              setStage(socialPic ? 'social' : 'initial');
            } else if (stage === 'social') {
              setStage('initial');
            }
          }}
        />
      ) : (
        <span style={{ fontSize }}>{initial}</span>
      )}
    </span>
  );
}
