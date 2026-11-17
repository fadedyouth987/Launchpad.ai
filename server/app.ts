import express from 'express';
import { aiRoutes } from './routes/ai';
import { billingRoutes } from './routes/billing';
import { metaRoutes } from './routes/meta';
import { webhookRoutes } from './routes/webhooks';
import { workspaceRoutes } from './routes/workspaces';
import { workspaceDataRoutes } from './routes/workspaceData';
import { workspaceAdminRoutes } from './routes/workspaceAdmin';
import { sendServerError } from './http';
import { securityHeaders } from './security';
import { corsMiddleware, parseAllowedOrigins } from './cors';
import { llmFromClient, type AiClient } from './ai';
import { createAiResolver, fixedResolver, type AiResolver } from './llm/resolver';
import { aiSettingsRoutes } from './routes/aiSettings';
import { imageRoutes } from './routes/images';
import { paymentRoutes } from './routes/payments';
import { inviteRoutes } from './routes/invites';
import { socialRoutes } from './routes/social';
import { buildRateLimiters, setRateLimitStoreFactory, type RateLimitStoreFactory } from './rateLimit';

export interface AppOptions {
  /**
   * Tests: a fixed Gemini-shaped client for every call (null = always sample output). Omit in
   * production; the provider is then chosen per workspace from env keys and saved settings.
   */
  ai?: AiClient | null;
  /** Tests: fetch used for Resend (email) calls. */
  emailFetch?: typeof fetch;
  /** Tests: fetch used for Stripe API calls. */
  paymentsFetch?: typeof fetch;
  /** Tests: fetch used for LinkedIn API calls. */
  socialFetch?: typeof fetch;
  /** Tests: a custom provider resolver (takes precedence over `ai`). */
  aiResolver?: AiResolver;
  /** Shared rate-limit store (e.g. Redis) for multi-instance deployments. Default: in-memory. */
  rateLimitStore?: RateLimitStoreFactory;
  /** Origins allowed to call the API cross-origin. Default: ALLOWED_ORIGINS env (comma-separated). */
  allowedOrigins?: string[];
}

/**
 * Builds the API app (all /api routes and the JSON error handler). Static files / Vite are added by
 * server.ts; tests mount this app directly.
 */
const jsonParser = express.json({ limit: '100kb' });

export function createApp(options: AppOptions) {
  const { ai, aiResolver, rateLimitStore, allowedOrigins } = options;
  const resolver: AiResolver =
    aiResolver ?? ('ai' in options ? fixedResolver(ai ? llmFromClient(ai) : null) : createAiResolver());
  if (rateLimitStore) setRateLimitStoreFactory(rateLimitStore);
  buildRateLimiters();
  const app = express();

  // TRUST_PROXY: number of reverse-proxy hops in front of the app (e.g. 1 on Cloud Run) so
  // req.ip, and therefore IP rate limiting, uses the real client address.
  // On Cloud Run (K_SERVICE set) there is exactly one Google front end in front of the app.
  const trustProxy = process.env.TRUST_PROXY || (process.env.K_SERVICE ? '1' : '');
  if (trustProxy) {
    const n = Number(trustProxy);
    app.set('trust proxy', Number.isInteger(n) ? n : trustProxy === 'true' ? true : trustProxy);
  }
  app.disable('x-powered-by');
  app.use(securityHeaders({ production: process.env.NODE_ENV === 'production' }));
  // CORS first so preflights are answered before body parsing, auth and rate limits.
  app.use('/api', corsMiddleware(allowedOrigins ?? parseAllowedOrigins(process.env.ALLOWED_ORIGINS)));

  // Campaign OS saves need a larger body; that route has its own parser, mounted first.
  app.use('/api', (req, res, next) =>
    (req.method === 'PUT' && /\/(campaign-os|campaign-assets\/[^/]+)$/.test(req.path)) ||
    req.path === '/billing/stripe/webhook'
      ? next()
      : jsonParser(req, res, next),
  );
  app.use('/api', metaRoutes(resolver));
  app.use('/api', workspaceRoutes());
  app.use('/api', billingRoutes());
  app.use('/api', paymentRoutes(options.paymentsFetch));
  app.use('/api', socialRoutes(options.socialFetch));
  app.use('/api', aiRoutes(resolver));
  app.use('/api', aiSettingsRoutes(resolver));
  app.use('/api', imageRoutes(resolver));
  app.use('/api', webhookRoutes());
  app.use('/api', workspaceDataRoutes());
  app.use('/api', workspaceAdminRoutes());
  app.use('/api', inviteRoutes(options.emailFetch));

  // Unknown API routes get JSON, not the SPA's index.html.
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Unknown API endpoint.' });
  });

  // JSON error handler: body-parser errors (oversized or malformed JSON) and anything unhandled
  // get a short JSON response instead of Express's default HTML page with a stack trace.
  app.use(
    (
      err: { type?: string; status?: number; message?: string } | undefined,
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      if (res.headersSent) return next(err);
      if (err?.type === 'entity.too.large') {
        return res.status(413).json({ error: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large.' });
      }
      if (err?.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'INVALID_JSON', message: 'Request body is not valid JSON.' });
      }
      sendServerError(res, 'INTERNAL_ERROR', 'unhandled', err);
    },
  );

  return app;
}
