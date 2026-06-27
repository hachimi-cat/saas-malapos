/*
 * Shared UI utilities for the dashboard.
 *
 * `cn` is the shadcn-standard merger: clsx for conditional joining +
 * tailwind-merge so that a className override actually REPLACES a
 * conflicting utility (e.g. `flex-row` wins over a component's default
 * `flex-col`) instead of both ending up on the element and the cascade
 * picking the wrong one. The dependency-free joiner this replaced caused
 * layout bugs everywhere component classes were overridden.
 *
 * Money is IDR integers (no decimals) — formatCurrency renders Rp.
 */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
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
