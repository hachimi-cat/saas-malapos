'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { blogApi, type BlogPost, type BlogPostStatus } from '@/lib/marketing-api';
import { Loader2, Plus, Search, ExternalLink, FileText, Globe, Undo2, Trash2, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import {
  BulkBar,
  BulkDeleteDialog,
  BulkActionDialog,
  type PendingBatchAction,
} from '@/components/dashboard/bulk-bar';
import { AgenticEntry, BulkEditSlot, BulkVerbSlot } from '@/components/catentio/agentic-entry';
import { ActionsDropdown, type PageAction } from '@/components/dashboard/actions-dropdown';
import { useCatentioStatus } from '@/hooks/use-catentio';
import { actMany, deleteMany } from '@/lib/bulk';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
  // Card-list selection (this list had none): a checkbox per card, the
  // bulk bar below while the selection is non-empty.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkEditing, setBulkEditing] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  // Wave-2 batch verbs. Assistant ON: the dropdown item opens the
  // agentic verb sheet over the selection (one plan turn, fanned out
  // through the same blogApi calls the row buttons make). Assistant
  // OFF: the hand-built confirm — `confirming` for publish/unpublish,
  // BulkDeleteDialog for delete.
  const [bulkVerb, setBulkVerb] = useState<'publish' | 'unpublish' | 'delete' | null>(null);
  const [confirming, setConfirming] = useState<PendingBatchAction | null>(null);
  // Row-action in-flight guard: the post id being published/unpublished/
  // deleted, so its buttons disable while the call runs.
  const [working, setWorking] = useState<string | null>(null);
  const { enabled: assistantEnabled } = useCatentioStatus();

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

  // Counted against the CURRENT posts, so a post that was deleted (or
  // dropped by a status-filter reload) leaves the selection on its own.
  const bulkTargets = useMemo(
    () => posts.filter((p) => selected.has(p.id)),
    [posts, selected],
  );

  function toggleRow(id: string, checked: boolean) {
    setSelected((s) => {
      const next = new Set(s);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  // Row publish/unpublish — status-gated (the button only renders for the
  // status it applies to), then reload so the badge + filter are honest.
  async function togglePublish(p: BlogPost) {
    setWorking(p.id);
    setError('');
    try {
      if (p.status === 'published') await blogApi.unpublish(p.id);
      else await blogApi.publish(p.id);
      await load();
    } catch (e) {
      setError(extractError(e) ?? `Failed to ${p.status === 'published' ? 'unpublish' : 'publish'} post`);
    } finally {
      setWorking(null);
    }
  }

  // Row delete — the AlertDialog is the confirm; reload either way.
  async function deletePost(p: BlogPost) {
    setWorking(p.id);
    setError('');
    try {
      await blogApi.delete(p.id);
      await load();
    } catch (e) {
      setError(extractError(e) ?? 'Failed to delete post');
    } finally {
      setWorking(null);
    }
  }

  // Bulk-delete executor — the bar's confirm AND the page assistant's
  // picker both call this; each owns its own confirm dialog.
  async function onBulkDelete() {
    try {
      await deleteMany(
        bulkTargets.map((p) => ({ id: p.id, label: p.title })),
        (id) => blogApi.delete(id),
      );
    } finally {
      // Reload either way so the list is honest; a partial
      // run's thrown message stays on the bar.
      await load();
    }
  }

  /** The assistant-off batch lifecycle executor — the SAME blogApi
   *  calls the row buttons make, looped with actMany's partial-failure
   *  contract. */
  async function onBatchLifecycle(verb: 'publish' | 'unpublish') {
    try {
      await actMany(
        verb === 'publish' ? 'Published' : 'Unpublished',
        bulkTargets.map((p) => ({ id: p.id, label: p.title })),
        (id) => (verb === 'publish' ? blogApi.publish(id) : blogApi.unpublish(id)),
      );
    } finally {
      await load();
    }
  }

  /** One dropdown item's run: the agentic verb sheet with the assistant
   *  on, the hand-built confirm with it off. Both end at the same
   *  per-record routes. */
  function batchRun(verb: 'publish' | 'unpublish' | 'delete', manual: () => void) {
    return () => (assistantEnabled ? setBulkVerb(verb) : manual());
  }

  const n = bulkTargets.length;
  const nPosts = n === 1 ? 'post' : 'posts';

  // The page's batch verbs, on the Actions dropdown beside the "New X"
  // entry (bang's entry-point contract). Labels recompute per render so
  // the counts stay live.
  const pageActions: PageAction[] = [
    ...(assistantEnabled
      ? [{
          key: 'bulk-edit',
          label: n > 0 ? `Bulk edit ${n} selected` : 'Bulk edit',
          icon: Pencil,
          run: () => setBulkEditing(true),
          requiresSelection: true,
        }]
      : []),
    // The lifecycle verbs were declared in wave 1 and wired per ROW;
    // these are the same two over a selection.
    {
      key: 'bulk-publish',
      label: n > 0 ? `Publish ${n} selected` : 'Publish selected',
      icon: Globe,
      requiresSelection: true,
      run: batchRun('publish', () =>
        setConfirming({
          title: `Publish ${n} ${nPosts}?`,
          body: 'Each post goes live on the storefront and is indexed in the sitemap + RSS feed. Already-published posts are left alone; failures are skipped and named.',
          cta: `Publish ${n}`,
          run: () => onBatchLifecycle('publish'),
          onError: setBulkError,
          onDone: () => setSelected(new Set()),
        }),
      ),
    },
    {
      key: 'bulk-unpublish',
      label: n > 0 ? `Unpublish ${n} selected` : 'Unpublish selected',
      icon: Undo2,
      requiresSelection: true,
      run: batchRun('unpublish', () =>
        setConfirming({
          title: `Unpublish ${n} ${nPosts}?`,
          body: 'Each post goes back to draft and comes off the storefront. Nothing is deleted; failures are skipped and named.',
          cta: `Unpublish ${n}`,
          run: () => onBatchLifecycle('unpublish'),
          onError: setBulkError,
          onDone: () => setSelected(new Set()),
        }),
      ),
    },
    {
      key: 'bulk-delete',
      label: n > 0 ? `Delete ${n} selected` : 'Delete selected',
      icon: Trash2,
      run: batchRun('delete', () => setBulkDeleteOpen(true)),
      requiresSelection: true,
      destructive: true,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Blog"
        description={
          <>
            Publish posts to <code className="rounded bg-muted px-1 font-mono text-xs">/s/&lt;your-slug&gt;/blog</code>.
            Markdown body, tags, cover images, SEO fields. Each post auto-indexed in your sitemap + RSS feed.
          </>
        }
        action={
          <div className="flex items-center gap-2">
            <ActionsDropdown
              actions={pageActions}
              selectionCount={bulkTargets.length}
              noun="post"
            />
            <AgenticEntry
              resource="blog-posts"
              mode="create"
              split
              onApplied={load}
              className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
              fallback={
                <Button asChild className="shrink-0">
                  <Link href="/dashboard/marketing/blog/new">
                    <Plus className="h-4 w-4" /> New post
                  </Link>
                </Button>
              }
            >
              <Plus className="h-4 w-4" /> New post
            </AgenticEntry>
          </div>
        }
      />

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
            <li
              key={p.id}
              className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 hover:border-primary/50"
            >
              <Checkbox
                checked={selected.has(p.id)}
                onCheckedChange={(v) => toggleRow(p.id, v === true)}
                aria-label={`Select ${p.title}`}
                className="mt-0.5 shrink-0"
              />
              <Link
                href={`/dashboard/marketing/blog/${p.id}`}
                className="flex min-w-0 flex-1 items-center justify-between gap-3"
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
              <div className="flex shrink-0 items-center gap-1">
                {/* Row verbs are agentic entries (P3): the button opens
                    the sheet for that (resource, action) with the row as
                    `initial`; assistant off keeps the direct-API flow. */}
                {p.status === 'published' ? (
                  <AgenticEntry
                    resource="blog-posts"
                    mode="unpublish"
                    initial={{ id: p.id, title: p.title, status: p.status }}
                    onApplied={load}
                    disabled={working === p.id}
                    title="Unpublish — back to draft, removed from the storefront"
                    className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
                    fallback={
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={working === p.id}
                        onClick={() => togglePublish(p)}
                        title="Unpublish — back to draft, removed from the storefront"
                      >
                        <Undo2 className="h-3.5 w-3.5" /> Unpublish
                      </Button>
                    }
                  >
                    <Undo2 className="h-3.5 w-3.5" /> Unpublish
                  </AgenticEntry>
                ) : (
                  <AgenticEntry
                    resource="blog-posts"
                    mode="publish"
                    initial={{ id: p.id, title: p.title, status: p.status }}
                    onApplied={load}
                    disabled={working === p.id}
                    title="Publish to the storefront"
                    className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
                    fallback={
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={working === p.id}
                        onClick={() => togglePublish(p)}
                        title="Publish to the storefront"
                      >
                        <Globe className="h-3.5 w-3.5" /> Publish
                      </Button>
                    }
                  >
                    <Globe className="h-3.5 w-3.5" /> Publish
                  </AgenticEntry>
                )}
                <AgenticEntry
                  resource="blog-posts"
                  mode="delete"
                  initial={{ id: p.id, title: p.title }}
                  onApplied={load}
                  disabled={working === p.id}
                  title="Delete post"
                  className={cn(
                    buttonVariants({ variant: 'ghost', size: 'icon' }),
                    'h-8 w-8 text-muted-foreground hover:text-destructive',
                  )}
                  fallback={
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={working === p.id}
                          title="Delete post"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete &ldquo;{p.title}&rdquo;?</AlertDialogTitle>
                          <AlertDialogDescription>
                            The post and its storefront page are removed. This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Keep post</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deletePost(p)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete post
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </AgenticEntry>
              </div>
            </li>
          ))}
        </ul>
      )}

      <BulkBar
        count={bulkTargets.length}
        noun="post"
        onClear={() => { setBulkError(null); setSelected(new Set()); }}
        error={bulkError}
      />

      <BulkDeleteDialog
        count={bulkTargets.length}
        noun="post"
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        onDelete={onBulkDelete}
        onError={setBulkError}
        onDone={() => setSelected(new Set())}
        description="Each post and its storefront page are removed. This cannot be undone."
      />

      <BulkActionDialog action={confirming} onClose={() => setConfirming(null)} />

      {bulkEditing && (
        <BulkEditSlot
          resource="blog-posts"
          targets={bulkTargets as unknown as Record<string, unknown>[]}
          onClose={() => setBulkEditing(false)}
          onApplied={async () => {
            setBulkEditing(false);
            setSelected(new Set());
            await load();
          }}
        />
      )}

      {bulkVerb && (
        <BulkVerbSlot
          resource="blog-posts"
          verb={bulkVerb}
          targets={bulkTargets as unknown as Record<string, unknown>[]}
          onClose={() => setBulkVerb(null)}
          onApplied={async () => {
            setBulkVerb(null);
            setSelected(new Set());
            await load();
          }}
        />
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
      <Badge variant="outline" className="rounded-full border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
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
