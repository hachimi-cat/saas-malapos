'use client';

/*
 * Shared helpers for the in-product admin portal pages, aligned with
 * the family standard set by pawpado's admin console: a DEFENSIVE
 * fetch that never surfaces a raw JSON.parse error (check content-type
 * before parsing), plus the shared date formatters.
 *
 * FORKERS: route every admin page's data access through `adminFetch`.
 */

// ─── Data access ────────────────────────────────────────────────────

/**
 * Fetch an admin BFF endpoint (same-origin `/api/v1/console/*` proxy,
 * cookies included) and unwrap the `{ data }` envelope.
 *
 * Defensive: if the response is not JSON (an HTML error page, an nginx
 * gateway error, a redirect to login…) we throw a clean message instead
 * of letting `res.json()` surface the browser's raw parse error
 * (Safari's reads "The string did not match the expected pattern").
 */
export async function adminFetch<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: 'include' });
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('json')) {
    throw new Error(
      res.ok
        ? 'The admin API returned an unexpected non-JSON response.'
        : `The admin API returned an unexpected response (HTTP ${res.status}). Try signing in again.`,
    );
  }
  const body = (await res.json()) as {
    data?: T;
    error?: { code?: string; message?: string };
  };
  if (!res.ok) {
    throw new Error(
      body?.error?.message ?? body?.error?.code ?? `Request failed (HTTP ${res.status})`,
    );
  }
  return (body?.data ?? (body as unknown)) as T;
}

// ─── Formatters ─────────────────────────────────────────────────────

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 'never';
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 60) return `${d}d ago`;
  return `${Math.round(d / 30)}mo ago`;
}
