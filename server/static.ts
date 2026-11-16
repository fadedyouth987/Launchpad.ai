import express from 'express';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Serves the built client from `publicDir` (dist/public). Only the Vite output lives there, so the
 * server bundle and its source map (dist/server.cjs*) are never reachable over HTTP.
 *
 * Caching: hashed files under /assets are immutable for a year; index.html and other top-level files
 * are revalidated on every load so a deploy takes effect immediately.
 */
export function serveClient(app: express.Express, publicDir: string) {
  const indexHtml = path.join(publicDir, 'index.html');
  if (!fs.existsSync(indexHtml)) {
    throw new Error(`Client build not found at ${indexHtml}. Run "npm run build" first.`);
  }
  app.use(
    express.static(publicDir, {
      index: false,
      dotfiles: 'ignore',
      setHeaders(res, filePath) {
        const rel = path.relative(publicDir, filePath).split(path.sep).join('/');
        res.setHeader('Cache-Control', rel.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    }),
  );
  // SPA fallback for page URLs only; /api has its own JSON 404 and missing assets stay 404.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/assets/') || path.extname(req.path)) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexHtml);
  });
  app.use((req, res) => res.status(404).type('text/plain').send('Not found'));
}
