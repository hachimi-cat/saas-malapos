import { CurrencyToggle } from '@/components/currency-toggle';

/**
 * The footer currency row — same position, same border, same 12px type
 * as storlaunch's, so a merchant who has seen one Forjio site knows
 * where to look on the other.
 *
 * Below MarketingFooter rather than inside it: the shared footer takes
 * `columns` and has no slot for arbitrary content, and a currency choice
 * is not a column of links.
 */
export function CurrencyRow() {
  return (
    <div className="border-t border-border/50">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-4 text-xs text-muted-foreground md:px-6">
        <span className="uppercase tracking-wider">Currency</span>
        <CurrencyToggle />
        <span className="text-muted-foreground/70">
          Rupiah is paid by QRIS, virtual account, e-wallet or card; US dollars settle through
          PayPal.
        </span>
      </div>
    </div>
  );
}
