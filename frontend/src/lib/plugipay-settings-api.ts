import { api } from './api';

const PREFIX = '/payments/plugipay-settings';

/*
 * Thin client for Plugipay's settings endpoints, proxied through
 * malapos's backend at /api/v1/payments/plugipay-settings/* (a generic
 * passthrough — see backend routes/payment/plugipay-settings-proxy.ts).
 * Only works when the Payment module is active for the merchant.
 *
 * malapos port of storlaunch's lib/plugipay-settings-api.ts. malapos's
 * `api` already unwraps the envelope, so each call just returns `.data`.
 */

export interface PaymentMethodDef {
  id: string;
  label: string;
  group: 'qr' | 'ewallet' | 'va' | 'debit' | 'card' | 'retail' | 'bnpl' | 'offline' | 'paypal';
  currency: 'IDR' | 'USD';
}

export interface ReceiptTemplateSettings {
  footerText: string | null;
  thankYouText: string | null;
  showTax: boolean | null;
  taxLabel: string | null;
  taxRate: number | null;
  cashierLabel: string | null;
  showMerchantAddress: boolean | null;
  merchantAddress: string | null;
  merchantTaxId: string | null;
}

export interface CheckoutSettings {
  enabledMethods: string[];
  methodOrder: string[];
  methodAdapter: Record<string, string>;
  availableMethods: string[];
  methodSupport: Record<string, string[]>;
  brandName: string | null;
  brandLogoUrl: string | null;
  brandAccentColor: string | null;
  brandTagline: string | null;
  businessPhone: string | null;
  businessEmail: string | null;
  businessAddress: string | null;
  businessTaxId: string | null;
  receiptTemplate: ReceiptTemplateSettings | null;
  catalog: PaymentMethodDef[];
}

export interface AdapterSummary {
  kind: 'xendit' | 'paypal' | 'midtrans' | 'manual' | 'managed';
  status: 'unconfigured' | 'active' | 'error';
  secretKeyLast4: string | null;
  publicConfig: unknown;
  configuredAt: string | null;
  lastErrorAt: string | null;
  lastErrorCode: string | null;
}

export type AdapterConfigMap = Partial<Record<AdapterSummary['kind'], AdapterSummary>>;

export interface ManagedOnboardingDTO {
  subAccountId: string;
  email: string | null;
  onboardingUrl: string | null;
  kybStatus: 'not_started' | 'invited' | 'registered' | 'live' | 'rejected' | string;
  capabilitiesStatus: 'pending' | 'live' | 'declined' | 'resubmission_required' | string;
  payoutsReady: boolean;
  lastWebhookAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ManualBankAccount {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
}

export type TemplateKind = 'invoice' | 'receipt' | 'checkout';

export interface TemplateDTO {
  id: string;
  accountId: string;
  kind: TemplateKind;
  name: string;
  isDefault: boolean;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export const plugipaySettingsApi = {
  // Adapters / Providers
  getAdapters: () => api.get<AdapterConfigMap>(`${PREFIX}/adapters`).then((r) => r.data),

  putXendit: (body: { secretKey: string; callbackToken?: string }) =>
    api.put<AdapterSummary>(`${PREFIX}/adapters/xendit`, body).then((r) => r.data),

  putPaypal: (body: { clientId: string; secret: string; mode: 'live' | 'sandbox' }) =>
    api.put<AdapterSummary>(`${PREFIX}/adapters/paypal`, body).then((r) => r.data),

  putMidtrans: (body: { serverKey: string; clientKey: string; merchantId: string; env: 'sandbox' | 'production' }) =>
    api.put<AdapterSummary>(`${PREFIX}/adapters/midtrans`, body).then((r) => r.data),

  putManual: (body: { bankAccounts?: ManualBankAccount[]; staticQrImageUrl?: string | null; instructions?: string | null }) =>
    api.put<AdapterSummary>(`${PREFIX}/adapters/manual`, body).then((r) => r.data),

  // Managed (Plugipay-operated) provisioning
  getManagedOnboarding: () =>
    api.get<ManagedOnboardingDTO | null>(`${PREFIX}/adapters/managed/onboarding`).then((r) => r.data),

  startManagedOnboarding: (email: string) =>
    api.post<ManagedOnboardingDTO>(`${PREFIX}/adapters/managed/onboarding`, { email }).then((r) => r.data),

  simulateManagedStatus: (patch: {
    kybStatus?: 'not_started' | 'invited' | 'registered' | 'live' | 'rejected';
    capabilitiesStatus?: 'pending' | 'live' | 'declined' | 'resubmission_required';
    payoutsReady?: boolean;
  }) => api.post<ManagedOnboardingDTO>(`${PREFIX}/adapters/managed/onboarding/_simulate`, patch).then((r) => r.data),

  // Checkout settings (payment methods + business profile + receipt template)
  getCheckoutSettings: () => api.get<CheckoutSettings>(`${PREFIX}/checkout/settings`).then((r) => r.data),

  updateCheckoutSettings: (body: {
    enabledMethods?: string[];
    methodOrder?: string[];
    methodAdapter?: Record<string, string>;
    brandName?: string | null;
    brandLogoUrl?: string | null;
    brandAccentColor?: string | null;
    brandTagline?: string | null;
    businessPhone?: string | null;
    businessEmail?: string | null;
    businessAddress?: string | null;
    businessTaxId?: string | null;
    receiptTemplate?: Partial<ReceiptTemplateSettings> | null;
  }) => api.patch<CheckoutSettings>(`${PREFIX}/checkout/settings`, body).then((r) => r.data),

  // Templates
  listTemplates: (kind?: TemplateKind) =>
    api.get<TemplateDTO[]>(`${PREFIX}/templates${kind ? `?kind=${kind}` : ''}`).then((r) => r.data),

  getTemplate: (id: string) => api.get<TemplateDTO>(`${PREFIX}/templates/${id}`).then((r) => r.data),

  createTemplate: (body: { kind: TemplateKind; name: string; config: Record<string, unknown>; isDefault?: boolean }) =>
    api.post<TemplateDTO>(`${PREFIX}/templates`, body).then((r) => r.data),

  updateTemplate: (id: string, body: { name?: string; config?: Record<string, unknown> }) =>
    api.patch<TemplateDTO>(`${PREFIX}/templates/${id}`, body).then((r) => r.data),

  makeTemplateDefault: (id: string) =>
    api.post<TemplateDTO>(`${PREFIX}/templates/${id}/make-default`, {}).then((r) => r.data),

  duplicateTemplate: (id: string) =>
    api.post<TemplateDTO>(`${PREFIX}/templates/${id}/duplicate`, {}).then((r) => r.data),

  deleteTemplate: (id: string) => api.delete(`${PREFIX}/templates/${id}`),
};
