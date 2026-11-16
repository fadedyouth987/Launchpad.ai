import { randomBytes, randomUUID } from 'node:crypto';
import { DEMO_MODE } from './auth';
import { withTx, db } from './db';
import { initialWebhookEndpoints } from '../src/data/initialData';
import type { WebhookEndpoint } from '../src/types';
import { ApiError } from './errors';
import { checkWebhookUrl } from './urlSafety';
import { assertMember, assertRole } from './workspaces';

const MAX_ENDPOINTS_PER_WORKSPACE = 20;
const limitError = () =>
  new ApiError(409, 'WEBHOOK_LIMIT', `A workspace can have at most ${MAX_ENDPOINTS_PER_WORKSPACE} webhook receivers.`);
// Asset lifecycle events (see webhookEvents.ts). New receivers get all of them.
const DEFAULT_EVENTS = ['approval.requested', 'asset.approved', 'asset.scheduled', 'asset.published', 'asset.rejected'];

/** 256-bit signing secret. Only ever returned once, from createWebhookEndpoint(). */
const generateSecret = () => `whsec_${randomBytes(32).toString('base64url')}`;
const maskSecret = (secret: string) => `whsec_…${secret.slice(-4)}`;

// DEMO_MODE only: seeded endpoints get fresh random secrets that are never revealed.
const demoSecrets = new Map<string, string>();
const demoEndpoints: WebhookEndpoint[] = structuredClone(initialWebhookEndpoints).map((e) => {
  const secret = generateSecret();
  demoSecrets.set(e.id, secret);
  return { ...e, secretPreview: maskSecret(secret) };
});

export async function listWebhookEndpoints(uid: string, workspaceId: string): Promise<WebhookEndpoint[]> {
  await assertMember(uid, workspaceId);
  if (DEMO_MODE) return demoEndpoints.filter((e) => e.workspaceId === workspaceId);
  const { rows } = await db().query(
    `SELECT id, url, description, secret_preview, events, status FROM webhook_endpoints
      WHERE workspace_id = $1 ORDER BY created_at LIMIT 100`,
    [workspaceId],
  );
  return rows.map((e) => ({
    id: e.id,
    workspaceId,
    url: String(e.url),
    description: String(e.description ?? ''),
    secretPreview: String(e.secret_preview ?? 'whsec_…'),
    events: Array.isArray(e.events) ? e.events.map(String) : [],
    status: e.status === 'suspended' || e.status === 'failing' ? e.status : 'active',
  }));
}

/**
 * Validates the URL (SSRF rules), stores the endpoint and its secret separately
 * (webhook_secrets is never returned after this call), and returns the full secret exactly once.
 */
export async function createWebhookEndpoint(
  uid: string,
  workspaceId: string,
  url: string,
  description: string,
): Promise<{ endpoint: WebhookEndpoint; secret: string }> {
  await assertRole(uid, workspaceId, ['owner', 'admin']);
  const check = await checkWebhookUrl(url);
  if (!check.ok) throw new ApiError(400, check.code, `Webhook URL rejected: ${check.reason}`);

  const secret = generateSecret();
  const endpoint: WebhookEndpoint = {
    id: `wh-${randomUUID()}`,
    workspaceId,
    url: check.url.toString(),
    description: description || 'Webhook receiver',
    secretPreview: maskSecret(secret),
    events: DEFAULT_EVENTS,
    status: 'active',
  };

  if (DEMO_MODE) {
    if (demoEndpoints.filter((e) => e.workspaceId === workspaceId).length >= MAX_ENDPOINTS_PER_WORKSPACE)
      throw limitError();
    demoEndpoints.push(endpoint);
    demoSecrets.set(endpoint.id, secret);
  } else {
    await withTx(async (c) => {
      // Lock the workspace row so concurrent creates cannot exceed the limit.
      await c.query('SELECT 1 FROM workspaces WHERE id = $1 FOR UPDATE', [workspaceId]);
      const n = (
        await c.query('SELECT count(*)::int AS n FROM webhook_endpoints WHERE workspace_id = $1', [workspaceId])
      ).rows[0].n;
      if (n >= MAX_ENDPOINTS_PER_WORKSPACE) throw limitError();
      await c.query(
        `INSERT INTO webhook_endpoints (id, workspace_id, url, description, secret_preview, events, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          endpoint.id,
          workspaceId,
          endpoint.url,
          endpoint.description,
          endpoint.secretPreview,
          endpoint.events,
          'active',
          uid,
        ],
      );
      await c.query('INSERT INTO webhook_secrets (endpoint_id, secret) VALUES ($1, $2)', [endpoint.id, secret]);
    });
  }
  return { endpoint, secret };
}

/** DEMO_MODE: removes a workspace's in-memory receivers and secrets (GDPR erase). */
export function demoEraseWebhooks(workspaceId: string): number {
  let n = 0;
  for (let i = demoEndpoints.length - 1; i >= 0; i--) {
    if (demoEndpoints[i].workspaceId === workspaceId) {
      demoSecrets.delete(demoEndpoints[i].id);
      demoEndpoints.splice(i, 1);
      n++;
    }
  }
  return n;
}
