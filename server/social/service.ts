/**
 * Connected social accounts and publishing.
 *
 * Publishing an asset claims a social_posts row first (UNIQUE asset/provider/account), so the minute
 * scheduler, "Publish now" and retries can never post the same asset twice. A claim stuck in
 * 'publishing' (process died mid-call) is marked failed after 10 minutes instead of being re-sent,
 * because LinkedIn may already have the post; the user checks LinkedIn and retries by hand.
 */
import { randomUUID } from 'node:crypto';
import { DEMO_MODE } from '../auth';
import { db, withTx } from '../db';
import { ApiError } from '../errors';
import { decryptSecret, encryptSecret, keyStorageEnabled } from '../llm/secrets';
import { recordAudit } from '../audit';
import { assetEventData, emitWorkspaceEvent } from '../webhookEvents';
import { LinkedInError, linkedinConfigured, publishPost } from './linkedin';
import { RELEASED_STATUSES } from '../campaignAssets';
import type { CampaignAsset, Platform } from '../../src/types';

export type SocialProvider = 'linkedin';
/** Asset platforms that Launchpad can post to directly. Others are handed off via webhooks. */
export const DIRECT_PLATFORMS: Partial<Record<Platform, SocialProvider>> = { linkedin: 'linkedin' };

export const socialEnabled = (provider: SocialProvider) =>
  !DEMO_MODE && keyStorageEnabled() && (provider === 'linkedin' ? linkedinConfigured() : false);

const tokenAad = (workspaceId: string, provider: string) => `social:${workspaceId}:${provider}`;

// ---------------------------------------------------------------- OAuth state

const STATE_TTL_MS = 10 * 60_000;

/** Encrypted (so also tamper-proof) OAuth state naming the workspace and member who started it. */
export function makeState(workspaceId: string, uid: string, provider: SocialProvider): string {
  const payload = JSON.stringify({
    w: workspaceId,
    u: uid,
    p: provider,
    e: Date.now() + STATE_TTL_MS,
    n: randomUUID(),
  });
  return Buffer.from(encryptSecret(payload, 'oauth-state')).toString('base64url');
}

export function readState(state: string, provider: SocialProvider): { workspaceId: string; uid: string } {
  try {
    const raw = decryptSecret(Buffer.from(state, 'base64url').toString('utf8'), 'oauth-state');
    const s = JSON.parse(raw) as { w: string; u: string; p: string; e: number };
    if (s.p !== provider || typeof s.w !== 'string' || typeof s.u !== 'string') throw new Error('bad');
    if (!(s.e > Date.now())) throw new ApiError(400, 'STATE_EXPIRED', 'The connection link expired. Try again.');
    return { workspaceId: s.w, uid: s.u };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(400, 'INVALID_STATE', 'Invalid or tampered connection request.');
  }
}

/**
 * The result of a finished LinkedIn sign-in, sealed for the browser that comes back from LinkedIn.
 * The callback does not save the account: the web app hands this back with its signed-in session and
 * it is saved only if that session is the member who started the connection. So a connect link sent to
 * someone else cannot put their LinkedIn account into the sender's workspace.
 */
export interface PendingConnection {
  workspaceId: string;
  uid: string;
  provider: SocialProvider;
  externalId: string;
  displayName: string;
  avatarUrl: string;
  accessToken: string;
  expiresInSec: number;
}

export function sealPendingConnection(p: PendingConnection): string {
  const payload = JSON.stringify({ ...p, e: Date.now() + STATE_TTL_MS });
  return Buffer.from(encryptSecret(payload, 'oauth-pending')).toString('base64url');
}

export function openPendingConnection(sealed: string): PendingConnection {
  let p: PendingConnection & { e: number };
  try {
    p = JSON.parse(decryptSecret(Buffer.from(sealed, 'base64url').toString('utf8'), 'oauth-pending'));
  } catch {
    throw new ApiError(400, 'INVALID_STATE', 'Invalid or tampered connection request.');
  }
  if (!(p.e > Date.now())) throw new ApiError(400, 'STATE_EXPIRED', 'The connection link expired. Try again.');
  return p;
}

// ---------------------------------------------------------------- Accounts

export interface SocialAccount {
  id: string;
  provider: SocialProvider;
  externalId: string;
  displayName: string;
  avatarUrl: string;
  tokenExpiresAt: string | null;
  expired: boolean;
  connectedBy: string;
  connectedAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toAccount = (r: any): SocialAccount => {
  const exp = r.token_expires_at ? new Date(r.token_expires_at) : null;
  return {
    id: r.id,
    provider: r.provider,
    externalId: r.external_id,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    tokenExpiresAt: exp ? exp.toISOString() : null,
    expired: exp ? exp.getTime() <= Date.now() : false,
    connectedBy: r.connected_by,
    connectedAt: new Date(r.connected_at).toISOString(),
  };
};

export async function listAccounts(workspaceId: string): Promise<SocialAccount[]> {
  if (DEMO_MODE) return [];
  const { rows } = await db().query(
    `SELECT id, provider, external_id, display_name, avatar_url, token_expires_at, connected_by, connected_at
       FROM social_accounts WHERE workspace_id = $1 ORDER BY provider`,
    [workspaceId],
  );
  return rows.map(toAccount);
}

/** Saves (or replaces) the workspace's account for a network. */
export async function saveAccount(a: {
  workspaceId: string;
  provider: SocialProvider;
  externalId: string;
  displayName: string;
  avatarUrl: string;
  accessToken: string;
  expiresInSec: number;
  uid: string;
}) {
  const ciphertext = encryptSecret(a.accessToken, tokenAad(a.workspaceId, a.provider));
  const expires = new Date(Date.now() + a.expiresInSec * 1000);
  await db().query(
    `INSERT INTO social_accounts (id, workspace_id, provider, external_id, display_name, avatar_url, token_ciphertext,
                                  token_expires_at, connected_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (workspace_id, provider) DO UPDATE SET
       external_id = EXCLUDED.external_id, display_name = EXCLUDED.display_name, avatar_url = EXCLUDED.avatar_url,
       token_ciphertext = EXCLUDED.token_ciphertext, token_expires_at = EXCLUDED.token_expires_at,
       connected_by = EXCLUDED.connected_by, connected_at = now()`,
    [
      `soc-${randomUUID()}`,
      a.workspaceId,
      a.provider,
      a.externalId,
      a.displayName,
      a.avatarUrl,
      ciphertext,
      expires,
      a.uid,
    ],
  );
}

export async function deleteAccount(workspaceId: string, accountId: string): Promise<SocialAccount | null> {
  const { rows } = await db().query(
    `DELETE FROM social_accounts WHERE workspace_id = $1 AND id = $2
     RETURNING id, provider, external_id, display_name, avatar_url, token_expires_at, connected_by, connected_at`,
    [workspaceId, accountId],
  );
  return rows[0] ? toAccount(rows[0]) : null;
}

async function accountWithToken(workspaceId: string, provider: SocialProvider) {
  const { rows } = await db().query(
    `SELECT external_id, display_name, token_ciphertext, token_expires_at FROM social_accounts
      WHERE workspace_id = $1 AND provider = $2`,
    [workspaceId, provider],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    externalId: r.external_id as string,
    displayName: r.display_name as string,
    expiresAt: r.token_expires_at ? new Date(r.token_expires_at) : null,
    token: decryptSecret(r.token_ciphertext, tokenAad(workspaceId, provider)),
  };
}

// ---------------------------------------------------------------- Publishing

export interface SocialPost {
  id: string;
  assetId: string;
  provider: string;
  status: 'publishing' | 'published' | 'failed';
  externalUrl: string | null;
  error: string | null;
  attempts: number;
  updatedAt: string;
}

const POST_COLS = 'id, asset_id, provider, status, external_url, error, attempts, updated_at';

export async function listPosts(workspaceId: string, limit = 200): Promise<SocialPost[]> {
  if (DEMO_MODE) return [];
  const { rows } = await db().query(
    `SELECT ${POST_COLS} FROM social_posts WHERE workspace_id = $1 ORDER BY updated_at DESC LIMIT $2`,
    [workspaceId, limit],
  );
  return rows.map(toPost);
}

/** One post, by id or by (asset, provider): the latest attempt for that asset. */
async function findPost(workspaceId: string, by: { id: string } | { assetId: string; provider: string }) {
  const { rows } =
    'id' in by
      ? await db().query(`SELECT ${POST_COLS} FROM social_posts WHERE workspace_id = $1 AND id = $2`, [
          workspaceId,
          by.id,
        ])
      : await db().query(
          `SELECT ${POST_COLS} FROM social_posts WHERE workspace_id = $1 AND asset_id = $2 AND provider = $3
            ORDER BY updated_at DESC LIMIT 1`,
          [workspaceId, by.assetId, by.provider],
        );
  return rows[0] ? toPost(rows[0]) : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toPost(r: any): SocialPost {
  return {
    id: r.id,
    assetId: r.asset_id,
    provider: r.provider,
    status: r.status,
    externalUrl: r.external_url,
    error: r.error,
    attempts: Number(r.attempts),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

export type PublishOutcome =
  | { status: 'published'; url: string; post: SocialPost }
  | { status: 'failed'; error: string; reconnect: boolean; post: SocialPost }
  | { status: 'skipped'; reason: string };

const STUCK_AFTER = "interval '10 minutes'";

/**
 * Posts one asset to its network. `retry` re-sends a previously failed post (never a published one).
 * The image, if any, is attached from generated_images.
 */
export async function publishAsset(
  workspaceId: string,
  assetId: string,
  actor: string,
  opts: { retry?: boolean; fetchImpl?: typeof fetch } = {},
): Promise<PublishOutcome> {
  const assetRow = (
    await db().query('SELECT data FROM campaign_assets WHERE workspace_id = $1 AND id = $2', [workspaceId, assetId])
  ).rows[0];
  if (!assetRow) throw new ApiError(404, 'NOT_FOUND', 'Asset not found.');
  const asset = { ...(assetRow.data as CampaignAsset), id: assetId, workspaceId };
  const provider = DIRECT_PLATFORMS[asset.platform];
  if (!provider) return { status: 'skipped', reason: 'PLATFORM_NOT_SUPPORTED' };
  // Only cleared posts go out ("published" is allowed so a failed post can be retried).
  if (!RELEASED_STATUSES.includes(asset.status)) return { status: 'skipped', reason: 'NOT_APPROVED' };
  if (!socialEnabled(provider)) return { status: 'skipped', reason: 'LINKEDIN_NOT_CONFIGURED' };
  const account = await accountWithToken(workspaceId, provider);
  if (!account) return { status: 'skipped', reason: 'NO_ACCOUNT' };

  // Claim: insert, or (retry) take over a failed row. A published or in-flight row is never re-sent.
  const postId = `post-${randomUUID()}`;
  const claim = await withTx(async (c) => {
    await c.query(
      `UPDATE social_posts SET status = 'failed', error = 'Stopped mid-publish. Check LinkedIn before retrying.', updated_at = now()
        WHERE asset_id = $1 AND provider = $2 AND status = 'publishing' AND updated_at < now() - ${STUCK_AFTER}`,
      [assetId, provider],
    );
    // Already out (or going out) on this network through a previously connected account: reconnecting a
    // different LinkedIn account must not post it a second time.
    const elsewhere = await c.query(
      `SELECT 1 FROM social_posts WHERE asset_id = $1 AND provider = $2 AND account_external_id <> $3
          AND status IN ('published', 'publishing') LIMIT 1`,
      [assetId, provider, account.externalId],
    );
    if (elsewhere.rows.length) return null;
    const ins = await c.query(
      `INSERT INTO social_posts (id, workspace_id, asset_id, provider, account_external_id, status, requested_by)
       VALUES ($1, $2, $3, $4, $5, 'publishing', $6)
       ON CONFLICT (asset_id, provider, account_external_id) DO NOTHING RETURNING id`,
      [postId, workspaceId, assetId, provider, account.externalId, actor],
    );
    if (ins.rows.length) return ins.rows[0].id as string;
    if (!opts.retry) return null;
    const upd = await c.query(
      `UPDATE social_posts SET status = 'publishing', error = NULL, attempts = attempts + 1, requested_by = $4, updated_at = now()
        WHERE asset_id = $1 AND provider = $2 AND account_external_id = $3 AND status = 'failed' RETURNING id`,
      [assetId, provider, account.externalId, actor],
    );
    return (upd.rows[0]?.id as string | undefined) ?? null;
  });
  if (!claim) {
    const existing = await findPost(workspaceId, { assetId, provider });
    return {
      status: 'skipped',
      reason:
        existing?.status === 'published'
          ? 'ALREADY_PUBLISHED'
          : existing?.status === 'failed'
            ? 'FAILED_NEEDS_RETRY'
            : 'IN_PROGRESS',
    };
  }

  let result: { url: string; postId: string } | null = null;
  let failure: { message: string; reconnect: boolean } | null = null;
  try {
    if (account.expiresAt && account.expiresAt.getTime() <= Date.now()) {
      throw new LinkedInError('LinkedIn access expired (tokens last 60 days). Reconnect LinkedIn.', 401, true);
    }
    let image: { mimeType: string; data: Buffer; altText?: string } | null = null;
    if (asset.imageId) {
      const img = (
        await db().query('SELECT mime_type, data FROM generated_images WHERE workspace_id = $1 AND id = $2', [
          workspaceId,
          asset.imageId,
        ])
      ).rows[0];
      if (img) image = { mimeType: img.mime_type, data: img.data, altText: asset.title };
    }
    result = await publishPost(
      {
        accessToken: account.token,
        memberId: account.externalId,
        caption: asset.caption,
        hashtags: asset.hashtags,
        image,
      },
      opts.fetchImpl,
    );
  } catch (err) {
    const e = err as Error;
    failure = {
      message: (err instanceof LinkedInError ? e.message : `Publishing failed: ${e.message}`).slice(0, 1000),
      reconnect: err instanceof LinkedInError && err.reconnect,
    };
    if (!(err instanceof LinkedInError)) console.error('[social] publish error', assetId, e.message);
  }

  if (result) {
    await withTx(async (c) => {
      await c.query(
        `UPDATE social_posts SET status = 'published', external_post_id = $2, external_url = $3, error = NULL, updated_at = now()
          WHERE id = $1`,
        [claim, result!.postId, result!.url],
      );
      await c.query(
        `UPDATE campaign_assets SET data = jsonb_set(data, '{status}', '"published"'), updated_at = now()
          WHERE workspace_id = $1 AND id = $2`,
        [workspaceId, assetId],
      );
    });
    await recordAudit({
      workspaceId,
      uid: actor,
      action: 'social.post.published',
      details: `Posted "${asset.title}" to LinkedIn as ${account.displayName}: ${result.url}`,
    });
    await emitWorkspaceEvent(workspaceId, actor, 'asset.published', {
      ...assetEventData({ ...asset, status: 'published' }),
      publication: { provider, url: result.url, postId: result.postId },
    });
  } else {
    await db().query(`UPDATE social_posts SET status = 'failed', error = $2, updated_at = now() WHERE id = $1`, [
      claim,
      failure!.message,
    ]);
    await recordAudit({
      workspaceId,
      uid: actor,
      action: 'social.post.failed',
      details: `LinkedIn post for "${asset.title}" failed: ${failure!.message}`,
      severity: 'warning',
    });
  }
  const post = (await findPost(workspaceId, { id: claim }))!;
  return result
    ? { status: 'published', url: result.url, post }
    : { status: 'failed', error: failure!.message, reconnect: failure!.reconnect, post };
}

/**
 * Publishes every scheduled asset whose time has come, on networks the workspace has connected.
 * Safe to run concurrently or repeatedly: each asset is claimed once. Returns a summary.
 *
 * It stops starting new posts once `budgetMs` has passed, so a run finishes well inside the function
 * timeout: a run killed mid-post would leave that post marked failed ("stopped mid-publish") without
 * knowing whether LinkedIn has it. Whatever is left goes out on the next minute's run.
 */
export async function publishDue(opts: { fetchImpl?: typeof fetch; limit?: number; budgetMs?: number } = {}) {
  if (DEMO_MODE) return { checked: 0, published: 0, failed: 0 };
  const platforms = Object.keys(DIRECT_PLATFORMS);
  const now = Date.now();
  // Candidates in SQL, earliest first, so future posts can never crowd due ones out of the window.
  // scheduledTime is an ISO-8601 UTC string, which sorts and compares as text; the bound allows for
  // offsets of up to 14h. There is no ::timestamptz cast, so one malformed value cannot break the query;
  // the exact due check is done below.
  const upper = new Date(now + 14 * 3600_000).toISOString();
  const { rows: candidates } = await db().query(
    `SELECT a.workspace_id, a.id, a.data->>'scheduledTime' AS at FROM campaign_assets a
       JOIN social_accounts s ON s.workspace_id = a.workspace_id AND s.provider = a.data->>'platform'
      WHERE a.data->>'status' = 'scheduled'
        AND a.data->>'platform' = ANY($1)
        AND (a.data->>'scheduledTime') COLLATE "C" <= $2
        AND NOT EXISTS (SELECT 1 FROM social_posts p WHERE p.asset_id = a.id AND p.provider = a.data->>'platform')
      ORDER BY (a.data->>'scheduledTime') COLLATE "C"
      LIMIT 1000`,
    [platforms, upper],
  );
  const rows = candidates
    .map((r) => ({ ...r, t: Date.parse(r.at) }))
    .filter((r) => Number.isFinite(r.t) && r.t <= now)
    .sort((a, b) => a.t - b.t)
    .slice(0, opts.limit ?? 25);
  const until = now + (opts.budgetMs ?? 25_000);
  let published = 0;
  let failed = 0;
  let checked = 0;
  for (const r of rows) {
    if (Date.now() > until) break;
    checked++;
    try {
      const out = await publishAsset(r.workspace_id, r.id, 'scheduler', { fetchImpl: opts.fetchImpl });
      if (out.status === 'published') published++;
      else if (out.status === 'failed') failed++;
    } catch (err) {
      failed++;
      console.error('[social] scheduled publish crashed', r.id, (err as Error).message);
    }
  }
  return { checked, published, failed };
}
