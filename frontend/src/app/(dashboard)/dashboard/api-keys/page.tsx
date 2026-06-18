'use client';

/*
 * API keys — programmatic access to the Malapos API. Keys are
 * `sk_live_…` Bearer tokens; the plaintext is shown ONCE at creation
 * (only a sha256 hash is stored server-side).
 */

import { useCallback, useEffect, useState } from 'react';
import { api, ApiRequestError } from '@/lib/api';

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleting, setDeleting] = useState<ApiKey | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data } = await api.get<{ keys: ApiKey[] }>('/api-keys');
      setKeys(data.keys);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Could not load API keys');
      setKeys([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">API keys</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Authenticate API calls with{' '}
            <code className="rounded bg-muted/60 px-1 py-0.5 text-xs">
              Authorization: Bearer sk_live_…
            </code>
            . Keys are shown once — store them like passwords.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Create key
        </button>
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm">
          {error}
        </div>
      )}

      {keys === null ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
      ) : keys.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          No API keys yet. Create one to call the Malapos API from your own code.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="hidden grid-cols-[1fr_8rem_7rem_7rem_4rem] gap-4 border-b border-border bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:grid">
            <span>Name</span>
            <span>Key</span>
            <span>Created</span>
            <span>Last used</span>
            <span />
          </div>
          {keys.map((k) => (
            <div
              key={k.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/60 px-4 py-3 last:border-b-0 sm:grid sm:grid-cols-[1fr_8rem_7rem_7rem_4rem]"
            >
              <span className="min-w-0 flex-1 truncate text-sm font-medium sm:flex-none">
                {k.name}
              </span>
              <code className="font-mono text-xs text-muted-foreground">{k.keyPrefix}…</code>
              <span className="text-xs text-muted-foreground">{fmtDate(k.createdAt)}</span>
              <span className="text-xs text-muted-foreground">
                {k.lastUsedAt ? fmtDate(k.lastUsedAt) : 'Never'}
              </span>
              <button
                onClick={() => setDeleting(k)}
                className="text-right text-xs text-destructive hover:underline"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateKeyDialog
          onClose={() => setShowCreate(false)}
          onCreated={() => load()}
        />
      )}
      {deleting && (
        <ConfirmDeleteDialog
          apiKey={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function CreateKeyDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // After creation, the dialog flips into reveal mode — the only time
  // the plaintext key is ever visible.
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post<ApiKey & { key: string }>('/api-keys', { name });
      setCreated(data.key);
      onCreated();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not create key');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={created ? undefined : onClose}
    >
      {created ? (
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md space-y-3 rounded-xl border border-border bg-background p-5 shadow-xl"
        >
          <h2 className="text-lg font-semibold">Your new API key</h2>
          <p className="text-xs text-muted-foreground">
            This is the only time the full key is shown. Copy it now and store it securely — if
            you lose it, delete the key and create a new one.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-xs">
              {created}
            </code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(created);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <div className="flex justify-end pt-1">
            <button
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm"
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={submit}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md space-y-3 rounded-xl border border-border bg-background p-5 shadow-xl"
        >
          <h2 className="text-lg font-semibold">Create API key</h2>
          <p className="text-xs text-muted-foreground">
            Give it a name you&apos;ll recognize later (e.g. “Back-office sync”, “Zapier”).
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <input
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Key name"
            maxLength={120}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm">
              Cancel
            </button>
            <button
              disabled={busy}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {busy ? 'Creating…' : 'Create key'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function ConfirmDeleteDialog({
  apiKey,
  onClose,
  onDeleted,
}: {
  apiKey: ApiKey;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/api-keys/${apiKey.id}`);
      onDeleted();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not delete key');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-3 rounded-xl border border-border bg-background p-5 shadow-xl"
      >
        <h2 className="text-lg font-semibold">Delete API key?</h2>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{apiKey.name}</span>{' '}
          (<code className="font-mono text-xs">{apiKey.keyPrefix}…</code>) will stop working
          immediately. Anything still using it will get 401s.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm">
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={busy}
            className="rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-50"
          >
            {busy ? 'Deleting…' : 'Delete key'}
          </button>
        </div>
      </div>
    </div>
  );
}
