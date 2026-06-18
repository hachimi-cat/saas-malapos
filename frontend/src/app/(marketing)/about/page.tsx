import type { Metadata } from 'next';
import { Hexagon } from 'lucide-react';

/*
 * FORKERS: replace the placeholder origin story + principles with the
 * real "why this product exists." Keep the structure.
 */

export const metadata: Metadata = {
  title: 'About',
  description: 'Malapos is built by Forjio — replace this with your real about copy.',
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-20 md:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center gap-3">
          <Hexagon className="h-8 w-8 text-primary" />
          <h1 className="text-4xl font-bold tracking-tight">About Malapos</h1>
        </div>

        <div className="mt-10 space-y-6 text-muted-foreground">
          <p className="text-lg">
            One sentence on the problem Malapos exists to solve.
          </p>

          <p>
            A paragraph on who built it and what gap they hit with the existing options —
            too expensive, missing a CLI, built on an abandoned stack. Make it concrete.
          </p>

          <p>
            A paragraph on what Malapos is, in plain terms — the core capability, who
            it&apos;s for, and the one thing it does better than the alternatives.
          </p>

          <h2 className="pt-4 text-2xl font-bold text-foreground">Our principles</h2>

          <ul className="space-y-4">
            <li>
              <strong className="text-foreground">Principle one.</strong>{' '}
              A belief that shapes the product — and the concrete way it shows up.
            </li>
            <li>
              <strong className="text-foreground">Principle two.</strong>{' '}
              Another. Keep these honest; they should be falsifiable against the product.
            </li>
            <li>
              <strong className="text-foreground">No vendor lock-in.</strong>{' '}
              Export everything as CSV or JSON. Your data is yours.
            </li>
            <li>
              <strong className="text-foreground">Transparent pricing.</strong>{' '}
              IDR pricing for our market. Monthly billing. No hidden fees. Cancel anytime.
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
