import fs from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';
import matter from 'gray-matter';

/*
 * Docs loader — reads markdown from the repo-root `copy/docs/` directory
 * and renders it to HTML with an injected heading-id + TOC. Same pattern
 * every Forjio product uses.
 *
 * FORKERS: add a page = drop a `copy/docs/<slug>.md` file AND add a
 * matching entry to DOC_NAV below (the sidebar + search are driven by
 * DOC_NAV, not a directory scan, so order + grouping stay deliberate).
 */

const COPY_ROOT = (() => {
  const candidates = [
    process.env.COPY_ROOT,
    path.resolve(process.cwd(), '../copy'),
    path.resolve(process.cwd(), '../../copy'),
  ].filter((p): p is string => !!p);
  for (const c of candidates) {
    try {
      if (fs.existsSync(path.join(c, 'docs'))) return c;
    } catch {}
  }
  return candidates[candidates.length - 1] ?? path.resolve(process.cwd(), '../copy');
})();

export type DocMeta = {
  slug: string;
  title: string;
  group?: string;
  href: string;
};

// Placeholder doc set. Replace these with the real pages of your
// product — keep the `''` (index) entry first.
export const DOC_NAV: DocMeta[] = [
  { slug: '', title: 'Introduction', group: 'Getting started', href: '/docs' },
  { slug: 'getting-started', title: 'Getting started', group: 'Getting started', href: '/docs/getting-started' },
  { slug: 'api-reference', title: 'API reference', group: 'API', href: '/docs/api-reference' },
  { slug: 'sdk', title: 'SDKs', group: 'SDKs', href: '/docs/sdk' },
];

export function docsGroups(): Array<{ heading: string; items: DocMeta[] }> {
  const groups = new Map<string, DocMeta[]>();
  for (const d of DOC_NAV) {
    const g = d.group ?? 'Other';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(d);
  }
  return Array.from(groups.entries()).map(([heading, items]) => ({ heading, items }));
}

function readDocRaw(slug: string | undefined): { content: string } {
  const cleanSlug = (slug ?? '').replace(/^\/+|\/+$/g, '');
  const rel = cleanSlug === '' ? 'index' : cleanSlug;
  const candidates = [
    path.join(COPY_ROOT, 'docs', `${rel}.md`),
    path.join(COPY_ROOT, 'docs', rel, 'index.md'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return { content: matter(fs.readFileSync(c, 'utf8')).content };
    }
  }
  return { content: '' };
}

export interface SearchEntry {
  href: string;
  title: string;
  group: string;
  body: string;
}

// Build-time scan of every doc page → a flat index for DocsSearch.
export function buildSearchIndex(): SearchEntry[] {
  return DOC_NAV.map((nav) => {
    const { content } = readDocRaw(nav.slug);
    const body = content
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`[^`]+`/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[#*_>|-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 4000);
    return { href: nav.href, title: nav.title, group: nav.group ?? 'Other', body };
  });
}

export type TocEntry = { depth: 2 | 3; text: string; slug: string };

export function readDoc(
  slug: string | undefined,
): { html: string; title: string; meta: DocMeta | null; toc: TocEntry[] } {
  const cleanSlug = (slug ?? '').replace(/^\/+|\/+$/g, '');
  const rel = cleanSlug === '' ? 'index' : cleanSlug;
  const candidates = [
    path.join(COPY_ROOT, 'docs', `${rel}.md`),
    path.join(COPY_ROOT, 'docs', rel, 'index.md'),
  ];
  let filepath: string | null = null;
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      filepath = c;
      break;
    }
  }
  if (!filepath) {
    return {
      html: `<p>Doc not found: <code>${cleanSlug}</code></p>`,
      title: 'Not found',
      meta: null,
      toc: [],
    };
  }
  const parsed = matter(fs.readFileSync(filepath, 'utf8'));
  const content = parsed.content;
  const frontTitle =
    (parsed.data?.title as string | undefined) ?? extractFirstHeading(content) ?? cleanSlug;
  const rawHtml = marked.parse(content, { async: false }) as string;
  const { html, toc } = injectHeadingIds(rawHtml);
  const meta = DOC_NAV.find((d) => d.slug === cleanSlug) ?? null;
  return { html, title: frontTitle, meta, toc };
}

// Walk the rendered HTML, inject id="…" on h2/h3, collect a TOC.
function injectHeadingIds(html: string): { html: string; toc: TocEntry[] } {
  const toc: TocEntry[] = [];
  const seen = new Map<string, number>();
  const out = html.replace(
    /<(h[23])>([\s\S]*?)<\/\1>/g,
    (_match, tag: 'h2' | 'h3', inner: string) => {
      const text = decodeEntities(inner.replace(/<[^>]+>/g, '').trim());
      const base = slugify(text);
      const count = (seen.get(base) ?? 0) + 1;
      seen.set(base, count);
      const slug = count === 1 ? base : `${base}-${count}`;
      const depth = tag === 'h2' ? 2 : 3;
      toc.push({ depth, text, slug });
      return `<${tag} id="${slug}">${inner}</${tag}>`;
    },
  );
  return { html: out, toc };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function extractFirstHeading(md: string): string | null {
  const m = md.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : null;
}
