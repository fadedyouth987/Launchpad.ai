import { DEMO_MODE } from './auth';
import { db, withTx } from './db';
import { ApiError } from './errors';
import { assertMember, assertRole, WRITE_ROLES } from './workspaces';
import type { CampaignAsset } from '../src/types';

/**
 * Campaign assets (posts in review/scheduling). Previously the browser wrote these straight to
 * Firestore under security rules; now the API owns them. Rules carried over: members read; writers
 * (not viewers) create and edit; the creator, owner or admin deletes; id, workspace and creator are
 * immutable. Demo mode keeps sample assets in the browser only.
 */
export const MAX_ASSETS_PER_WORKSPACE = 500;

const notInDemo = () =>
  new ApiError(400, 'NOT_AVAILABLE_IN_DEMO', 'Demo assets live in your browser session and are not saved.');

export async function listCampaignAssets(uid: string, workspaceId: string): Promise<CampaignAsset[]> {
  await assertMember(uid, workspaceId);
  if (DEMO_MODE) return [];
  const { rows } = await db().query(
    'SELECT id, data FROM campaign_assets WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT $2',
    [workspaceId, MAX_ASSETS_PER_WORKSPACE],
  );
  return rows.map((r) => ({ ...(r.data as CampaignAsset), id: r.id, workspaceId }));
}

/** Creates or updates an asset. Returns whether it was created. */
/** Statuses that mean "cleared to go out". Scheduled LinkedIn posts are published automatically. */
export const RELEASED_STATUSES = ['approved', 'scheduled', 'published'];
/** Roles that may approve: move an asset into a released status from anything else. */
export const APPROVER_ROLES = ['owner', 'admin', 'approver'] as const;

export async function saveCampaignAsset(
  uid: string,
  workspaceId: string,
  asset: CampaignAsset & { userId?: string; createdAt?: string },
): Promise<{ created: boolean; previousStatus: string | null }> {
  const ws = await assertRole(uid, workspaceId, WRITE_ROLES);
  const needsApprover =
    RELEASED_STATUSES.includes(asset.status) && !(APPROVER_ROLES as readonly string[]).includes(ws.role);
  if (DEMO_MODE) throw notInDemo();
  const { id, userId: _u, createdAt: _c, workspaceId: _w, ...fields } = asset;
  return withTx(async (c) => {
    await c.query('SELECT 1 FROM workspaces WHERE id = $1 FOR UPDATE', [workspaceId]);
    const existing = await c.query(
      "SELECT workspace_id, data->>'status' AS status FROM campaign_assets WHERE id = $1",
      [id],
    );
    if (existing.rows.length && existing.rows[0].workspace_id !== workspaceId)
      throw new ApiError(409, 'ID_CONFLICT', 'That id belongs to another workspace.');
    // Approval is enforced here, not only in the UI: only owners, admins and approvers can clear a post
    // to go out. Editing an already-cleared post (e.g. rescheduling it) stays open to writers.
    const prev = (existing.rows[0]?.status as string | undefined) ?? null;
    if (needsApprover && !(prev && RELEASED_STATUSES.includes(prev))) {
      throw new ApiError(
        403,
        'APPROVAL_REQUIRED',
        'Only an owner, admin or approver can approve or schedule a post. Submit it for review instead.',
      );
    }
    if (!existing.rows.length) {
      const n = (await c.query('SELECT count(*)::int AS n FROM campaign_assets WHERE workspace_id = $1', [workspaceId]))
        .rows[0].n;
      if (n >= MAX_ASSETS_PER_WORKSPACE)
        throw new ApiError(409, 'ASSET_LIMIT', `A workspace can have at most ${MAX_ASSETS_PER_WORKSPACE} assets.`);
      await c.query('INSERT INTO campaign_assets (id, workspace_id, user_id, data) VALUES ($1, $2, $3, $4)', [
        id,
        workspaceId,
        uid,
        JSON.stringify(fields),
      ]);
      return { created: true, previousStatus: null };
    }
    await c.query('UPDATE campaign_assets SET data = $3, updated_at = now() WHERE id = $1 AND workspace_id = $2', [
      id,
      workspaceId,
      JSON.stringify(fields),
    ]);
    return { created: false, previousStatus: (existing.rows[0].status as string | null) ?? null };
  });
}

/** Deletes an asset: its creator, or the workspace owner/admin. Returns false if it does not exist. */
export async function deleteCampaignAsset(uid: string, workspaceId: string, assetId: string): Promise<boolean> {
  const ws = await assertRole(uid, workspaceId, WRITE_ROLES);
  if (DEMO_MODE) throw notInDemo();
  const { rows } = await db().query('SELECT user_id FROM campaign_assets WHERE id = $1 AND workspace_id = $2', [
    assetId,
    workspaceId,
  ]);
  if (!rows.length) return false;
  if (rows[0].user_id !== uid && ws.role !== 'owner' && ws.role !== 'admin')
    throw new ApiError(403, 'ROLE_REQUIRED', 'Only the creator, an owner or an admin can delete this asset.');
  await db().query('DELETE FROM campaign_assets WHERE id = $1 AND workspace_id = $2', [assetId, workspaceId]);
  return true;
}
