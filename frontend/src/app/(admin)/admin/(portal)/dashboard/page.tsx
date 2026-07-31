'use client';

/*
 * Admin dashboard — MANDATORY admin-portal standard.
 *
 * This was still the template's dashed-border placeholder telling forkers
 * to invent their own overview. It now composes the three standard
 * contracts (business metrics, system health, feature flags).
 *
 * Malapos's own admin surfaces go in `quickLinks` — on top of the
 * standard, never instead of it.
 */

import { AdminOverviewPanel } from '@forjio/admin-ui';
import { MALAPOS_ADMIN_ENDPOINTS } from '@/lib/admin-endpoints';

const brand = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Malapos';

export default function AdminDashboardPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <AdminOverviewPanel
        endpoints={MALAPOS_ADMIN_ENDPOINTS}
        brand={brand}
        quickLinks={[
          {
            href: '/admin/customers',
            label: 'Customers',
            description: 'Everyone signed into this product via Huudis SSO.',
          },
        ]}
      />
    </div>
  );
}
