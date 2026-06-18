import type { Metadata } from 'next';
import { Mail, Phone, MapPin, MessageCircle } from 'lucide-react';

// Suppuo hosted help center (live chat + ticket form) for this product.
// Handle = brand slug (Suppuo resolves slug-or-acc); rename.sh rewrites
// `malapos`. See (marketing)/layout.tsx for the family rationale.
const SUPPUO_SUPPORT_URL = 'https://suppuo.com/support/malapos';

/*
 * The mailbox, phone, and registered address are family-stable — every
 * Forjio product routes to the same PT Forjio Teknologi Indonesia
 * entity. Leave them; only the brand name changes.
 */

export const metadata: Metadata = {
  title: 'Contact — Malapos',
  description: 'Get in touch with the Malapos team. Support, sales, partnerships, legal, privacy.',
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 md:px-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight">Contact</h1>
        <p className="mt-3 text-base text-muted-foreground">
          Support, sales, partnerships, legal, privacy — all routed to one mailbox so nothing
          slips through.
        </p>

        <div className="mt-8 rounded-lg border border-primary/30 bg-primary/5 p-6">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <MessageCircle size={18} className="text-primary" />
            Need help now?
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Start a live chat or open a support ticket in our help center — the fastest way to reach
            us.
          </p>
          <a
            href={SUPPUO_SUPPORT_URL}
            target="_blank"
            rel="noopener"
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <MessageCircle size={16} />
            Visit the help center
          </a>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          <ContactCard
            icon={<Mail size={18} className="text-primary" />}
            label="Email"
            value="support@forjio.com"
            href="mailto:support@forjio.com"
            note="Response within 1 business day."
          />
          <ContactCard
            icon={<Phone size={18} className="text-primary" />}
            label="Phone / WhatsApp"
            value="+62 815-2999-0219"
            href="tel:+6281529990219"
            note="Mon–Fri, 09:00–17:00 WIB."
          />
          <ContactCard
            icon={<MapPin size={18} className="text-primary" />}
            label="Registered address"
            value={
              <>
                Jl. Parkit, Blok I, No. 48,
                <br />
                RT 004, RW 001,
                <br />
                Cempaka Permai, Gading Cempaka,
                <br />
                Bengkulu, Bengkulu 38221
              </>
            }
            note="PT Forjio Teknologi Indonesia"
          />
        </div>

        <div className="mt-10 rounded-lg border border-border/50 bg-card/50 p-6 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">What to send for a faster reply</p>
          <ul className="mt-3 list-disc space-y-1.5 pl-5">
            <li>
              <strong>Customer support</strong> — your account email, the record in question, and
              a screenshot or error code if you have one.
            </li>
            <li>
              <strong>Billing / refund</strong> — the invoice number or charge date, plus the
              reason. See our{' '}
              <a href="/refund" className="text-primary hover:underline">Refund Policy</a>.
            </li>
            <li>
              <strong>Privacy / data subject requests</strong> — the action you want and the email
              tied to your account. We respond within 30 days under UU PDP.
            </li>
            <li>
              <strong>Legal notices / takedowns</strong> — please use a subject line starting with
              [legal].
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function ContactCard({
  icon,
  label,
  value,
  href,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  href?: string;
  note?: string;
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-card/30 p-5">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-base font-medium">
        {href ? (
          <a className="hover:underline" href={href}>
            {value}
          </a>
        ) : (
          value
        )}
      </div>
      {note ? <p className="mt-2 text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}
