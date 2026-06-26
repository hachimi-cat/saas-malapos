/*
 * Fulfillment (Fulkruma) merchant API clients. malapos port of the
 * fulfillment-related resource clients from storlaunch's lib/api.ts, but
 * implemented over malapos's envelope-aware `api` object (lib/api.ts)
 * instead of axios — the same shape as lib/payments-api.ts.
 *
 * Each call returns `{ data, meta }`; call sites use `const { data } =
 * await shipmentsApi.list()`. Errors throw `ApiRequestError` (status 409
 * when the Fulfillment module is off → callers show the enable state).
 *
 * Paths target the backend resource routers mounted under
 * `/api/v1/fulfillment/*` (see backend routes/index.ts). IDR money.
 */

import { api } from './api';

// ─── Types (mirror @forjio/fulkruma-node DTOs) ────────────────────────

export type ShipmentStatus =
  | 'pending'
  | 'confirmed'
  | 'allocated'
  | 'picking_up'
  | 'picked_up'
  | 'dropping_off'
  | 'in_transit'
  | 'delivered'
  | 'cancelled'
  | 'returned'
  | 'failed';

export interface Shipment {
  id: string;
  accountId: string;
  productId: string | null;
  checkoutSessionId: string | null;
  customerId: string | null;
  customerEmail: string | null;
  biteshipOrderId: string;
  biteshipTrackingId: string | null;
  waybillId: string | null;
  courierCode: string;
  courierServiceCode: string;
  courierType: string;
  status: ShipmentStatus;
  trackingUrl: string | null;
  labelUrl: string | null;
  price: number;
  insurance: number;
  insured: boolean;
  originSnapshot: Record<string, unknown>;
  destinationSnapshot: Record<string, unknown>;
  items: Array<Record<string, unknown>>;
  cancelReason: string | null;
  externalSource: string | null;
  externalRef: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShippingOrigin {
  address?: string | null;
  province?: string | null;
  city?: string | null;
  district?: string | null;
  village?: string | null;
  postal?: string | null;
  areaId?: string | null;
  lat?: number | null;
  lng?: number | null;
  note?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  couriers?: string[];
  [key: string]: unknown;
}

export interface Courier {
  courierCode?: string;
  courierName?: string;
  courierServiceCode?: string;
  courierServiceName?: string;
  serviceType?: string;
  description?: string;
  [key: string]: unknown;
}

export interface Rate {
  courierCode: string;
  courierServiceCode: string;
  courierName?: string;
  serviceName?: string;
  description?: string;
  price: number;
  duration?: string;
}

export interface Warehouse {
  id: string;
  accountId: string;
  name: string;
  address: string | null;
  city: string | null;
  postal: string | null;
  phone: string | null;
  isDefault: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FulkrumaVariant {
  id: string;
  productId: string;
  sku: string | null;
  name: string;
  priceCents: number;
  costCents: number | null;
  lowStockThreshold: number | null;
  isDefault: boolean;
  archived: boolean;
}

export interface FulkrumaProduct {
  id: string;
  accountId: string;
  name: string;
  sku: string | null;
  type: 'physical' | 'digital' | 'license';
  archived: boolean;
  variants?: FulkrumaVariant[];
}

export interface VariantStock {
  id: string;
  variantId: string;
  warehouseId: string;
  quantity: number;
  updatedAt: string;
  warehouse?: { id: string; name: string };
}

export type StockMovementReason =
  | 'manual_adjust'
  | 'refund_restock'
  | 'transfer_in'
  | 'transfer_out'
  | 'damaged'
  | 'returned_to_supplier'
  | 'initial_stock'
  | 'import';

export interface StockMovement {
  id: string;
  variantId: string;
  warehouseId: string;
  delta: number;
  reason: string;
  referenceId: string | null;
  note: string | null;
  createdAt: string;
  createdBy: string | null;
}

export type LicenseStatus = 'active' | 'revoked';

export interface License {
  id: string;
  accountId: string;
  productId: string;
  customerId: string;
  key: string;
  status: LicenseStatus;
  activations: number;
  maxActivations: number;
  expiresAt: string | null;
  externalSource: string | null;
  externalRef: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Delivery {
  id: string;
  accountId: string;
  productId: string;
  customerId: string;
  checkoutSessionId: string;
  downloadCount: number;
  maxDownloads: number;
  expiresAt: string;
  externalSource: string | null;
  externalRef: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShippingCreditBalance {
  accountId: string;
  balance: number;
  updatedAt: string;
}

export interface ShippingCreditTransaction {
  id: string;
  kind: 'topup' | 'shipment_charge' | 'shipment_refund' | 'manual_adjustment';
  amount: number;
  balanceAfter: number;
  shipmentId: string | null;
  externalRef: string | null;
  memo: string | null;
  createdAt: string;
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

export const shipmentsApi = {
  list: (params?: { status?: string }) => api.get<Shipment[]>(`/fulfillment/shipments${qs(params)}`),
  get: (id: string) => api.get<Shipment>(`/fulfillment/shipments/${id}`),
  getLabel: (id: string) => api.get<{ url: string }>(`/fulfillment/shipments/${id}/label`),
  confirmPickup: (id: string) => api.post<Shipment>(`/fulfillment/shipments/${id}/confirm-pickup`, {}),
  cancel: (id: string, reason: string) =>
    api.post<Shipment>(`/fulfillment/shipments/${id}/cancel`, { reason }),
  create: (body: {
    transactionId?: string;
    destination: Record<string, unknown>;
    courierCode: string;
    courierServiceCode: string;
    courierType?: string;
    price?: number;
    items: Array<Record<string, unknown>>;
    customerId?: string;
    customerEmail?: string;
    insured?: boolean;
    insurance?: number;
  }) => api.post<Shipment>('/fulfillment/shipments', body),
};

/*
 * Delivery proxy (/api/v1/delivery → routes/delivery.ts). This is the
 * surface a POS *sale* dispatches against — the shipment id it mints is
 * stamped on the originating Transaction (fulkrumaShipmentId). The
 * sale-detail page reads + drives a sale's shipment here. Same Fulkruma
 * shipment DTO as `shipmentsApi` (both proxy `client.shipments.get`), so
 * it reuses the `Shipment` type. Label printing has no delivery-proxy
 * route, so the page reuses `shipmentsApi.getLabel` for that one action.
 */
export const deliveryApi = {
  getShipment: (id: string) => api.get<Shipment>(`/delivery/shipments/${id}`),
  confirmPickup: (id: string) => api.post<Shipment>(`/delivery/shipments/${id}/confirm-pickup`, {}),
  cancelShipment: (id: string, reason: string) =>
    api.post<Shipment>(`/delivery/shipments/${id}/cancel`, { reason }),
};

export const shippingApi = {
  getOrigin: () => api.get<ShippingOrigin>('/fulfillment/shipping/origin'),
  updateOrigin: (body: Partial<ShippingOrigin>) =>
    api.patch<ShippingOrigin>('/fulfillment/shipping/origin', body),
  listCouriers: () => api.get<Courier[] | { couriers?: Courier[]; data?: Courier[] }>('/fulfillment/shipping/couriers'),
  rates: (body: { destination: Record<string, unknown>; items: Array<Record<string, unknown>>; insurance?: boolean }) =>
    api.post<{ pricing?: Rate[] } | Rate[]>('/fulfillment/shipping/rates', body),
};

export const warehousesApi = {
  list: () => api.get<Warehouse[]>('/fulfillment/warehouses'),
  create: (body: {
    name: string;
    address?: string;
    city?: string;
    postal?: string;
    phone?: string;
    isDefault?: boolean;
  }) => api.post<Warehouse>('/fulfillment/warehouses', body),
  update: (id: string, body: Partial<{ name: string; address: string; city: string; postal: string; phone: string; isDefault: boolean }>) =>
    api.patch<Warehouse>(`/fulfillment/warehouses/${id}`, body),
  delete: (id: string) => api.delete<{ archived: boolean }>(`/fulfillment/warehouses/${id}`),
};

export const inventoryApi = {
  listProducts: () => api.get<FulkrumaProduct[]>('/fulfillment/inventory/products'),
  listStock: (variantId?: string) =>
    api.get<VariantStock[]>(`/fulfillment/inventory/stock${qs({ variantId })}`),
  listMovements: (variantId?: string) =>
    api.get<StockMovement[]>(`/fulfillment/inventory/movements${qs({ variantId })}`),
  adjust: (body: {
    variantId: string;
    warehouseId: string;
    delta: number;
    reason: StockMovementReason;
    note?: string;
  }) => api.post<{ stock: VariantStock; movement: StockMovement }>('/fulfillment/inventory/adjust', body),
};

export const shippingCreditsApi = {
  get: () => api.get<ShippingCreditBalance>('/fulfillment/shipping-credits'),
  listTransactions: (params?: { limit?: number; cursor?: string }) =>
    api.get<{ data: ShippingCreditTransaction[]; nextCursor: string | null }>(
      `/fulfillment/shipping-credits/transactions${qs(params)}`,
    ),
  topup: (amount: number) =>
    api.post<{ checkoutUrl: string; sessionId: string; amount: number }>(
      '/fulfillment/shipping-credits/topup',
      { amount },
    ),
};

export const licensesApi = {
  list: () => api.get<License[]>('/fulfillment/licenses'),
  validate: (key: string, productId?: string) =>
    api.get<{ valid: boolean; key: string; status: string | null }>(
      `/fulfillment/licenses/validate${qs({ key, productId })}`,
    ),
  issue: (body: { productId: string; customerId: string; maxActivations?: number; expiresAt?: string }) =>
    api.post<License>('/fulfillment/licenses', body),
  revoke: (id: string) => api.post<License>(`/fulfillment/licenses/${id}/revoke`, {}),
};

export const deliveriesApi = {
  list: () => api.get<Delivery[]>('/fulfillment/deliveries'),
  get: (id: string) => api.get<Delivery>(`/fulfillment/deliveries/${id}`),
};
