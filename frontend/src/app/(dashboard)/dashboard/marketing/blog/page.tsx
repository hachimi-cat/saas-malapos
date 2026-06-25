'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { blogApi, type BlogPost, type BlogPostStatus } from '@/lib/marketing-api';
import { Loader2, Plus, Search, ExternalLink, FileText } from 'lucide-react';

/**
 * /dashboard/marketing/blog — list view of blog posts with status filter +
 * search. Links to /new for create and /[id] for edit.
 */

export default function BlogListPage() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [filter, setFilter] = useState<BlogPostStatus | 'all'>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const res = await blogApi.list({ status: filter === 'all' ? undefined : filter });
      const data = (res.data as { data?: BlogPost[] })?.data ?? (res.data as BlogPost[]);
      setPosts(Array.isArray(data) ? data : []);
      setError('');
    } catch (e) {
      setError(extractError(e) ?? 'Failed to load posts');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = query
    ? posts.filter((p) => p.title.toLowerCase().includes(query.toLowerCase()) ||
                           p.slug.toLowerCase().includes(query.toLowerCase()))
    : posts;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Blog</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Publish posts to <code className="rounded bg-muted px-1 font-mono text-xs">/s/&lt;your-slug&gt;/blog</code>.
            Markdown body, tags, cover images, SEO fields. Each post auto-indexed in your sitemap + RSS feed.
          </p>
        </div>
        <Link
          href="/dashboard/marketing/blog/new"
          className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> New post
        </Link>
      </header>

      {error && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-border bg-card p-1">
          {(['all', 'published', 'draft'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize ${
                filter === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search titles…"
            className="w-full rounded-lg border border-border bg-background py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            {posts.length === 0 ? 'No posts yet. Create your first one.' : 'No posts match this filter.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((p) => (
            <li key={p.id}>
              <Link
                href={`/dashboard/marketing/blog/${p.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-4 hover:border-primary/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-semibold">{p.title}</h3>
                    <StatusBadge status={p.status} />
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">/{p.slug}</p>
                  {p.excerpt && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{p.excerpt}</p>}
                  {p.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {p.tags.slice(0, 5).map((t) => (
                        <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">#{t}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  {p.publishedAt ? new Date(p.publishedAt).toLocaleDateString() : '—'}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-lg border border-border bg-card/50 p-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-2 font-medium text-foreground">
          <ExternalLink className="h-3.5 w-3.5" /> Storefront URLs
        </div>
        <p className="mt-2">
          Blog list: <code className="rounded bg-muted px-1 font-mono">/s/&lt;your-slug&gt;/blog</code>
          {'  '}·{'  '}
          RSS: <code className="rounded bg-muted px-1 font-mono">/s/&lt;your-slug&gt;/blog/rss.xml</code>
        </p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: BlogPostStatus }) {
  if (status === 'published') {
    return (
      <span className="rounded-full border border-green-300 bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700">
        Published
      </span>
    );
  }
  return (
    <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      Draft
    </span>
  );
}

function extractError(e: unknown): string | null {
  return (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? null;
}
