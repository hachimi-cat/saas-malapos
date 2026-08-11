'use client';

import { Price } from '@forjio/website-ui';

import { useCurrency } from '@/lib/currency';

/**
 * A marketing price, in the currency the reader chose.
 *
 * `<Price>` on its own reads `useLocale()` from @forjio/website-ui, which
 * guesses from the device timezone, caches in sessionStorage, and cannot
 * be told otherwise. That is the right answer for a first paint and the
 * wrong one for a toggle: the reader clicks "$" and every price on the
 * page carries on saying Rp.
 *
 * It is also a SECOND source of truth. `lib/currency.ts` (localStorage) is
 * what the checkout call actually bills on, so leaving the marketing
 * prices on the guess means the pricing page and the invoice can disagree.
 * This wrapper closes both problems the same way: one preference, passed
 * down as `forceCurrency`.
 */
export function ProductPrice({
  idr,
  usdCents,
  per,
  className,
}: {
  /** Whole rupiah — IDR has no minor unit. */
  idr: number;
  /** US cents. */
  usdCents: number;
  per?: string;
  className?: string;
}) {
  const { currency } = useCurrency();
  return (
    <Price idr={idr} usdCents={usdCents} per={per} forceCurrency={currency} className={className} />
  );
}
