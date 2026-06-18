/*
 * Admin dashboard home. The admin auth gate + portal shell live in the
 * route-group layout (`(admin)/admin/(portal)/layout.tsx`) — this page
 * is just the content.
 *
 * FORKERS: replace the empty state with your product's admin overview
 * (review-queue counts, system health, recent activity). Admin data is
 * fetched through the admin BFF proxy at `/api/v1/console/*`, which
 * stamps the admin role header — no secret in the browser.
 *
 * rename.sh rewrites the "Malapos" display name.
 */
const brand = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Malapos';

export default function AdminDashboardPage() {
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>{brand} Admin Console</h1>
        <p style={{ color: 'hsl(var(--muted-foreground))' }}>
          Internal staff portal — gated on owner/admin of the {brand} Huudis
          workspace.
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
        No admin content yet. Add your product&rsquo;s admin surfaces in{' '}
        <code>src/app/(admin)/admin/(portal)/</code>, nav entries in{' '}
        <code>src/components/admin-shell.tsx</code>, and the matching
        guarded routers under <code>backend/src/routes/</code> (mounted
        at <code>/api/v1/admin/*</code> behind <code>adminGuard</code>).
      </div>
    </div>
  );
}
