'use client';

/*
 * System metrics — MANDATORY admin-portal standard.
 * See forjio/documentation/2. Technical/13-Admin-Portal-Standard.md.
 * Body from @forjio/admin-ui; data from malapos's adapter under
 * backend/src/routes/admin-*.ts.
 */

import { SystemHealthPanel } from '@forjio/admin-ui';

export default function Page() {
  return <SystemHealthPanel />;
}
