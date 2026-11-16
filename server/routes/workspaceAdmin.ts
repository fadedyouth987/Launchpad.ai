import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth';
import { dataWriteRateLimiter } from '../rateLimit';
import { handle, parseBody, workspaceFromParam } from '../http';
import { recordAudit } from '../audit';
import { eraseWorkspace, exportWorkspace } from '../gdpr';
import { setLegalHold, setMemberRole } from '../workspaces';

const eraseSchema = z.object({ confirmSlug: z.string().min(1).max(100) }).strict();
const legalHoldSchema = z.object({ active: z.boolean() }).strict();
const roleSchema = z.object({ role: z.enum(['admin', 'approver', 'creator', 'viewer']) }).strict();

/** Workspace administration: GDPR export/erase, legal hold, member roles. */
export function workspaceAdminRoutes() {
  const r = Router();
  const base = '/workspaces/:workspaceId';

  r.get(
    `${base}/export`,
    requireAuth,
    dataWriteRateLimiter,
    handle('gdpr/export', async (req, res) => {
      const ws = workspaceFromParam(req, res);
      if (!ws) return;
      const data = await exportWorkspace(req.authContext!.uid, ws);
      await recordAudit({
        workspaceId: ws,
        uid: req.authContext!.uid,
        ip: req.ip,
        action: 'gdpr.workspace.export',
        details: 'Downloaded a full data export of this workspace.',
        severity: 'warning',
      });
      res.setHeader('Content-Disposition', `attachment; filename="launchpad-export-${ws}.json"`);
      res.setHeader('Cache-Control', 'no-store');
      res.json(data);
    }),
  );

  r.post(
    `${base}/erase`,
    requireAuth,
    dataWriteRateLimiter,
    handle('gdpr/erase', async (req, res) => {
      const ws = workspaceFromParam(req, res);
      if (!ws) return;
      const body = parseBody(eraseSchema, req, res);
      if (!body) return;
      const deleted = await eraseWorkspace(req.authContext!.uid, ws, body.confirmSlug);
      await recordAudit({
        workspaceId: ws,
        uid: req.authContext!.uid,
        ip: req.ip,
        action: 'gdpr.workspace.erase',
        severity: 'critical',
        details: `Erased workspace data: ${JSON.stringify(deleted)}. Ledger and audit log kept.`,
      });
      res.json({ success: true, deleted, kept: ['workspace', 'ledger', 'auditLogs'] });
    }),
  );

  r.put(
    `${base}/legal-hold`,
    requireAuth,
    dataWriteRateLimiter,
    handle('legal-hold', async (req, res) => {
      const ws = workspaceFromParam(req, res);
      if (!ws) return;
      const body = parseBody(legalHoldSchema, req, res);
      if (!body) return;
      await setLegalHold(req.authContext!.uid, ws, body.active);
      await recordAudit({
        workspaceId: ws,
        uid: req.authContext!.uid,
        ip: req.ip,
        action: body.active ? 'workspace.legal_hold.on' : 'workspace.legal_hold.off',
        details: `Legal hold turned ${body.active ? 'on' : 'off'}.`,
        severity: 'warning',
      });
      res.json({ success: true, legalHoldActive: body.active });
    }),
  );

  r.put(
    `${base}/members/:memberId/role`,
    requireAuth,
    dataWriteRateLimiter,
    handle('members/role', async (req, res) => {
      const ws = workspaceFromParam(req, res);
      if (!ws) return;
      const body = parseBody(roleSchema, req, res);
      if (!body) return;
      const memberId = String(req.params.memberId);
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(memberId))
        return res.status(400).json({ error: 'INVALID_ID', message: 'Invalid member id.' });
      await setMemberRole(req.authContext!.uid, ws, memberId, body.role);
      await recordAudit({
        workspaceId: ws,
        uid: req.authContext!.uid,
        ip: req.ip,
        action: 'workspace.member.role',
        details: `Changed role of member ${memberId} to ${body.role}.`,
        severity: 'warning',
      });
      res.json({ success: true });
    }),
  );

  return r;
}
