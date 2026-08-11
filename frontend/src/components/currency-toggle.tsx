'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { setCurrency, useCurrency, type Currency } from '@/lib/currency';

/**
 * The visible currency choice — navbar, footer, billing pages
 * (storlaunch's currency-toggle, transcribed).
 *
 * The visible text is the symbol — "Rp" / "$" — because the footer row it
 * sits in is 12px and a navbar has no room for "Rupiah (IDR)". The full
 * name is the button's accessible name, so a screen reader hears the
 * currency rather than a lone dollar sign.
 */
export function CurrencyToggle({
  groupLabel = 'Currency',
  idrLabel = 'Rupiah (IDR)',
  usdLabel = 'US Dollar (USD)',
  className,
}: {
  /** Accessible name for the pair. */
  groupLabel?: string;
  /** Full name of the rupiah option. */
  idrLabel?: string;
  /** Full name of the dollar option. */
  usdLabel?: string;
  className?: string;
}) {
  const { currency } = useCurrency();

  return (
    <div
      role="group"
      aria-label={groupLabel}
      className={cn(
        'inline-flex h-8 items-center gap-0.5 rounded-md border border-border/60 px-0.5',
        className
      )}
    >
      <Segment code="IDR" symbol="Rp" label={idrLabel} active={currency === 'IDR'} />
      <Segment code="USD" symbol="$" label={usdLabel} active={currency === 'USD'} />
    </div>
  );
}

function Segment({
  code,
  symbol,
  label,
  active,
}: {
  code: Currency;
  symbol: string;
  label: string;
  active: boolean;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? 'secondary' : 'ghost'}
      // aria-pressed rather than aria-current: this is a control that
      // changes the page, not a link to where you already are.
      aria-pressed={active}
      aria-label={label}
      onClick={() => setCurrency(code)}
      className={cn(
        'h-6 px-2 text-xs font-medium',
        active ? 'text-foreground' : 'text-muted-foreground'
      )}
    >
      {symbol}
    </Button>
  );
}
