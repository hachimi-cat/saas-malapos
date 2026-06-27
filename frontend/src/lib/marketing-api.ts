/*
 * Marketing (Ripllo) merchant API for the Malapos dashboard.
 *
 * Two layers, both hitting the malapos backend's Ripllo surface:
 *
 *  1. `marketingFetch()` — a thin raw-fetch wrapper (credentials +
 *     absolute base URL) used by the pages that mirror Ripllo's UI 1:1
 *     and read Ripllo's raw response shapes themselves. It targets the
 *     generic passthrough mounted at `/api/v1/account/marketing/*`
 *     (routes/marketing-proxy.ts → ripllo `/api/v1/*`). The active
 *     workspace is carried by the `malapos_active_workspace` cookie
 *     (sent automatically with credentials: 'include'); no X-Account-Id
 *     header is needed — the backend reads the cookie (middleware/auth).
 *
 *  2. Typed resource clients (`blogApi`, `feedsApi`, `pixelsApi`,
 *     `abandonedCartApi`, `referralsApi`, `discountCodesApi`,
 *     `uploadsApi`, `productsApi`) — built over the envelope-aware
 *     `api` object (lib/api.ts), mirroring storlaunch's client
 *     signatures so the ported pages compile + behave 1:1. These hit the
 *     thin native typed routes (`/account/{blog,feeds,pixels,
 *     abandoned-cart,referrals}` + the POS-native `/marketing/
 *     discount-codes`).
 */

import { api } from './api';

// NEXT_PUBLIC_API_URL may be a bare origin (dev) OR already include the
// /api/v1 prefix (CI sets the RELATIVE '/api/v1'). Strip a trailing
// /api/v1 so we add it exactly once — same rule as lib/api.ts.
const BASE_URL = (
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL) ||
  'http://localhost:4191'
).replace(/\/api\/v1\/?$/, '');

/**
 * Drop-in for fetch() used by the marketing pages. Callers pass an
 * absolute-from-root path (e.g. `/api/v1/account/marketing/campaigns`);
 * we prefix the API origin so dev (frontend :3190 → backend :4191) works
 * the same as prod (relative). Always sends the session cookie.
 */
export function marketingFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const url = input.startsWith('http') ? input : `${BASE_URL}${input}`;
  return fetch(url, { credentials: 'include', ...init });
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

// ─── Discount codes (POS-native typed route /marketing/discount-codes) ─

export type DiscountType = 'percent' | 'fixed' | 'shipping_percent' | 'shipping_fixed';
export type DiscountScope = 'cart' | 'products' | 'tags';

export interface DiscountCode {
  id: string;
  accountId: string;
  code: string;
  description: string | null;
  type: DiscountType;
  value: number;
  currency: string;
  scope: DiscountScope;
  productIds: string[];
  tagFilter: string[];
  minPurchaseAmount: number | null;
  maxUsesTotal: number | null;
  maxUsesPerCustomer: number | null;
  startsAt: string | null;
  expiresAt: string | null;
  active: boolean;
  public: boolean;
  redemptionCount: number;
  marketingCampaignId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DiscountCreateInput {
  code: string;
  description?: string | null;
  type: DiscountType;
  value: number;
  currency: string;
  scope?: DiscountScope;
  productIds?: string[];
  tagFilter?: string[];
  minPurchaseAmount?: number | null;
  maxUsesTotal?: number | null;
  maxUsesPerCustomer?: number | null;
  startsAt?: string | null;
  expiresAt?: string | null;
  active?: boolean;
  public?: boolean;
  marketingCampaignId?: string | null;
}

export const discountCodesApi = {
  list: (params?: { active?: boolean; cursor?: string; limit?: number }) =>
    api.get<DiscountCode[]>(`/marketing/discount-codes${qs(params)}`),
  get: (id: string) => api.get<DiscountCode>(`/marketing/discount-codes/${id}`),
  create: (body: DiscountCreateInput) => api.post<DiscountCode>('/marketing/discount-codes', body),
  update: (id: string, body: Partial<Omit<DiscountCreateInput, 'code'>>) =>
    api.patch<DiscountCode>(`/marketing/discount-codes/${id}`, body),
  archive: (id: string) =>
    api.delete<{ id: string; active: boolean }>(`/marketing/discount-codes/${id}`),
};

// ─── Blog (native typed route /account/blog/posts) ────────────────────

export type BlogPostStatus = 'draft' | 'published';

export interface BlogPost {
  id: string;
  accountId: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string;
  coverImage: string | null;
  status: BlogPostStatus;
  publishedAt: string | null;
  authorName: string | null;
  tags: string[];
  metaTitle: string | null;
  metaDescription: string | null;
  marketingCampaignId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BlogPostInput {
  title?: string;
  slug?: string;
  excerpt?: string | null;
  body?: string;
  coverImage?: string | null;
  status?: BlogPostStatus;
  publishedAt?: string | null;
  authorName?: string | null;
  tags?: string[];
  metaTitle?: string | null;
  metaDescription?: string | null;
  marketingCampaignId?: string | null;
}

export const blogApi = {
  list: (params?: { status?: BlogPostStatus; limit?: number }) =>
    api.get<BlogPost[]>(`/account/blog/posts${qs(params)}`),
  get: (id: string) => api.get<BlogPost>(`/account/blog/posts/${id}`),
  create: (body: BlogPostInput) => api.post<BlogPost>('/account/blog/posts', body),
  update: (id: string, body: BlogPostInput) =>
    api.patch<BlogPost>(`/account/blog/posts/${id}`, body),
  delete: (id: string) => api.delete(`/account/blog/posts/${id}`),
  publish: (id: string) => api.post<BlogPost>(`/account/blog/posts/${id}/publish`, {}),
  unpublish: (id: string) => api.post<BlogPost>(`/account/blog/posts/${id}/unpublish`, {}),
};

// ─── Feeds (native typed route /account/feeds) ────────────────────────

export interface MerchantFeedConfig {
  enabled: boolean;
  defaultGoogleProductCategory: string | null;
  includeUnpublished: boolean;
  marketingCampaignId?: string | null;
  urls: { google: string; meta: string; tiktok: string };
}

export const feedsApi = {
  get: () => api.get<MerchantFeedConfig>('/account/feeds'),
  update: (body: Partial<Omit<MerchantFeedConfig, 'urls'>>) =>
    api.patch<MerchantFeedConfig>('/account/feeds', body),
  previewUrl: (format: 'google' | 'meta' | 'tiktok') =>
    `${BASE_URL}/api/v1/account/feeds/preview?format=${format}`,
};

// ─── Pixels (native typed route /account/pixels) ──────────────────────

export interface MerchantPixelsConfig {
  metaPixelId: string | null;
  metaCapiAccessToken: string | null;
  metaTestEventCode: string | null;
  googleAnalyticsId: string | null;
  googleAdsConversionId: string | null;
  googleAdsPurchaseLabel: string | null;
  tiktokPixelId: string | null;
  enabled: boolean;
}

export interface MerchantPixelsInput {
  metaPixelId?: string | null;
  metaCapiAccessToken?: string | null;
  metaTestEventCode?: string | null;
  googleAnalyticsId?: string | null;
  googleAdsConversionId?: string | null;
  googleAdsPurchaseLabel?: string | null;
  tiktokPixelId?: string | null;
  enabled?: boolean;
}

export const pixelsApi = {
  get: () => api.get<MerchantPixelsConfig>('/account/pixels'),
  update: (body: MerchantPixelsInput) => api.patch<MerchantPixelsConfig>('/account/pixels', body),
};

// ─── Abandoned cart (native typed route /account/abandoned-cart) ──────

export interface AbandonedCartConfig {
  enabled: boolean;
  delayHours: number;
  emailSubject: string;
  emailPreview: string;
  discountCodeId: string | null;
  marketingCampaignId?: string | null;
}

export interface AbandonedCartReminder {
  id: string;
  accountId: string;
  customerId: string;
  cartId: string;
  email: string;
  cartSnapshot: Array<{
    productId: string;
    name: string;
    thumbnail: string | null;
    variantName: string | null;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  valueAtSend: number;
  currencyAtSend: string;
  discountCodeId: string | null;
  sentAt: string;
  recoveredAt: string | null;
  recoveredBySessionId: string | null;
}

export interface AbandonedCartStats {
  remindersSent: number;
  cartsRecovered: number;
  recoveryRate: number;
  // Backend RecoveryStats names this `recoveredValueAtSend` (routes/marketing/abandoned-cart.ts).
  recoveredValueAtSend: number;
  currency: string | null;
}

export const abandonedCartApi = {
  config: {
    get: () => api.get<AbandonedCartConfig>('/account/abandoned-cart'),
    update: (body: Partial<AbandonedCartConfig>) =>
      api.patch<AbandonedCartConfig>('/account/abandoned-cart', body),
  },
  reminders: (params?: { limit?: number }) =>
    api.get<AbandonedCartReminder[]>(`/account/abandoned-cart/reminders${qs(params)}`),
  stats: (params?: { windowDays?: number }) =>
    api.get<AbandonedCartStats>(`/account/abandoned-cart/stats${qs(params)}`),
};

// ─── Referrals (native typed route /account/referrals) ────────────────

export interface ReferralProgramConfig {
  enabled: boolean;
  rewardType: 'percent' | 'fixed' | 'shipping_percent' | 'shipping_fixed';
  referrerValue: number;
  refereeValue: number;
  currency: string;
  minPurchaseAmount: number | null;
  rewardExpiryDays: number;
  attributionWindowDays: number;
  maxRewardsPerReferrer: number | null;
  programTerms: string | null;
  marketingCampaignId?: string | null;
}

export interface ReferralLinkRow {
  id: string;
  code: string;
  clicks: number;
  signups: number;
  rewards: number;
  revenue: number;
  createdAt: string;
  customer?: { email: string; name: string | null };
}

export interface ReferralAttributionRow {
  id: string;
  status: 'pending' | 'rewarded' | 'voided' | 'expired';
  clickedAt: string;
  signedUpAt: string | null;
  rewardedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  referrerCustomer?: { email: string; name: string | null };
  refereeCustomer?: { email: string; name: string | null };
  link?: { code: string };
}

export interface ReferralProgramStats {
  totalLinks: number;
  totalClicks: number;
  totalSignups: number;
  totalRewards: number;
  attributedRevenue: number;
  conversionRate: number;
}

export interface ReferralPagedResponse<T> {
  rows: T[];
  nextCursor: string | null;
}

export const referralsApi = {
  get: () => api.get<ReferralProgramConfig>('/account/referrals'),
  update: (body: Partial<ReferralProgramConfig>) =>
    api.put<ReferralProgramConfig>('/account/referrals', body),
  links: (params?: { limit?: number; cursor?: string }) =>
    api.get<ReferralPagedResponse<ReferralLinkRow>>(`/account/referrals/links${qs(params)}`),
  attributions: (params?: { limit?: number; cursor?: string; status?: string }) =>
    api.get<ReferralPagedResponse<ReferralAttributionRow>>(
      `/account/referrals/attributions${qs(params)}`,
    ),
  stats: () => api.get<ReferralProgramStats>('/account/referrals/stats'),
};

// ─── Uploads (passthrough → ripllo image upload) ──────────────────────
// Best-effort: posts multipart to the marketing passthrough. Cover
// images are optional in the blog editor, so a 404 here is non-fatal.

export const uploadsApi = {
  uploadImage: async (file: File): Promise<{ data: { url: string; fileName: string; fileSize: number } }> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await marketingFetch('/api/v1/account/marketing/uploads/image', {
      method: 'POST',
      body: formData,
    });
    const body = (await res.json()) as {
      data?: { url: string; fileName: string; fileSize: number };
      error?: { message?: string };
    };
    if (!res.ok || !body.data) {
      throw new Error(body.error?.message ?? `Upload failed (${res.status})`);
    }
    return { data: body.data };
  },
};

// ─── Products (POS catalog, mapped to the storefront Product shape used
// by ProductMultiSelect) ──────────────────────────────────────────────

export interface Product {
  id: string;
  name: string;
  price: number;
  currency: string;
  type: string;
  thumbnail: string | null;
}

interface PosProductRow {
  id: string;
  name: string;
  imageUrl: string | null;
  variants?: Array<{ price: number }>;
}

export const productsApi = {
  list: async (params?: { cursor?: string; limit?: number; type?: string }) => {
    const res = await api.get<{ products: PosProductRow[] } | PosProductRow[]>(
      `/products${qs(params)}`,
    );
    const rows = Array.isArray(res.data) ? res.data : (res.data?.products ?? []);
    const data: Product[] = rows.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.variants?.[0]?.price ?? 0,
      currency: 'IDR',
      type: 'physical',
      thumbnail: p.imageUrl ?? null,
    }));
    return { data, meta: res.meta };
  },
};
