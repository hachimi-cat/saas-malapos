'use client';

import { CreditsSection } from '@/components/catentio/credits-section';
import { CurrencyToggle } from '@/components/currency-toggle';
import { PageHeader } from '@/components/dashboard/page-header';

/**
 * Agent credits, on their own page under Billing (the storlaunch shape,
 * bang 2026-08-08).
 *
 * It used to be the last section of /dashboard/billing, reached by a
 * `#credits` anchor from the sidebar chip. Its own route means the chip
 * lands on a page that is only about credits, and the balance is not
 * competing with plan cards for the top of the screen. The top-up
 * checkout's return URL (topupReturnPath in backend/src/routes/
 * catentio.ts) points here too.
 *
 * The currency control sits in the header slot exactly as it does on
 * /dashboard/billing: this page prices credit packs, and it is the same
 * account-wide preference either way — one value, not a per-page setting.
 *
 * CreditsSection renders nothing unless the catentio pilot flag is on for
 * this user, so for everyone else the page is a header and a blank space.
 * That is deliberate: the sidebar chip is flag-gated on the same signal,
 * so nobody without the flag has a link to arrive by.
 */
export default function AgentCreditsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Agent Credits"
        description="Assistant usage across every Forjio product, and the packs you can top up with."
        action={
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Currency</span>
            <CurrencyToggle />
          </div>
        }
      />
      <CreditsSection />
    </div>
  );
}
