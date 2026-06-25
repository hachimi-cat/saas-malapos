/*
 * Payment (Plugipay) merchant API clients. malapos port of the
 * payment-related resource clients from storlaunch's lib/api.ts, but
 * implemented over malapos's envelope-aware `api` object (lib/api.ts)
 * instead of axios.
 *
 * Each call returns `{ data }` (the malapos `api` also returns `meta`),
 * so existing storlaunch-style call sites — `const { data } = await
 * plansApi.list()` — work unchanged. Errors throw `ApiRequestError`.
 *
 * Paths target the backend resource routers mounted under
 * `/api/v1/payments/*` (see backend routes/index.ts).
 */

import { api, apiRequest, type RequestOptions } from './api';

// ─── Types (mirror storlaunch's payment DTOs for page parity) ─────────

export interface CheckoutSession {
  id: string;
  amount: number;
  currency: string;
  description: string | null;
  customerId: string | null;
  customerEmail: string | null;
  status: 'open' | 'pending' | 'completed' | 'expired' | 'pending_review' | 'canceled' | 'refunded';
  checkoutUrl: string;
  successUrl: string;
  cancelUrl: string;
  paymentMethod: string | null;
  methods?: string[];
  metadata: Record<string, string> | null;
  expiresAt: string;
  completedAt: string | null;
  createdAt: string;
  adapter?: string | null;
  hostedUrl?: string | null;
  mode?: string;
  paymentId?: string | null;
}

export interface PlanPrice {
  id: string;
  planId: string;
  currency: string;
  model: 'flat' | 'tiered' | 'usage' | string;
  unitAmount: number;
  active: boolean;
  taxMode?: string;
}

export interface Plan {
  id: string;
  name: string;
  description: string | null;
  amount: number;
  currency: string;
  interval: 'day' | 'week' | 'month' | 'year';
  intervalCount?: number;
  trialPeriodDays?: number | null;
  trialDays?: number;
  active: boolean;
  metadata?: Record<string, string>;
  prices?: PlanPrice[];
  createdAt: string;
}

export interface Subscription {
  id: string;
  customerId: string;
  planId: string;
  planName?: string;
  status: 'created' | 'trialing' | 'active' | 'past_due' | 'paused' | 'canceled' | 'incomplete';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  canceledAt?: string | null;
  trialStart?: string | null;
  trialEnd?: string | null;
  trialEndsAt?: string | null;
  createdAt: string;
}

export interface Invoice {
  id: string;
  subscriptionId?: string | null;
  customerId: string | null;
  customerEmail?: string | null;
  number?: string;
  amount: number;
  currency: string;
  status: 'draft' | 'open' | 'past_due' | 'paid' | 'void' | 'uncollectible';
  subtotal?: number;
  tax?: number;
  total?: number;
  amountPaid?: number;
  amountDue?: number;
  dueDate: string | null;
  dueAt?: string | null;
  issuedAt?: string | null;
  paidAt: string | null;
  pdfUrl: string | null;
  hostedInvoiceUrl?: string | null;
  lineItems: Array<{ description: string; amount: number; quantity: number }>;
  createdAt: string;
}

export interface Receipt {
  id: string;
  number: string;
  sourceType: 'checkout_session' | 'invoice';
  sourceId: string;
  customerId: string | null;
  amount: number;
  currency: string;
  method: string | null;
  adapter: string | null;
  issuedAt: string;
  emailedAt: string | null;
  emailedTo: string | null;
}

export interface Customer {
  id: string;
  email: string | null;
  name: string | null;
  phone?: string | null;
  externalId?: string | null;
  metadata?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export type LedgerCategory =
  | 'sale'
  | 'refund'
  | 'platform_fee'
  | 'channel_fee'
  | 'shipping_cost'
  | 'shipping_refund'
  | 'payout'
  | 'adjustment';

export interface LedgerEntry {
  id: string;
  accountId: string;
  customerId: string | null;
  customer: { id: string; email: string; name: string | null } | null;
  transactionId: string;
  sourceType: string | null;
  sourceId: string | null;
  category: LedgerCategory | null;
  type: 'debit' | 'credit';
  amount: number;
  currency: string;
  description: string;
  balanceBefore: number;
  balanceAfter: number;
  createdAt: string;
}

export interface PnlReport {
  period: { from: string; to: string };
  currency: string | null;
  revenue: { sales: number; refunds: number; net: number };
  expenses: { platformFees: number; channelFees: number; shippingCosts: number; shippingRefunds: number; total: number };
  netProfit: number;
  entryCount: number;
}

export interface CashFlowReport {
  period: { from: string; to: string };
  currency: string | null;
  openingBalance: number;
  closingBalance: number;
  netChange: number;
  inflows: Record<string, number>;
  outflows: Record<string, number>;
  totalIn: number;
  totalOut: number;
  entryCount: number;
}

export type PayoutStatus = 'pending' | 'in_transit' | 'paid' | 'failed' | 'cancelled';
export type PayoutMethod = 'manual' | 'xendit_disbursement';

export interface Payout {
  id: string;
  accountId: string;
  amount: number;
  currency: string;
  status: PayoutStatus;
  method: PayoutMethod;
  bankCode: string | null;
  bankName: string;
  bankAccountNumber: string;
  bankAccountHolder: string;
  reference: string | null;
  note: string | null;
  failureReason: string | null;
  requestedAt?: string;
  processedAt: string | null;
  completedAt: string | null;
  ledgerTransactionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PayoutBankAccount {
  bankCode: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountHolder: string | null;
  configured: boolean;
}

// ─── Query-string helper ──────────────────────────────────────────────

function qs(params?: Record<string, unknown>): string {
  if (!params) return '';
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    usp.append(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

// ─── Resource clients ─────────────────────────────────────────────────

export const checkoutSessionsApi = {
  list: (params?: { status?: string; cursor?: string; limit?: number }) =>
    api.get<CheckoutSession[]>(`/payments/checkout-sessions${qs(params)}`),
  get: (id: string) => api.get<CheckoutSession>(`/payments/checkout-sessions/${id}`),
  confirm: (id: string) => api.post<CheckoutSession>(`/payments/checkout-sessions/${id}/confirm`, {}),
  create: (body: {
    amount: number;
    currency: string;
    successUrl: string;
    cancelUrl: string;
    customerId?: string;
    paymentMethods?: string[];
    expiresInMinutes?: number;
    metadata?: Record<string, string>;
  }) => api.post<CheckoutSession>('/payments/checkout-sessions', body),
};

export const plansApi = {
  list: (params?: { cursor?: string; limit?: number; active?: boolean }) =>
    api.get<Plan[]>(`/payments/plans${qs(params)}`),
  get: (id: string) => api.get<Plan>(`/payments/plans/${id}`),
  create: (body: Partial<Plan> & { amount: number; name: string }) => api.post<Plan>('/payments/plans', body),
  update: (id: string, body: Partial<Plan>) => api.patch<Plan>(`/payments/plans/${id}`, body),
  delete: (id: string) => api.delete(`/payments/plans/${id}`),
  addPrice: (
    planId: string,
    body: { currency: string; model?: 'flat' | 'usage'; unitAmount?: number; taxMode?: 'inclusive' | 'exclusive' },
  ) => api.post<PlanPrice>(`/payments/plans/${planId}/prices`, body),
  updatePrice: (priceId: string, body: { active: boolean }) =>
    api.patch<PlanPrice>(`/payments/plans/prices/${priceId}`, body),
};

export const subscriptionsApi = {
  list: (params?: { status?: string; cursor?: string; limit?: number; customerId?: string; planId?: string }) =>
    api.get<Subscription[]>(`/payments/subscriptions${qs(params)}`),
  get: (id: string) => api.get<Subscription>(`/payments/subscriptions/${id}`),
  create: (body: { customerId: string; planId: string; priceId?: string; trialEnd?: string }) =>
    api.post<Subscription>('/payments/subscriptions', body),
  cancel: (id: string, immediate = false) =>
    apiRequest<void>(`/payments/subscriptions/${id}${immediate ? '?immediate=true' : ''}`, { method: 'DELETE' }),
  pause: (id: string) => api.patch<Subscription>(`/payments/subscriptions/${id}`, { action: 'pause' }),
  resume: (id: string) => api.patch<Subscription>(`/payments/subscriptions/${id}`, { action: 'resume' }),
};

export const invoicesApi = {
  list: (params?: { status?: string; cursor?: string; limit?: number; customerId?: string }) =>
    api.get<Invoice[]>(`/payments/invoices${qs(params)}`),
  get: (id: string) => api.get<Invoice>(`/payments/invoices/${id}`),
};

export const receiptsApi = {
  list: (params?: { cursor?: string; limit?: number; sourceType?: 'checkout_session' | 'invoice'; customerId?: string }) =>
    api.get<Receipt[]>(`/payments/receipts${qs(params)}`),
  get: (id: string) => api.get<Receipt>(`/payments/receipts/${id}`),
  email: (id: string, to?: string) =>
    api.post<{ sent: boolean; to: string }>(`/payments/receipts/${id}/email`, to ? { to } : {}),
};

export const customersApi = {
  list: (params?: { cursor?: string; limit?: number; email?: string }) =>
    api.get<Customer[]>(`/payments/customers${qs(params)}`),
  get: (id: string) => api.get<Customer>(`/payments/customers/${id}`),
  create: (body: { email: string; name?: string; metadata?: Record<string, string> }) =>
    api.post<Customer>('/payments/customers', body),
  update: (id: string, body: { email?: string; name?: string; metadata?: Record<string, string> }) =>
    api.patch<Customer>(`/payments/customers/${id}`, body),
};

export const payoutsApi = {
  getBalance: () =>
    api.get<{ ledgerBalance: number; locked: number; available: number; currency: string | null }>(
      '/payments/payouts/balance',
    ),
  getBankAccount: () => api.get<PayoutBankAccount>('/payments/payouts/bank-account'),
  updateBankAccount: (body: {
    bankCode?: string | null;
    bankName: string;
    bankAccountNumber: string;
    bankAccountHolder: string;
  }) => api.patch<PayoutBankAccount>('/payments/payouts/bank-account', body),
  list: (params?: { status?: PayoutStatus; cursor?: string; limit?: number }) =>
    api.get<Payout[]>(`/payments/payouts${qs(params)}`),
  get: (id: string) => api.get<Payout>(`/payments/payouts/${id}`),
  create: (body: {
    amount: number;
    currency: string;
    note?: string;
    bankName?: string;
    bankAccountNumber?: string;
    bankAccountHolder?: string;
    bankCode?: string | null;
  }) => api.post<Payout>('/payments/payouts', body),
  cancel: (id: string) => api.post<Payout>(`/payments/payouts/${id}/cancel`, {}),
  markInTransit: (id: string, reference: string | null) =>
    api.post<Payout>(`/payments/payouts/${id}/mark-in-transit`, { reference }),
  markPaid: (id: string, reference?: string | null) =>
    api.post<Payout>(`/payments/payouts/${id}/mark-paid`, { reference }),
  markFailed: (id: string, failureReason: string) =>
    api.post<Payout>(`/payments/payouts/${id}/mark-failed`, { failureReason }),
};

export const reportsApi = {
  pnl: (params: { from: string; to: string; currency?: string }) =>
    api.get<PnlReport>(`/payments/reports/pnl${qs(params)}`),
  cashFlow: (params: { from: string; to: string; currency?: string }) =>
    api.get<CashFlowReport>(`/payments/reports/cash-flow${qs(params)}`),
  // CSV export streams straight from Plugipay's ledger CSV endpoint.
  downloadLedgerCsv: async (params: { from: string; to: string; currency?: string }) =>
    fetchCsvBlob(`/payments/ledger/entries.csv${qs(params)}`),
};

export const ledgerApi = {
  listEntries: (params?: {
    type?: 'debit' | 'credit';
    category?: LedgerCategory;
    customerId?: string;
    sourceType?: string;
    sourceId?: string;
    from?: string;
    to?: string;
    cursor?: string;
    limit?: number;
  }) => api.get<LedgerEntry[]>(`/payments/ledger/entries${qs(params)}`),
  getEntry: (id: string) => api.get<LedgerEntry>(`/payments/ledger/entries/${id}`),
  getBalance: () =>
    api.get<{ balance: number; currency: string | null; byCode?: unknown }>('/payments/ledger/balance'),
};

// Fetch a CSV (or any binary) endpoint as a Blob, forwarding the session
// cookie. malapos's `api` only handles JSON envelopes, so CSV downloads
// go through a thin direct fetch against the same base URL.
async function fetchCsvBlob(path: string): Promise<Blob> {
  const base = (
    (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL) ||
    'http://localhost:4191'
  ).replace(/\/api\/v1\/?$/, '');
  const res = await fetch(`${base}/api/v1${path}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`CSV export failed (${res.status})`);
  return res.blob();
}

// Silence "imported but unused" when a build configuration tree-shakes
// the helper paths; RequestOptions is part of the public api surface.
export type { RequestOptions };
