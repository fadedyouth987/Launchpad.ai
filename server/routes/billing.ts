import { Router } from 'express';
import { requireAuth } from '../auth';
import { getCredits, listLedger } from '../credits';
import { handle, workspaceFromHeader } from '../http';

/**
 * Credits. Real mode: balances live in Postgres (workspaces.credits_remaining) and change only
 * on the server, inside a transaction that also writes an immutable ledger entry.
 * DEMO_MODE: in-memory balances for the seeded demo workspaces.
 */
export function billingRoutes() {
  const r = Router();

  r.get(
    '/billing/credits/check',
    requireAuth,
    handle('credits/check', async (req, res) => {
      const workspaceId = workspaceFromHeader(req, res);
      if (!workspaceId) return;
      const { creditsRemaining, totalAllocated } = await getCredits(req.authContext!.uid, workspaceId);
      res.json({
        success: true,
        workspaceId,
        creditsRemaining,
        totalAllocated,
        status: creditsRemaining > 500 ? 'healthy' : 'low_credits_warning',
        demo: req.authContext!.demo,
      });
    }),
  );

  r.get(
    '/billing/ledger',
    requireAuth,
    handle('billing/ledger', async (req, res) => {
      const workspaceId = workspaceFromHeader(req, res);
      if (!workspaceId) return;
      res.json({ success: true, entries: await listLedger(req.authContext!.uid, workspaceId) });
    }),
  );

  // There is deliberately no client-callable "reserve credits" endpoint: credits are only spent by
  // server routes that perform a paid action (POST /api/generate), so a member cannot drain a balance.

  return r;
}
