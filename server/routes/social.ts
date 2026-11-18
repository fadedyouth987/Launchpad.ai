import { timingSafeEqual } from 'node:crypto';
import express, { Router } from 'express';
import { requireAuth } from '../auth';
import { dataWriteRateLimiter } from '../rateLimit';
import { handle, workspaceFromParam } from '../http';
import { assertMember, assertRole } from '../workspaces';
import { recordAudit } from '../audit';
import { ApiError } from '../errors';
import { appUrl } from '../payments';
import { APPROVER_ROLES } from '../campaignAssets';
import { refreshProcessingVideos } from '../media/service';
import { authorizeUrl, exchangeCode, fetchProfile, LinkedInError, linkedinNotConfigured } from '../social/linkedin';
import {
  deleteAccount,
  listAccounts,
  listPosts,
  makeState,
  openPendingConnection,
  publishAsset,
  publishDue,
  readState,
  saveAccount,
  sealPendingConnection,
  socialEnabled,
} from '../social/service';

const assetIdRe = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Who may run the publish scheduler: a Neon scheduled Function Trigger (Neon strips client-sent
 * X-Neon-* headers, so the header proves the call came from Neon), or anyone holding CRON_SECRET.
 * Running it is harmless anyway (each asset posts at most once), but it should not be public.
 */
function schedulerAllowed(req: express.Request): boolean {
  if (process.env.LAUNCHPAD_RUNTIME === 'neon-functions' && req.get('x-neon-trigger-invocation-id')) return true;
  const secret = process.env.CRON_SECRET?.trim();
  const given = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!secret || secret.length < 16 || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function socialRoutes(fetchImpl?: typeof fetch) {
  const r = Router();
  const back = (params: Record<string, string>) => `${appUrl()}/?${new URLSearchParams(params)}#publisher`;

  // Connected accounts + which networks this server can post to. Tokens are never returned.
  r.get(
    '/workspaces/:workspaceId/social/accounts',
    requireAuth,
    handle('social/accounts', async (req, res) => {
      const ws = workspaceFromParam(req, res);
      if (!ws) return;
      await assertMember(req.authContext!.uid, ws);
      res.json({
        success: true,
        available: { linkedin: socialEnabled('linkedin') },
        accounts: await listAccounts(ws),
      });
    }),
  );

  // Owner/admin starts the LinkedIn sign-in; the browser is sent to the returned URL.
  r.post(
    '/workspaces/:workspaceId/social/linkedin/connect',
    requireAuth,
    dataWriteRateLimiter,
    handle('social/linkedin/connect', async (req, res) => {
      const ws = workspaceFromParam(req, res);
      if (!ws) return;
      if (!socialEnabled('linkedin')) throw linkedinNotConfigured();
      await assertRole(req.authContext!.uid, ws, ['owner', 'admin']);
      res.json({ success: true, url: authorizeUrl(makeState(ws, req.authContext!.uid, 'linkedin')) });
    }),
  );

  // LinkedIn redirects the browser here (no API token on this request: the encrypted state carries
  // the workspace and member). Nothing is saved here: the browser is sent back to the web app with the
  // sealed result, and the web app finishes the connection with its signed-in session (POST .../complete).
  // Always ends with a redirect back to the web app.
  r.get('/social/linkedin/callback', async (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    if (q.error) {
      // The extended query parser can hand us an array or object here; never call string methods on it.
      const reason = typeof q.error === 'string' ? q.error : 'failed';
      return res.redirect(
        302,
        back({ social: 'error', reason: reason === 'user_cancelled_authorize' ? 'cancelled' : reason.slice(0, 60) }),
      );
    }
    try {
      if (!socialEnabled('linkedin')) throw linkedinNotConfigured();
      if (!q.code || !q.state) throw new ApiError(400, 'MISSING_CODE', 'LinkedIn did not return a code.');
      const { workspaceId, uid } = readState(q.state, 'linkedin');
      // Re-check: the member must still be an owner/admin of the workspace.
      await assertRole(uid, workspaceId, ['owner', 'admin']);
      const token = await exchangeCode(q.code, fetchImpl);
      const profile = await fetchProfile(token.accessToken, fetchImpl);
      const pending = sealPendingConnection({
        workspaceId,
        uid,
        provider: 'linkedin',
        externalId: profile.id,
        displayName: profile.name,
        avatarUrl: profile.picture,
        accessToken: token.accessToken,
        expiresInSec: token.expiresIn,
      });
      res.redirect(302, back({ social: 'pending', provider: 'linkedin', workspace: workspaceId, pending }));
    } catch (err) {
      const reason =
        err instanceof ApiError ? err.code : err instanceof LinkedInError ? `linkedin_${err.status}` : 'failed';
      if (!(err instanceof ApiError)) console.error('[social] LinkedIn connect failed:', (err as Error).message);
      res.redirect(302, back({ social: 'error', reason }));
    }
  });

  // The web app finishes a LinkedIn connection: only the member who started it, still an owner/admin,
  // can save it, and only into the workspace it was started for.
  r.post(
    '/workspaces/:workspaceId/social/linkedin/complete',
    requireAuth,
    dataWriteRateLimiter,
    handle('social/linkedin/complete', async (req, res) => {
      const ws = workspaceFromParam(req, res);
      if (!ws) return;
      if (req.authContext?.apiKey) throw new ApiError(403, 'API_KEY_NOT_ALLOWED', 'API keys cannot connect accounts.');
      if (!socialEnabled('linkedin')) throw linkedinNotConfigured();
      const sealed = typeof req.body?.pending === 'string' ? req.body.pending : '';
      if (!sealed || sealed.length > 8192) throw new ApiError(400, 'INVALID_STATE', 'Missing connection request.');
      const p = openPendingConnection(sealed);
      if (p.workspaceId !== ws || p.uid !== req.authContext!.uid || p.provider !== 'linkedin') {
        throw new ApiError(
          403,
          'NOT_YOUR_CONNECTION',
          'This LinkedIn sign-in was started by someone else. Start the connection from your own account.',
        );
      }
      await assertRole(p.uid, ws, ['owner', 'admin']);
      await saveAccount({
        workspaceId: ws,
        provider: 'linkedin',
        externalId: p.externalId,
        displayName: p.displayName,
        avatarUrl: p.avatarUrl,
        accessToken: p.accessToken,
        expiresInSec: p.expiresInSec,
        uid: p.uid,
      });
      await recordAudit({
        workspaceId: ws,
        uid: p.uid,
        ip: req.ip,
        action: 'social.account.connected',
        details: `Connected LinkedIn as ${p.displayName}.`,
      });
      res.json({ success: true, accounts: await listAccounts(ws) });
    }),
  );

  r.delete(
    '/workspaces/:workspaceId/social/accounts/:accountId',
    requireAuth,
    dataWriteRateLimiter,
    handle('social/accounts/delete', async (req, res) => {
      const ws = workspaceFromParam(req, res);
      if (!ws) return;
      await assertRole(req.authContext!.uid, ws, ['owner', 'admin']);
      const gone = await deleteAccount(ws, String(req.params.accountId));
      if (!gone) throw new ApiError(404, 'NOT_FOUND', 'Account not found.');
      await recordAudit({
        workspaceId: ws,
        uid: req.authContext!.uid,
        ip: req.ip,
        action: 'social.account.disconnected',
        details: `Disconnected ${gone.provider} (${gone.displayName}). Revoke the app in LinkedIn settings to remove access fully.`,
      });
      res.json({ success: true });
    }),
  );

  // Publish history for the workspace (status per asset).
  r.get(
    '/workspaces/:workspaceId/social/posts',
    requireAuth,
    handle('social/posts', async (req, res) => {
      const ws = workspaceFromParam(req, res);
      if (!ws) return;
      await assertMember(req.authContext!.uid, ws);
      res.json({ success: true, posts: await listPosts(ws) });
    }),
  );

  // "Publish now" (or retry a failed post): owners, admins and approvers.
  r.post(
    '/workspaces/:workspaceId/campaign-assets/:assetId/publish',
    requireAuth,
    dataWriteRateLimiter,
    handle('social/publish', async (req, res) => {
      const ws = workspaceFromParam(req, res);
      if (!ws) return;
      const assetId = String(req.params.assetId);
      if (!assetIdRe.test(assetId)) throw new ApiError(400, 'INVALID_ID', 'Invalid asset id.');
      await assertRole(req.authContext!.uid, ws, [...APPROVER_ROLES]);
      const out = await publishAsset(ws, assetId, req.authContext!.uid, { retry: true, fetchImpl });
      if (out.status === 'skipped') {
        const messages: Record<string, string> = {
          PLATFORM_NOT_SUPPORTED: 'Direct posting is only available for LinkedIn posts.',
          LINKEDIN_NOT_CONFIGURED: 'LinkedIn is not set up on this server.',
          NO_ACCOUNT: 'Connect a LinkedIn account first (Publisher page).',
          NOT_APPROVED: 'Only approved or scheduled posts can be published.',
          ALREADY_PUBLISHED: 'This post is already on LinkedIn.',
          IN_PROGRESS: 'This post is being published right now.',
          FAILED_NEEDS_RETRY: 'The last attempt failed. Use Retry to publish it again.',
        };
        throw new ApiError(409, out.reason, messages[out.reason] ?? 'This post cannot be published right now.');
      }
      if (out.status === 'published') return res.json({ success: true, ...out });
      // API error format: a code in `error`, LinkedIn's reason in `message`.
      res.status(502).json({
        success: false,
        error: 'PUBLISH_FAILED',
        message: out.error,
        status: out.status,
        reconnect: out.reconnect,
        post: out.post,
      });
    }),
  );

  // Scheduler: publishes due posts. Called every minute by the Neon trigger declared in neon.ts.
  r.post('/internal/publish-due', async (req, res) => {
    if (!schedulerAllowed(req)) return res.status(401).json({ error: 'UNAUTHORIZED' });
    try {
      const out = await publishDue({ fetchImpl });
      // Same tick: finish talking-head videos D-ID has rendered (nobody may be watching them).
      await refreshProcessingVideos().catch((err) =>
        console.error('[media] video refresh failed:', (err as Error).message),
      );
      if (out.checked)
        console.log(`[social] scheduler: ${out.published} published, ${out.failed} failed of ${out.checked}`);
      res.json({ success: true, ...out });
    } catch (err) {
      console.error('[social] scheduler failed:', (err as Error).message);
      res.status(500).json({ error: 'SCHEDULER_FAILED' });
    }
  });

  return r;
}
