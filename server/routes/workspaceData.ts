import express, { Router } from 'express';
import { requireAuth } from '../auth';
import { dataWriteRateLimiter } from '../rateLimit';
import { handle, parseBody, workspaceFromParam } from '../http';
import { campaignAssetSchema, campaignOsStateSchema, clientAuditSchema, influencerSchema } from '../dataSchemas';
import { deleteCampaignAsset, listCampaignAssets, saveCampaignAsset } from '../campaignAssets';
import { deleteInfluencer, getCampaignOs, listInfluencers, saveCampaignOs, upsertInfluencer } from '../workspaceData';
import { listAudit, recordAudit } from '../audit';
import { assetEventData, assetEventFor, emitWorkspaceEvent } from '../webhookEvents';
import { assertMember } from '../workspaces';
import type { AIInfluencer, CampaignAsset } from '../../src/types';

const idParam = /^[A-Za-z0-9_-]{1,128}$/;

/** Influencers, Campaign OS and audit log, all under /api/workspaces/:workspaceId/... */
export function workspaceDataRoutes() {
  const r = Router();
  const base = '/workspaces/:workspaceId';

  // ----- Influencers -----
  r.get(
    `${base}/influencers`,
    requireAuth,
    handle('influencers/list', async (req, res) => {
      const ws = workspaceFromParam(req, res);
      if (!ws) return;
      res.json({ success: true, influencers: await listInfluencers(req.authContext!.uid, ws) });
    }),
  );

  r.put(
    `${base}/influencers/:id`,
    requireAuth,
    dataWriteRateLimiter,
    handle('influencers/save', async (req, res) => {
      const ws = workspaceFromParam(req, res);
      if (!ws) return;
      const body = parseBody(influencerSchema, req, res);
      if (!body) return;
      if (body.id !== req.params.id)
        return res.status(400).json({ error: 'ID_MISMATCH', message: 'Body id must match the URL.' });
      const { created } = await upsertInfluencer(req.authContext!.uid, ws, body as AIInfluencer);
      if (created) {
        await recordAudit({
          workspaceId: ws,
          uid: req.authContext!.uid,
          ip: req.ip,
          action: 'ai.influencer.create',
          details: `Saved AI influencer profile "${body.name}" (${body.handle}).`,
        });
      }
      res.status(created ? 201 : 200).json({ success: true, created });
    }),
  );

  r.delete(
    `${base}/influencers/:id`,
    requireAuth,
    dataWriteRateLimiter,
    handle('influencers/delete', async (req, res) => {
      const ws = workspaceFromParam(req, res);
      if (!ws) return;
      if (!idParam.test(req.params.id)) return res.status(400).json({ error: 'INVALID_ID', message: 'Invalid id.' });
      const deleted = await deleteInfluencer(req.authContext!.uid, ws, req.params.id);
      if (!deleted) return res.status(404).json({ error: 'NOT_FOUND', message: 'Influencer not found.' });
      await recordAudit({
        workspaceId: ws,
        uid: req.authContext!.uid,
        ip: req.ip,
        action: 'ai.influencer.delete',
        details: `Deleted AI influencer ${req.params.id}.`,
        severity: 'warning',
      });
      res.json({ success: true });
    }),
  );

  // ----- Campaign assets -----
  r.get(
    `${base}/campaign-assets`,
    requireAuth,
    handle('campaign-assets/list', async (req, res) => {
      const ws = workspaceFromParam(req, res);
      if (!ws) return;
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, assets: await listCampaignAssets(req.authContext!.uid, ws) });
    }),
  );

  r.put(
    `${base}/campaign-assets/:id`,
    express.json({ limit: '1mb' }),
    requireAuth,
    dataWriteRateLimiter,
    handle('campaign-assets/save', async (req, res) => {
      const ws = workspaceFromParam(req, res);
      if (!ws) return;
      const body = parseBody(campaignAssetSchema, req, res);
      if (!body) return;
      if (body.id !== req.params.id)
        return res.status(400).json({ error: 'ID_MISMATCH', message: 'Body id must match the URL.' });
      const sent = { ...(body as CampaignAsset), workspaceId: ws };
      const { created, previousStatus, status } = await saveCampaignAsset(req.authContext!.uid, ws, sent);
      // The saved status can differ from the one sent (a writer's edit to a cleared post goes back to review).
      const asset = { ...sent, status: status as CampaignAsset['status'] };
      const event = assetEventFor(previousStatus, asset);
      const deliveries = event ? await emitWorkspaceEvent(ws, req.authContext!.uid, event, assetEventData(asset)) : [];
      res.status(created ? 201 : 200).json({ success: true, created, status, ...(event ? { event, deliveries } : {}) });
    }),
  );

  r.delete(
    `${base}/campaign-assets/:id`,
    requireAuth,
    dataWriteRateLimiter,
    handle('campaign-assets/delete', async (req, res) => {
      const ws = workspaceFromParam(req, res);
      if (!ws) return;
      if (!idParam.test(req.params.id)) return res.status(400).json({ error: 'INVALID_ID', message: 'Invalid id.' });
      const deleted = await deleteCampaignAsset(req.authContext!.uid, ws, req.params.id);
      if (!deleted) return res.status(404).json({ error: 'NOT_FOUND', message: 'Asset not found.' });
      res.json({ success: true });
    }),
  );

  // ----- Campaign OS -----
  r.get(
    `${base}/campaign-os`,
    requireAuth,
    handle('campaign-os/get', async (req, res) => {
      const ws = workspaceFromParam(req, res);
      if (!ws) return;
      res.json({ success: true, ...(await getCampaignOs(req.authContext!.uid, ws)) });
    }),
  );

  // Larger body limit for this one route (parsed before the global 100 kB parser).
  r.put(
    `${base}/campaign-os`,
    express.json({ limit: '1mb' }),
    requireAuth,
    dataWriteRateLimiter,
    handle('campaign-os/save', async (req, res) => {
      const ws = workspaceFromParam(req, res);
      if (!ws) return;
      const parsed = campaignOsStateSchema.safeParse(req.body?.state);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'INVALID_STATE',
          message: 'Campaign OS data has an invalid shape.',
          issues: parsed.error.issues.slice(0, 10).map((i) => ({ path: i.path.join('.'), message: i.message })),
        });
      }
      res.json({ success: true, ...(await saveCampaignOs(req.authContext!.uid, ws, parsed.data)) });
    }),
  );

  // ----- Audit log -----
  r.get(
    `${base}/audit-logs`,
    requireAuth,
    handle('audit/list', async (req, res) => {
      const ws = workspaceFromParam(req, res);
      if (!ws) return;
      res.json({ success: true, entries: await listAudit(req.authContext!.uid, ws) });
    }),
  );

  r.post(
    `${base}/audit-logs`,
    requireAuth,
    dataWriteRateLimiter,
    handle('audit/record', async (req, res) => {
      const ws = workspaceFromParam(req, res);
      if (!ws) return;
      const body = parseBody(clientAuditSchema, req, res);
      if (!body) return;
      await assertMember(req.authContext!.uid, ws);
      const entry = await recordAudit({
        workspaceId: ws,
        uid: req.authContext!.uid,
        ip: req.ip,
        source: 'client',
        action: body.action,
        details: body.details,
        severity: body.severity,
      });
      if (!entry)
        return res.status(500).json({ error: 'AUDIT_WRITE_FAILED', message: 'Could not record the audit entry.' });
      res.status(201).json({ success: true, entry });
    }),
  );

  return r;
}
