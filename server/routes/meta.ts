import { Router } from 'express';
import { AUTH_CONFIGURED, DEMO_MODE } from '../auth';
import { DATABASE_CONFIGURED, db } from '../db';
import { isShuttingDown } from '../lifecycle';
import type { AiResolver } from '../llm/resolver';
import { PROVIDER_ORDER, serverConfigured, serverDefaultImageProvider, serverDefaultProvider } from '../llm/catalog';
import { keyStorageEnabled } from '../llm/secrets';
import { paymentsEnabled } from '../payments';
import { socialEnabled } from '../social/service';
import { videoEnabled, voiceEnabled } from '../media/service';
import { emailEnabled } from '../email';
import { WEBHOOK_DELIVERY_ENABLED } from '../webhookDelivery';

export function metaRoutes(resolver: AiResolver) {
  const r = Router();

  // Readiness: 200 only when this instance can serve traffic (database reachable, not draining).
  // Use /api/health for liveness and /api/ready for load-balancer / Cloud Run startup probes.
  r.get('/ready', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (isShuttingDown()) return res.status(503).json({ ready: false, reason: 'shutting_down' });
    if (DEMO_MODE) return res.json({ ready: true, database: 'demo-memory' });
    if (!DATABASE_CONFIGURED) return res.status(503).json({ ready: false, reason: 'database_not_configured' });
    let timer: NodeJS.Timeout | undefined;
    try {
      const probe = db().query('SELECT 1');
      probe.catch(() => undefined); // a late failure after the timeout must not become an unhandled rejection
      await Promise.race([
        probe,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('timeout')), 5000); // allows a suspended compute to wake
        }),
      ]);
      res.json({ ready: true, database: 'ok' });
    } catch {
      res.status(503).json({ ready: false, reason: 'database_unreachable' });
    } finally {
      clearTimeout(timer);
    }
  });

  // Health: reports what is actually connected. Anything not listed as true is demo-only.
  r.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      version: '2.4.0-dev',
      mode: resolver.anyConfigured() ? 'ai-connected' : 'demo',
      ai: {
        defaultProvider: serverDefaultProvider(),
        defaultImageProvider: serverDefaultImageProvider(),
        providers: Object.fromEntries(PROVIDER_ORDER.map((id) => [id, serverConfigured(id)])),
        workspaceKeys: keyStorageEnabled() && !DEMO_MODE,
      },
      auth: DEMO_MODE ? 'demo-mode' : AUTH_CONFIGURED ? 'neon' : 'not-configured',
      integrations: {
        ai: resolver.anyConfigured(),
        gemini: serverConfigured('gemini'),
        imageGeneration: Boolean(serverDefaultImageProvider()),
        database: DATABASE_CONFIGURED && !DEMO_MODE,
        backgroundJobs: false,
        payments: paymentsEnabled(),
        socialPublishing: socialEnabled('linkedin'),
        voice: voiceEnabled(),
        video: videoEnabled(),
        email: emailEnabled(),
        webhookDelivery: WEBHOOK_DELIVERY_ENABLED,
      },
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
    });
  });

  // Feature flags: static demo values. Requires the workspace header but does not authenticate it.
  r.get('/features/:flagName', (req, res) => {
    const { flagName } = req.params;
    const workspaceId = req.get('x-workspace-id');
    if (!workspaceId) {
      return res.status(401).json({
        error: 'TENANT_HEADER_MISSING',
        message: 'Requests to feature flags must provide a valid x-workspace-id header.',
      });
    }
    const flags: Record<string, boolean> = {
      multi_tenant_isolation: true,
      ai_asset_studio: true,
      ssrf_webhook_guard: true,
      realtime_presence: true,
      stripe_idempotent_billing: false,
      gdpr_retention_purge: true,
    };
    res.json({ flagName, enabled: flags[flagName] ?? false, workspaceId, tenantVerified: false });
  });

  return r;
}
