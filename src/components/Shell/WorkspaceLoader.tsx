import React, { useCallback, useEffect, useState } from 'react';
import type { Workspace } from '../../types';
import { apiErrorMessage, apiJson } from '../../lib/api';
import { CenteredCard } from './CenteredCard';
import { takeInviteToken } from '../../lib/invite';

interface Props {
  /** Changes whenever the signed-in identity changes, to trigger a reload. */
  identityKey: string;
  children: (
    workspaces: Workspace[],
    setWorkspaces: React.Dispatch<React.SetStateAction<Workspace[]>>,
  ) => React.ReactNode;
}

/**
 * Loads the workspaces the signed-in user belongs to from the server (GET /api/me/workspaces).
 * If the user has none, offers to create one. Renders children only with a non-empty list.
 */
export const WorkspaceLoader: React.FC<Props> = ({ identityKey, children }) => {
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const [inviteNote, setInviteNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    // Accept a pending invitation link (captured from #invite=... before sign-in) first.
    const token = identityKey === 'demo' ? null : takeInviteToken();
    if (token) {
      const a = await apiJson<{ workspaceId: string; role: string }>('/api/invites/accept', { json: { token } });
      setInviteNote(
        a.ok
          ? `Invitation accepted: you joined as ${a.data.role}.`
          : apiErrorMessage(a, 'Could not accept the invitation.'),
      );
    }
    const r = await apiJson<{ workspaces: Workspace[] }>('/api/me/workspaces');
    if (r.ok && Array.isArray(r.data.workspaces)) setWorkspaces(r.data.workspaces);
    else setError(apiErrorMessage(r, 'Could not load your workspaces.'));
  }, [identityKey]);

  useEffect(() => {
    setWorkspaces(null);
    load();
  }, [load, identityKey]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    const r = await apiJson<{ workspace: Workspace }>('/api/workspaces', { json: { name: name.trim() } });
    setCreating(false);
    if (r.ok && r.data.workspace) setWorkspaces([r.data.workspace]);
    else setError(apiErrorMessage(r, 'Could not create the workspace.'));
  };

  if (error && !workspaces?.length) {
    return (
      <CenteredCard title="Can't load workspaces" testId="workspace-error">
        <p className="text-sm text-rose-300">{error}</p>
        <button onClick={load} className="px-4 py-2 rounded-xl bg-slate-800 text-sm font-semibold">
          Try again
        </button>
      </CenteredCard>
    );
  }

  if (!workspaces) return <CenteredCard title="Loading your workspaces…" testId="workspace-loading" />;

  if (workspaces.length === 0) {
    return (
      <CenteredCard title="Create your first workspace" testId="workspace-create">
        {inviteNote && <p className="text-sm font-semibold text-amber-300">{inviteNote}</p>}
        <p className="text-sm text-slate-400">
          You're not a member of any workspace yet. Create one, or open an invitation link from a teammate.
        </p>
        <form onSubmit={create} className="space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            placeholder="Workspace name"
            aria-label="Workspace name"
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500"
          />
          <button
            type="submit"
            disabled={creating || !name.trim()}
            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-bold"
          >
            {creating ? 'Creating…' : 'Create workspace'}
          </button>
        </form>
      </CenteredCard>
    );
  }

  return (
    <>
      {inviteNote && (
        <div
          role="status"
          data-testid="invite-note"
          className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-3 bg-indigo-700 px-4 py-2 text-sm font-semibold text-white"
        >
          <span>{inviteNote}</span>
          <button type="button" className="underline" onClick={() => setInviteNote(null)}>
            Dismiss
          </button>
        </div>
      )}
      {children(workspaces, setWorkspaces as React.Dispatch<React.SetStateAction<Workspace[]>>)}
    </>
  );
};
