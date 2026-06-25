'use client';

import Link from 'next/link';
import { Truck, ExternalLink } from 'lucide-react';

/*
 * Shared "enable the Fulfillment module" empty state for the
 * /dashboard/fulfillment/* pages. Rendered when a fulfillment-scoped
 * fetch returns 409 FULFILLMENT_MODULE_DISABLED (the module is off for
 * this workspace). Mirrors the inline block on the existing
 * /dashboard/fulfillment page.
 */
export function FulfillmentModuleOff({ blurb }: { blurb?: string }) {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="rounded-lg border border-border bg-card px-8 py-16 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Truck className="h-6 w-6 text-primary" />
        </div>
        <h1 className="text-lg font-semibold">Enable the Fulfillment module</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          {blurb ??
            'Fulfillment uses Fulkruma to manage warehouses, stock, shipments, licenses, and digital deliveries across Indonesia (Biteship). Turn it on to use this page.'}
        </p>
        <Link
          href="/dashboard/settings/modules"
          className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Go to Modules <ExternalLink className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
