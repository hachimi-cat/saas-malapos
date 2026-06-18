import { redirect } from 'next/navigation';

/**
 * OIDC callback — ADR-0004.
 *
 * Receives ?code=... from Huudis, exchanges it for an access token via
 * the backend's /auth/exchange endpoint (POST with the authorization
 * code), sets the session cookie, redirects to /dashboard.
 *
 * Template ships a placeholder — the token-exchange endpoint is a
 * per-product backend concern (each product holds its own client_secret
 * and sets its own cookie on its own domain).
 */
export default async function CallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; error?: string }>;
}) {
  const { code, error } = await searchParams;

  if (error) {
    return (
      <main style={{ maxWidth: 480, margin: '96px auto', textAlign: 'center' }}>
        <h1>Sign-in failed</h1>
        <p style={{ color: 'hsl(var(--muted-foreground))' }}>{error}</p>
        <p>
          <a href="/">Back to home</a>
        </p>
      </main>
    );
  }

  if (!code) {
    redirect('/');
  }

  // TODO per product: POST to backend /auth/exchange with { code }, set
  // httpOnly session cookie on the response, then redirect to /dashboard.
  return (
    <main style={{ maxWidth: 480, margin: '96px auto', textAlign: 'center' }}>
      <h1>Finishing sign-in…</h1>
      <p style={{ color: 'hsl(var(--muted-foreground))' }}>
        Implement token exchange against Huudis in the backend. See{' '}
        <code>src/app/callback/page.tsx</code>.
      </p>
      <p style={{ color: 'hsl(var(--muted-foreground))', fontSize: 12 }}>
        Received code: <code>{code.slice(0, 8)}…</code>
      </p>
    </main>
  );
}
