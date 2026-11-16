// The Neon Functions entry (functions/api.ts) driven through its fetch handler, as the Functions
// runtime calls it: Express behind fetch-to-node, CORS allowlist, JWT auth, Postgres reads/writes.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '../../server/db';
import { createUser, type TestUser } from './helpers';

const WEB = 'https://launchpad-web.nexgen-studio.workers.dev';
let handler: { fetch: (r: Request) => Promise<Response> };
let user: TestUser;
const call = (path: string, init: RequestInit = {}) => handler.fetch(new Request(`https://fn.example${path}`, init));

beforeAll(async () => {
  Object.assign(process.env, { NODE_ENV: 'production', SERVE_STATIC: 'false', ALLOWED_ORIGINS: WEB });
  handler = (await import('../../functions/api')).default;
  user = await createUser('fn');
});
afterAll(() => closeDb());

describe('Neon Functions entry (fetch handler)', () => {
  it('health and readiness (SELECT 1 on Postgres)', async () => {
    const h = await call('/api/health');
    expect(h.status).toBe(200);
    expect(await h.json()).toMatchObject({ auth: 'neon', integrations: { database: true } });
    const r = await call('/api/ready');
    expect(await r.json()).toEqual({ ready: true, database: 'ok' });
    expect(h.headers.get('content-security-policy')).toContain("default-src 'self'");
  });
  it('401 without or with an invalid token', async () => {
    expect((await call('/api/me/workspaces')).status).toBe(401);
    expect((await call('/api/me/workspaces', { headers: { authorization: 'Bearer a.b.c' } })).status).toBe(401);
  });
  it('CORS: the web origin is allowed, others are not', async () => {
    const pre = (origin: string) =>
      call('/api/me/workspaces', {
        method: 'OPTIONS',
        headers: {
          origin,
          'access-control-request-method': 'PUT',
          'access-control-request-headers': 'authorization,content-type',
        },
      });
    const ok = await pre(WEB);
    expect(ok.status).toBe(204);
    expect(ok.headers.get('access-control-allow-origin')).toBe(WEB);
    const bad = await pre('https://evil.example.com');
    expect(bad.headers.get('access-control-allow-origin')).toBeNull();
  });
  it('authenticated write and read through Postgres; JSON body parsing; non-API paths 404', async () => {
    const headers = { authorization: `Bearer ${user.token}`, 'content-type': 'application/json', origin: WEB };
    const created = await call('/api/workspaces', { method: 'POST', headers, body: JSON.stringify({ name: 'Fn Co' }) });
    expect(created.status).toBe(201);
    expect(created.headers.get('access-control-allow-origin')).toBe(WEB);
    const ws = (await created.json()).workspace.id;
    const list = await (await call('/api/me/workspaces', { headers })).json();
    expect(list.workspaces.map((w: { id: string }) => w.id)).toContain(ws);
    const bad = await call('/api/workspaces', { method: 'POST', headers, body: '{not json' });
    expect(bad.status).toBe(400);
    expect((await call('/', { headers })).status).toBe(404);
  });
});
