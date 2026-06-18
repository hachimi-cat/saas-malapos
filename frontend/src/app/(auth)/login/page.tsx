import { Suspense } from 'react';
import { AuthForm, fetchSocialProviders } from '@forjio/auth-ui';
import { LogoMark } from '@/components/brand/logo';

const brand = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Malapos';

export default async function LoginPage() {
  // Only render social buttons Huudis actually has live (Google). Passing
  // the live set hides Apple/Facebook — AuthForm shows a provider unless
  // it is explicitly `false`, so omitting this prop surfaces all three.
  const providers = await fetchSocialProviders(
    process.env.NEXT_PUBLIC_HUUDIS_ISSUER || 'https://huudis.com',
  );
  return (
    <div className="flex items-center justify-center bg-muted/30 px-4 py-16 md:py-24">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <LogoMark size={36} className="mx-auto mb-4 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to your {brand} account
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <Suspense fallback={null}>
            <AuthForm mode="login" brand={brand} providers={providers} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
