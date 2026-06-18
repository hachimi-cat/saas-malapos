/**
 * Admin portal route-group loading UI. Next.js renders this while a
 * server component in `src/app/(admin)/admin/(portal)/...` suspends.
 * Mirrors the merchant `(dashboard)/loading.tsx`.
 */
export default function AdminLoading() {
  return (
    <main style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>
      <div
        aria-busy
        style={{
          border: '1px dashed hsl(var(--border))',
          borderRadius: 12,
          padding: 48,
          color: 'hsl(var(--muted-foreground))',
          textAlign: 'center',
        }}
      >
        Loading…
      </div>
    </main>
  );
}
