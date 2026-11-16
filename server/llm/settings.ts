/**
 * Per-workspace AI settings (chosen provider and model) and workspace-supplied API keys.
 * Postgres tables workspace_ai_settings / workspace_ai_keys (migration 002). DEMO_MODE keeps
 * settings in memory and does not accept keys (the demo is shared by every visitor).
 */
import { DEMO_MODE } from '../auth';
import { db } from '../db';
import { ApiError } from '../errors';
import { providerCatalog } from './catalog';
import { decryptSecret, encryptSecret, keyStorageEnabled } from './secrets';
import type { ProviderId } from './types';

export interface WorkspaceAiSettings {
  textProvider: ProviderId | null;
  textModel: string | null;
  imageProvider: ProviderId | null;
  imageModel: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface StoredKeyInfo {
  last4: string;
  createdAt: string;
}

const EMPTY: WorkspaceAiSettings = {
  textProvider: null,
  textModel: null,
  imageProvider: null,
  imageModel: null,
  updatedAt: null,
  updatedBy: null,
};

const demoSettings = new Map<string, WorkspaceAiSettings>();

/** Settings for a workspace (no access check: callers check membership first). */
export async function getAiSettings(workspaceId: string): Promise<WorkspaceAiSettings> {
  if (DEMO_MODE) return demoSettings.get(workspaceId) ?? { ...EMPTY };
  const { rows } = await db().query(
    `SELECT text_provider, text_model, image_provider, image_model, updated_at, updated_by
       FROM workspace_ai_settings WHERE workspace_id = $1`,
    [workspaceId],
  );
  if (!rows.length) return { ...EMPTY };
  const r = rows[0];
  return {
    textProvider: r.text_provider,
    textModel: r.text_model,
    imageProvider: r.image_provider,
    imageModel: r.image_model,
    updatedAt: new Date(r.updated_at).toISOString(),
    updatedBy: r.updated_by,
  };
}

export async function saveAiSettings(
  uid: string,
  workspaceId: string,
  s: Pick<WorkspaceAiSettings, 'textProvider' | 'textModel' | 'imageProvider' | 'imageModel'>,
): Promise<WorkspaceAiSettings> {
  if (DEMO_MODE) {
    const next = { ...s, updatedAt: new Date().toISOString(), updatedBy: uid };
    demoSettings.set(workspaceId, next);
    return next;
  }
  await db().query(
    `INSERT INTO workspace_ai_settings (workspace_id, text_provider, text_model, image_provider, image_model, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (workspace_id) DO UPDATE SET text_provider = EXCLUDED.text_provider, text_model = EXCLUDED.text_model,
       image_provider = EXCLUDED.image_provider, image_model = EXCLUDED.image_model,
       updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [workspaceId, s.textProvider, s.textModel, s.imageProvider, s.imageModel, uid],
  );
  return getAiSettings(workspaceId);
}

/** Which providers have a workspace key (last 4 characters only). */
export async function listWorkspaceKeys(workspaceId: string): Promise<Map<ProviderId, StoredKeyInfo>> {
  const out = new Map<ProviderId, StoredKeyInfo>();
  if (DEMO_MODE) return out;
  const { rows } = await db().query(
    'SELECT provider, key_last4, created_at FROM workspace_ai_keys WHERE workspace_id = $1',
    [workspaceId],
  );
  for (const r of rows) out.set(r.provider, { last4: r.key_last4, createdAt: new Date(r.created_at).toISOString() });
  return out;
}

const aad = (workspaceId: string, provider: ProviderId) => `launchpad-ai-key:${workspaceId}:${provider}`;

function assertKeyAllowed(provider: ProviderId) {
  if (DEMO_MODE) throw new ApiError(400, 'NOT_AVAILABLE_IN_DEMO', 'Saving API keys is not available in demo mode.');
  if (!providerCatalog()[provider].allowWorkspaceKey) {
    throw new ApiError(400, 'KEY_NOT_ALLOWED', 'This provider is configured by the server admin only.');
  }
  if (!keyStorageEnabled()) {
    throw new ApiError(
      503,
      'KEY_STORAGE_DISABLED',
      'Saving workspace API keys is turned off on this server (AI_KEYS_ENCRYPTION_KEY is not set).',
    );
  }
}

export async function saveWorkspaceKey(uid: string, workspaceId: string, provider: ProviderId, apiKey: string) {
  assertKeyAllowed(provider);
  const blob = encryptSecret(apiKey, aad(workspaceId, provider));
  await db().query(
    `INSERT INTO workspace_ai_keys (workspace_id, provider, key_ciphertext, key_last4, created_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (workspace_id, provider) DO UPDATE SET key_ciphertext = EXCLUDED.key_ciphertext,
       key_last4 = EXCLUDED.key_last4, created_by = EXCLUDED.created_by, created_at = now()`,
    [workspaceId, provider, blob, apiKey.slice(-4), uid],
  );
}

export async function deleteWorkspaceKey(workspaceId: string, provider: ProviderId): Promise<boolean> {
  if (DEMO_MODE) return false;
  const r = await db().query('DELETE FROM workspace_ai_keys WHERE workspace_id = $1 AND provider = $2', [
    workspaceId,
    provider,
  ]);
  return (r.rowCount ?? 0) > 0;
}

/** Decrypted workspace key, or null. Server-internal only. */
export async function loadWorkspaceKey(workspaceId: string, provider: ProviderId): Promise<string | null> {
  if (DEMO_MODE || !keyStorageEnabled()) return null;
  const { rows } = await db().query(
    'SELECT key_ciphertext FROM workspace_ai_keys WHERE workspace_id = $1 AND provider = $2',
    [workspaceId, provider],
  );
  if (!rows.length) return null;
  try {
    return decryptSecret(rows[0].key_ciphertext, aad(workspaceId, provider));
  } catch (err) {
    console.error(`[ai-keys] could not decrypt the ${provider} key for ${workspaceId}:`, (err as Error).message);
    return null;
  }
}
