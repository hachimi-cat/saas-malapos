import type { Metadata } from 'next';

/*
 * FORKERS: structural placeholder — have it reviewed before launch.
 * The PT Forjio entity, Bengkulu jurisdiction, and refund cross-link
 * are family-stable.
 */

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Malapos Terms of Service. The rules for using the platform.',
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-20">
      <h1 className="text-4xl font-bold tracking-tight">Terms of Service</h1>
      <p className="mt-4 text-sm text-muted-foreground">Last updated: [DATE]</p>

      <div className="mt-10 space-y-8 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="text-lg font-semibold text-foreground">1. Acceptance of Terms</h2>
          <p className="mt-3">
            By creating an account or using Malapos, you agree to these terms. If you
            don&apos;t agree, don&apos;t use the service.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">2. Account Responsibilities</h2>
          <p className="mt-3">
            You are responsible for maintaining the security of your account and API keys,
            and for all activity that occurs under your account. Do not share your API keys
            or credentials.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">3. Acceptable Use</h2>
          <p className="mt-3">
            You may not use Malapos for illegal content, spam, content that violates
            intellectual property rights, or content that promotes violence or hate speech.
            We reserve the right to disable resources or accounts that violate this policy.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">4. Service Tiers &amp; Billing</h2>
          <p className="mt-3">
            Free accounts are subject to the usage limits described on our pricing page.
            Paid subscriptions are billed monthly in IDR (USD via PayPal for international
            customers). You can cancel at any time — access continues until the end of the
            current billing period.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">5. Data Ownership</h2>
          <p className="mt-3">
            You own your data. We provide export tools so you can take your data with you.
            We do not claim ownership of any content you create through the service.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">6. Service Availability</h2>
          <p className="mt-3">
            We target 99.9% uptime but do not guarantee uninterrupted service. We may
            perform maintenance with reasonable notice. We are not liable for downtime or
            data loss caused by circumstances beyond our control.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">7. Termination</h2>
          <p className="mt-3">
            You may delete your account at any time. We may terminate accounts that violate
            these terms. Upon termination, your data is deleted within 30 days as described
            in our Privacy Policy.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">8. Changes to Terms</h2>
          <p className="mt-3">
            We may update these terms from time to time. Material changes are communicated
            via email or dashboard notification at least 14 days before they take effect.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">9. Limitation of Liability</h2>
          <p className="mt-3">
            Malapos is provided &quot;as is&quot; without warranties of any kind. To the
            maximum extent permitted by law, Forjio is not liable for any indirect, incidental,
            special, or consequential damages arising from your use of the service. Our total
            liability for any claim shall not exceed the amount you paid us in the 3 months
            prior to the claim.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">10. Governing Law</h2>
          <p className="mt-3">
            These Terms are governed by the laws of the Republic of Indonesia. Disputes shall
            first be resolved through good-faith negotiation; if that fails within 30 days,
            disputes shall be submitted to the District Court of Bengkulu (Pengadilan Negeri
            Bengkulu).
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">11. Refunds</h2>
          <p className="mt-3">
            Refunds for Malapos subscription fees are governed by our{' '}
            <a href="/refund" className="text-primary hover:underline">Refund Policy</a>. By
            subscribing you agree to that policy.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">12. Legal Entity &amp; Contact</h2>
          <p className="mt-3">
            Malapos is operated by <strong>PT Forjio Teknologi Indonesia</strong>.
          </p>
          <p className="mt-2">
            Jl. Parkit, Blok I, No. 48, RT 004, RW 001, Cempaka Permai, Gading Cempaka, Bengkulu,
            Bengkulu 38221
          </p>
          <p className="mt-2">
            Phone / WhatsApp:{' '}
            <a href="tel:+6281529990219" className="font-mono text-primary hover:underline">
              +62 815-2999-0219
            </a>
            <br />
            Email:{' '}
            <a href="mailto:support@forjio.com" className="font-mono text-primary hover:underline">
              support@forjio.com
            </a>{' '}
            (subject line tag: [legal])
          </p>
        </section>
      </div>
    </div>
  );
}
