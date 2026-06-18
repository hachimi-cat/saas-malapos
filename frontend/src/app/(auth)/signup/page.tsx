import { Suspense } from 'react';
import { AuthForm, fetchSocialProviders } from '@forjio/auth-ui';
import { LogoMark } from '@/components/brand/logo';

const brand = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Malapos';

export default async function SignupPage() {
  // Only the live providers (Google) — hides Apple/Facebook (see login page).
  const providers = await fetchSocialProviders(
    process.env.NEXT_PUBLIC_HUUDIS_ISSUER || 'https://huudis.com',
  );
  return (
    <div className="flex items-center justify-center bg-muted/30 px-4 py-16 md:py-24">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <LogoMark size={36} className="mx-auto mb-4 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Create your account</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Get started with {brand} in minutes
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <Suspense fallback={null}>
            <AuthForm mode="signup" brand={brand} providers={providers} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
