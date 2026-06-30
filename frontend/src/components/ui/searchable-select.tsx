'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Check, Search, Loader2 } from 'lucide-react';

/**
 * Searchable combobox. Keyboard-navigable, inline filter, works with
 * 38 provinces or 83,000 villages.
 *
 * Keep it dependency-free so we don't pull in a UI lib for one widget.
 */

export interface SearchableSelectOption {
  value: string;
  label: string;
  image?: string | null; // optional thumbnail shown beside the label
  subtext?: string; // optional secondary line below the label
}

export interface SearchableSelectProps {
  label: string;
  value: string | null;
  options: SearchableSelectOption[];
  onChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  required?: boolean;
}

export function SearchableSelect({
  label,
  value,
  options,
  onChange,
  placeholder = 'Select…',
  disabled = false,
  loading = false,
  required = false,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => { setFocusedIndex(0); }, [query, open]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  function pick(opt: SearchableSelectOption) {
    onChange(opt.value);
    setOpen(false);
    setQuery('');
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[focusedIndex]) pick(filtered[focusedIndex]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <label className="mb-1 block text-xs font-medium">
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((x) => !x)}
        className={`flex w-full items-center justify-between gap-2 rounded border border-border bg-background px-3 py-2 text-left text-sm focus:outline-none focus:ring-1 focus:ring-primary ${
          disabled ? 'cursor-not-allowed opacity-60' : 'hover:bg-muted/30'
        }`}
      >
        <span className="flex min-w-0 items-center gap-2">
          {loading
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : selected?.image
              ? (
                // Product thumbnails from merchant uploads — dynamic src, native img is fine.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selected.image} alt="" className="h-6 w-6 shrink-0 rounded object-cover" />
              ) : null}
          <span className={`truncate ${selected ? '' : 'text-muted-foreground'}`}>
            {selected?.label ?? placeholder}
          </span>
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>
      {open && !disabled && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-border bg-background shadow-lg">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={`Search ${label.toLowerCase()}…`}
              className="w-full bg-transparent text-sm focus:outline-none"
            />
          </div>
          <ul role="listbox" className="max-h-64 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-3 py-4 text-center text-xs text-muted-foreground">No matches</li>
            ) : filtered.map((opt, i) => (
              <li key={opt.value}>
                <button
                  type="button"
                  onClick={() => pick(opt)}
                  onMouseEnter={() => setFocusedIndex(i)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                    i === focusedIndex ? 'bg-muted' : ''
                  } ${opt.value === value ? 'font-medium text-primary' : ''}`}
                >
                  {opt.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={opt.image} alt="" className="h-7 w-7 shrink-0 rounded object-cover" />
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{opt.label}</span>
                    {opt.subtext && <span className="block truncate text-xs text-muted-foreground">{opt.subtext}</span>}
                  </span>
                  {opt.value === value && <Check className="h-3.5 w-3.5 shrink-0" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
