'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { blogApi, uploadsApi, type BlogPost, type BlogPostInput } from '@/lib/marketing-api';
import { CampaignSelect } from '@/components/marketing/campaign-select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
import {
  Loader2,
  Save,
  Send,
  Eye,
  Trash2,
  ArrowLeft,
  ImagePlus,
  X,
  EyeOff,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';
import { renderMarkdown } from './markdown';

/**
 * Shared editor used by /blog/new and /blog/[id]. Handles create vs update
 * based on whether `id` is set. Preview toggle renders markdown → HTML.
 * Cover image upload uses the existing uploads/image endpoint (auto-compressed
 * seller-side). Tags are a comma-separated input for simplicity.
 */

type Mode = 'create' | 'edit';

interface Props {
  mode: Mode;
  initial?: BlogPost;
}

export default function PostEditor({ mode, initial }: Props) {
  const router = useRouter();
  // Deep-link pre-fill on create: /dashboard/marketing/blog/new?campaign=<id>
  // arrives via the campaign hub's "Add post to this campaign" CTA.
  const searchParams = useSearchParams();
  const campaignParam = mode === 'create' ? (searchParams?.get('campaign') ?? null) : null;

  const [title, setTitle] = useState(initial?.title ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [excerpt, setExcerpt] = useState(initial?.excerpt ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [coverImage, setCoverImage] = useState(initial?.coverImage ?? '');
  const [authorName, setAuthorName] = useState(initial?.authorName ?? '');
  const [tagsInput, setTagsInput] = useState((initial?.tags ?? []).join(', '));
  const [metaTitle, setMetaTitle] = useState(initial?.metaTitle ?? '');
  const [metaDescription, setMetaDescription] = useState(initial?.metaDescription ?? '');
  const [status, setStatus] = useState(initial?.status ?? 'draft');
  const [marketingCampaignId, setMarketingCampaignId] = useState<string | null>(initial?.marketingCampaignId ?? campaignParam ?? null);

  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Auto-slug from title only in create mode + untouched slug
  const [slugTouched, setSlugTouched] = useState(mode === 'edit');
  useEffect(() => {
    if (!slugTouched) {
      setSlug(
        title
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .trim()
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .slice(0, 120),
      );
    }
  }, [title, slugTouched]);

  function buildInput(): BlogPostInput {
    return {
      title: title.trim(),
      slug: slug.trim() || undefined,
      excerpt: excerpt.trim() || null,
      body,
      coverImage: coverImage || null,
      authorName: authorName.trim() || null,
      tags: tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 20),
      metaTitle: metaTitle.trim() || null,
      metaDescription: metaDescription.trim() || null,
      // Explicit null on detach so ripllo clears the FK; absent on no-op.
      marketingCampaignId,
    };
  }

  async function save(statusOverride?: 'draft' | 'published') {
    if (!title.trim()) { setError('Title is required'); return; }
    if (!body.trim()) { setError('Body is required'); return; }
    setSaving(true); setError(''); setSuccess('');
    try {
      const payload: BlogPostInput = { ...buildInput(), status: statusOverride ?? status };
      if (mode === 'create') {
        const res = await blogApi.create(payload);
        const data = (res.data as { data?: BlogPost })?.data ?? (res.data as BlogPost);
        router.replace(`/dashboard/marketing/blog/${data.id}`);
      } else if (initial) {
        const res = await blogApi.update(initial.id, payload);
        const data = (res.data as { data?: BlogPost })?.data ?? (res.data as BlogPost);
        setStatus(data.status);
        setSuccess(statusOverride === 'published' ? 'Published.' : 'Saved.');
      }
    } catch (e) {
      setError(extractError(e) ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function onUpload(file: File) {
    setUploading(true); setError('');
    try {
      const res = await uploadsApi.uploadImage(file);
      const data = (res.data as { data?: { url: string } })?.data ?? (res.data as { url: string });
      setCoverImage(data.url);
    } catch (e) {
      setError(extractError(e) ?? 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function onDelete() {
    if (!initial) return;
    setSaving(true);
    try {
      await blogApi.delete(initial.id);
      router.replace('/dashboard/marketing/blog');
    } catch (e) {
      setError(extractError(e) ?? 'Delete failed');
      setSaving(false);
    }
  }

  async function onUnpublish() {
    if (!initial) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      const res = await blogApi.unpublish(initial.id);
      const data = (res.data as { data?: BlogPost })?.data ?? (res.data as BlogPost);
      setStatus(data.status);
      setSuccess('Unpublished — post is now a draft.');
    } catch (e) {
      setError(extractError(e) ?? 'Unpublish failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/marketing/blog" className="text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight font-display">{mode === 'create' ? 'New post' : 'Edit post'}</h1>
          {status === 'published' && (
            <Badge
              variant="outline"
              className="rounded-full border-transparent bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400"
            >
              Published
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setPreview((p) => !p)}>
            {preview ? <><EyeOff className="h-3.5 w-3.5" /> Edit</> : <><Eye className="h-3.5 w-3.5" /> Preview</>}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => save('draft')} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save draft
          </Button>
          {status === 'published' ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onUnpublish}
              disabled={saving}
              className="border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 hover:text-amber-400"
            >
              <EyeOff className="h-3.5 w-3.5" /> Unpublish
            </Button>
          ) : (
            <Button type="button" size="sm" onClick={() => save('published')} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Publish
            </Button>
          )}
        </div>
      </header>

      {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {success && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400">{success}</div>}

      {preview ? (
        <article className="prose prose-sm max-w-none rounded-lg border border-border bg-card p-8">
          {coverImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverImage} alt="" className="mb-6 w-full rounded-lg object-cover" />
          )}
          <h1 className="mb-2 text-3xl font-bold">{title || '(untitled)'}</h1>
          {excerpt && <p className="text-lg text-muted-foreground">{excerpt}</p>}
          <div dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }} />
        </article>
      ) : (
        <div className="space-y-4">
          <section className="rounded-lg border border-border bg-card p-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="title" className="text-xs font-medium">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="How we doubled conversions with a simple refund policy change"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="slug" className="text-xs font-medium">Slug</Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => { setSlugTouched(true); setSlug(e.target.value); }}
                placeholder="how-we-doubled-conversions"
                className="font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                URL: <code className="rounded bg-muted px-1 font-mono">/s/&lt;your-slug&gt;/blog/{slug || '…'}</code>
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="excerpt" className="text-xs font-medium">Excerpt</Label>
              <Textarea
                id="excerpt"
                value={excerpt ?? ''}
                onChange={(e) => setExcerpt(e.target.value)}
                rows={2}
                placeholder="One-line hook shown in the blog list + OG preview card."
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="body" className="text-xs font-medium">Body (Markdown)</Label>
              <Textarea
                id="body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={18}
                placeholder="# Heading&#10;&#10;Your content here. **Bold**, *italic*, [links](https://…), images `![alt](url)`, code blocks with triple-backticks."
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Supports headings, bold/italic, links, lists, code blocks, blockquotes, images. Preview button renders it.
              </p>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-5 space-y-4">
            <header className="text-sm font-semibold font-display">Cover image</header>
            {coverImage ? (
              <div className="relative">
                <Image
                  src={coverImage}
                  alt=""
                  width={640}
                  height={240}
                  className="w-full rounded-lg object-cover"
                  unoptimized
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setCoverImage('')}
                  className="absolute right-2 top-2 h-7 w-7 rounded-full bg-black/60 text-white hover:bg-black/80 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground hover:border-primary hover:text-foreground">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                {uploading ? 'Uploading…' : 'Click to upload cover image'}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); }}
                  className="hidden"
                />
              </label>
            )}
          </section>

          <section className="rounded-lg border border-border bg-card p-5 space-y-4">
            <header className="text-sm font-semibold font-display">Metadata</header>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="author" className="text-xs font-medium">Author name</Label>
                <Input
                  id="author"
                  value={authorName ?? ''}
                  onChange={(e) => setAuthorName(e.target.value)}
                  placeholder="Your name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tags" className="text-xs font-medium">Tags (comma-separated)</Label>
                <Input
                  id="tags"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="launch, update, tutorial"
                />
              </div>
            </div>
            <CampaignSelect value={marketingCampaignId} onChange={setMarketingCampaignId} disabled={saving} />
          </section>

          <details className="group rounded-lg border border-border bg-card">
            <summary className="flex cursor-pointer list-none items-center gap-2 p-4 text-sm font-semibold font-display [&::-webkit-details-marker]:hidden">
              <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
              SEO (optional)
            </summary>
            <div className="border-t border-border p-5 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="metaTitle" className="text-xs font-medium">Meta title</Label>
                <Input
                  id="metaTitle"
                  value={metaTitle ?? ''}
                  onChange={(e) => setMetaTitle(e.target.value)}
                  placeholder="Falls back to post title"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="metaDesc" className="text-xs font-medium">Meta description</Label>
                <Textarea
                  id="metaDesc"
                  value={metaDescription ?? ''}
                  onChange={(e) => setMetaDescription(e.target.value)}
                  rows={2}
                  placeholder="Falls back to excerpt. 150-160 chars ideal."
                />
              </div>
            </div>
          </details>

          {mode === 'edit' && (
            <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 p-4">
              <div>
                <p className="text-sm font-medium text-destructive">Delete this post</p>
                <p className="text-xs text-destructive">Permanent — removes it from your storefront and RSS.</p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={saving}
                    className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this post permanently?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This removes it from your storefront and RSS. This can&apos;t be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep post</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={onDelete}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete post
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}

          {mode === 'edit' && status === 'published' && initial && (
            <p className="text-xs text-muted-foreground">
              Live at{' '}
              <Link href={`/s/${''}${initial.slug ? '' : ''}/blog/${initial.slug}`} className="text-primary hover:underline">
                <span className="inline-flex items-center gap-1">View post <ExternalLink className="h-3 w-3" /></span>
              </Link>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function extractError(e: unknown): string | null {
  return (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? null;
}
