'use client';

import { useEffect, useRef } from 'react';

/*
 * useRealtime — subscribe to the backend's F&B board SSE stream
 * (GET /api/v1/events/stream). Calls `onChange(topic)` whenever a relevant
 * mutation fires, so a board can refetch instantly instead of waiting for its
 * poll. EventSource reconnects natively on a dropped connection; we never
 * throw, so a transient backend blip just silently re-opens.
 *
 * Same-origin + cookie auth: the stream rides the BFF session cookie the same
 * way `api.ts` fetches do (`withCredentials`), so no token plumbing is needed.
 * The URL is derived from NEXT_PUBLIC_API_URL exactly like api.ts — in prod
 * that's the relative `/api/v1`, giving a same-origin `/api/v1/events/stream`.
 */

export type RealtimeTopic = 'kds' | 'floor' | 'serve';

// Mirror api.ts: NEXT_PUBLIC_API_URL may be a bare origin (dev) or already the
// `/api/v1` prefix (CI/prod). Strip a trailing /api/v1, then re-add it once.
const BASE_URL = (
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL) ||
  'http://localhost:4191'
).replace(/\/api\/v1\/?$/, '');

export function useRealtime(opts: {
  onChange: (topic: RealtimeTopic) => void;
  outletId?: string | null;
  enabled?: boolean;
}): void {
  const { outletId = null, enabled = true } = opts;
  // Keep the latest callback without re-opening the stream every render.
  const onChangeRef = useRef(opts.onChange);
  onChangeRef.current = opts.onChange;

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;

    const qs = outletId ? `?outletId=${encodeURIComponent(outletId)}` : '';
    const url = `${BASE_URL}/api/v1/events/stream${qs}`;

    let es: EventSource;
    try {
      es = new EventSource(url, { withCredentials: true });
    } catch {
      return; // EventSource unsupported / blocked — boards fall back to polling.
    }

    const handler = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as { topic?: RealtimeTopic };
        if (data.topic) onChangeRef.current(data.topic);
      } catch {
        /* ignore malformed frames */
      }
    };
    es.addEventListener('change', handler as EventListener);
    // Don't throw on error — EventSource auto-reconnects with backoff.
    es.onerror = () => {};

    return () => {
      es.removeEventListener('change', handler as EventListener);
      es.close();
    };
  }, [outletId, enabled]);
}
