// Replaces the old Firestore rules tests: the browser has no database access at all now, so every
// rule lives in the API. Covers JWT verification edge cases, campaign assets (previously written
// directly by the browser), viewer restrictions and tenant isolation.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { SignJWT, generateKeyPair } from 'jose';
import { createApp } from '../../server/app';
import { closeDb, db } from '../../server/db';
import { addMember, as as asUser, createUser, type TestUser } from './helpers';
import { initialAIInfluencers, initialCampaignAssets } from '../../src/data/initialData';

// The sandbox resolves every public hostname to 198.18.0.1 (blocked as non-public, correctly), so
// for one fixed hostname pretend DNS returned a public address. Everything else uses the real check.
vi.mock('../../server/urlSafety', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../server/urlSafety')>();
  return {
    ...real,
    checkWebhookUrl: async (url: string) =>
      url.startsWith('https://example.com/')
        ? { ok: true, url: new URL(url), addresses: ['93.184.215.14'] }
        : real.checkWebhookUrl(url),
  };
});

const app = createApp({ ai: null });
const as = (u: TestUser) => asUser(app, u);
let owner: TestUser, creator: TestUser, viewer: TestUser, outsider: TestUser;
let WS: string;
const asset = (id: string, extra: Record<string, unknown> = {}) => ({
  ...structuredClone(initialCampaignAssets[0]),
  id,
  ...extra,
});
const A1 = `asset-${Date.now()}-1`;
const A2 = `asset-${Date.now()}-2`;

beforeAll(async () => {
  [owner, creator, viewer, outsider] = await Promise.all(
    ['owner', 'creator', 'viewer', 'outsider'].map((l) => createUser(`acc-${l}`)),
  );
  const r = await as(owner).post('/api/workspaces').send({ name: 'Access Co' });
  expect(r.status).toBe(201);
  WS = r.body.workspace.id;
  await addMember(WS, creator.uid, 'creator');
  await addMember(WS, viewer.uid, 'viewer');
});
afterAll(() => closeDb());

describe('JWT verification', () => {
  const origin = () => new URL(process.env.NEON_AUTH_BASE_URL as string).origin;
  const forge = async (claims: Record<string, unknown>, opts: { iss?: string; aud?: string; exp?: string } = {}) => {
    const { privateKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
    return new SignJWT(claims)
      .setProtectedHeader({ alg: 'EdDSA', kid: 'attacker' })
      .setSubject(owner.uid)
      .setIssuer(opts.iss ?? origin())
      .setAudience(opts.aud ?? origin())
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? '10m')
      .sign(privateKey);
  };
  it('rejects a token signed with a key that is not in the Neon Auth JWKS', async () => {
    const token = await forge({});
    expect((await request(app).get('/api/me/workspaces').set('authorization', `Bearer ${token}`)).status).toBe(401);
  });
  it('rejects alg=none and tampered tokens', async () => {
    const [h, p] = owner.token.split('.');
    const none = `${Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')}.${p}.`;
    expect((await request(app).get('/api/me/workspaces').set('authorization', `Bearer ${none}`)).status).toBe(401);
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    const tampered = `${h}.${Buffer.from(JSON.stringify({ ...payload, sub: outsider.uid })).toString('base64url')}.${owner.token.split('.')[2]}`;
    expect((await request(app).get('/api/me/workspaces').set('authorization', `Bearer ${tampered}`)).status).toBe(401);
  });
  it('accepts the genuine token', async () => {
    expect((await as(owner).get('/api/me/workspaces')).status).toBe(200);
  });
});

describe('campaign assets (API-owned, previously Firestore rules)', () => {
  it('writers create; viewers and outsiders cannot', async () => {
    expect((await as(creator).put(`/api/workspaces/${WS}/campaign-assets/${A1}`).send(asset(A1))).status).toBe(201);
    expect((await as(viewer).put(`/api/workspaces/${WS}/campaign-assets/${A2}`).send(asset(A2))).status).toBe(403);
    expect((await as(outsider).put(`/api/workspaces/${WS}/campaign-assets/${A2}`).send(asset(A2))).status).toBe(403);
    const row = await db().query('SELECT user_id, workspace_id FROM campaign_assets WHERE id = $1', [A1]);
    expect(row.rows[0]).toEqual({ user_id: creator.uid, workspace_id: WS });
  });
  it('members (incl. viewers) read; outsiders cannot', async () => {
    const list = await as(viewer).get(`/api/workspaces/${WS}/campaign-assets`);
    expect(list.status).toBe(200);
    expect(list.body.assets.map((a: { id: string }) => a.id)).toContain(A1);
    expect((await as(outsider).get(`/api/workspaces/${WS}/campaign-assets`)).status).toBe(403);
  });
  it('edits keep the creator and workspace; forged ownership fields are ignored', async () => {
    const r = await as(owner)
      .put(`/api/workspaces/${WS}/campaign-assets/${A1}`)
      .send(asset(A1, { title: 'Edited', userId: outsider.uid, createdAt: '1999-01-01' }));
    expect(r.status).toBe(200);
    const row = await db().query('SELECT user_id, data FROM campaign_assets WHERE id = $1', [A1]);
    expect(row.rows[0].user_id).toBe(creator.uid);
    expect(row.rows[0].data.title).toBe('Edited');
    expect(row.rows[0].data.userId).toBeUndefined();
  });
  it('an id from another workspace cannot be hijacked', async () => {
    const other = await as(outsider).post('/api/workspaces').send({ name: 'Other' });
    const r = await as(outsider)
      .put(`/api/workspaces/${other.body.workspace.id}/campaign-assets/${A1}`)
      .send(asset(A1));
    expect(r.status).toBe(409);
  });
  it('rejects invalid fields', async () => {
    const bad = asset(A2, { platform: 'myspace' });
    expect((await as(owner).put(`/api/workspaces/${WS}/campaign-assets/${A2}`).send(bad)).status).toBe(400);
    const extra = asset(A2, { creditsRemaining: 1e6 });
    expect((await as(owner).put(`/api/workspaces/${WS}/campaign-assets/${A2}`).send(extra)).status).toBe(400);
  });
  it('delete: creator or owner/admin only', async () => {
    expect((await as(owner).put(`/api/workspaces/${WS}/campaign-assets/${A2}`).send(asset(A2))).status).toBe(201);
    expect((await as(creator).delete(`/api/workspaces/${WS}/campaign-assets/${A2}`)).status).toBe(403);
    expect((await as(viewer).delete(`/api/workspaces/${WS}/campaign-assets/${A1}`)).status).toBe(403);
    expect((await as(creator).delete(`/api/workspaces/${WS}/campaign-assets/${A1}`)).status).toBe(200);
    expect((await as(owner).delete(`/api/workspaces/${WS}/campaign-assets/${A2}`)).status).toBe(200);
    expect((await as(owner).delete(`/api/workspaces/${WS}/campaign-assets/${A2}`)).status).toBe(404);
  });
});

describe('viewer and role restrictions', () => {
  it('viewers cannot edit influencers, Campaign OS, webhooks or legal hold', async () => {
    const state = { campaigns: [], agents: [], leads: [], pages: [], emails: [], clients: [] };
    expect((await as(viewer).put(`/api/workspaces/${WS}/campaign-os`).send({ state })).status).toBe(403);
    expect(
      (await as(viewer).post('/api/webhooks/endpoints').send({ workspaceId: WS, url: 'https://example.com/h' })).status,
    ).toBe(403);
    expect(
      (await as(creator).post('/api/webhooks/endpoints').send({ workspaceId: WS, url: 'https://example.com/h' }))
        .status,
    ).toBe(403);
    expect(
      (await as(viewer).put(`/api/workspaces/${WS}/members/${creator.uid}/role`).send({ role: 'admin' })).status,
    ).toBe(403);
    expect((await as(viewer).get(`/api/workspaces/${WS}/export`)).status).toBe(403);
    const inf = { ...structuredClone(initialAIInfluencers[0]), id: `inf-viewer-${Date.now()}`, workspaceId: WS };
    expect((await as(viewer).put(`/api/workspaces/${WS}/influencers/${inf.id}`).send(inf)).status).toBe(403);
    expect((await as(viewer).put(`/api/workspaces/${WS}/legal-hold`).send({ active: true })).status).toBe(403);
    expect((await as(creator).put(`/api/workspaces/${WS}/legal-hold`).send({ active: true })).status).toBe(403);
  });
  it('owner creates a webhook: secret returned once, stored separately, never listed', async () => {
    const r = await as(owner)
      .post('/api/webhooks/endpoints')
      .send({ workspaceId: WS, url: 'https://example.com/hook', description: 'test' });
    expect(r.status).toBe(201);
    expect(r.body.secret).toMatch(/^whsec_/);
    const list = await as(viewer).get('/api/webhooks/endpoints').set('x-workspace-id', WS);
    expect(JSON.stringify(list.body)).not.toContain(r.body.secret);
    const stored = await db().query('SELECT secret FROM webhook_secrets WHERE endpoint_id = $1', [r.body.endpoint.id]);
    expect(stored.rows[0].secret).toBe(r.body.secret);
    // SSRF guard still applies.
    const ssrf = await as(owner)
      .post('/api/webhooks/endpoints')
      .send({ workspaceId: WS, url: 'http://169.254.169.254/' });
    expect(ssrf.status).toBe(400);
  });
});
