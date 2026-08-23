'use client';

import { useSyncExternalStore } from 'react';

/**
 * Display + billing currency preference (storlaunch's lib/currency.ts,
 * transcribed — the family pattern).
 *
 * Malapos sells to Indonesian shops, but the currency choice is still a
 * first-class visible preference family-wide: an owner abroad, or a
 * buyer who simply prefers settling in dollars, picks USD and pays
 * through PayPal; rupiah rides QRIS/VA/e-wallet/card.
 *
 * Why this is not `useLocale()` from @forjio/website-ui: that hook
 * answers "what should we GUESS for an anonymous visitor", resolves once
 * per session, and has no persistence. This is a saved preference.
 * (It also can't be imported here — website-ui has no subpath exports,
 * so pulling `useLocale` drags in MarketingNav and `next/link`, which
 * resolves under Next and not under vitest.)
 *
 * localStorage, not session: a currency choice should survive closing
 * the tab.
 */

export type Currency = 'IDR' | 'USD';

/**
 * USD billing is suspended.
 *
 * PayPal permanently closed the account that settled every USD charge on
 * 2026-08-23, and PayPal is the only USD payment method Plugipay offers —
 * so a price shown in dollars has nothing behind it. Until a replacement
 * USD rail exists, every price reads in rupiah and the toggle does not
 * render.
 *
 * Re-enable by setting this to true. Nothing else needs touching:
 * detection, the stored preference, the toggle and every price that reads
 * through this module all follow it.
 *
 * Typed as `boolean` rather than inferred, so flipping it back does not
 * make the other branch look unreachable to the compiler.
 */
export const USD_BILLING_ENABLED: boolean = false;

const ALL_CURRENCIES: { code: Currency; label: string }[] = [
  { code: 'IDR', label: 'Rupiah (IDR)' },
  { code: 'USD', label: 'US Dollar (USD)' },
];

/** What a reader may actually choose between. One entry means there is
 *  no choice to offer, and the picker hides itself. */
export const CURRENCIES: { code: Currency; label: string }[] =
  ALL_CURRENCIES.filter((c) => USD_BILLING_ENABLED || c.code === 'IDR');

const STORAGE_KEY = 'malapos.currency.v1';

// Indonesia spans four zones — one per WIB/WITA/WIT plus Pontianak. Kept
// in step with the same list in @forjio/website-ui's useLocale.
const INDONESIAN_TIMEZONES = new Set([
  'Asia/Jakarta',
  'Asia/Pontianak',
  'Asia/Makassar',
  'Asia/Jayapura',
]);

/** Best guess before the user has said anything. Timezone first — it
 *  survives a VPN and ignores UI language, so an Indonesian phone set to
 *  en-US still reads as Indonesian. Falls back to the language region. */
export function detectCurrency(): Currency {
  if (!USD_BILLING_ENABLED) return 'IDR';
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && INDONESIAN_TIMEZONES.has(tz)) return 'IDR';
    if (tz) return 'USD';
  } catch {
    // Some embedded webviews don't expose Intl — fall through.
  }
  if (typeof navigator === 'undefined') return 'IDR';
  const tags = [navigator.language, ...(navigator.languages ?? [])].filter(Boolean);
  if (tags.some((t) => t.toLowerCase().startsWith('id'))) return 'IDR';
  return tags.length > 0 ? 'USD' : 'IDR';
}

function readStored(): Currency | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'IDR' || v === 'USD' ? v : null;
  } catch {
    return null; // storage throws in some privacy modes
  }
}

/**
 * ONE value, shared by every component that asks for it.
 *
 * A `useState` inside the hook would be N disagreeing copies — the
 * picker on the billing page and the prices on the pricing table would
 * each hold their own currency and neither would tell the other
 * (storlaunch shipped exactly that once). The value lives at module
 * scope and the hook subscribes via useSyncExternalStore.
 */
let current: Currency | null = null;
const listeners = new Set<() => void>();

function snapshot(): Currency {
  if (current === null) current = readStored() ?? detectCurrency();
  // Anyone who chose USD before it was suspended still has it in
  // storage. Hiding the toggle alone would strand them on a currency
  // nothing can charge, so the stored value is corrected, not trusted.
  if (!USD_BILLING_ENABLED && current === 'USD') current = 'IDR';
  return current;
}

// The server (and the first client render, before hydration settles) has
// no storage and no timezone to read. IDR keeps the static markup and the
// first paint identical for the home market — nothing flashes for the
// readers we have most of.
function serverSnapshot(): Currency {
  return 'IDR';
}

// Bound once for the whole module rather than per subscriber. Another
// tab changing the preference is the only way this fires — our own
// writes notify directly.
let storageBound = false;
function bindStorage(): void {
  if (storageBound || typeof window === 'undefined') return;
  storageBound = true;
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return;
    current = e.newValue === 'IDR' || e.newValue === 'USD' ? e.newValue : null;
    listeners.forEach((l) => l());
  });
}

function subscribe(onChange: () => void): () => void {
  bindStorage();
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/** Set the preference everywhere at once. Module-scoped, so its identity
 *  is stable and it is safe in a dependency array. */
export function setCurrency(c: Currency): void {
  // Coerce rather than ignore: a stale bundle still holding the old
  // toggle must not be able to write a currency back into storage.
  const c2: Currency = !USD_BILLING_ENABLED && c === 'USD' ? 'IDR' : c;
  current = c2;
  try {
    localStorage.setItem(STORAGE_KEY, c2);
  } catch {
    // Preference is best-effort; the in-memory value still applies.
  }
  listeners.forEach((l) => l());
}

export function useCurrency(): {
  currency: Currency;
  setCurrency: (c: Currency) => void;
  /** false until the store has been read on the client — the value is
   *  still the IDR default and may yet change under the reader. */
  resolved: boolean;
} {
  const currency = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const resolved = useSyncExternalStore(subscribe, () => true, () => false);
  return { currency, setCurrency, resolved };
}

/** Test seam: drop the module-level value so the next read re-resolves
 *  from storage. Nothing in the app needs this — a real page gets a fresh
 *  module per load. */
export function __resetCurrencyForTests(): void {
  current = null;
  listeners.clear();
}
