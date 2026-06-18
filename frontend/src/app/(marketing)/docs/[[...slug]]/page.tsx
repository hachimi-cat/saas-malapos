import Link from 'next/link';
import type { Metadata } from 'next';
import { readDoc, docsGroups, buildSearchIndex, DOC_NAV } from '@/lib/markdown';
import {
  DocsSearch,
  CrossProductNav,
  DocsMobileSidebar,
  DocsSidebar,
  DocsToc,
} from '@forjio/website-ui';

type Params = { slug?: string[] };

export const dynamicParams = false;

// The Forjio family — shared identity (Huudis), billing (Plugipay), and
// a docs aesthetic. Surfaced in the docs header so readers can jump
// sideways into related products. Keep your own product `current`.
const FORJIO_PRODUCTS = [
  { name: 'Huudis',      href: 'https://huudis.com/docs',     tagline: 'Identity' },
  { name: 'Plugipay',    href: 'https://plugipay.com/docs',   tagline: 'Payments' },
  { name: 'Storlaunch',  href: 'https://storlaunch.com/docs', tagline: 'E-commerce' },
  { name: 'Fulkruma',    href: 'https://fulkruma.com/docs',   tagline: 'Fulfillment' },
  { name: 'Ripllo',      href: 'https://ripllo.com/docs',     tagline: 'Marketing' },
  { name: 'Malapos', href: '/docs',                      tagline: 'This product' },
];

export function generateStaticParams(): Array<{ slug?: string[] }> {
  return DOC_NAV.map((nav) => {
    if (nav.slug === '') return { slug: [] };
    return { slug: nav.slug.split('/') };
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const p = await params;
  const slug = (p.slug ?? []).join('/');
  const { title } = readDoc(slug);
  return {
    title: title === 'Introduction' ? 'Malapos Docs' : `${title} · Malapos Docs`,
  };
}

export default async function DocsPage({ params }: { params: Promise<Params> }) {
  const p = await params;
  const slug = (p.slug ?? []).join('/');
  const { html, title, toc } = readDoc(slug);
  const groups = docsGroups();
  const searchIndex = buildSearchIndex();
  const currentHref = slug === '' ? '/docs' : `/docs/${slug}`;

  return (
    <>
      <CrossProductNav products={FORJIO_PRODUCTS} current="Malapos" />

      {/* Docs header — search + mobile sidebar trigger */}
      <div className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 flex items-center gap-3">
          <Link
            href="/docs"
            className="text-sm font-semibold whitespace-nowrap hover:text-primary"
          >
            Malapos Docs
          </Link>
          <div className="flex-1 flex justify-center">
            <DocsSearch index={searchIndex} />
          </div>
          <div className="lg:hidden">
            <DocsMobileSidebar groups={groups} currentHref={currentHref} />
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-8 md:py-10">
        <div
          className={
            toc.length >= 2
              ? 'grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)_220px] gap-8'
              : 'grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-8'
          }
        >
          <aside className="hidden lg:block lg:sticky lg:top-[57px] lg:self-start lg:h-[calc(100vh-57px)] lg:overflow-y-auto pr-2 pb-6 pt-2">
            <DocsSidebar groups={groups} currentHref={currentHref} />
          </aside>

          <article className="min-w-0">
            <nav className="text-xs text-muted-foreground mb-4">
              <Link href="/docs" className="hover:text-foreground">
                Docs
              </Link>
              {slug && (
                <>
                  <span className="mx-1.5 text-muted-foreground/50">/</span>
                  <span className="text-foreground">{title}</span>
                </>
              )}
            </nav>
            <div className="docs-prose" dangerouslySetInnerHTML={{ __html: html }} />
          </article>

          {toc.length >= 2 && (
            <aside className="hidden lg:block lg:sticky lg:top-[57px] lg:self-start lg:max-h-[calc(100vh-57px)] lg:overflow-y-auto pl-2 pb-6 pt-2">
              <DocsToc entries={toc} />
            </aside>
          )}
        </div>

        <style>{`
          .docs-prose { color: hsl(var(--foreground)); font-size: 15px; line-height: 1.65; max-width: 72ch; }
          .docs-prose h1 { font-size: 36px; font-weight: 700; letter-spacing: -0.02em; margin: 0 0 20px; line-height: 1.1; }
          .docs-prose h2 { font-size: 22px; font-weight: 700; letter-spacing: -0.015em; margin: 36px 0 14px; line-height: 1.2; border-top: 1px solid hsl(var(--border)); padding-top: 26px; scroll-margin-top: 80px; }
          .docs-prose h2:first-of-type { border-top: none; padding-top: 0; }
          .docs-prose h3 { font-size: 17px; font-weight: 600; margin: 26px 0 10px; scroll-margin-top: 80px; }
          .docs-prose h4 { font-size: 14px; font-weight: 600; margin: 18px 0 8px; color: hsl(var(--muted-foreground)); font-family: var(--font-mono), monospace; letter-spacing: 0.02em; text-transform: uppercase; }
          .docs-prose p { margin: 0 0 14px; }
          .docs-prose a { color: hsl(var(--primary)); text-decoration: underline; text-underline-offset: 3px; }
          .docs-prose code { background: hsl(var(--muted)); padding: 2px 6px; border-radius: 4px; font-size: 12.5px; font-family: var(--font-mono), monospace; }
          .docs-prose pre { background: #0C0A09; color: #A7F3D0; border-radius: 8px; padding: 16px 18px; margin: 14px 0; overflow-x: auto; font-size: 12.5px; line-height: 1.7; }
          .docs-prose pre code { background: transparent; color: inherit; padding: 0; font-size: inherit; }
          .docs-prose ul, .docs-prose ol { margin: 0 0 14px; padding-left: 1.4em; }
          .docs-prose li { margin: 6px 0; }
          .docs-prose blockquote { border-left: 3px solid hsl(var(--primary)); padding: 10px 14px; margin: 14px 0; color: hsl(var(--muted-foreground)); background: hsl(var(--muted) / 0.4); border-radius: 0 6px 6px 0; }
          .docs-prose hr { border: 0; border-top: 1px solid hsl(var(--border)); margin: 28px 0; }
          .docs-prose table { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 13px; }
          .docs-prose th, .docs-prose td { border: 1px solid hsl(var(--border)); padding: 8px 12px; text-align: left; }
          .docs-prose th { background: hsl(var(--muted)); font-weight: 600; }
          .docs-prose strong { font-weight: 600; color: hsl(var(--foreground)); }
        `}</style>
      </main>
    </>
  );
}
