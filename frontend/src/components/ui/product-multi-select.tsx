'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Check, Search, Loader2, X, Package } from 'lucide-react';
import { productsApi, type Product } from '@/lib/marketing-api';

/**
 * ProductMultiSelect — searchable multi-select of merchant products with
 * thumbnail + name + price. Fetches the account's products once on open.
 *
 * Same interaction pattern as SearchableSelect but for multi-pick: opens a
 * popover below the trigger, shows a search input + list with checkboxes,
 * shows selected items as dismissable chips on the trigger.
 */

export interface ProductMultiSelectProps {
  label: string;
  value: string[]; // product IDs
  onChange: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
}

function formatPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat(currency === 'USD' ? 'en-US' : 'id-ID', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(amount);
}

export function ProductMultiSelect({
  label,
  value,
  onChange,
  placeholder = 'Pick products…',
  disabled = false,
  required = false,
}: ProductMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load products lazily on first open, cache in state. If the merchant
  // creates a new product later, close and reopen to refresh.
  useEffect(() => {
    if (!open || products.length > 0 || loading) return;
    setLoading(true); setError('');
    productsApi.list({ limit: 100 })
      .then((r) => setProducts(r.data ?? []))
      .catch(() => setError('Failed to load products'))
      .finally(() => setLoading(false));
  }, [open, products.length, loading]);

  const selectedMap = useMemo(() => new Set(value), [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, query]);

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

  function toggle(id: string) {
    if (selectedMap.has(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
  }

  function removeChip(id: string) {
    onChange(value.filter((v) => v !== id));
  }

  const selectedProducts = products.filter((p) => selectedMap.has(p.id));
  // Stale fallback: value may include IDs whose product hasn't been loaded yet
  // (cache miss on first render). Render those as bare chips.
  const staleIds = value.filter((id) => !products.some((p) => p.id === id));

  return (
    <div ref={rootRef} className="relative">
      <label className="mb-1 block text-xs font-medium">
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((x) => !x)}
        className={`flex w-full min-h-[40px] items-center justify-between gap-2 rounded border border-border bg-background px-2 py-1.5 text-left text-sm focus:outline-none focus:ring-1 focus:ring-primary ${
          disabled ? 'cursor-not-allowed opacity-60' : 'hover:bg-muted/30'
        }`}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          {value.length === 0 ? (
            <span className="px-1 text-muted-foreground">{placeholder}</span>
          ) : (
            <>
              {selectedProducts.map((p) => (
                <span key={p.id} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs">
                  {p.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.thumbnail} alt="" className="h-4 w-4 shrink-0 rounded object-cover" />
                  ) : null}
                  <span className="max-w-[120px] truncate">{p.name}</span>
                  <button type="button" onClick={(e) => { e.stopPropagation(); removeChip(p.id); }}
                    className="rounded p-0.5 hover:bg-background" aria-label={`Remove ${p.name}`}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              {staleIds.map((id) => (
                <span key={id} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                  {id.slice(0, 10)}…
                  <button type="button" onClick={(e) => { e.stopPropagation(); removeChip(id); }}
                    className="rounded p-0.5 hover:bg-background">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </>
          )}
        </div>
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
              placeholder="Search products…"
              className="w-full bg-transparent text-sm focus:outline-none"
            />
          </div>
          <ul className="max-h-64 overflow-y-auto">
            {loading ? (
              <li className="flex items-center justify-center px-3 py-6 text-xs text-muted-foreground">
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Loading…
              </li>
            ) : error ? (
              <li className="px-3 py-4 text-center text-xs text-red-600">{error}</li>
            ) : filtered.length === 0 ? (
              <li className="px-3 py-4 text-center text-xs text-muted-foreground">
                {products.length === 0 ? 'No products yet' : 'No matches'}
              </li>
            ) : filtered.map((p) => {
              const selected = selectedMap.has(p.id);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => toggle(p.id)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted ${selected ? 'bg-primary/5' : ''}`}
                  >
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background'}`}>
                      {selected && <Check className="h-3 w-3" />}
                    </span>
                    {p.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.thumbnail} alt="" className="h-7 w-7 shrink-0 rounded object-cover" />
                    ) : (
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-muted">
                        <Package className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{p.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {formatPrice(p.price, p.currency)} · {p.type}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
