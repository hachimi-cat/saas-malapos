'use client';

/**
 * Reusable error panel. Ported from saas-plugipay, restyled onto the
 * shadcn/Tailwind design tokens (destructive palette + shadcn Button).
 * Public API (ErrorPanelProps) is unchanged.
 */

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface ErrorPanelProps {
  title?: string;
  message?: string;
  code?: string;
  onRetry?: () => void;
}

export function ErrorPanel({ title, message, code, onRetry }: ErrorPanelProps) {
  return (
    <div
      role="alert"
      className="flex items-start gap-4 rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-destructive"
    >
      <AlertTriangle aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold">
          {title ?? 'Something went wrong'}
        </h3>
        <p className="mt-1 text-sm leading-relaxed">
          {message ?? 'The request failed. Try again in a moment.'}
        </p>
        {code && (
          <p className="mt-2 font-mono text-[11px] opacity-75">code: {code}</p>
        )}
        {onRetry && (
          <div className="mt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRetry}
              className="border-destructive/40 bg-background text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              Retry
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
