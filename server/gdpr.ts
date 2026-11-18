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
import { deleteVoice, elevenLabsConfigured } from './media/elevenlabs';
import { KEY_MEMBER_LIKE } from './apiKeyMembers';

/**
 * GDPR data export and erasure for one workspace.
 *
 * Export (owner/admin): everything stored for the workspace, as JSON. Webhook secrets, social OAuth
 * tokens and API key hashes are never exported; voice/video files are listed (not embedded).
 *
 * Erase (owner only, refused while legal hold is on): deletes campaign assets, influencers, Campaign
 * OS data, webhook receivers + secrets, generated images, voice/video media, cloned voices (also at
 * ElevenLabs), connected social accounts and their publish history, AI settings and workspace AI keys,
 * and revokes every API key (removing its hidden member). KEPT: the workspace record itself, the credit
 * ledger (financial record), people's memberships and the audit log (security record, includes this
 * erasure). Personal data in kept records is limited to member uids/names on audit entries.
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
  let media: unknown[] = [];
  let clonedVoices: unknown[] = [];
  let socialAccounts: unknown[] = [];
  let socialPosts: unknown[] = [];
  let apiKeys: unknown[] = [];
  if (!DEMO_MODE) {
    const q = async (sql: string) => (await db().query(sql, [workspaceId])).rows;
    [media, clonedVoices, socialAccounts, socialPosts, apiKeys] = await Promise.all([
      q(`SELECT id, user_id, kind, status, influencer_id, script, voice_id, provider, mime_type,
                coalesce(octet_length(data), 0) AS bytes, error, cost_credits, created_at
           FROM generated_media WHERE workspace_id = $1 ORDER BY created_at`),
      q(
        'SELECT voice_id, name, consent_by, created_at FROM workspace_voices WHERE workspace_id = $1 ORDER BY created_at',
      ),
      q(`SELECT id, provider, external_id, display_name, avatar_url, token_expires_at, connected_by, connected_at
           FROM social_accounts WHERE workspace_id = $1 ORDER BY provider`),
      q(`SELECT id, asset_id, provider, account_external_id, status, external_post_id, external_url, error, attempts,
                requested_by, created_at, updated_at
           FROM social_posts WHERE workspace_id = $1 ORDER BY created_at`),
      q(`SELECT id, name, prefix, scopes, created_by, created_at, expires_at, last_used_at, revoked_at
           FROM api_keys WHERE workspace_id = $1 ORDER BY created_at`),
    ]);
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
    media,
    clonedVoices,
    // OAuth tokens are never exported.
    socialAccounts,
    socialPosts,
    // Only key metadata; the keys themselves are never stored.
    apiKeys,
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
  const { result, voiceIds } = await withTx(async (c) => {
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
    const media = await del('generated_media');
    const voices = (
      await c.query('DELETE FROM workspace_voices WHERE workspace_id = $1 RETURNING voice_id', [workspaceId])
    ).rows.map((r) => String(r.voice_id));
    await del('social_posts');
    const socialAccounts = await del('social_accounts');
    // API keys: revoke (the rows stay as a security record) and drop their hidden members.
    const apiKeys =
      (
        await c.query('UPDATE api_keys SET revoked_at = now() WHERE workspace_id = $1 AND revoked_at IS NULL', [
          workspaceId,
        ])
      ).rowCount ?? 0;
    await c.query('DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id LIKE $2', [
      workspaceId,
      KEY_MEMBER_LIKE,
    ]);
    return {
      result: {
        campaignAssets,
        influencers,
        campaignOs,
        webhookEndpoints,
        generatedImages,
        aiKeys,
        media,
        clonedVoices: voices.length,
        socialAccounts,
        apiKeysRevoked: apiKeys,
      },
      voiceIds: voices,
    };
  });
  // Cloned voices also live in the server's ElevenLabs account; remove them there (best effort, after
  // the database erase has committed).
  if (voiceIds.length && elevenLabsConfigured()) {
    for (const v of voiceIds) {
      await deleteVoice(v).catch((err) =>
        console.warn('[gdpr] ElevenLabs voice delete failed', v, (err as Error).message),
      );
    }
  }
  return result;
}
