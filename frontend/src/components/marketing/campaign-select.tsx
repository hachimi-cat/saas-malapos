'use client';

/*
 * Shared "Tie to campaign" dropdown.
 *
 * Fetches /api/v1/account/marketing/marketing-campaigns/_/selector once
 * (the storlaunch BFF catch-all proxies to ripllo's
 * /api/v1/marketing-campaigns/_/selector) and renders a native <select>
 * mapping each non-archived MarketingCampaign to its id. "None" is the
 * default for entities that aren't tied to a campaign.
 *
 * Reused on every create/edit form for the 6 child entity types under
 * storlaunch's marketing module:
 *  - Discount code
 *  - Blog post
 *  - Referral program
 *  - Abandoned-cart config
 *  - Merchant feed config
 *  - Affiliate program
 *
 * The backend's selector endpoint already filters to status ∈
 * {draft, live, paused}; archived + completed campaigns aren't shown
 * so old links don't clutter new forms.
 *
 * Mirrors ripllo's saas-ripllo CampaignSelect component shape so the
 * UX matches between products that share marketing surfaces.
 */

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { marketingFetch } from '@/lib/marketing-api';

export interface CampaignOption {
  id: string;
  name: string;
  status: 'draft' | 'live' | 'paused';
  goal: 'awareness' | 'conversion' | 'retention' | 'launch' | 'other';
}

interface Props {
  value: string | null;
  onChange: (id: string | null) => void;
  /** Label shown above the select. Default: "Campaign (optional)". */
  label?: string;
  /** Help text shown below. Default: explainer string. */
  help?: string;
  /** Disable the input (e.g. during submit). */
  disabled?: boolean;
  /** Extra Tailwind classes for the <select>. */
  className?: string;
  /**
   * Drop the label + help-text wrapper entirely and render just the
   * <select>. Use this when embedding inline in a table cell so the
   * row stays compact (no empty placeholders). The full labeled form
   * is the default for create/edit forms.
   */
  compact?: boolean;
}

export function CampaignSelect({ value, onChange, label = 'Campaign (optional)', help, disabled, className = '', compact = false }: Props) {
  const [options, setOptions] = useState<CampaignOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    marketingFetch('/api/v1/account/marketing/marketing-campaigns/_/selector')
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((b) => {
        if (cancelled) return;
        // BFF wraps the SDK `passthrough` result (which already unwrapped
        // ripllo's `data` field) back into storlaunch's envelope, so
        // shape is `{ data: { campaigns: [...] } }`.
        const list = Array.isArray(b?.data?.campaigns) ? (b.data.campaigns as CampaignOption[]) : [];
        setOptions(list);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        // Non-fatal — the dropdown still renders with just "None".
        setError((e instanceof Error) ? e.message : 'load failed');
        setOptions([]);
      });
    return () => { cancelled = true; };
  }, []);

  const selectEl = (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
      disabled={disabled || options === null}
      className={`w-full rounded-md border border-border bg-background px-3 py-2 text-sm disabled:opacity-60 ${className}`}
    >
      <option value="">None — standalone</option>
      {(options ?? []).map((o) => (
        <option key={o.id} value={o.id}>
          {o.name} {o.status !== 'live' ? `(${o.status})` : ''}
        </option>
      ))}
    </select>
  );

  if (compact) {
    // Inline-cell mode: just the select, no label/help wrapper so the
    // row stays tight. Callers wrap with their own min-width container
    // if needed.
    return selectEl;
  }

  const helpText = help ?? 'Group this with other marketing items under one Campaign for combined reporting. Leave blank for standalone.';

  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {label}
        {options === null && <Loader2 className="h-3 w-3 animate-spin" />}
      </span>
      {selectEl}
      {error ? (
        <span className="mt-1 block text-xs text-muted-foreground">Couldn&apos;t load campaigns — you can still save standalone.</span>
      ) : (
        <span className="mt-1 block text-xs text-muted-foreground">{helpText}</span>
      )}
    </label>
  );
}
