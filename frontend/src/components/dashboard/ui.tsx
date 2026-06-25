'use client';

import { Loader2, X } from 'lucide-react';
import type { ReactNode } from 'react';

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'} rounded-xl border border-border bg-card p-6 shadow-lg max-h-[90vh] overflow-y-auto`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
      {children}
    </div>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
      <Loader2 size={14} className="animate-spin" /> {label}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export function Button({
  children,
  variant = 'primary',
  loading,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
  loading?: boolean;
}) {
  const cls = {
    primary: 'bg-primary text-primary-foreground hover:bg-brand-600 shadow-sm',
    secondary: 'border border-border bg-card hover:bg-secondary',
    ghost: 'text-muted-foreground hover:text-foreground',
    destructive: 'border border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20',
  }[variant];
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-medium transition disabled:opacity-60 ${cls} ${props.className ?? ''}`}
    >
      {loading && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  );
}

export function StatusPill({ status }: { status: string }) {
  const tone = (() => {
    if (status === 'delivered' || status === 'active' || status === 'sent') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (status === 'cancelled' || status === 'failed' || status === 'returned' || status === 'revoked') return 'bg-destructive/10 text-destructive border-destructive/30';
    if (status === 'in_transit' || status === 'picked_up' || status === 'dropping_off' || status === 'allocated' || status === 'picking_up' || status === 'pending') return 'bg-blue-100 text-blue-700 border-blue-200';
    return 'bg-secondary text-muted-foreground border-border';
  })();
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${tone}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}
