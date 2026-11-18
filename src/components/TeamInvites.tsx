import React, { useCallback, useEffect, useState } from 'react';
import { Copy, MailPlus, Trash2 } from 'lucide-react';
import { apiErrorMessage, apiJson } from '../lib/api';
import type { WorkspaceRole } from '../types';

interface Seats {
  planName: string;
  limit: number | null;
  members: number;
  pendingInvites: number;
}

interface Invite {
  id: string;
  email: string;
  role: WorkspaceRole;
  expiresAt: string;
}

/** Owner/admin: invite people by email, copy the link, revoke open invitations. */
export const TeamInvites: React.FC<{ workspaceId: string; canInvite: boolean }> = ({ workspaceId, canInvite }) => {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [seats, setSeats] = useState<Seats | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Exclude<WorkspaceRole, 'owner'>>('creator');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; link?: string } | null>(null);

  const load = useCallback(async () => {
    if (!canInvite) return;
    const r = await apiJson<{ invites: Invite[]; emailEnabled: boolean; seats: Seats | null }>(
      `/api/workspaces/${workspaceId}/invites`,
    );
    if (r.ok) {
      setInvites(r.data.invites);
      setEmailEnabled(r.data.emailEnabled);
      setSeats(r.data.seats ?? null);
    }
  }, [workspaceId, canInvite]);

  useEffect(() => {
    load();
  }, [load]);

  if (!canInvite) {
    return <p className="text-sm text-ink-muted">Only the workspace owner and admins can invite people.</p>;
  }

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await apiJson<{ inviteUrl: string; emailSent: boolean }>(`/api/workspaces/${workspaceId}/invites`, {
      json: { email, role },
    });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: apiErrorMessage(r, 'Could not create the invitation.') });
    setEmail('');
    setMsg({
      ok: true,
      text: r.data.emailSent
        ? `Invitation emailed. You can also share the link below (shown once).`
        : 'Email is not connected on this server, so nothing was emailed. Send this link yourself (shown once):',
      link: r.data.inviteUrl,
    });
    load();
  };

  const revoke = async (id: string) => {
    const r = await apiJson(`/api/workspaces/${workspaceId}/invites/${id}`, { method: 'DELETE' });
    if (r.ok) load();
    else setMsg({ ok: false, text: apiErrorMessage(r) });
  };

  const used = seats ? seats.members + seats.pendingInvites : 0;
  const full = Boolean(seats && seats.limit !== null && used >= seats.limit);

  return (
    <div className="space-y-4" data-testid="team-invites">
      {seats && (
        <p
          data-testid="seat-usage"
          className={`text-sm rounded-xl px-3 py-2 border ${
            full
              ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-200'
              : 'bg-canvas border-line text-ink-muted'
          }`}
        >
          {seats.limit === null ? (
            <>
              {seats.planName} plan: unlimited members ({seats.members} now).
            </>
          ) : (
            <>
              {seats.planName} plan: <strong>{used}</strong> of {seats.limit} seats used ({seats.members} member
              {seats.members === 1 ? '' : 's'}
              {seats.pendingInvites
                ? `, ${seats.pendingInvites} open invitation${seats.pendingInvites === 1 ? '' : 's'}`
                : ''}
              ).
              {full && ' Revoke an invitation, remove a member, or upgrade in Billing > Plans to invite more people.'}
            </>
          )}
        </p>
      )}
      <form onSubmit={send} className="flex flex-wrap items-end gap-3">
        <div className="min-w-[16rem] flex-1">
          <label htmlFor="invite-email" className="block text-sm font-semibold text-ink">
            Email address
          </label>
          <input
            id="invite-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@company.com"
            className="mt-1 w-full rounded-xl border border-line-strong bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <label htmlFor="invite-role" className="block text-sm font-semibold text-ink">
            Role
          </label>
          <select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value as Exclude<WorkspaceRole, 'owner'>)}
            className="mt-1 rounded-xl border border-line-strong bg-canvas px-3 py-2 text-sm text-ink"
          >
            <option value="admin">Admin</option>
            <option value="approver">Approver</option>
            <option value="creator">Creator</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={busy || !email || full}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          <MailPlus className="h-4 w-4" />{' '}
          {busy ? 'Inviting…' : emailEnabled ? 'Send invitation' : 'Create invite link'}
        </button>
      </form>
      <p className="text-xs text-ink-subtle">
        {emailEnabled
          ? 'Invitations are emailed (Resend) and expire after 7 days. The person must sign in with the invited email.'
          : 'Invitation emails aren’t set up on this server, so you get a link to send yourself. It expires after 7 days and only works for the invited email.'}
      </p>
      {msg && (
        <div
          role="status"
          className={`rounded-xl p-3 text-sm ${msg.ok ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200' : 'bg-rose-50 dark:bg-rose-950 text-rose-800 dark:text-rose-200'}`}
        >
          <p className="font-semibold">{msg.text}</p>
          {msg.link && (
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 break-all rounded bg-canvas p-2 text-xs" data-testid="invite-link">
                {msg.link}
              </code>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(msg.link!)}
                className="inline-flex items-center gap-1 rounded-lg bg-surface-muted px-3 py-2 text-xs font-bold"
              >
                <Copy className="h-3.5 w-3.5" /> Copy
              </button>
            </div>
          )}
        </div>
      )}
      {invites.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {invites.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-3 p-3 text-sm text-ink">
              <span>
                {i.email} · {i.role} · expires {new Date(i.expiresAt).toLocaleDateString()}
              </span>
              <button
                type="button"
                onClick={() => revoke(i.id)}
                className="inline-flex items-center gap-1 rounded-lg bg-rose-100 dark:bg-rose-900 px-3 py-1.5 text-xs font-bold text-ink"
              >
                <Trash2 className="h-3.5 w-3.5" /> Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
