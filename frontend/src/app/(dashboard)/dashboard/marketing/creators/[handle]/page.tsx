'use client';

/*
 * Marketing Creator profile — full detail view, 1:1 with Ripllo's own
 * brand-side creator profile page (`/dashboard/creators/[handle]`).
 *
 * Fetches through the marketing passthrough:
 *   - detail:  GET /api/v1/account/marketing/marketplace/creators/:handle
 *              → ripllo /api/v1/marketplace/creators/:handle
 *   - history: GET /api/v1/account/marketing/creator-stats/:handle/history?days=30
 *              → ripllo /api/v1/creator-stats/:handle/history?days=30
 * and renders the shared `CreatorDetailView` (ported verbatim from
 * saas-ripllo). Avatars + post thumbnails load from ripllo.com absolute
 * URLs — this product serves no img-proxy/uploads route of its own
 * (see lib/social-image). The history call degrades silently: each
 * platform panel renders its own empty-state when history is [].
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, Camera } from 'lucide-react';
import { ErrorBox } from '@/components/dashboard/ui';
import { BackLink } from '@/components/dashboard/back-link';
import { marketingFetch } from '@/lib/marketing-api';
import { Card } from '@/components/ui/card';
import {
  CreatorDetailView,
  type CreatorDetail,
} from '@/components/marketplace/creator-detail-view';

type HistoryByPlatform = Record<string, { day: string; followers: number }[]>;

export default function CreatorProfilePage() {
  const params = useParams<{ handle: string }>();
  const handle = params?.handle ?? '';
  const [creator, setCreator] = useState<CreatorDetail | null>(null);
  const [historyByPlatform, setHistoryByPlatform] = useState<HistoryByPlatform>({});
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!handle) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNotFound(false);

    (async () => {
      try {
        const r = await marketingFetch(
          `/api/v1/account/marketing/marketplace/creators/${encodeURIComponent(handle)}`,
          { credentials: 'include' },
        );
        if (r.status === 404) {
          if (!cancelled) setNotFound(true);
          return;
        }
        const b = await r.json();
        if (!r.ok) {
          if (!cancelled) setError(b?.error?.message ?? 'failed to load');
          return;
        }
        if (!cancelled) setCreator((b?.data as CreatorDetail) ?? null);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    // Time-series follower history keyed by platform. Fetched in
    // parallel; failures degrade silently — the panel renders an
    // empty-state when its `history` is [].
    marketingFetch(
      `/api/v1/account/marketing/creator-stats/${encodeURIComponent(handle)}/history?days=30`,
      { credentials: 'include' },
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (cancelled) return;
        const snaps = (b?.data?.snapshots ?? []) as Array<{
          day: string;
          platform: string;
          followers: number;
        }>;
        const grouped: HistoryByPlatform = {};
        for (const s of snaps) {
          if (!grouped[s.platform]) grouped[s.platform] = [];
          grouped[s.platform]!.push({ day: s.day, followers: s.followers });
        }
        setHistoryByPlatform(grouped);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [handle]);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl">
        <BackLink href="/dashboard/marketing/creators" label="Creator directory" />
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-6xl">
        <BackLink href="/dashboard/marketing/creators" label="Creator directory" />
        <Card className="border-dashed p-12 text-center">
          <Camera size={28} className="mx-auto text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">No creator found for @{handle}.</p>
        </Card>
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

  return (
    <div className="mx-auto max-w-6xl">
      <BackLink href="/dashboard/marketing/creators" label="Creator directory" />
      {error && <ErrorBox>{error}</ErrorBox>}
      <CreatorDetailView c={creator} historyByPlatform={historyByPlatform} />
    </div>
  );
}
