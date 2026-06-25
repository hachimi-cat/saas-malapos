/*
 * Shared UI utilities for the dashboard. Ported from storlaunch's
 * lib/utils.ts, adapted to malapos (no clsx / tailwind-merge dependency
 * in the template — `cn` is a dependency-free class-name joiner).
 *
 * Money is IDR integers (no decimals) — formatCurrency renders Rp.
 */

type ClassValue = string | number | null | false | undefined | ClassValue[] | Record<string, boolean>;

function flatten(input: ClassValue, out: string[]): void {
  if (!input) return;
  if (typeof input === 'string' || typeof input === 'number') {
    out.push(String(input));
    return;
  }
  if (Array.isArray(input)) {
    for (const v of input) flatten(v, out);
    return;
  }
  if (typeof input === 'object') {
    for (const [k, v] of Object.entries(input)) {
      if (v) out.push(k);
    }
  }
}

export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];
  for (const i of inputs) flatten(i, out);
  return out.join(' ');
}

export function formatCurrency(amount: number, currency = 'IDR'): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('id-ID').format(num);
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date));
}
