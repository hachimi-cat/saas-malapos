import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { gellix } from '@forjio/website-ui/fonts';
import '@forjio/website-ui/styles/marketing.css';
import './globals.css';

const brand = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Malapos';

export const metadata: Metadata = {
  title: { default: brand, template: `%s | ${brand}` },
  description: `${brand} — part of the Forjio commerce suite.`,
  // The apple touch icon is the same violet receipt tile as app/icon.svg,
  // rendered to 180px under public/. Until 2026-08-19 malapos shipped no
  // public/ at all — iOS bookmarks had a blank tile and the docked
  // assistant's avatar (`/apple-touch-icon.png`, copied from linksnap,
  // which ships the file) was a broken image on every reply.
  //
  // The `icon:` entry re-declares the file-convention favicon on purpose:
  // on this Next (15.5.19, resolve-metadata.js leafSegmentStaticIcons),
  // declaring `metadata.icons` at all DROPS the app/icon.svg link — a
  // build with only `apple:` here emitted no rel="icon" tag. Pointing at
  // the convention's own /icon.svg route keeps the tab favicon (the
  // huudis/plugipay shape, live on both).
  icons: {
    icon: { url: '/icon.svg', type: 'image/svg+xml' },
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // FORKERS: the theme is driven by the `:root` tokens in globals.css
    // (dark navy by default). Add className="dark" here ONLY if your
    // brand splits light/dark token sets behind Tailwind's `dark:`
    // variant — a stray hardcoded class otherwise leaks into every page.
    <html lang="en">
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} ${gellix.variable} font-sans`}
      >
        {children}
      </body>
    </html>
  );
}
