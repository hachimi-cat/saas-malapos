'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { blogApi, uploadsApi, type BlogPost, type BlogPostInput } from '@/lib/marketing-api';
import { CampaignSelect } from '@/components/marketing/campaign-select';
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
    if (!confirm('Delete this post permanently?')) return;
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
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/marketing/blog" className="text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-2xl font-bold">{mode === 'create' ? 'New post' : 'Edit post'}</h1>
          {status === 'published' && (
            <span className="rounded-full border border-green-300 bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700">
              Published
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPreview((p) => !p)}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-muted"
          >
            {preview ? <><EyeOff className="h-3.5 w-3.5" /> Edit</> : <><Eye className="h-3.5 w-3.5" /> Preview</>}
          </button>
          <button
            type="button"
            onClick={() => save('draft')}
            disabled={saving}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save draft
          </button>
          {status === 'published' ? (
            <button
              type="button"
              onClick={onUnpublish}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
            >
              <EyeOff className="h-3.5 w-3.5" /> Unpublish
            </button>
          ) : (
            <button
              type="button"
              onClick={() => save('published')}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Publish
            </button>
          )}
        </div>
      </header>

      {error && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800">{success}</div>}

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
            <div>
              <label htmlFor="title" className="mb-1 block text-xs font-medium">Title</label>
              <input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="How we doubled conversions with a simple refund policy change"
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label htmlFor="slug" className="mb-1 block text-xs font-medium">Slug</label>
              <input
                id="slug"
                value={slug}
                onChange={(e) => { setSlugTouched(true); setSlug(e.target.value); }}
                placeholder="how-we-doubled-conversions"
                className="w-full rounded border border-border bg-background px-3 py-2 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                URL: <code className="rounded bg-muted px-1 font-mono">/s/&lt;your-slug&gt;/blog/{slug || '…'}</code>
              </p>
            </div>

            <div>
              <label htmlFor="excerpt" className="mb-1 block text-xs font-medium">Excerpt</label>
              <textarea
                id="excerpt"
                value={excerpt ?? ''}
                onChange={(e) => setExcerpt(e.target.value)}
                rows={2}
                placeholder="One-line hook shown in the blog list + OG preview card."
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label htmlFor="body" className="mb-1 block text-xs font-medium">Body (Markdown)</label>
              <textarea
                id="body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={18}
                placeholder="# Heading&#10;&#10;Your content here. **Bold**, *italic*, [links](https://…), images `![alt](url)`, code blocks with triple-backticks."
                className="w-full rounded border border-border bg-background px-3 py-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Supports headings, bold/italic, links, lists, code blocks, blockquotes, images. Preview button renders it.
              </p>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-5 space-y-4">
            <header className="text-sm font-semibold">Cover image</header>
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
                <button
                  type="button"
                  onClick={() => setCoverImage('')}
                  className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
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
            <header className="text-sm font-semibold">Metadata</header>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="author" className="mb-1 block text-xs font-medium">Author name</label>
                <input
                  id="author"
                  value={authorName ?? ''}
                  onChange={(e) => setAuthorName(e.target.value)}
                  placeholder="Your name"
                  className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label htmlFor="tags" className="mb-1 block text-xs font-medium">Tags (comma-separated)</label>
                <input
                  id="tags"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="launch, update, tutorial"
                  className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
            <CampaignSelect value={marketingCampaignId} onChange={setMarketingCampaignId} disabled={saving} />
          </section>

          <details className="group rounded-lg border border-border bg-card">
            <summary className="flex cursor-pointer list-none items-center gap-2 p-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">
              <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
              SEO (optional)
            </summary>
            <div className="border-t border-border p-5 space-y-4">
              <div>
                <label htmlFor="metaTitle" className="mb-1 block text-xs font-medium">Meta title</label>
                <input
                  id="metaTitle"
                  value={metaTitle ?? ''}
                  onChange={(e) => setMetaTitle(e.target.value)}
                  placeholder="Falls back to post title"
                  className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label htmlFor="metaDesc" className="mb-1 block text-xs font-medium">Meta description</label>
                <textarea
                  id="metaDesc"
                  value={metaDescription ?? ''}
                  onChange={(e) => setMetaDescription(e.target.value)}
                  rows={2}
                  placeholder="Falls back to excerpt. 150-160 chars ideal."
                  className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          </details>

          {mode === 'edit' && (
            <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50/50 p-4">
              <div>
                <p className="text-sm font-medium text-red-900">Delete this post</p>
                <p className="text-xs text-red-700">Permanent — removes it from your storefront and RSS.</p>
              </div>
              <button
                type="button"
                onClick={onDelete}
                disabled={saving}
                className="inline-flex items-center gap-1 rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
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
