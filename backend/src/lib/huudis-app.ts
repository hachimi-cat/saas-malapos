/*
 * Huudis `/app/*` client — this product reading ITS OWN data from
 * Huudis as a confidential OAuth client (server-to-server). Uses the
 * same HUUDIS_CLIENT_ID + HUUDIS_CLIENT_SECRET the product already
 * holds for OIDC, sent as HTTP Basic to Huudis's `/api/v1/app/*`
 * surface (see saas-huudis routes/app.ts).
 *
 * Powers the in-product admin "Customers" view: every user who has
 * signed into THIS product via Huudis SSO (its OidcConsent rows).
 */

const HUUDIS_ISSUER = process.env.HUUDIS_ISSUER ?? 'https://huudis.com';
const CLIENT_ID = process.env.HUUDIS_CLIENT_ID ?? 'malapos';
const CLIENT_SECRET = process.env.HUUDIS_CLIENT_SECRET ?? '';

export function huudisAppConfigured(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET);
}

function basicAuthHeader(): string {
  return 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
}

export interface AppUser {
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
  disabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  firstSignInAt: string;
  lastSignInAt: string;
}

export interface AppUsersPage {
  client: { clientId: string; name: string };
  users: AppUser[];
  nextCursor: string | null;
}

export interface AppStats {
  users: { total: number; signupsLast30d: number };
}

async function callApp<T>(path: string): Promise<T> {
  const res = await fetch(`${HUUDIS_ISSUER}/api/v1/app${path}`, {
    headers: { Authorization: basicAuthHeader() },
  });
  const body = (await res.json().catch(() => ({}))) as {
    data?: T;
    error?: { code?: string; message?: string };
  };
  if (!res.ok) {
    throw new Error(
      body?.error?.message ?? body?.error?.code ?? `Huudis /app${path} ${res.status}`,
    );
  }
  return body.data as T;
}

export async function fetchAppUsers(params: {
  q?: string;
  status?: 'all' | 'active' | 'disabled';
  limit?: number;
  cursor?: string;
}): Promise<AppUsersPage> {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.status) qs.set('status', params.status);
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.cursor) qs.set('cursor', params.cursor);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return callApp<AppUsersPage>(`/users${suffix}`);
}

export async function fetchAppStats(): Promise<AppStats> {
  return callApp<AppStats>('/stats');
}
