// Load .env.local (written by `neon env pull` / `neon deploy`) and .env before anything reads
// process.env (ES imports are evaluated in order). Real environment variables always win.
import './server/loadEnv';
import path from 'node:path';
import type { Server } from 'node:http';
import { checkConfig } from './server/config';

const PORT = Number(process.env.PORT) || 3000;
const production = process.env.NODE_ENV === 'production';

// Fail fast on bad configuration before anything else starts.
const { errors, warnings } = checkConfig();
for (const w of warnings) console.warn(`[config] ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`[config] ERROR: ${e}`);
  console.error('[config] Refusing to start. Fix the settings above (see .env.example).');
  process.exit(1);
}

process.on('unhandledRejection', (reason) => {
  console.error('[process] unhandled promise rejection', reason instanceof Error ? reason.message : reason);
});
process.on('uncaughtException', (err) => {
  console.error('[process] uncaught exception, exiting', err);
  process.exit(1);
});

async function main() {
  const { createApp } = await import('./server/app');
  const { serverDefaultProvider } = await import('./server/llm/catalog');
  const { DEMO_MODE, AUTH_CONFIGURED } = await import('./server/auth');
  const { DATABASE_DRIVER, closeDb } = await import('./server/db');
  const { setShuttingDown } = await import('./server/lifecycle');

  const app = createApp({});
  console.log(`[ai] server default provider: ${serverDefaultProvider() ?? 'none (sample output until a key is set)'}`);

  if (!production) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else if (process.env.SERVE_STATIC === 'false') {
    // API only: the web app is hosted elsewhere (e.g. Cloudflare) and calls this origin via CORS.
    console.log(`[web] SERVE_STATIC=false: API only. CORS origins: ${process.env.ALLOWED_ORIGINS || '(none)'}`);
    app.use((_req, res) => res.status(404).json({ error: 'NOT_FOUND', message: 'This server only serves /api.' }));
  } else {
    const { serveClient } = await import('./server/static');
    // dist/server.cjs -> dist/public
    const baseDir = typeof __dirname !== 'undefined' ? __dirname : path.join(process.cwd(), 'dist');
    serveClient(app, process.env.STATIC_DIR || path.join(baseDir, 'public'));
  }

  if (DEMO_MODE) {
    console.warn(
      `[auth] DEMO_MODE=true: API endpoints do NOT require sign-in${production ? ' (production override set)' : ''}.`,
    );
  } else if (!AUTH_CONFIGURED) {
    console.warn('[auth] Neon Auth / DATABASE_URL not configured: protected endpoints will return 503.');
  } else {
    console.log(`[auth] Neon Auth JWT verification enabled; Postgres driver: ${DATABASE_DRIVER}.`);
  }

  // Long-running server (local dev, Docker, Cloud Run with min instances): run the social publish
  // scheduler in-process every minute. On Neon Functions the neon.ts trigger does this instead.
  // PUBLISH_SCHEDULER=off disables it (e.g. when an external cron calls /api/internal/publish-due).
  if (!DEMO_MODE && AUTH_CONFIGURED && process.env.PUBLISH_SCHEDULER !== 'off') {
    const { publishDue } = await import('./server/social/service');
    const { refreshProcessingVideos } = await import('./server/media/service');
    let running = false;
    setInterval(() => {
      if (running) return;
      running = true;
      publishDue()
        .then((o) => o.checked && console.log(`[social] scheduler: ${o.published} published, ${o.failed} failed`))
        .catch((err) => console.error('[social] scheduler failed:', (err as Error).message))
        .then(() => refreshProcessingVideos())
        .catch((err) => console.error('[media] video refresh failed:', (err as Error).message))
        .finally(() => (running = false));
    }, 60_000).unref();
  }

  const server: Server = app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `Launchpad server listening on port ${PORT} (AI default: ${serverDefaultProvider() ?? 'none, sample output'})`,
    );
  });
  // Slightly above typical load-balancer idle timeouts so keep-alive sockets are not cut mid-request.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  let closing = false;
  const shutdown = (signal: string) => {
    if (closing) return;
    closing = true;
    setShuttingDown();
    console.log(`[process] ${signal} received: draining connections`);
    server.close(() => {
      closeDb()
        .catch(() => undefined)
        .finally(() => {
          console.log('[process] shutdown complete');
          process.exit(0);
        });
    });
    server.closeIdleConnections?.();
    setTimeout(() => {
      console.error('[process] forced exit after 10s drain timeout');
      process.exit(1);
    }, 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[process] failed to start', err);
  process.exit(1);
});
