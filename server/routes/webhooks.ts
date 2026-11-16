import { Router } from 'express';
import { requireAuth } from '../auth';
import { assertRole } from '../workspaces';
import { webhookRateLimiter } from '../rateLimit';
import { checkWebhookUrl } from '../urlSafety';
import { createWebhookEndpoint, listWebhookEndpoints } from '../webhooks';
import { createWebhookSchema } from '../schemas';
import { handle, workspaceFromHeader } from '../http';
import { recordAudit } from '../audit';
import { deliverPinned, WEBHOOK_DELIVERY_ENABLED } from '../webhookDelivery';

export function webhookRoutes() {
  const r = Router();

  // Webhook test send. The URL is fully validated (parse, http/https only, DNS resolution, every
  // address must be public). With WEBHOOK_DELIVERY_ENABLED=true a test event is POSTed to the first
  // validated address (IP pinned, see deliverPinned); otherwise nothing is sent (simulated).
  r.post(
    '/webhooks/deliver',
    requireAuth,
    webhookRateLimiter,
    handle('webhooks/deliver', async (req, res) => {
      // Only workspace owners/admins may make the server contact an outside URL.
      const workspaceId = workspaceFromHeader(req, res);
      if (!workspaceId) return;
      await assertRole(req.authContext!.uid, workspaceId, ['owner', 'admin']);
      const url = typeof req.body?.url === 'string' ? req.body.url : '';
      if (!url) return res.status(400).json({ error: 'URL_REQUIRED', message: 'A url is required.' });
      const check = await checkWebhookUrl(url);
      if (!check.ok) {
        return res
          .status(403)
          .json({ success: false, status: 'blocked_ssrf', error: check.code, message: `Blocked: ${check.reason}` });
      }
      if (!WEBHOOK_DELIVERY_ENABLED) {
        return res.json({
          success: true,
          simulated: true,
          status: 'simulated',
          resolvedAddresses: check.addresses,
          responsePreview: `Simulated: URL passed validation (resolves to ${check.addresses.join(', ')}), but no request was sent. Set WEBHOOK_DELIVERY_ENABLED=true to send test events.`,
        });
      }
      try {
        const result = await deliverPinned({
          url: check.url,
          address: check.addresses[0],
          payload: { event: 'test.delivery', id: `evt_test_${Date.now()}`, createdAt: new Date().toISOString() },
        });
        res.json({
          success: result.status >= 200 && result.status < 300,
          simulated: false,
          status: result.status >= 200 && result.status < 300 ? 'delivered' : 'receiver_error',
          httpStatus: result.status,
          durationMs: result.durationMs,
          connectedTo: check.addresses[0],
          responsePreview: result.bodyPreview,
        });
      } catch (err) {
        res.status(502).json({
          success: false,
          simulated: false,
          status: 'failed',
          error: 'DELIVERY_FAILED',
          message: `Delivery failed: ${(err as Error).message}`,
        });
      }
    }),
  );

  // Webhook receivers: secrets are generated here, kept server-only, returned once, masked after.
  r.get(
    '/webhooks/endpoints',
    requireAuth,
    handle('webhooks/list', async (req, res) => {
      const workspaceId = workspaceFromHeader(req, res);
      if (!workspaceId) return;
      res.json({ success: true, endpoints: await listWebhookEndpoints(req.authContext!.uid, workspaceId) });
    }),
  );

  r.post(
    '/webhooks/endpoints',
    requireAuth,
    webhookRateLimiter,
    handle('webhooks/create', async (req, res) => {
      const parsed = createWebhookSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: 'INVALID_REQUEST', message: 'workspaceId and a url (max 2048 chars) are required.' });
      }
      const { workspaceId, url, description } = parsed.data;
      const { endpoint, secret } = await createWebhookEndpoint(
        req.authContext!.uid,
        workspaceId,
        url,
        description ?? '',
      );
      await recordAudit({
        workspaceId,
        uid: req.authContext!.uid,
        ip: req.ip,
        action: 'webhook.endpoint.create',
        details: `Added webhook receiver ${endpoint.url} (secret ${endpoint.secretPreview}).`,
        severity: 'warning',
      });
      res.status(201).json({ success: true, endpoint, secret, secretShownOnce: true });
    }),
  );

  return r;
}
