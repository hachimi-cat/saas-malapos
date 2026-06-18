/*
 * Dashboard home. The auth gate + portal shell live in the route-group
 * layout (`(dashboard)/layout.tsx`) — this page is just the content.
 * FORKERS: replace the empty state with your product's overview.
 */
const brand = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Malapos';

export default function DashboardPage() {
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>{brand} Dashboard</h1>
        <p style={{ color: 'hsl(var(--muted-foreground))' }}>
          Empty shell — each product fills this with its own sections.
        </p>
      </header>
      <div
        style={{
          border: '1px dashed hsl(var(--border))',
          borderRadius: 12,
          padding: 48,
          color: 'hsl(var(--muted-foreground))',
          textAlign: 'center',
        }}
      >
        No content yet. Add your product surface in{' '}
        <code>src/app/(dashboard)/dashboard/</code> and nav entries in{' '}
        <code>src/components/dashboard-shell.tsx</code>.
      </div>
    </div>
  );
}
