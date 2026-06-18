import { Suspense } from 'react';
import { ResetPasswordForm } from '@forjio/auth-ui';

export default function ResetPasswordPage() {
  return (
    <div className="flex items-center justify-center bg-muted/30 px-4 py-16 md:py-24">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Choose a new password</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick something you&rsquo;ll remember — we won&rsquo;t email it back.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <Suspense fallback={null}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
