'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useCurrency } from '@/lib/currency';
import {
  startCreditsTopup,
  useCatentioCredits,
  useCatentioStatus,
  type CreditsCurrency,
  type CreditsLedgerRow,
  type CreditsPack,
} from '@/hooks/use-catentio';

/**
 * Billing → Credits — the agent layer's cost surface (linksnap's
 * credits-section.tsx ported). Mounts only when the assistant flag is
 * on for this user (flag off = the Billing page is unchanged). One
 * Forjio-wide balance: the same number shown in the sidebar chip and
 * in every Forjio product.
 *
 * Top-up packs go through the BFF to catentio's Plugipay hosted
 * checkout; the exact price is FX-computed at checkout creation, so the
 * buttons carry the credit amount only. The monthly grant arrives per
 * plan tier, claimed lazily on any balance read.
 */

function opLabel(row: CreditsLedgerRow): string {
  if (row.kind === 'topup') return 'Top-up';
  if (row.kind === 'adjustment') return 'Adjustment';
  if (row.kind === 'agent_credit_grant') return 'Monthly grant';
  if (row.surface === 'chat') return 'Chat turn';
  if (row.surface === 'search') return 'Search';
  return 'Assistant plan turn';
}

const PACKS: CreditsPack[] = ['500', '1200', '2600'];

export function CreditsSection() {
  const { enabled } = useCatentioStatus();
  const { credits, loading, refresh } = useCatentioCredits(enabled);
  const [buying, setBuying] = useState<CreditsPack | null>(null);
  // The account-wide currency preference — read-only here; the page
  // header's toggle is the one control that sets it.
  const { currency } = useCurrency();

  if (!enabled || (!credits && !loading)) return null;

  const balance = credits?.balance.credits ?? 0;
  // What the plan includes each month, straight from the CP's grant
  // table — the one figure a merchant needs to decide whether to top up.
  const grant = credits?.balance.monthly_grant_credits ?? 0;
  const ledger = credits?.ledger ?? [];

  const buy = async (pack: CreditsPack) => {
    setBuying(pack);
    try {
      const out = await startCreditsTopup(pack, currency as CreditsCurrency);
      if (out.checkoutUrl) {
        window.location.assign(out.checkoutUrl);
        return;
      }
      if (out.noop) {
        toast.info('Billing runs in internal mode here — no checkout needed.');
        refresh();
      } else {
        toast.error('Top-up is unavailable right now');
      }
    } catch {
      toast.error('Top-up is unavailable right now');
    } finally {
      setBuying(null);
    }
  };

  return (
    // No heading and no currency control of its own: this section owns
    // the whole /dashboard/billing/credits page, whose PageHeader already
    // carries the title and the currency toggle (the storlaunch shape).
    <section id="credits">
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight">
                {balance.toLocaleString()}
              </span>
              <span className="text-sm text-muted-foreground">credits</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              One balance across every Forjio product — spent by the assistant, priced per
              operation.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {PACKS.map((pack) => (
              <Button
                key={pack}
                variant="outline"
                size="sm"
                disabled={buying !== null}
                onClick={() => buy(pack)}
              >
                {buying === pack ? 'Opening checkout…' : `+${Number(pack).toLocaleString()}`}
              </Button>
            ))}
          </div>
        </div>

        <div className="mt-4 space-y-1">
          <p className="text-xs text-muted-foreground">
            {currency === 'USD'
              ? 'PayPal — credits land as soon as the payment clears.'
              : 'QRIS, virtual account, e-wallet or card — credits land as soon as the payment clears.'}
          </p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            {grant > 0
              ? `${grant.toLocaleString()} credits included each month on your plan — the exact pack price shows at checkout.`
              : 'Monthly grant included with your plan — the exact pack price shows at checkout.'}
          </p>
        </div>

        {ledger.length > 0 && (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">When</th>
                  <th className="py-2 pr-4 font-medium">Operation</th>
                  <th className="py-2 pr-4 font-medium">Product</th>
                  <th className="py-2 text-right font-medium">Credits</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((row, i) => (
                  <tr key={`${row.run_id ?? row.kind}-${i}`} className="border-b border-border/60">
                    <td className="py-2 pr-4 text-muted-foreground">
                      {row.at
                        ? new Date(row.at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })
                        : '—'}
                    </td>
                    <td className="py-2 pr-4">{opLabel(row)}</td>
                    <td className="py-2 pr-4">
                      {row.product ? (
                        <span className="rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
                          {row.product}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-2 text-right font-mono text-xs">
                      {row.credits > 0 ? `+${row.credits}` : row.credits}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
