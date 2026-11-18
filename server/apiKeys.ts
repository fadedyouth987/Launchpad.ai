/**
 * Workspace API keys: `Authorization: Bearer lp_live_<secret>` for other apps and scripts.
 *
 * - Only owners/admins create and revoke keys, from a signed-in session (a key cannot manage keys).
 * - A key belongs to one workspace and acts as a hidden member with a fixed role:
 *     read -> viewer, write -> creator, publish -> approver (the highest scope wins).
 *   Every existing check (membership, roles, credits, approval rules, rate limits per caller) applies.
 * - Keys can only call the endpoints in KEY_ROUTES (content, AI generation, images, voice/video,
 *   credits, publishing); never members, billing, webhooks, settings or GDPR.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { DEMO_MODE } from './auth';
import { db, withTx } from './db';
import { ApiError } from './errors';
import { assertRole, type Role } from './workspaces';
import { isKeyMember, keyMemberId, KEY_MEMBER_PREFIX } from './apiKeyMembers';

export type Scope = 'read' | 'write' | 'publish';
export const SCOPES: Scope[] = ['read', 'write', 'publish'];
export const KEY_PREFIX = 'lp_live_';
export const MAX_KEYS_PER_WORKSPACE = 20;
export { isKeyMember, keyMemberId } from './apiKeyMembers';
const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');

export function roleForScopes(scopes: Scope[]): Role {
  if (scopes.includes('publish')) return 'approver';
  if (scopes.includes('write')) return 'creator';
  return 'viewer';
}

export interface ApiKeyRecord {
  id: string;
  name: string;
  prefix: string;
  scopes: Scope[];
  createdBy: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toRecord = (r: any): ApiKeyRecord => ({
  id: r.id,
  name: r.name,
  prefix: r.prefix,
  scopes: r.scopes,
  createdBy: r.created_by,
  createdAt: new Date(r.created_at).toISOString(),
  expiresAt: r.expires_at ? new Date(r.expires_at).toISOString() : null,
  lastUsedAt: r.last_used_at ? new Date(r.last_used_at).toISOString() : null,
});

const notInDemo = () => new ApiError(400, 'NOT_AVAILABLE_IN_DEMO', 'API keys are not available in demo mode.');

export async function listApiKeys(uid: string, workspaceId: string): Promise<ApiKeyRecord[]> {
  if (DEMO_MODE) return [];
  await assertRole(uid, workspaceId, ['owner', 'admin']);
  const { rows } = await db().query(
    `SELECT * FROM api_keys WHERE workspace_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC`,
    [workspaceId],
  );
  return rows.map(toRecord);
}

/** Creates a key. Returns the secret once; only its hash is kept. */
export async function createApiKey(
  uid: string,
  workspaceId: string,
  opts: { name: string; scopes: Scope[]; expiresInDays?: number | null },
) {
  if (DEMO_MODE) throw notInDemo();
  await assertRole(uid, workspaceId, ['owner', 'admin']);
  const scopes = SCOPES.filter((s) => opts.scopes.includes(s));
  if (!scopes.length) throw new ApiError(400, 'SCOPES_REQUIRED', 'Choose at least one permission.');
  const id = randomUUID();
  const key = `${KEY_PREFIX}${randomBytes(32).toString('base64url')}`;
  const expires = opts.expiresInDays ? new Date(Date.now() + opts.expiresInDays * 86_400_000) : null;
  const rec = await withTx(async (c) => {
    await c.query('SELECT 1 FROM workspaces WHERE id = $1 FOR UPDATE', [workspaceId]);
    const n = (
      await c.query('SELECT count(*)::int AS n FROM api_keys WHERE workspace_id = $1 AND revoked_at IS NULL', [
        workspaceId,
      ])
    ).rows[0].n;
    if (n >= MAX_KEYS_PER_WORKSPACE)
      throw new ApiError(409, 'KEY_LIMIT', `A workspace can have at most ${MAX_KEYS_PER_WORKSPACE} active API keys.`);
    const { rows } = await c.query(
      `INSERT INTO api_keys (id, workspace_id, name, prefix, key_hash, scopes, created_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [id, workspaceId, opts.name, key.slice(0, KEY_PREFIX.length + 4), hashKey(key), scopes, uid, expires],
    );
    await c.query('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, $3)', [
      workspaceId,
      keyMemberId(id),
      roleForScopes(scopes),
    ]);
    return toRecord(rows[0]);
  });
  return { key, record: rec };
}

export async function revokeApiKey(uid: string, workspaceId: string, keyId: string): Promise<ApiKeyRecord | null> {
  if (DEMO_MODE) throw notInDemo();
  await assertRole(uid, workspaceId, ['owner', 'admin']);
  return withTx(async (c) => {
    const { rows } = await c.query(
      `UPDATE api_keys SET revoked_at = now() WHERE id = $1 AND workspace_id = $2 AND revoked_at IS NULL RETURNING *`,
      [keyId, workspaceId],
    );
    if (!rows.length) return null;
    await c.query('DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [
      workspaceId,
      keyMemberId(keyId),
    ]);
    return toRecord(rows[0]);
  });
}

export interface KeyPrincipal {
  id: string;
  workspaceId: string;
  name: string;
  scopes: Scope[];
}

/** Looks up a presented key. Returns null for unknown, revoked or expired keys. */
export async function authenticateKey(key: string): Promise<KeyPrincipal | null> {
  if (!key.startsWith(KEY_PREFIX) || key.length > 100) return null;
  const { rows } = await db().query(
    `SELECT id, workspace_id, name, scopes, last_used_at FROM api_keys
      WHERE key_hash = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())`,
    [hashKey(key)],
  );
  const r = rows[0];
  if (!r) return null;
  // Record use at most every 5 minutes (no write on every request).
  if (!r.last_used_at || Date.now() - new Date(r.last_used_at).getTime() > 5 * 60_000) {
    db()
      .query('UPDATE api_keys SET last_used_at = now() WHERE id = $1', [r.id])
      .catch(() => undefined);
  }
  return { id: r.id, workspaceId: r.workspace_id, name: r.name, scopes: r.scopes };
}

/** Display name of a key member for audit logs. */
export async function keyMemberName(uid: string): Promise<string | null> {
  if (!isKeyMember(uid)) return null;
  const { rows } = await db().query('SELECT name FROM api_keys WHERE id = $1', [uid.slice(KEY_MEMBER_PREFIX.length)]);
  return `API key "${rows[0]?.name ?? 'deleted'}"`;
}

// Endpoints an API key may call (method + path under /api). Everything else answers 403.
const W = '/workspaces/[^/]+';
export const KEY_ROUTES: Array<[string, RegExp]> = [
  ['GET', /^\/v1\/key$/],
  ['GET', new RegExp(`^${W}/campaign-assets$`)],
  ['PUT', new RegExp(`^${W}/campaign-assets/[^/]+$`)],
  ['DELETE', new RegExp(`^${W}/campaign-assets/[^/]+$`)],
  ['POST', new RegExp(`^${W}/campaign-assets/[^/]+/publish$`)],
  ['GET', new RegExp(`^${W}/social/posts$`)],
  ['GET', new RegExp(`^${W}/influencers$`)],
  ['GET', new RegExp(`^${W}/images$`)],
  ['GET', new RegExp(`^${W}/images/[^/]+$`)],
  ['POST', /^\/images\/generate$/],
  ['GET', new RegExp(`^${W}/media(/voices|/[^/]+|/[^/]+/content)?$`)],
  ['POST', new RegExp(`^${W}/media/(speech|videos)$`)],
  ['POST', /^\/(generate|trends|engagement\/suggest-reply)$/],
  ['GET', /^\/billing\/(credits\/check|ledger)$/],
];

export const keyMayCall = (req: Request) =>
  KEY_ROUTES.some(([method, re]) => method === req.method && re.test(req.path));
