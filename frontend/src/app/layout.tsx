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
