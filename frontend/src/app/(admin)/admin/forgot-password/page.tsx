import Link from 'next/link';
import { ForgotPasswordForm } from '@forjio/auth-ui';
import { LogoMark } from '@/components/brand/logo';

/*
 * Admin forgot-password — mirrors the merchant `(auth)/forgot-password`
 * page. `ForgotPasswordForm` posts to the auth-ui default endpoint,
 * which `@forjio/sdk/auth-server`'s `createAuthRouter` mounts; it
 * proxies to Huudis's password-reset flow, which emails a reset link.
 * The flow is role-agnostic — Huudis owns the identity — so no
 * `endpoints` override is needed.
 *
 * rename.sh rewrites the "Malapos" display name.
 */
const brand = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Malapos';

export default function AdminForgotPasswordPage() {
  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-muted/30 px-4 py-16 md:py-24">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/admin/login" className="inline-flex" aria-label={`${brand} admin`}>
            <LogoMark size={36} className="text-primary" />
          </Link>
          <h1 className="mt-5 text-2xl font-bold tracking-tight">Forgot your password?</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter your email — we&rsquo;ll send a reset link from Huudis.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <ForgotPasswordForm />
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link className="underline hover:text-foreground" href="/admin/login">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
