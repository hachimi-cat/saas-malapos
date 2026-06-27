'use client';

import { useEffect, useState } from 'react';
import { Loader2, Truck } from 'lucide-react';
import { deliveriesApi, type Delivery } from '@/lib/fulfillment-api';
import { ApiRequestError } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { DataTable, type Column, type FilterDef } from '@/components/data-table';
import { FulfillmentModuleOff } from '@/components/fulfillment/module-off';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/*
 * Fulfillment → Digital deliveries. malapos port of storlaunch's page over
 * /api/v1/fulfillment/deliveries. Tracks digital-product deliveries to
 * customers (download windows + counts), sourced from Fulkruma. malapos
 * keeps no local delivery table, so this is a read-only Fulkruma view.
 */

function deliveryStatus(d: Delivery): 'expired' | 'maxed' | 'active' {
  if (new Date(d.expiresAt) < new Date()) return 'expired';
  if (d.downloadCount >= d.maxDownloads) return 'maxed';
  return 'active';
}

function StatusBadge({ delivery }: { delivery: Delivery }) {
  const s = deliveryStatus(delivery);
  if (s === 'expired')
    return <Badge variant="outline" className="rounded-full border-transparent bg-destructive/10 text-destructive">Expired</Badge>;
  if (s === 'maxed')
    return <Badge variant="outline" className="rounded-full border-transparent bg-amber-500/10 text-amber-400">Limit Reached</Badge>;
  return <Badge variant="outline" className="rounded-full border-transparent bg-emerald-500/10 text-emerald-400">Active</Badge>;
}

export default function DeliveriesPage() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [moduleOff, setModuleOff] = useState(false);
  const [detail, setDetail] = useState<Delivery | null>(null);

  useEffect(() => {
    deliveriesApi
      .list()
      .then((res) => setDeliveries(res.data ?? []))
      .catch((e) => {
        if (e instanceof ApiRequestError && e.status === 409) setModuleOff(true);
        else setDeliveries([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const columns: Column<Delivery>[] = [
    {
      key: 'id',
      header: 'Delivery ID',
      sortable: true,
      sortValue: (d) => d.id,
      searchValue: (d) => `${d.id} ${d.productId} ${d.customerId}`,
      cell: (d) => (
        <button type="button" onClick={() => setDetail(d)} className="font-mono text-xs text-primary hover:underline">
          {d.id.slice(0, 12)}…
        </button>
      ),
    },
    {
      key: 'product',
      header: 'Product',
      sortable: true,
      sortValue: (d) => d.productId,
      cell: (d) => <span className="font-mono text-xs text-muted-foreground">{d.productId.slice(0, 12)}…</span>,
    },
    {
      key: 'customer',
      header: 'Customer',
      sortable: true,
      sortValue: (d) => d.customerId,
      cell: (d) => <span className="font-mono text-xs text-muted-foreground">{d.customerId.slice(0, 12)}…</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      sortValue: (d) => deliveryStatus(d),
      cell: (d) => <StatusBadge delivery={d} />,
    },
    {
      key: 'downloads',
      header: 'Downloads',
      align: 'right',
      sortable: true,
      sortValue: (d) => d.downloadCount,
      cell: (d) => <span className="text-muted-foreground">{d.downloadCount} / {d.maxDownloads}</span>,
    },
    {
      key: 'expires',
      header: 'Expires',
      sortable: true,
      sortValue: (d) => new Date(d.expiresAt).getTime(),
      cell: (d) => <span className="text-muted-foreground">{formatDate(d.expiresAt)}</span>,
    },
    {
      key: 'createdAt',
      header: 'Created',
      sortable: true,
      sortValue: (d) => new Date(d.createdAt).getTime(),
      cell: (d) => <span className="text-muted-foreground">{formatDate(d.createdAt)}</span>,
    },
  ];

  const filters: FilterDef<Delivery>[] = [
    {
      key: 'status',
      label: 'Status',
      accessor: (d) => deliveryStatus(d),
      options: [
        { value: 'active', label: 'Active' },
        { value: 'maxed', label: 'Limit reached' },
        { value: 'expired', label: 'Expired' },
      ],
    },
  ];

  if (moduleOff) return <FulfillmentModuleOff blurb="Digital deliveries grant buyers download access via Fulkruma. Turn on the Fulfillment module to track them." />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight font-display">Digital deliveries</h1>
        <p className="mt-1 text-sm text-muted-foreground">Track digital product deliveries to customers.</p>
      </div>

      {loading ? (
        <Card className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </Card>
      ) : deliveries.length === 0 ? (
        <Card className="flex h-48 flex-col items-center justify-center gap-3 border-dashed">
          <Truck className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No deliveries yet</p>
          <p className="text-xs text-muted-foreground/60">Deliveries are created when customers complete a purchase.</p>
        </Card>
      ) : (
        <DataTable
          rows={deliveries}
          columns={columns}
          filters={filters}
          rowKey={(d) => d.id}
          searchPlaceholder="Search delivery id, product, customer…"
          defaultSort={{ key: 'createdAt', dir: 'desc' }}
          empty="No deliveries match."
        />
      )}

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Delivery detail</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Delivery ID</p>
                <p className="font-mono text-xs">{detail.id}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <StatusBadge delivery={detail} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Product</p>
                <p className="font-mono text-xs">{detail.productId}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Customer</p>
                <p className="font-mono text-xs">{detail.customerId}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Downloads</p>
                <p>{detail.downloadCount} / {detail.maxDownloads}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Expires</p>
                <p>{formatDate(detail.expiresAt)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Created</p>
                <p>{formatDate(detail.createdAt)}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
