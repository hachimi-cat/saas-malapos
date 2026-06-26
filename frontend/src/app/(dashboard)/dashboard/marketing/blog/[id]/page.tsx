'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { blogApi, type BlogPost } from '@/lib/marketing-api';
import { Loader2 } from 'lucide-react';
import PostEditor from '../_components/post-editor';

export default function BlogPostEditPage() {
  const params = useParams<{ id: string }>();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    blogApi
      .get(params.id)
      .then((res) => {
        const data = (res.data as { data?: BlogPost })?.data ?? (res.data as BlogPost);
        setPost(data);
      })
      .catch((e) =>
        setError(
          (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Not found',
        ),
      )
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return <div className="flex h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (error || !post) {
    return (
      <div className="mx-auto max-w-6xl">
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{error || 'Post not found'}</div>
      </div>
    );
  }
  return <PostEditor mode="edit" initial={post} />;
}
