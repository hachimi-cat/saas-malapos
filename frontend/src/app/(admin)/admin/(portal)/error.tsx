'use client';

import { ErrorPanel } from '@/components/ui/error-panel';

/**
 * Admin portal route-group error boundary. Next.js renders this when a
 * server or client component throws inside
 * `src/app/(admin)/admin/(portal)/...`. Mirrors the merchant
 * `(dashboard)/error.tsx`.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main style={{ maxWidth: 720, margin: '64px auto', padding: '0 24px' }}>
      <ErrorPanel
        title="Admin console failed to load"
        message={error.message}
        code={error.digest}
        onRetry={reset}
      />
    </main>
  );
}
