'use client';

import { ErrorPanel } from '../../components/ui/error-panel';

/**
 * Dashboard route-group error boundary. Next.js renders this when a
 * server component (or client component) throws inside
 * `src/app/(dashboard)/...`. Ported (pattern) from saas-plugipay.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main style={{ maxWidth: 720, margin: '64px auto', padding: '0 24px' }}>
      <ErrorPanel
        title="Dashboard failed to load"
        message={error.message}
        code={error.digest}
        onRetry={reset}
      />
    </main>
  );
}
