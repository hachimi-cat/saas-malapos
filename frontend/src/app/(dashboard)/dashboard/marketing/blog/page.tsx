'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { blogApi, type BlogPost, type BlogPostStatus } from '@/lib/marketing-api';
import { Loader2, Plus, Search, ExternalLink, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

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
      // Backend relays Ripllo's verbatim `{ posts }` shape (see routes/marketing/blog.ts).
      const data = (res.data as unknown as { posts?: BlogPost[] })?.posts ?? [];
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
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight font-display">Blog</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Publish posts to <code className="rounded bg-muted px-1 font-mono text-xs">/s/&lt;your-slug&gt;/blog</code>.
            Markdown body, tags, cover images, SEO fields. Each post auto-indexed in your sitemap + RSS feed.
          </p>
        </div>
        <Button asChild className="shrink-0">
          <Link href="/dashboard/marketing/blog/new">
            <Plus className="h-4 w-4" /> New post
          </Link>
        </Button>
      </header>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as BlogPostStatus | 'all')}>
          <TabsList>
            {(['all', 'published', 'draft'] as const).map((s) => (
              <TabsTrigger key={s} value={s} className="capitalize">
                {s}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search titles…"
            className="pl-8"
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

      <Card className="bg-card/50 p-4 text-xs text-muted-foreground shadow-none">
        <div className="flex items-center gap-2 font-medium text-foreground">
          <ExternalLink className="h-3.5 w-3.5" /> Storefront URLs
        </div>
        <p className="mt-2">
          Blog list: <code className="rounded bg-muted px-1 font-mono">/s/&lt;your-slug&gt;/blog</code>
          {'  '}·{'  '}
          RSS: <code className="rounded bg-muted px-1 font-mono">/s/&lt;your-slug&gt;/blog/rss.xml</code>
        </p>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: BlogPostStatus }) {
  if (status === 'published') {
    return (
      <Badge variant="outline" className="rounded-full border-green-300 bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700">
        Published
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="rounded-full border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      Draft
    </Badge>
  );
}

function extractError(e: unknown): string | null {
  return (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? null;
}
