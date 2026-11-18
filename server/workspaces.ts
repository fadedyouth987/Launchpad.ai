import { randomUUID } from 'node:crypto';
import { DEMO_MODE } from './auth';
import { db, withTx, type DbClient } from './db';
import { isKeyMember, keyMemberId, KEY_MEMBER_LIKE } from './apiKeyMembers';
import { demoWorkspaces } from './demoStore';
import { ApiError, forbidden } from './errors';
import type { Workspace, WorkspaceMember } from '../src/types';

const MAX_OWNED_WORKSPACES = Number(process.env.MAX_WORKSPACES_PER_USER) || 5;
// Credits granted to a newly created workspace. Default 0: grant credits server-side
// (npm run credits:grant) or connect a payment provider. Set NEW_WORKSPACE_CREDITS for a trial balance.
const NEW_WORKSPACE_CREDITS = Math.max(0, Math.floor(Number(process.env.NEW_WORKSPACE_CREDITS) || 0));

export const ROLES = ['owner', 'admin', 'approver', 'creator', 'viewer'] as const;
export type Role = (typeof ROLES)[number];
/** Roles that may change workspace content or spend credits. Viewers are read-only. */
export const WRITE_ROLES: Role[] = ['owner', 'admin', 'approver', 'creator'];

/** A workspace as seen by one member: the row plus that member's role. */
export interface WorkspaceRecord {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  plan: Workspace['plan'];
  creditsRemaining: number;
  totalCreditsAllocated: number;
  legalHoldActive: boolean;
  retentionDays: number;
  createdAt: string;
  role: Role;
}

export const WORKSPACE_COLUMNS = `w.id, w.name, w.slug, w.owner_id, w.plan, w.credits_remaining, w.total_credits_allocated,
  w.legal_hold_active, w.retention_days, w.created_at`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toRecord(row: any, role: Role): WorkspaceRecord {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    ownerId: row.owner_id,
    plan: row.plan,
    creditsRemaining: Number(row.credits_remaining),
    totalCreditsAllocated: Number(row.total_credits_allocated),
    legalHoldActive: Boolean(row.legal_hold_active),
    retentionDays: Number(row.retention_days),
    createdAt: new Date(row.created_at).toISOString(),
    role,
  };
}

function demoRecord(ws: Workspace): WorkspaceRecord {
  return {
    id: ws.id,
    name: ws.name,
    slug: ws.slug,
    ownerId: ws.members.find((m) => m.role === 'owner')?.id ?? 'demo-owner',
    plan: ws.plan,
    creditsRemaining: ws.creditsRemaining,
    totalCreditsAllocated: ws.totalCreditsAllocated,
    legalHoldActive: ws.legalHoldActive,
    retentionDays: ws.retentionDays,
    createdAt: new Date(0).toISOString(),
    role: 'owner',
  };
}

/** Throws 403 unless uid is a member of workspaceId. Same response for "missing" and "not a member". */
export async function assertMember(uid: string, workspaceId: string): Promise<WorkspaceRecord> {
  if (DEMO_MODE) {
    const ws = demoWorkspaces.get(workspaceId);
    if (!ws) throw forbidden();
    return demoRecord(ws);
  }
  const { rows } = await db().query(
    `SELECT ${WORKSPACE_COLUMNS}, m.role FROM workspaces w
       JOIN workspace_members m ON m.workspace_id = w.id AND m.user_id = $2
      WHERE w.id = $1`,
    [workspaceId, uid],
  );
  if (!rows.length) throw forbidden();
  return toRecord(rows[0], rows[0].role);
}

/** Throws 403 unless uid has one of the given roles in workspaceId (demo: always allowed). */
export async function assertRole(uid: string, workspaceId: string, roles: Role[]): Promise<WorkspaceRecord> {
  const ws = await assertMember(uid, workspaceId);
  if (DEMO_MODE) return ws;
  if (!roles.includes(ws.role)) {
    throw new ApiError(403, 'ROLE_REQUIRED', `This action needs the ${roles.join(' or ')} role.`);
  }
  return ws;
}

/** Display names come from Neon Auth's user table (same database). */
export async function userProfiles(
  ids: string[],
): Promise<Map<string, { name: string; email: string; image: string }>> {
  const out = new Map<string, { name: string; email: string; image: string }>();
  if (!ids.length) return out;
  try {
    const { rows } = await db().query(
      'SELECT id, name, email, image FROM neon_auth."user" WHERE id::text = ANY($1::text[])',
      [ids],
    );
    for (const r of rows) out.set(String(r.id), { name: r.name || '', email: r.email || '', image: r.image || '' });
  } catch (err) {
    console.warn('[workspaces] could not read Neon Auth profiles:', (err as Error).message);
  }
  return out;
}

async function membersFor(workspaceIds: string[]): Promise<Map<string, WorkspaceMember[]>> {
  const byWs = new Map<string, WorkspaceMember[]>(workspaceIds.map((id) => [id, []]));
  if (!workspaceIds.length) return byWs;
  const { rows } = await db().query(
    `SELECT workspace_id, user_id, role FROM workspace_members
      WHERE workspace_id = ANY($1::text[]) AND user_id NOT LIKE $2 ORDER BY added_at LIMIT 5000`,
    [workspaceIds, KEY_MEMBER_LIKE],
  );
  const profiles = await userProfiles([...new Set(rows.map((r) => String(r.user_id)))]);
  for (const r of rows) {
    const p = profiles.get(r.user_id);
    byWs.get(r.workspace_id)?.push({
      id: r.user_id,
      name: p?.name || p?.email || 'Unknown user',
      email: p?.email || '',
      avatar: p?.image || '',
      role: r.role,
      status: 'offline',
    });
  }
  return byWs;
}

function toWorkspace(rec: WorkspaceRecord, members: WorkspaceMember[]): Workspace {
  return {
    id: rec.id,
    name: rec.name,
    slug: rec.slug,
    plan: rec.plan,
    creditsRemaining: rec.creditsRemaining,
    totalCreditsAllocated: rec.totalCreditsAllocated,
    legalHoldActive: rec.legalHoldActive,
    retentionDays: rec.retentionDays,
    members,
  };
}

/** Workspaces the signed-in user belongs to, with server-held balances. */
export async function listWorkspacesForUser(uid: string): Promise<Workspace[]> {
  if (DEMO_MODE) return [...demoWorkspaces.values()];
  const { rows } = await db().query(
    `SELECT ${WORKSPACE_COLUMNS}, m.role FROM workspace_members m JOIN workspaces w ON w.id = m.workspace_id
      WHERE m.user_id = $1 ORDER BY w.created_at LIMIT 50`,
    [uid],
  );
  const records = rows.map((r) => toRecord(r, r.role));
  const members = await membersFor(records.map((r) => r.id));
  return records.map((r) => toWorkspace(r, members.get(r.id) ?? []));
}

/**
 * Creates a workspace owned by uid. The per-user limit is checked under a per-user advisory lock in
 * the same transaction, so parallel requests cannot exceed it. Starting credits are recorded as a
 * 'grant' ledger entry so the ledger always reconciles with the balance.
 */
export async function createWorkspace(uid: string, name: string): Promise<Workspace> {
  if (DEMO_MODE) throw new ApiError(400, 'NOT_AVAILABLE_IN_DEMO', 'Creating workspaces is not available in demo mode.');
  const id = `ws-${randomUUID()}`;
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50) || 'workspace';
  const rec = await withTx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 42))', [`owned-workspaces:${uid}`]);
    const owned = (await c.query('SELECT count(*)::int AS n FROM workspaces WHERE owner_id = $1', [uid])).rows[0].n;
    if (owned >= MAX_OWNED_WORKSPACES) {
      throw new ApiError(409, 'WORKSPACE_LIMIT', `You can own at most ${MAX_OWNED_WORKSPACES} workspaces.`);
    }
    const { rows } = await c.query(
      `INSERT INTO workspaces AS w (id, name, slug, owner_id, credits_remaining, total_credits_allocated)
       VALUES ($1, $2, $3, $4, $5, $5) RETURNING ${WORKSPACE_COLUMNS}`,
      [id, name, slug, uid, NEW_WORKSPACE_CREDITS],
    );
    await c.query(`INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`, [id, uid]);
    if (NEW_WORKSPACE_CREDITS > 0) {
      await c.query(
        `INSERT INTO ledger_entries (id, workspace_id, user_id, type, description, amount_credits, resulting_balance)
         VALUES ($1, $2, $3, 'grant', 'Starting credits for a new workspace', $4, $4)`,
        [`grant-${id}`, id, uid, NEW_WORKSPACE_CREDITS],
      );
    }
    return toRecord(rows[0], 'owner');
  });
  const members = await membersFor([id]);
  return toWorkspace(rec, members.get(id) ?? []);
}

/** Sets a member's role (owner/admin only). The owner's own role cannot be changed. */
export async function setMemberRole(uid: string, workspaceId: string, memberId: string, role: Exclude<Role, 'owner'>) {
  if (DEMO_MODE) {
    const ws = demoWorkspaces.get(workspaceId);
    if (!ws) throw forbidden();
    const m = ws.members.find((x) => x.id === memberId);
    if (!m) throw new ApiError(404, 'NOT_FOUND', 'Member not found.');
    if (m.role === 'owner') throw new ApiError(400, 'OWNER_ROLE_FIXED', "The owner's role cannot be changed.");
    m.role = role;
    return;
  }
  const ws = await assertRole(uid, workspaceId, ['owner', 'admin']);
  if (memberId === ws.ownerId) throw new ApiError(400, 'OWNER_ROLE_FIXED', "The owner's role cannot be changed.");
  if (isKeyMember(memberId)) throw keyMemberFixed();
  await withTx(async (c) => {
    const r = await c.query(
      `UPDATE workspace_members SET role = $3 WHERE workspace_id = $1 AND user_id = $2 AND role <> 'owner'`,
      [workspaceId, memberId, role],
    );
    if (!r.rowCount) throw new ApiError(404, 'NOT_FOUND', 'Member not found.');
    // Only owners/admins manage keys: someone who is no longer one loses the keys they created.
    if (role !== 'admin') await revokeKeysCreatedBy(c, workspaceId, memberId);
  });
}

const keyMemberFixed = () =>
  new ApiError(400, 'API_KEY_MEMBER', 'API keys are managed on the API Keys page, not as members.');

/**
 * Revokes the API keys a member created (when they are removed, or stop being an owner/admin), so an
 * offboarded admin's integration keys stop working. Returns how many were revoked.
 */
async function revokeKeysCreatedBy(c: DbClient, workspaceId: string, memberId: string): Promise<number> {
  const { rows } = await c.query(
    `UPDATE api_keys SET revoked_at = now() WHERE workspace_id = $1 AND created_by = $2 AND revoked_at IS NULL
     RETURNING id`,
    [workspaceId, memberId],
  );
  if (rows.length) {
    await c.query('DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = ANY($2::text[])', [
      workspaceId,
      rows.map((r) => keyMemberId(String(r.id))),
    ]);
  }
  return rows.length;
}

/**
 * Removes a member (owner/admin). The owner cannot be removed, and only the owner can remove an admin.
 * Frees a plan seat.
 */
export async function removeMember(uid: string, workspaceId: string, memberId: string) {
  if (DEMO_MODE) throw new ApiError(400, 'NOT_AVAILABLE_IN_DEMO', 'Removing members is not available in demo mode.');
  const ws = await assertRole(uid, workspaceId, ['owner', 'admin']);
  if (memberId === ws.ownerId) throw new ApiError(400, 'OWNER_FIXED', 'The owner cannot be removed.');
  if (isKeyMember(memberId)) throw keyMemberFixed();
  const target = (
    await db().query('SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [
      workspaceId,
      memberId,
    ])
  ).rows[0];
  if (!target) throw new ApiError(404, 'NOT_FOUND', 'Member not found.');
  if (target.role === 'admin' && ws.role !== 'owner')
    throw new ApiError(403, 'ROLE_REQUIRED', 'Only the owner can remove an admin.');
  const keysRevoked = await withTx(async (c) => {
    await c.query(`DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 AND role <> 'owner'`, [
      workspaceId,
      memberId,
    ]);
    return revokeKeysCreatedBy(c, workspaceId, memberId);
  });
  return { role: target.role as Role, keysRevoked };
}

/** Turns legal hold on/off (owner/admin only). While on, erasure is refused. */
export async function setLegalHold(uid: string, workspaceId: string, active: boolean) {
  if (DEMO_MODE) {
    const ws = demoWorkspaces.get(workspaceId);
    if (!ws) throw forbidden();
    ws.legalHoldActive = active;
    return;
  }
  await assertRole(uid, workspaceId, ['owner', 'admin']);
  await db().query('UPDATE workspaces SET legal_hold_active = $2 WHERE id = $1', [workspaceId, active]);
}
