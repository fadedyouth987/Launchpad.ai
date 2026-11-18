import { randomUUID } from 'node:crypto';
import { DEMO_MODE } from './auth';
import { db } from './db';
import { assertMember, userProfiles } from './workspaces';
import { initialAuditLogs } from '../src/data/initialData';
import type { AuditLog } from '../src/types';
import { isKeyMember } from './apiKeyMembers';

/**
 * Audit log. Entries are written ONLY by the server (Postgres `audit_logs`, never exposed to the browser). Server-side actions record themselves; the browser can report UI events through
 * POST /api/workspaces/:id/audit-logs, but actor, timestamp, IP and source are always set here.
 */
export interface AuditInput {
  workspaceId: string;
  uid: string;
  action: string;
  details: string;
  severity?: AuditLog['securitySeverity'];
  source?: 'server' | 'client';
  ip?: string;
}

const demoAudit: AuditLog[] = structuredClone(initialAuditLogs);
const nameCache = new Map<string, string>();

async function actorName(uid: string): Promise<string> {
  if (DEMO_MODE) return 'Demo user';
  const cached = nameCache.get(uid);
  if (cached) return cached;
  if (isKeyMember(uid)) {
    const { keyMemberName } = await import('./apiKeys');
    const n = (await keyMemberName(uid).catch(() => null)) ?? 'API key';
    nameCache.set(uid, n);
    return n;
  }
  const p = (await userProfiles([uid])).get(uid);
  const name = p?.name || p?.email || uid;
  if (p) nameCache.set(uid, name);
  if (nameCache.size > 5000) nameCache.clear();
  return name;
}

/** Records an audit entry. Never throws: audit failures are logged, not surfaced to the caller. */
export async function recordAudit(input: AuditInput): Promise<AuditLog | null> {
  try {
    const entry: AuditLog = {
      id: `audit-${randomUUID()}`,
      workspaceId: input.workspaceId,
      timestamp: new Date().toISOString(),
      actor: await actorName(input.uid),
      action: input.action,
      details: input.details.slice(0, 1000),
      ipAddress: input.ip || (input.source === 'client' ? 'unknown' : 'server'),
      securitySeverity: input.severity ?? 'info',
    };
    if (DEMO_MODE) {
      demoAudit.unshift(entry);
      if (demoAudit.length > 2000) demoAudit.length = 2000;
      return entry;
    }
    await db().query(
      `INSERT INTO audit_logs (id, workspace_id, user_id, actor, action, details, ip_address, severity, source, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        entry.id,
        entry.workspaceId,
        input.uid,
        entry.actor,
        entry.action,
        entry.details,
        entry.ipAddress,
        entry.securitySeverity,
        input.source ?? 'server',
        entry.timestamp,
      ],
    );
    return entry;
  } catch (err) {
    console.error('[audit] failed to record', input.action, err);
    return null;
  }
}

export async function listAudit(uid: string, workspaceId: string, limit = 100): Promise<AuditLog[]> {
  await assertMember(uid, workspaceId);
  if (DEMO_MODE) return demoAudit.filter((e) => e.workspaceId === workspaceId).slice(0, limit);
  const { rows } = await db().query(
    `SELECT id, created_at, actor, action, details, ip_address, severity
       FROM audit_logs WHERE workspace_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2`,
    [workspaceId, limit],
  );
  return rows.map((e) => ({
    id: e.id,
    workspaceId,
    timestamp: new Date(e.created_at).toISOString(),
    actor: String(e.actor ?? ''),
    action: String(e.action ?? ''),
    details: String(e.details ?? ''),
    ipAddress: String(e.ip_address ?? ''),
    securitySeverity: e.severity === 'warning' || e.severity === 'critical' ? e.severity : 'info',
  }));
}
