import { Suspense } from 'react';
import { AuthForm } from '@forjio/auth-ui';

const brand = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Malapos';

export default function LoginPage() {
  return (
    <div className="flex items-center justify-center bg-muted/30 px-4 py-16 md:py-24">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to your {brand} account
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <Suspense fallback={null}>
            <AuthForm mode="login" brand={brand} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
