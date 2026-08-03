import * as React from 'react';
import { cn } from '@/lib/utils';

const PROVIDER_COLORS = {
  managed: { bg: '#A16207', label: 'PM' },
  xendit: { bg: '#00D4C8', label: 'XN' },
  midtrans: { bg: '#1A5AF7', label: 'MT' },
  paypal: { bg: '#003087', label: 'PP' },
  manual: { bg: '#475569', label: 'MN' },
} as const;

export type ProviderKey = keyof typeof PROVIDER_COLORS;

interface ProviderIconProps {
  provider: ProviderKey;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function ProviderIcon({ provider, size = 'md', className }: ProviderIconProps) {
  const cfg = PROVIDER_COLORS[provider];
  const sizeCls = size === 'sm' ? 'size-7 text-[11px]' : size === 'lg' ? 'size-12 text-base' : 'size-10 text-sm';
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-md text-white font-semibold tracking-tight',
        sizeCls,
        className,
      )}
      style={{ backgroundColor: cfg.bg }}
      aria-hidden
    >
      {cfg.label}
    </span>
  );
}

export const PROVIDER_LABELS: Record<ProviderKey, string> = {
  managed: 'Plugipay managed',
  xendit: 'Xendit (BYO)',
  midtrans: 'Midtrans (BYO)',
  paypal: 'PayPal (BYO)',
  manual: 'Offline & manual',
};
