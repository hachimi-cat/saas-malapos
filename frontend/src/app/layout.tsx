import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { gellix } from '@forjio/website-ui/fonts';
import '@forjio/website-ui/styles/marketing.css';
import './globals.css';

const brand = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Malapos';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

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
        className={`${inter.variable} ${jetbrainsMono.variable} ${gellix.variable} font-sans`}
      >
        {children}
      </body>
    </html>
  );
}
