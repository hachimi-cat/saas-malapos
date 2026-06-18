import { Suspense } from 'react';
import Link from 'next/link';
import { Hexagon } from 'lucide-react';
import { AuthForm, fetchSocialProviders } from '@forjio/auth-ui';

/*
 * Admin portal login. Server Component — resolves which social
 * providers Huudis has configured at render time so the SSR HTML
 * ships the correct button set.
 *
 * The admin portal is internal staff tooling: there is no marketing
 * surface for it, so this renders a self-contained centered card
 * rather than wrapping in the marketing chrome the merchant `(auth)`
 * pages use.
 *
 * `AuthForm` is run in `admin` mode by passing the role discriminator
 * two ways:
 *   - `extraBody={{ role: 'admin' }}`   → merged into the login/signup
 *     request body; `createAuthRouter` reads `req.body.role`.
 *   - `socialParams={{ role: 'admin' }}` → appended to the OIDC
 *     social-start URL; the Huudis callback mints the admin session.
 * The `*Href` overrides keep every link inside the /admin/* surface.
 *
 * Access is gated by the backend `gate` in auth-config.ts: a Huudis
 * account that is not an owner/admin of this product's Huudis
 * workspace is rejected at session-mint time, so a non-admin who
 * signs in here never gets an admin cookie.
 *
 * rename.sh rewrites the "Malapos" display name.
 */
const brand = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Malapos';

export default async function AdminLoginPage() {
  const providers = await fetchSocialProviders(
    process.env.NEXT_PUBLIC_HUUDIS_ISSUER || 'https://huudis.com',
  );
  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-muted/30 px-4 py-16 md:py-24">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/admin/login" className="inline-flex" aria-label={`${brand} admin`}>
            <Hexagon className="h-9 w-9 text-primary" strokeWidth={2} />
          </Link>
          <span className="mt-4 block font-mono text-[11px] uppercase tracking-[0.2em] text-primary">
            Admin portal
          </span>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">Welcome back</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to the {brand} admin console
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <Suspense fallback={null}>
            <AuthForm
              mode="login"
              brand={brand}
              providers={providers}
              defaultReturnTo="/admin/dashboard"
              loginHref="/admin/login"
              signupHref="/admin/login"
              forgotPasswordHref="/admin/forgot-password"
              extraBody={{ role: 'admin' }}
              socialParams={{ role: 'admin' }}
            />
          </Suspense>
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Internal staff only. Auth runs through{' '}
          <a className="underline hover:text-foreground" href="https://huudis.com">
            Huudis
          </a>
          .
        </p>
      </div>
    </div>
  );
}
