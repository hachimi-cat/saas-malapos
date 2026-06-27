'use client';

/*
 * Workspaces — list the Huudis workspaces you belong to, switch the
 * active one (drives which outlets / sales / billing you operate), and
 * create new workspaces via the Huudis proxy.
 */

import { useCallback, useEffect, useState } from 'react';
import { readActiveWorkspaceId, writeActiveWorkspace } from '@forjio/portal-ui';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface Workspace {
  id: string;
  name: string;
  slug?: string;
  role: string;
  isForjioInternal?: boolean;
}

const BRAND_SLUG = 'malapos';

export default function WorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [personalId, setPersonalId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/v1/huudis/account/workspaces', { credentials: 'include' });
      const b = await r.json();
      setWorkspaces(Array.isArray(b?.data) ? b.data : []);
    } catch {
      setError('Could not load workspaces');
    }
    let personal: string | null = null;
    try {
      const auth = await fetch('/api/v1/auth/me', { credentials: 'include' }).then((r) => r.json());
      personal = auth?.data?.user?.id ?? null;
      setPersonalId(personal);
    } catch {
      /* ignore */
    }
    // Active workspace = the cookie the backend resolves per request,
    // falling back to the personal (derived) workspace.
    setActiveId(readActiveWorkspaceId('cookie', BRAND_SLUG) ?? personal);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function activate(id: string) {
    writeActiveWorkspace('cookie', BRAND_SLUG, id);
    // The backend resolves the cookie per request — reload so every page
    // reflects the newly-active workspace.
    window.location.href = '/dashboard';
  }

  async function createWorkspace(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/v1/huudis/account/workspaces', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => null);
        throw new Error(b?.error?.message ?? `Create failed (${r.status})`);
      }
      setName('');
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight font-display">Workspaces</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Each workspace has its own outlets, sales, stock, billing and settings. Managed in{' '}
          <a href="https://huudis.com" target="_blank" rel="noreferrer" className="text-primary hover:underline">
            Huudis
          </a>
          , usable everywhere in the Forjio family.
        </p>
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm">
          {error}
        </div>
      )}

      <Card className="overflow-hidden">
        {personalId && (
          <WorkspaceRow
            name="Personal workspace"
            sub="Your private workspace — not shared with a team"
            role="owner"
            active={activeId === personalId}
            onActivate={() => activate(personalId)}
          />
        )}
        {workspaces.map((w) => (
          <WorkspaceRow
            key={w.id}
            name={w.name}
            sub={w.slug ?? w.id}
            role={w.role}
            active={activeId === w.id}
            onActivate={() => activate(w.id)}
          />
        ))}
      </Card>

      <form onSubmit={createWorkspace} className="mt-6 flex max-w-md gap-2">
        <Input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New workspace name"
        />
        <Button type="submit" disabled={busy} className="shrink-0">
          {busy ? 'Creating…' : 'Create'}
        </Button>
      </form>
    </div>
  );
}

function WorkspaceRow({
  name,
  sub,
  role,
  active,
  onActivate,
}: {
  name: string;
  sub: string;
  role: string;
  active: boolean;
  onActivate: () => void;
}) {
  return (
    <div className="flex items-center gap-4 border-b border-border/60 px-4 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{name}</p>
        <p className="truncate text-xs text-muted-foreground">{sub}</p>
      </div>
      <Badge variant="outline" className="rounded-full text-[11px] font-medium capitalize text-muted-foreground">
        {role}
      </Badge>
      {active ? (
        <Badge variant="outline" className="rounded-full border-primary/40 bg-primary/10 px-3 py-1 font-semibold text-primary">
          Active
        </Badge>
      ) : (
        <Button variant="outline" size="sm" onClick={onActivate}>
          Switch
        </Button>
      )}
    </div>
  );
}
