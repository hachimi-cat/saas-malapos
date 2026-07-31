'use client';

/*
 * Customers — MANDATORY admin-portal standard.
 * See forjio/documentation/2. Technical/13-Admin-Portal-Standard.md.
 *
 * Body from @forjio/admin-ui; data from malapos's adapter in
 * backend/src/routes/admin-customers.ts, which joins the Huudis SSO
 * roster against malapos's own shift, transaction and outlet tables.
 */

import { CustomersPanel } from '@forjio/admin-ui';

export default function Page() {
  return <CustomersPanel />;
}
