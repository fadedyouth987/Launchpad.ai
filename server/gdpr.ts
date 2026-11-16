import { DEMO_MODE } from './auth';
import { db, withTx } from './db';
import { demoWorkspaces } from './demoStore';
import { ApiError } from './errors';
import { assertRole } from './workspaces';
import { listLedger } from './credits';
import { listAudit } from './audit';
import { listWebhookEndpoints, demoEraseWebhooks } from './webhooks';
import { getCampaignOs, listInfluencers, demoEraseWorkspaceData } from './workspaceData';
import { getAiSettings, listWorkspaceKeys } from './llm/settings';
import { listImages } from './images';

/**
 * GDPR data export and erasure for one workspace.
 *
 * Export (owner/admin): everything stored for the workspace, as JSON. Webhook secrets are never
 * exported (masked previews only).
 *
 * Erase (owner only, refused while legal hold is on): deletes campaign assets, influencers, Campaign
 * OS data, webhook receivers + secrets, generated images, AI settings and workspace AI keys. KEPT: the workspace record itself, the credit ledger
 * (financial record), memberships and the audit log (security record, includes this erasure). Personal data in
 * kept records is limited to member uids/names on audit entries.
 */
export async function exportWorkspace(uid: string, workspaceId: string) {
  const ws = await assertRole(uid, workspaceId, ['owner', 'admin']);
  const [ledger, auditLogs, webhookEndpoints, influencers, campaignOs, aiSettings, aiKeys, images] = await Promise.all([
    listLedger(uid, workspaceId, 10_000),
    listAudit(uid, workspaceId, 10_000),
    listWebhookEndpoints(uid, workspaceId),
    listInfluencers(uid, workspaceId),
    getCampaignOs(uid, workspaceId),
    getAiSettings(workspaceId),
    listWorkspaceKeys(workspaceId),
    listImages(uid, workspaceId),
  ]);
  let campaignAssets: unknown[] = [];
  let members: unknown[] = [];
  if (!DEMO_MODE) {
    const a = await db().query(
      'SELECT id, user_id, data, created_at, updated_at FROM campaign_assets WHERE workspace_id = $1 ORDER BY created_at',
      [workspaceId],
    );
    campaignAssets = a.rows.map((r) => ({
      ...r.data,
      id: r.id,
      workspaceId,
      userId: r.user_id,
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
    }));
    const m = await db().query(
      'SELECT user_id, role, added_at FROM workspace_members WHERE workspace_id = $1 ORDER BY added_at',
      [workspaceId],
    );
    members = m.rows.map((r) => ({ userId: r.user_id, role: r.role, addedAt: new Date(r.added_at).toISOString() }));
  }
  const { role: _callerRole, ...workspace } = ws;
  return {
    format: 'launchpad-workspace-export/v1',
    exportedAt: new Date().toISOString(),
    workspace: { ...workspace, id: workspaceId },
    members,
    campaignAssets: DEMO_MODE ? 'Demo mode: sample campaign assets live in the browser session only.' : campaignAssets,
    influencers,
    campaignOs: campaignOs.state,
    webhookEndpoints,
    // Keys themselves are never exported; only which providers have one.
    aiSettings: { ...aiSettings, workspaceKeys: [...aiKeys.keys()] },
    generatedImages: images,
    ledger,
    auditLogs,
  };
}

export async function eraseWorkspace(uid: string, workspaceId: string, confirmSlug: string) {
  const ws = await assertRole(uid, workspaceId, ['owner']);
  if (confirmSlug !== ws.slug)
    throw new ApiError(400, 'CONFIRMATION_MISMATCH', 'Type the workspace slug exactly to confirm.');
  if (ws.legalHoldActive) throw new ApiError(409, 'LEGAL_HOLD', 'Legal hold is on. Turn it off before erasing data.');

  if (DEMO_MODE) {
    if (!demoWorkspaces.has(workspaceId)) throw new ApiError(404, 'NOT_FOUND', 'Workspace not found.');
    demoEraseWorkspaceData(workspaceId);
    const webhookEndpoints = demoEraseWebhooks(workspaceId);
    return { campaignAssets: 0, influencers: 'all', campaignOs: 1, webhookEndpoints };
  }

  // One transaction: either everything listed is erased or nothing is.
  return withTx(async (c) => {
    const del = async (table: string) =>
      (await c.query(`DELETE FROM ${table} WHERE workspace_id = $1`, [workspaceId])).rowCount ?? 0;
    const campaignAssets = await del('campaign_assets');
    const influencers = await del('influencers');
    const webhookEndpoints = await del('webhook_endpoints'); // webhook_secrets cascade
    const campaignOs = await del('campaign_os_states');
    const generatedImages = await del('generated_images');
    const aiKeys = await del('workspace_ai_keys');
    await del('workspace_ai_settings');
    await del('workspace_invites');
    return { campaignAssets, influencers, campaignOs, webhookEndpoints, generatedImages, aiKeys };
  });
}
