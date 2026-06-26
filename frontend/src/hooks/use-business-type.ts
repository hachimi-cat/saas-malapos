'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export type BusinessType = 'GENERAL' | 'RETAIL' | 'FNB' | 'PHARMACY';

/**
 * The workspace business type (PosSettings.businessType, GET /settings).
 * F&B-only affordances — the Tables nav item + the sell-screen floor view —
 * gate on `isFnb`. Mirrors use-modules: a single fetch, safe defaults on
 * error. `GET /settings` auto-creates the row, so this never 404s.
 */
export function useBusinessType(): { businessType: BusinessType | null; isFnb: boolean; loading: boolean } {
  const [businessType, setBusinessType] = useState<BusinessType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ settings: { businessType: BusinessType } }>('/settings')
      .then((res) => {
        if (cancelled) return;
        setBusinessType(res.data?.settings?.businessType ?? 'GENERAL');
      })
      .catch(() => {
        // treat as non-F&B on error — safe default (hides the extra UI)
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { businessType, isFnb: businessType === 'FNB', loading };
}
