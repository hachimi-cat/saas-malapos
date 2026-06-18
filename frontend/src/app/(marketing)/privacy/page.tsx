import type { Metadata } from 'next';

/*
 * FORKERS: this is a structural placeholder. Have it reviewed before
 * launch and adjust the product-specific clauses (what telemetry you
 * collect, retention windows, processors). The PT Forjio entity,
 * address, and UU PDP framing are family-stable.
 */

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Malapos Privacy Policy. How we handle your data.',
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-20">
      <h1 className="text-4xl font-bold tracking-tight">Privacy Policy</h1>
      <p className="mt-4 text-sm text-muted-foreground">Last updated: [DATE]</p>

      <div className="mt-10 space-y-8 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="text-lg font-semibold text-foreground">1. Information We Collect</h2>
          <p className="mt-3">
            When you create an account we collect your name, email address, and hashed
            password (identity is managed by Huudis). Describe here any additional usage
            telemetry Malapos records, and whether it is stored permanently.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">2. How We Use Your Data</h2>
          <p className="mt-3">
            Account data is used to authenticate you and manage your subscription. Usage
            data is used to provide the product&apos;s features. We do not sell your data,
            do not use it for advertising, and do not track you across other websites.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">3. Data Retention</h2>
          <p className="mt-3">
            State the retention window per plan. When you delete a record, associated
            data is permanently deleted. When you delete your account, all data is
            permanently deleted within 30 days.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">4. Data Export</h2>
          <p className="mt-3">
            You can export your data at any time via the dashboard or CLI, in CSV or JSON.
            Your data is yours.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">5. Cookies</h2>
          <p className="mt-3">
            We use essential cookies for authentication (session tokens). We do not use
            tracking cookies, advertising cookies, or third-party analytics.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">6. Security</h2>
          <p className="mt-3">
            Passwords are hashed; all data is transmitted over HTTPS and encrypted at rest.
            We follow security best practices for authentication, session management, and
            data storage.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">7. Third-Party Services</h2>
          <p className="mt-3">
            Payments are processed through Plugipay and its payment partners. We do not
            store your full card details. We use no third-party advertising networks,
            analytics SDKs, or tracking pixels.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">8. Governing Law</h2>
          <p className="mt-3">
            This Privacy Policy is governed by the laws of the Republic of Indonesia and
            handled in accordance with Indonesian data protection regulations.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">9. Data Controller &amp; Contact</h2>
          <p className="mt-3">The data controller for Malapos is:</p>
          <p className="mt-3">
            <strong>PT Forjio Teknologi Indonesia</strong>
            <br />
            Jl. Parkit, Blok I, No. 48, RT 004, RW 001, Cempaka Permai, Gading Cempaka, Bengkulu,
            Bengkulu 38221
            <br />
            Phone:{' '}
            <a href="tel:+6281529990219" className="font-mono text-primary hover:underline">
              +62 815-2999-0219
            </a>
            <br />
            Email:{' '}
            <a href="mailto:support@forjio.com" className="font-mono text-primary hover:underline">
              support@forjio.com
            </a>{' '}
            (subject line tag: [privacy])
          </p>
          <p className="mt-3">
            Data subject requests under UU No. 27/2022 (Pelindungan Data Pribadi) — including
            access, correction, deletion, and portability — go to the email above. We respond
            within 30 days.
          </p>
        </section>
      </div>
    </div>
  );
}
