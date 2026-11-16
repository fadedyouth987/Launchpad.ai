import { DEMO_MODE } from './auth';
import { db, withTx } from './db';
import { ApiError } from './errors';
import { assertMember, assertRole, WRITE_ROLES } from './workspaces';
import { initialAIInfluencers } from '../src/data/initialData';
import type { AIInfluencer } from '../src/types';
import type { CampaignOsState } from './dataSchemas';

/**
 * Server-owned workspace data (Postgres tables; the browser only reaches them through the API):
 *  - influencers          AI influencer profiles (jsonb), per workspace
 *  - campaign_os_states   one Campaign OS document (jsonb) per workspace
 * DEMO_MODE keeps the same data in memory (seeded influencers, empty Campaign OS).
 */
export const MAX_INFLUENCERS_PER_WORKSPACE = 50;

const demoInfluencers = new Map<string, AIInfluencer>(initialAIInfluencers.map((i) => [i.id, structuredClone(i)]));
const demoCampaignOs = new Map<string, { state: CampaignOsState; updatedAt: string }>();

// ---------- Influencers ----------

export async function listInfluencers(uid: string, workspaceId: string): Promise<AIInfluencer[]> {
  await assertMember(uid, workspaceId);
  let list: AIInfluencer[];
  if (DEMO_MODE) {
    list = [...demoInfluencers.values()].filter((i) => i.workspaceId === workspaceId);
  } else {
    const { rows } = await db().query(
      'SELECT id, data FROM influencers WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT $2',
      [workspaceId, MAX_INFLUENCERS_PER_WORKSPACE],
    );
    list = rows.map((r) => ({ ...(r.data as AIInfluencer), id: r.id, workspaceId }));
  }
  return list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

/** Creates or replaces an influencer. Returns whether it was newly created. */
export async function upsertInfluencer(
  uid: string,
  workspaceId: string,
  influencer: AIInfluencer,
): Promise<{ created: boolean }> {
  await assertRole(uid, workspaceId, WRITE_ROLES);
  const record: AIInfluencer = { ...influencer, workspaceId };
  if (DEMO_MODE) {
    const existing = demoInfluencers.get(record.id);
    if (existing && existing.workspaceId !== workspaceId)
      throw new ApiError(409, 'ID_CONFLICT', 'That id belongs to another workspace.');
    if (
      !existing &&
      [...demoInfluencers.values()].filter((i) => i.workspaceId === workspaceId).length >= MAX_INFLUENCERS_PER_WORKSPACE
    ) {
      throw new ApiError(
        409,
        'INFLUENCER_LIMIT',
        `A workspace can have at most ${MAX_INFLUENCERS_PER_WORKSPACE} influencers.`,
      );
    }
    demoInfluencers.set(record.id, record);
    return { created: !existing };
  }
  return withTx(async (c) => {
    // Serialise writers per workspace so the count limit cannot be raced.
    await c.query('SELECT 1 FROM workspaces WHERE id = $1 FOR UPDATE', [workspaceId]);
    const existing = await c.query('SELECT workspace_id FROM influencers WHERE id = $1', [record.id]);
    if (existing.rows.length && existing.rows[0].workspace_id !== workspaceId)
      throw new ApiError(409, 'ID_CONFLICT', 'That id belongs to another workspace.');
    if (!existing.rows.length) {
      const n = (await c.query('SELECT count(*)::int AS n FROM influencers WHERE workspace_id = $1', [workspaceId]))
        .rows[0].n;
      if (n >= MAX_INFLUENCERS_PER_WORKSPACE) {
        throw new ApiError(
          409,
          'INFLUENCER_LIMIT',
          `A workspace can have at most ${MAX_INFLUENCERS_PER_WORKSPACE} influencers.`,
        );
      }
    }
    const { id: _id, ...fields } = record;
    await c.query(
      `INSERT INTO influencers (id, workspace_id, data, updated_by) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_by = EXCLUDED.updated_by, updated_at = now()
       WHERE influencers.workspace_id = EXCLUDED.workspace_id`,
      [record.id, workspaceId, JSON.stringify(fields), uid],
    );
    return { created: !existing.rows.length };
  });
}

export async function deleteInfluencer(uid: string, workspaceId: string, influencerId: string): Promise<boolean> {
  await assertRole(uid, workspaceId, WRITE_ROLES);
  if (DEMO_MODE) {
    const existing = demoInfluencers.get(influencerId);
    if (!existing || existing.workspaceId !== workspaceId) return false;
    return demoInfluencers.delete(influencerId);
  }
  const r = await db().query('DELETE FROM influencers WHERE id = $1 AND workspace_id = $2', [
    influencerId,
    workspaceId,
  ]);
  return (r.rowCount ?? 0) > 0;
}

// ---------- Campaign OS ----------

export async function getCampaignOs(
  uid: string,
  workspaceId: string,
): Promise<{ state: CampaignOsState | null; updatedAt: string | null }> {
  await assertMember(uid, workspaceId);
  if (DEMO_MODE) {
    const saved = demoCampaignOs.get(workspaceId);
    return saved ? structuredClone(saved) : { state: null, updatedAt: null };
  }
  const { rows } = await db().query('SELECT state, updated_at FROM campaign_os_states WHERE workspace_id = $1', [
    workspaceId,
  ]);
  if (!rows.length) return { state: null, updatedAt: null };
  return { state: rows[0].state as CampaignOsState, updatedAt: new Date(rows[0].updated_at).toISOString() };
}

export async function saveCampaignOs(
  uid: string,
  workspaceId: string,
  state: CampaignOsState,
): Promise<{ updatedAt: string }> {
  await assertRole(uid, workspaceId, WRITE_ROLES);
  const updatedAt = new Date().toISOString();
  if (DEMO_MODE) {
    demoCampaignOs.set(workspaceId, { state: structuredClone(state), updatedAt });
    return { updatedAt };
  }
  const stateJson = JSON.stringify(state);
  if (stateJson.length > 900_000) throw new ApiError(413, 'STATE_TOO_LARGE', 'Campaign OS data is too large to save.');
  await db().query(
    `INSERT INTO campaign_os_states (workspace_id, state, updated_at, updated_by) VALUES ($1, $2, $3, $4)
     ON CONFLICT (workspace_id) DO UPDATE SET state = EXCLUDED.state, updated_at = EXCLUDED.updated_at,
       updated_by = EXCLUDED.updated_by`,
    [workspaceId, stateJson, updatedAt, uid],
  );
  return { updatedAt };
}

// ---------- GDPR helpers (demo store) ----------

export function demoEraseWorkspaceData(workspaceId: string) {
  for (const [id, inf] of demoInfluencers) if (inf.workspaceId === workspaceId) demoInfluencers.delete(id);
  demoCampaignOs.delete(workspaceId);
}
