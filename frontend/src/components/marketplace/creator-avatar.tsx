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
 *   1. `avatarKey` — uploaded by the creator to S3. Rendered via this
 *      product's same-origin image passthrough
 *      (`/api/v1/account/marketing-media/avatar?key=...`,
 *      backend routes/marketing-media.ts), which resolves the signed S3
 *      URL on Ripllo and streams the bytes. Same-origin so the browser
 *      sends the session cookie and skips the CORS-blocked signed-URL
 *      fetch the old client flow used.
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
import { socialImageSrc, API_BASE } from '@/lib/social-image';

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

  // Same-origin avatar URL. The merchant backend resolves the creator's
  // short-lived signed S3 URL from `avatarKey` and streams the bytes, so
  // the browser loads it with the session cookie and no CORS preflight —
  // no client-side signed-URL fetch. Null when there's no key.
  const avatarSrc = avatarKey
    ? `${API_BASE}/api/v1/account/marketing-media/avatar?key=${encodeURIComponent(avatarKey)}`
    : null;

  // Track which path is currently rendering for graceful onError
  // chaining — if the avatar 4xxs (e.g. key deleted, expired upstream
  // signature) we fall through to the social pic, not a broken-image
  // icon.
  const [stage, setStage] = useState<'s3' | 'social' | 'initial'>(
    avatarKey ? 's3' : socialPic ? 'social' : 'initial',
  );

  // Reset the render stage when inputs change — the component is reused
  // across rows (directory list, remapped props).
  useEffect(() => {
    setStage(avatarKey ? 's3' : socialPic ? 'social' : 'initial');
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
  // onError advances stage so an avatar 4xx demotes to social, social
  // 4xx demotes to initial — never a broken-image icon.
  let src: string | null = null;
  if (stage === 's3') src = avatarSrc;
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
