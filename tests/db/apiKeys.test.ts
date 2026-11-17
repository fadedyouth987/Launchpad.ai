// Workspace API keys against Postgres: create/revoke, permissions, isolation, audit, seats.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/app';
import { closeDb, db } from '../../server/db';
import { initialCampaignAssets } from '../../src/data/initialData';
import { addMember, as as asUser, createUser, type TestUser } from './helpers';

const app = createApp({ ai: null });
const as = (u: TestUser) => asUser(app, u);
const withKey = (key: string) => ({
  get: (p: string) => request(app).get(p).set('authorization', `Bearer ${key}`),
  post: (p: string) => request(app).post(p).set('authorization', `Bearer ${key}`),
  put: (p: string) => request(app).put(p).set('authorization', `Bearer ${key}`),
});
let owner: TestUser, creator: TestUser, other: TestUser;
let WS: string, OTHER: string;
const asset = (id: string, status: string) => ({ ...structuredClone(initialCampaignAssets[0]), id, status });
const makeKey = async (scopes: string[], name = `k-${scopes.join('-')}`) =>
  (await as(owner).post(`/api/workspaces/${WS}/api-keys`).send({ name, scopes })).body;

beforeAll(async () => {
  [owner, creator, other] = await Promise.all(['owner', 'creator', 'other'].map((l) => createUser(`key-${l}`)));
  WS = (await as(owner).post('/api/workspaces').send({ name: 'Keys Co' })).body.workspace.id;
  OTHER = (await as(other).post('/api/workspaces').send({ name: 'Other Keys Co' })).body.workspace.id;
  await addMember(WS, creator.uid, 'creator');
});
afterAll(() => closeDb());

describe('API keys', () => {
  it('only owners/admins create keys; the secret is shown once and only a hash is stored', async () => {
    expect(
      (
        await as(creator)
          .post(`/api/workspaces/${WS}/api-keys`)
          .send({ name: 'x', scopes: ['read'] })
      ).status,
    ).toBe(403);
    const out = await makeKey(['read']);
    expect(out.key).toMatch(/^lp_live_[A-Za-z0-9_-]{40,}$/);
    const list = await as(owner).get(`/api/workspaces/${WS}/api-keys`);
    expect(JSON.stringify(list.body)).not.toContain(out.key);
    const row = (await db().query('SELECT key_hash FROM api_keys WHERE id = $1', [out.apiKey.id])).rows[0];
    expect(row.key_hash).toHaveLength(64);
    const me = await withKey(out.key).get('/api/v1/key');
    expect(me.body.key).toMatchObject({ workspaceId: WS, scopes: ['read'], role: 'viewer' });
  });

  it('a read key can list but not write; it never reaches another workspace or admin endpoints', async () => {
    const { key } = await makeKey(['read'], 'reader');
    expect((await withKey(key).get(`/api/workspaces/${WS}/campaign-assets`)).status).toBe(200);
    expect(
      (await withKey(key).put(`/api/workspaces/${WS}/campaign-assets/a-key-1`).send(asset('a-key-1', 'draft'))).status,
    ).toBe(403);
    expect((await withKey(key).get(`/api/workspaces/${OTHER}/campaign-assets`)).status).toBe(403);
    expect((await withKey(key).get(`/api/workspaces/${WS}/api-keys`)).body.error).toBe('API_KEY_NOT_ALLOWED');
    expect((await withKey(key).post('/api/workspaces').send({ name: 'sneaky' })).body.error).toBe(
      'API_KEY_NOT_ALLOWED',
    );
  });

  it('write can draft but not approve; publish can approve; actions are audited under the key name', async () => {
    const { key: writer } = await makeKey(['read', 'write'], 'Zapier');
    expect(
      (await withKey(writer).put(`/api/workspaces/${WS}/campaign-assets/a-key-2`).send(asset('a-key-2', 'draft')))
        .status,
    ).toBe(201);
    const deny = await withKey(writer)
      .put(`/api/workspaces/${WS}/campaign-assets/a-key-2`)
      .send(asset('a-key-2', 'approved'));
    expect(deny.body.error).toBe('APPROVAL_REQUIRED');
    const { key: publisher } = await makeKey(['publish'], 'Approver bot');
    expect(
      (await withKey(publisher).put(`/api/workspaces/${WS}/campaign-assets/a-key-2`).send(asset('a-key-2', 'approved')))
        .status,
    ).toBe(200);
    await withKey(writer).get(`/api/workspaces/${WS}/campaign-assets`);
    const audit = (await as(owner).get(`/api/workspaces/${WS}/audit-logs`)).body.entries as Array<{ actor: string }>;
    expect(audit.some((e) => e.actor === 'API key "Zapier"' || e.actor === 'API key "Approver bot"')).toBe(true);
  });

  it('keys do not show as team members or use seats; revoking stops the key immediately', async () => {
    const ws = (await as(owner).get('/api/me/workspaces')).body.workspaces.find((w: { id: string }) => w.id === WS);
    expect(ws.members.every((m: { id: string }) => !m.id.startsWith('apikey_'))).toBe(true);
    expect((await as(owner).get(`/api/workspaces/${WS}/invites`)).body.seats.members).toBe(2);
    const { key, apiKey } = await makeKey(['read'], 'temp');
    expect((await withKey(key).get('/api/v1/key')).status).toBe(200);
    expect((await as(owner).delete(`/api/workspaces/${WS}/api-keys/${apiKey.id}`)).status).toBe(200);
    expect((await withKey(key).get('/api/v1/key')).body.error).toBe('INVALID_API_KEY');
    expect((await withKey('lp_live_' + 'x'.repeat(43)).get('/api/v1/key')).status).toBe(401);
  });
});
