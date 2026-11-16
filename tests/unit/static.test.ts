// Production static serving: only the client build is public; caching headers.
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { serveClient } from '../../server/static';

describe('serveClient', () => {
  let dist: string;
  let app: express.Express;
  beforeAll(() => {
    dist = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-dist-'));
    fs.mkdirSync(path.join(dist, 'public', 'assets'), { recursive: true });
    fs.writeFileSync(path.join(dist, 'public', 'index.html'), '<html>app</html>');
    fs.writeFileSync(path.join(dist, 'public', 'assets', 'index-abc.js'), 'console.log(1)');
    fs.writeFileSync(path.join(dist, 'server.cjs'), 'SECRET_SERVER_CODE');
    fs.writeFileSync(path.join(dist, 'server.cjs.map'), 'SECRET_MAP');
    app = express();
    app.get('/api/x', (_q, s) => s.json({ ok: true }));
    serveClient(app, path.join(dist, 'public'));
  });
  afterAll(() => fs.rmSync(dist, { recursive: true, force: true }));

  it('never serves the server bundle or its source map', async () => {
    for (const p of ['/server.cjs', '/server.cjs.map', '/../server.cjs', '/%2e%2e/server.cjs']) {
      const r = await request(app).get(p);
      expect(r.text).not.toMatch(/SECRET/);
    }
  });
  it('long-caches hashed assets and revalidates the HTML shell', async () => {
    const a = await request(app).get('/assets/index-abc.js');
    expect(a.status).toBe(200);
    expect(a.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    const page = await request(app).get('/dashboard/settings');
    expect(page.status).toBe(200);
    expect(page.text).toContain('app');
    expect(page.headers['cache-control']).toBe('no-cache');
  });
  it('returns 404 (not the SPA) for missing assets', async () => {
    expect((await request(app).get('/assets/missing.js')).status).toBe(404);
  });
});
