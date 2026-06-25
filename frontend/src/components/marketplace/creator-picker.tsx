'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Search, Loader2, ExternalLink, X, Check } from 'lucide-react';
import { flagEmoji } from './countries';

interface CreatorRow {
  id: string;
  handle: string;
  displayName: string;
  bio: string | null;
  avatarKey: string | null;
  niches: string[];
  country: string | null;
}

interface Props {
  /** Currently selected creator (controlled). */
  value: CreatorRow | null;
  onChange: (creator: CreatorRow | null) => void;
  /** Optional list-side proxy override. Defaults to the merchant proxy. */
  apiBase?: string;
}

export function CreatorPicker({ value, onChange, apiBase = '/api/v1/account/marketing/marketplace/creators' }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CreatorRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Auto-focus on open.
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  // Debounced search. Empty query → fetch first 30 verified creators.
  useEffect(() => {
    if (!open) return;
    const q = query.trim().toLowerCase();
    let cancelled = false;
    const t = setTimeout(() => {
      setLoading(true);
      // The marketplace endpoint accepts ?niche= (we pass q as niche
      // since there's no fuzzy search yet — niche match is the closest
      // proxy). For empty q, fetch the latest 30.
      const url = q ? `${apiBase}?limit=30&niche=${encodeURIComponent(q)}` : `${apiBase}?limit=30`;
      fetch(url, { credentials: 'include' })
        .then((r) => r.json())
        .then((b) => {
          if (cancelled) return;
          let list: CreatorRow[] = Array.isArray(b?.data?.data) ? b.data.data : [];
          // Client-side fallback: also match handle / displayName for
          // queries that don't hit the niche field.
          if (q) {
            list = list.filter((c) =>
              c.handle.toLowerCase().includes(q) ||
              c.displayName.toLowerCase().includes(q) ||
              c.niches.some((n) => n.toLowerCase().includes(q)),
            );
            if (list.length === 0) {
              // Re-query without niche filter and apply client filter
              fetch(`${apiBase}?limit=30`, { credentials: 'include' })
                .then((r) => r.json())
                .then((b2) => {
                  if (cancelled) return;
                  const all: CreatorRow[] = Array.isArray(b2?.data?.data) ? b2.data.data : [];
                  setResults(
                    all.filter((c) =>
                      c.handle.toLowerCase().includes(q) ||
                      c.displayName.toLowerCase().includes(q) ||
                      c.niches.some((n) => n.toLowerCase().includes(q)),
                    ),
                  );
                  setLoading(false);
                })
                .catch(() => { if (!cancelled) { setResults([]); setLoading(false); } });
              return;
            }
          }
          setResults(list);
          setLoading(false);
        })
        .catch(() => { if (!cancelled) { setResults([]); setLoading(false); } });
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [open, query, apiBase]);

  return (
    <div ref={ref} className="relative">
      {value ? (
        <SelectedCard value={value} onClear={() => onChange(null)} />
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-2 rounded-md border border-border bg-background px-3 py-2.5 text-left text-sm text-muted-foreground hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <Search size={14} />
          Search verified creators by handle, name, or niche…
        </button>
      )}

      {open && (
        <div className="absolute z-30 mt-1 max-h-96 w-full overflow-hidden rounded-md border border-border bg-card shadow-lg">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search size={14} className="text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search creators…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {loading && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
          </div>
          <ul className="max-h-80 overflow-y-auto py-1">
            {results === null ? (
              <li className="px-3 py-6 text-center text-xs text-muted-foreground">Loading…</li>
            ) : results.length === 0 ? (
              <li className="px-3 py-6 text-center text-xs text-muted-foreground">No verified creators match.</li>
            ) : results.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => { onChange(c); setOpen(false); setQuery(''); }}
                  className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-secondary"
                >
                  <Avatar avatarKey={c.avatarKey} fallback={c.displayName} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{c.displayName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      @{c.handle}
                      {c.country && <> · {flagEmoji(c.country)} {c.country}</>}
                    </p>
                    {c.niches.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {c.niches.slice(0, 4).map((n) => (
                          <span key={n} className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{n}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SelectedCard({ value, onClear }: { value: CreatorRow; onClear: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-brand-500/30 bg-brand-500/5 p-3">
      <Avatar avatarKey={value.avatarKey} fallback={value.displayName} size={48} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Check size={14} className="text-emerald-500" />
          {value.displayName}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          @{value.handle}
          {value.country && <> · {flagEmoji(value.country)} {value.country}</>}
        </p>
        <Link
          href={`/creators/${value.handle}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-flex items-center gap-1 text-xs text-brand-500 hover:underline"
        >
          <ExternalLink size={11} /> View full profile
        </Link>
      </div>
      <button
        type="button"
        onClick={onClear}
        aria-label="Change creator"
        className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        <X size={14} />
      </button>
    </div>
  );
}

function Avatar({ avatarKey, fallback, size = 36 }: { avatarKey: string | null; fallback: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!avatarKey) { setSrc(null); return; }
    fetch(`/api/v1/account/marketing/uploads/avatar?key=${encodeURIComponent(avatarKey)}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((b) => { if (!cancelled && b?.data?.url) setSrc(b.data.url); })
      .catch(() => { /* fall back to initial */ });
    return () => { cancelled = true; };
  }, [avatarKey]);
  return (
    <span
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-500/15 text-base font-bold text-brand-500"
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        fallback.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}
