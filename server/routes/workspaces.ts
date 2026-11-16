import { Router } from 'express';
import { requireAuth } from '../auth';
import { dataWriteRateLimiter } from '../rateLimit';
import { createWorkspace, listWorkspacesForUser } from '../workspaces';
import { createWorkspaceSchema } from '../schemas';
import { handle } from '../http';
import { recordAudit } from '../audit';

export function workspaceRoutes() {
  const r = Router();

  // Workspaces the signed-in user belongs to. The front end picks its workspace from this list.
  r.get(
    '/me/workspaces',
    requireAuth,
    handle('me/workspaces', async (req, res) => {
      const workspaces = await listWorkspacesForUser(req.authContext!.uid);
      res.json({ success: true, demo: req.authContext!.demo, workspaces });
    }),
  );

  r.post(
    '/workspaces',
    requireAuth,
    dataWriteRateLimiter,
    handle('workspaces/create', async (req, res) => {
      const parsed = createWorkspaceSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: 'INVALID_REQUEST', message: 'Workspace name must be 1-100 characters.' });
      }
      const workspace = await createWorkspace(req.authContext!.uid, parsed.data.name);
      await recordAudit({
        workspaceId: workspace.id,
        uid: req.authContext!.uid,
        ip: req.ip,
        action: 'workspace.create',
        details: `Created workspace "${workspace.name}".`,
      });
      res.status(201).json({ success: true, workspace });
    }),
  );

  return r;
}
