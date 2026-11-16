import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DEMO_MODE } from './auth';
import { db, withTx } from './db';
import { ApiError } from './errors';
import { assertRole, type Role } from './workspaces';

export const INVITE_DAYS = 7;
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const notInDemo = () => new ApiError(400, 'NOT_AVAILABLE_IN_DEMO', 'Invitations are not available in demo mode.');

export interface InviteRecord {
  id: string;
  email: string;
  role: Exclude<Role, 'owner'>;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toInvite = (r: any): InviteRecord => ({
  id: r.id,
  email: r.email,
  role: r.role,
  createdAt: new Date(r.created_at).toISOString(),
  expiresAt: new Date(r.expires_at).toISOString(),
  acceptedAt: r.accepted_at ? new Date(r.accepted_at).toISOString() : null,
});

export async function createInvite(uid: string, workspaceId: string, email: string, role: Exclude<Role, 'owner'>) {
  if (DEMO_MODE) throw notInDemo();
  const ws = await assertRole(uid, workspaceId, ['owner', 'admin']);
  if (role === 'admin' && ws.role !== 'owner')
    throw new ApiError(403, 'ROLE_REQUIRED', 'Only the owner can invite admins.');
  const token = randomBytes(32).toString('base64url');
  const id = `inv-${randomUUID()}`;
  const lower = email.trim().toLowerCase();
  const rec = await withTx(async (c) => {
    await c.query('SELECT 1 FROM workspaces WHERE id = $1 FOR UPDATE', [workspaceId]);
    const pending = (
      await c.query(
        'SELECT count(*)::int AS n FROM workspace_invites WHERE workspace_id = $1 AND accepted_at IS NULL AND expires_at > now()',
        [workspaceId],
      )
    ).rows[0].n;
    if (pending >= 50) throw new ApiError(409, 'INVITE_LIMIT', 'A workspace can have at most 50 open invitations.');
    const { rows } = await c.query(
      `INSERT INTO workspace_invites (id, workspace_id, email, role, token_hash, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, now() + make_interval(days => $7)) RETURNING *`,
      [id, workspaceId, lower, role, hash(token), uid, INVITE_DAYS],
    );
    return toInvite(rows[0]);
  });
  return { invite: rec, token, workspaceName: ws.name };
}

export async function listInvites(uid: string, workspaceId: string): Promise<InviteRecord[]> {
  if (DEMO_MODE) return [];
  await assertRole(uid, workspaceId, ['owner', 'admin']);
  const { rows } = await db().query(
    `SELECT * FROM workspace_invites WHERE workspace_id = $1 AND accepted_at IS NULL AND expires_at > now()
      ORDER BY created_at DESC LIMIT 50`,
    [workspaceId],
  );
  return rows.map(toInvite);
}

export async function revokeInvite(uid: string, workspaceId: string, inviteId: string): Promise<boolean> {
  if (DEMO_MODE) throw notInDemo();
  await assertRole(uid, workspaceId, ['owner', 'admin']);
  const r = await db().query(
    'DELETE FROM workspace_invites WHERE id = $1 AND workspace_id = $2 AND accepted_at IS NULL',
    [inviteId, workspaceId],
  );
  return (r.rowCount ?? 0) > 0;
}

/**
 * Accepts an invite for the signed-in user. The token must be valid, unexpired and unused, and the
 * user's email must match the invited address. Existing members keep their current role.
 */
export async function acceptInvite(uid: string, email: string | undefined, token: string) {
  if (DEMO_MODE) throw notInDemo();
  const invalid = () => new ApiError(404, 'INVITE_INVALID', 'This invitation link is invalid, used or expired.');
  return withTx(async (c) => {
    const { rows } = await c.query('SELECT * FROM workspace_invites WHERE token_hash = $1 FOR UPDATE', [hash(token)]);
    const inv = rows[0];
    if (!inv || inv.accepted_at || new Date(inv.expires_at) < new Date()) throw invalid();
    if (!email || email.toLowerCase() !== inv.email) {
      throw new ApiError(
        403,
        'INVITE_EMAIL_MISMATCH',
        `This invitation is for ${inv.email}. Sign in with that email to accept it.`,
      );
    }
    await c.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT (workspace_id, user_id) DO NOTHING`,
      [inv.workspace_id, uid, inv.role],
    );
    await c.query('UPDATE workspace_invites SET accepted_by = $2, accepted_at = now() WHERE id = $1', [inv.id, uid]);
    return { workspaceId: inv.workspace_id as string, role: inv.role as string };
  });
}
