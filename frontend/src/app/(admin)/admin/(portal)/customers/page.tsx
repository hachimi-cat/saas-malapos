'use client';

/*
 * Admin "Customers" — every user who has signed into THIS product via
 * Huudis SSO. Data comes from the backend admin route
 * (/api/v1/admin/customers → Huudis /app/users) through the admin BFF
 * proxy at /api/v1/console/*; no secret in the browser.
 *
 * Styling uses inline `hsl(var(--token))` (the theme tokens every
 * forked product ships) so it renders correctly regardless of which
 * Tailwind utilities a product has configured.
 *
 * rename.sh rewrites the "Malapos" display name.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminFetch, fmtDate, fmtRelative } from '@/components/admin/ui';

const brand = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Malapos';

interface Customer {
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
interface Payload {
  client: { clientId: string; name: string };
  users: Customer[];
  nextCursor: string | null;
  stats: { users: { total: number; signupsLast30d: number } } | null;
}

const card: React.CSSProperties = {
  border: '1px solid hsl(var(--border))',
  borderRadius: 12,
  background: 'hsl(var(--card))',
  padding: 16,
};
const muted: React.CSSProperties = { color: 'hsl(var(--muted-foreground))' };

export default function AdminCustomersPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // adminFetch is DEFENSIVE — it checks the content-type before
      // parsing so an HTML error page never surfaces as a raw
      // JSON.parse error.
      setData(await adminFetch<Payload>('/api/v1/console/customers?limit=200'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data.users;
    return data.users.filter(
      (u) => u.email.toLowerCase().includes(q) || (u.name ?? '').toLowerCase().includes(q),
    );
  }, [data, query]);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <header style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0 }}>Customers</h1>
          <p style={{ ...muted, margin: '4px 0 0' }}>
            Everyone who has signed into {brand} via Huudis SSO.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          style={{
            border: '1px solid hsl(var(--border))',
            background: 'hsl(var(--card))',
            color: 'inherit',
            borderRadius: 8,
            padding: '6px 14px',
            cursor: loading ? 'default' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </header>

      {data?.stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
          <div style={card}>
            <div style={{ ...muted, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Total customers</div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{data.stats.users.total}</div>
          </div>
          <div style={card}>
            <div style={{ ...muted, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>New (last 30d)</div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: data.stats.users.signupsLast30d > 0 ? 'hsl(var(--primary))' : undefined }}>
              {data.stats.users.signupsLast30d}
            </div>
          </div>
        </div>
      )}

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search email or name…"
        style={{
          width: '100%', maxWidth: 360, marginBottom: 16, padding: '8px 12px',
          borderRadius: 8, border: '1px solid hsl(var(--border))',
          background: 'hsl(var(--card))', color: 'inherit', outline: 'none',
        }}
      />

      {error && (
        <div style={{ border: '1px solid hsl(var(--destructive, 0 70% 50%))', background: 'hsl(var(--destructive, 0 70% 50%) / 0.1)', borderRadius: 8, padding: '8px 14px', marginBottom: 16, fontSize: 14 }}>
          {error}
        </div>
      )}

      {!loading && data && (
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: 'left', ...muted, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                <th style={{ padding: '10px 14px', borderBottom: '1px solid hsl(var(--border))' }}>Customer</th>
                <th style={{ padding: '10px 14px', borderBottom: '1px solid hsl(var(--border))' }}>Signed up</th>
                <th style={{ padding: '10px 14px', borderBottom: '1px solid hsl(var(--border))' }}>Last seen</th>
                <th style={{ padding: '10px 14px', borderBottom: '1px solid hsl(var(--border))' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: 24, textAlign: 'center', ...muted }}>
                    {query ? 'No customers match.' : 'No customers yet.'}
                  </td>
                </tr>
              )}
              {filtered.map((u) => (
                <tr key={u.id} style={{ borderBottom: '1px solid hsl(var(--border) / 0.5)' }}>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ fontWeight: 500 }}>{u.email}</div>
                    {u.name && <div style={{ ...muted, fontSize: 12 }}>{u.name}</div>}
                  </td>
                  <td style={{ padding: '10px 14px' }}>{fmtDate(u.firstSignInAt)}</td>
                  <td style={{ padding: '10px 14px', ...muted }}>{fmtRelative(u.lastSignInAt ?? u.lastLoginAt)}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ display: 'inline-flex', gap: 6 }}>
                      {u.disabled ? (
                        <Tag color="0 70% 55%">disabled</Tag>
                      ) : (
                        <Tag color="150 60% 45%">active</Tag>
                      )}
                      {!u.emailVerified && <Tag color="40 90% 55%">unverified</Tag>}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Tag({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 500,
        padding: '2px 8px',
        borderRadius: 999,
        border: `1px solid hsl(${color} / 0.35)`,
        background: `hsl(${color} / 0.12)`,
        color: `hsl(${color})`,
      }}
    >
      {children}
    </span>
  );
}
