import type { Metadata } from 'next';
import { LogoMark } from '@/components/brand/logo';

export const metadata: Metadata = {
  title: 'About',
  description:
    'Malapos is a point-of-sale for Indonesian retail, F&B, and pharmacy businesses — built by Forjio.',
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-20 md:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center gap-3">
          <LogoMark size={32} className="text-primary" />
          <h1 className="text-4xl font-bold tracking-tight">About Malapos</h1>
        </div>

        <div className="mt-10 space-y-6 text-muted-foreground">
          <p className="text-lg">
            Most point-of-sale software in Indonesia is either a cash drawer with a
            screen or an enterprise suite priced per terminal. Malapos is the middle
            most shops actually need.
          </p>

          <p>
            Small retailers, restaurants, and pharmacies run real operations — multiple
            outlets, stock that has to reconcile, cashier shifts that have to balance,
            batches that expire — but get sold either a glorified calculator or a system
            that charges by the till and takes a week to set up. Malapos is a
            browser-based POS that does the real work without the enterprise weight or
            the per-terminal bill.
          </p>

          <p>
            Ring up sales with cash, QRIS, or card; manage a catalog with variants,
            categories, and F&amp;B modifiers; track stock across outlets with an
            append-only movement ledger and pharmacy batch/expiry (FEFO); run cashier
            shifts with cash reconciliation; handle suppliers and purchase orders; keep a
            customer list with loyalty; and read it all back in reports. Retail, food, and
            pharmacy — one tool.
          </p>

          <h2 className="pt-4 text-2xl font-bold text-foreground">Our principles</h2>

          <ul className="space-y-4">
            <li>
              <strong className="text-foreground">Priced per shop, not per till.</strong>{' '}
              One flat monthly price per workspace covers your whole team — add cashiers
              without adding to the bill.
            </li>
            <li>
              <strong className="text-foreground">Built for Indonesia.</strong>{' '}
              Rupiah throughout, QRIS at the counter, and pharmacy batch + expiry
              tracking — not bolted onto a foreign template.
            </li>
            <li>
              <strong className="text-foreground">One Forjio account.</strong>{' '}
              Sign in once with Huudis and your identity works across every Forjio
              product; billing runs through Plugipay.
            </li>
            <li>
              <strong className="text-foreground">Start free.</strong>{' '}
              The Free plan is genuinely free — no card. Upgrade only when you need more
              outlets, products, or features.
            </li>
          </ul>

          <h2 className="pt-4 text-2xl font-bold text-foreground">Built by Forjio</h2>

          <p>
            Malapos is built and maintained by the Forjio team — a family of products
            that share one identity layer (Huudis) and one billing spine (Plugipay). Sign
            up once, work across all of them.
          </p>

          <p>
            Questions? Reach us at{' '}
            <span className="font-mono text-primary">support@forjio.com</span>.
          </p>
        </div>
      </div>
    </div>
  );
}
