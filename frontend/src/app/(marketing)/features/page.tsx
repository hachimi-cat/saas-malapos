import type { Metadata } from 'next';
import Link from 'next/link';
import { Boxes, Layers, Activity, ShieldCheck, Zap, Code2, ArrowRight } from 'lucide-react';

/*
 * FORKERS: replace the placeholder feature copy with what Malapos
 * actually ships. Keep the structure (centered hero → 2-col grid →
 * CTA) — it's the family standard.
 */

export const metadata: Metadata = {
  title: 'Features',
  description: 'Everything Malapos ships — replace this with your real feature summary.',
};

const features = [
  {
    Icon: Boxes,
    title: 'Feature one',
    body: 'A concrete capability and what the user gets from it. One or two sentences.',
    details: [
      'A specific sub-capability',
      'Another concrete detail',
      'A third, measurable detail',
      'A fourth if you have one',
    ],
  },
  {
    Icon: Layers,
    title: 'Feature two',
    body: 'Another shipped capability. Name it specifically; avoid marketing adjectives.',
    details: ['Sub-capability', 'Concrete detail', 'Measurable detail', 'One more'],
  },
  {
    Icon: Activity,
    title: 'Feature three',
    body: 'Something measurable or observable — analytics, a report, an export.',
    details: ['Live, no batch delay', 'Per-record breakdown', 'Time-series view', 'CSV export'],
  },
  {
    Icon: ShieldCheck,
    title: 'Feature four',
    body: 'A trust or compliance capability if the product has one.',
    details: ['Concrete guarantee', 'How it is enforced', 'What the user controls', 'Audit trail'],
  },
  {
    Icon: Zap,
    title: 'Feature five',
    body: 'A speed or automation capability — what the product does for the user.',
    details: ['What is automated', 'What it replaces', 'How fast', 'Where it runs'],
  },
  {
    Icon: Code2,
    title: 'API + CLI',
    body: 'REST API with idempotency keys, type-safe SDKs (Node, Python, Go), and a CLI: npm i -g @forjio/malapos-cli.',
    details: [
      'REST + idempotency keys',
      'SDKs for Node, Python, Go',
      '@forjio/malapos-cli on npm',
      'Per-workspace API keys with scoped permissions',
    ],
  },
];

export default function FeaturesPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-20 md:px-6">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Everything you need from Malapos.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          Replace this with a one-paragraph summary of what the product does and which
          capabilities are free versus paid.
        </p>
      </div>

      <div className="mt-16">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {features.map(({ Icon, title, body, details }) => (
            <article key={title} className="rounded-xl border border-border bg-card p-6 md:p-8">
              <div className="mb-5 flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-6" strokeWidth={1.5} />
              </div>
              <h2 className="text-xl font-semibold tracking-[-0.01em]">{title}</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{body}</p>
              <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
                {details.map((d) => (
                  <li key={d} className="flex items-start gap-2">
                    <span className="mt-2 size-1 shrink-0 rounded-full bg-primary/60" />
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>

      <div className="mt-20 text-center">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Try the free tier — no card required.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
          Describe the free plan honestly. Upgrade only when you outgrow it.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Start free <ArrowRight className="size-4" />
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 rounded-md border border-border px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-accent"
          >
            View pricing
          </Link>
        </div>
      </div>
    </div>
  );
}
