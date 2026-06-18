import Script from 'next/script';
import { Hexagon } from 'lucide-react';
import { MarketingShell, MarketingNav, MarketingFooter } from '@forjio/website-ui';

/*
 * Marketing route-group layout — the shared Forjio family chrome
 * (navbar + footer) wrapping every marketing page.
 *
 * After forking: swap <Hexagon> for your product's lucide icon and set
 * brandTagline to your one-liner. Everything else is family-locked.
 *
 * SUPPUO — the family helpdesk. Every Forjio product embeds Suppuo's
 * support widget + links to its hosted help center, the same way every
 * product uses Huudis (auth) + Plugipay (billing). Two touchpoints live
 * here: the footer "Help center" link and the live-chat widget. Two more
 * are in the dashboard shell ("Support" nav item) and the contact page.
 */

// Suppuo handle = this product's brand slug. Suppuo resolves slug-or-acc on
// every public surface (widget-config included), so the rename.sh rewrite of
// `malapos` is all the wiring needed. One-time setup: claim this slug in
// the product's Suppuo workspace (TEMPLATE.md Step 2) so the URLs resolve —
// until then, drop the workspace's `acc_…` id here instead.
const SUPPUO_ACCOUNT = 'malapos';
const SUPPUO_SUPPORT_URL = `https://suppuo.com/support/${SUPPUO_ACCOUNT}`;

// Mirrors @forjio/website-ui DEFAULT_COLUMNS, adding ONE family-standard
// entry: a "Help center" link to the hosted Suppuo support page.
const FOOTER_COLUMNS = [
  {
    title: 'Product',
    links: [
      { href: '/features', label: 'Features' },
      { href: '/pricing', label: 'Pricing' },
      { href: '/docs', label: 'Documentation' },
      { href: '/changelog', label: 'Changelog' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/about', label: 'About' },
      { href: SUPPUO_SUPPORT_URL, label: 'Help center' },
      { href: '/contact', label: 'Contact' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { href: '/privacy', label: 'Privacy Policy' },
      { href: '/terms', label: 'Terms of Service' },
      { href: '/refund', label: 'Refund Policy' },
    ],
  },
];

const brand = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Malapos';

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MarketingShell>
      <MarketingNav
        brandIcon={<Hexagon className="h-6 w-6 text-primary" />}
        brandName={brand}
      />
      <main className="flex-1">{children}</main>
      <MarketingFooter
        brandIcon={<Hexagon className="h-5 w-5 text-primary" />}
        brandName={brand}
        brandTagline={`${brand} — part of the Forjio family.`}
        copyrightSuffix="part of the Forjio family."
        columns={FOOTER_COLUMNS}
      />
      {/* Suppuo helpdesk widget — live-chat bubble + help form. Self-inits
          from the data attr; recolors to the workspace brand accent. */}
      <Script
        src="https://suppuo.com/widget.js"
        data-suppuo-account={SUPPUO_ACCOUNT}
        strategy="afterInteractive"
      />
    </MarketingShell>
  );
}
