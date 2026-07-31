'use client';

/*
 * Feature flags — MANDATORY admin-portal standard.
 * See forjio/documentation/2. Technical/13-Admin-Portal-Standard.md.
 * Body from @forjio/admin-ui; data from malapos's adapter under
 * backend/src/routes/admin-*.ts.
 */

import { FeatureFlagsPanel } from '@forjio/admin-ui';
import { MALAPOS_ADMIN_ENDPOINTS } from '@/lib/admin-endpoints';

export default function Page() {
  return <FeatureFlagsPanel endpoint={MALAPOS_ADMIN_ENDPOINTS.featureFlags} />;
}
