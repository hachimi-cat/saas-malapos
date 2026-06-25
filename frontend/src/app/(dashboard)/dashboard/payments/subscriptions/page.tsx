'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { subscriptionsApi, Subscription } from '@/lib/payments-api';
import { formatDate, cn } from '@/lib/utils';
import { Loader2, PauseCircle, PlayCircle, XCircle } from 'lucide-react';
import { BillingTabs } from '@/components/payment/BillingTabs';
import { DataTable, type Column, type FilterDef } from '@/components/data-table';

const STATUS_COLOR: Record<string, string> = {
  active: 'bg-green-500/10 text-green-400',
  trialing: 'bg-blue-500/10 text-blue-400',
  past_due: 'bg-orange-500/10 text-orange-400',
  paused: 'bg-yellow-500/10 text-yellow-400',
  canceled: 'bg-muted text-muted-foreground',
  created: 'bg-muted text-muted-foreground',
};

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'trialing', label: 'Trialing' },
  { value: 'past_due', label: 'Past due' },
  { value: 'paused', label: 'Paused' },
  { value: 'canceled', label: 'Canceled' },
];

export default function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    subscriptionsApi
      .list({ limit: 100 })
      .then((res) =>
        setSubscriptions(
          (res.data as unknown as { data?: Subscription[] })?.data ??
            (res.data as unknown as Subscription[])
        )
      )
      .catch(() => setSubscriptions([]))
      .finally(() => setLoading(false));
  }, []);

  async function handleAction(id: string, action: 'cancel' | 'pause' | 'resume') {
    setActionLoading(id);
    try {
      let res;
      if (action === 'cancel') res = await subscriptionsApi.cancel(id);
      else if (action === 'pause') res = await subscriptionsApi.pause(id);
      else res = await subscriptionsApi.resume(id);
      const updated = res.data as unknown as Subscription;
      setSubscriptions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } catch {
      alert(`Failed to ${action} subscription`);
    } finally {
      setActionLoading(null);
    }
  }

  const columns: Column<Subscription>[] = [
    {
      key: 'id',
      header: 'ID',
      sortable: true,
      sortValue: (r) => r.id,
      searchValue: (r) => `${r.id} ${r.planName}`,
      cell: (r) => (
        <Link href={`/dashboard/payments/subscriptions/${r.id}`} className="font-mono text-primary hover:underline">
          {r.id}
        </Link>
      ),
    },
    {
      key: 'plan',
      header: 'Plan',
      sortable: true,
      sortValue: (r) => r.planName,
      cell: (r) => <span className="font-medium">{r.planName}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      sortValue: (r) => r.status,
      cell: (r) => (
        <span>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-xs font-medium capitalize',
              STATUS_COLOR[r.status] || 'bg-muted text-muted-foreground'
            )}
          >
            {r.status.replace('_', ' ')}
          </span>
          {r.cancelAtPeriodEnd && (
            <span className="ml-2 text-xs text-orange-400">Cancels EOT</span>
          )}
        </span>
      ),
    },
    {
      key: 'period',
      header: 'Current Period',
      sortable: true,
      sortValue: (r) => new Date(r.currentPeriodEnd).getTime(),
      cell: (r) => (
        <span className="text-muted-foreground">
          {formatDate(r.currentPeriodStart)} → {formatDate(r.currentPeriodEnd)}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      sortable: true,
      sortValue: (r) => new Date(r.createdAt).getTime(),
      cell: (r) => <span className="text-muted-foreground">{formatDate(r.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      cell: (r) => (
        <div className="flex items-center gap-2">
          {r.status === 'active' && (
            <>
              <button
                onClick={() => handleAction(r.id, 'pause')}
                disabled={actionLoading === r.id}
                title="Pause"
                className="text-muted-foreground hover:text-yellow-400 disabled:opacity-50"
              >
                {actionLoading === r.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PauseCircle className="h-4 w-4" />
                )}
              </button>
              <button
                onClick={() => {
                  if (confirm('Cancel subscription at end of period?')) {
                    handleAction(r.id, 'cancel');
                  }
                }}
                disabled={actionLoading === r.id}
                title="Cancel"
                className="text-muted-foreground hover:text-red-400 disabled:opacity-50"
              >
                <XCircle className="h-4 w-4" />
              </button>
            </>
          )}
          {r.status === 'paused' && (
            <button
              onClick={() => handleAction(r.id, 'resume')}
              disabled={actionLoading === r.id}
              title="Resume"
              className="text-muted-foreground hover:text-green-400 disabled:opacity-50"
            >
              {actionLoading === r.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PlayCircle className="h-4 w-4" />
              )}
            </button>
          )}
        </div>
      ),
    },
  ];

  const filters: FilterDef<Subscription>[] = [
    { key: 'status', label: 'Status', accessor: (r) => r.status, options: STATUS_OPTIONS },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">Subscriptions</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage customer subscription lifecycle</p>
      </div>

      <BillingTabs />

      {loading ? (
        <div className="flex h-48 items-center justify-center rounded-lg border border-border bg-card">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : subscriptions.length === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-lg border border-border bg-card">
          <p className="text-sm text-muted-foreground">No subscriptions found</p>
        </div>
      ) : (
        <DataTable
          rows={subscriptions}
          columns={columns}
          filters={filters}
          rowKey={(r) => r.id}
          searchPlaceholder="Search id, plan…"
          defaultSort={{ key: 'createdAt', dir: 'desc' }}
          empty="No subscriptions match."
        />
      )}
    </div>
  );
}
