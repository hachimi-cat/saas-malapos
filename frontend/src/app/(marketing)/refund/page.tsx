import type { Metadata } from 'next';

/*
 * FORKERS: structural placeholder — have it reviewed before launch.
 * Mirrors the family refund stance (advance billing, non-refundable
 * current period, refund only on duplicate/error/outage).
 */

export const metadata: Metadata = {
  title: 'Refund Policy — Malapos',
  description: 'Malapos refund policy for subscription fees.',
};

export default function RefundPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight">Refund Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: [DATE]</p>
      </div>

      <div className="space-y-10 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="text-lg font-semibold text-foreground">1. Subscription Fees</h2>
          <p className="mt-3">
            Malapos sells access to the platform via monthly and annual subscription
            plans. Subscription fees are charged in advance for the upcoming billing period
            and are non-refundable for the current period once it has started.
          </p>
          <p className="mt-3">
            You can cancel a subscription at any time from your dashboard. Cancellation stops
            the next renewal — your access continues to the end of the period you have
            already paid for, and you will not be charged again.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">2. When We Will Issue a Refund</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>
              <strong>Duplicate charges</strong> — if you were charged twice for the same
              period due to a payment-system error, we refund the duplicate within 7 business
              days of confirmation.
            </li>
            <li>
              <strong>Service unavailable for &gt;24 consecutive hours</strong> in a billing
              period due to an issue on our side (excluding announced maintenance) — pro-rated
              credit on your next invoice, or a refund on request.
            </li>
            <li>
              <strong>Charged after cancellation</strong> — if a renewal was charged after a
              successful cancellation, we refund in full within 7 business days.
            </li>
            <li>
              <strong>Unauthorised charges</strong> — contact support immediately; we work
              with you and the payment provider to resolve and refund where applicable.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">3. When We Will Not Issue a Refund</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>Partial-period cancellation — the current period was consumed; no mid-cycle pro-rate.</li>
            <li>Change of mind after the trial period. Free tiers are available — use them first.</li>
            <li>Failure to use the service — no refund for unused time within an active subscription.</li>
            <li>Plan downgrades — the new tier applies from the next renewal; no credit for the higher tier already paid.</li>
            <li>Annual plans cancelled mid-year — cancellation stops the next renewal; the current 12-month period is not refunded.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">4. How to Request a Refund</h2>
          <p className="mt-3">
            Email{' '}
            <a href="mailto:support@forjio.com" className="font-mono text-primary hover:underline">
              support@forjio.com
            </a>{' '}
            with the account email, the invoice number or charge date, and the reason. We
            respond within 2 business days. Approved refunds are issued to the original
            payment method within 7 business days.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">5. Governing Law</h2>
          <p className="mt-3">
            This Refund Policy is governed by the laws of the Republic of Indonesia. PT Forjio
            Teknologi Indonesia is the legal entity behind Malapos.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">6. Contact</h2>
          <p className="mt-3">
            <strong>PT Forjio Teknologi Indonesia</strong>
            <br />
            Jl. Parkit, Blok I, No. 48, RT 004, RW 001, Cempaka Permai, Gading Cempaka, Bengkulu,
            Bengkulu 38221
            <br />
            Phone / WhatsApp:{' '}
            <a href="tel:+6281529990219" className="font-mono text-primary hover:underline">
              +62 815-2999-0219
            </a>
            <br />
            Email:{' '}
            <a href="mailto:support@forjio.com" className="font-mono text-primary hover:underline">
              support@forjio.com
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
