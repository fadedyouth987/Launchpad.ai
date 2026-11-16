// Influencers, Campaign OS, audit log, GDPR, legal hold, webhooks.
import { describe, expect, it } from 'vitest';
import { api, WS } from './helpers';
import { initialAIInfluencers } from '../../src/data/initialData';

const emptyOs = { campaigns: [], agents: [], leads: [], pages: [], emails: [], clients: [] };

describe('workspace data API', () => {
  it('influencers: list, create (audited), validate, scope to workspace', async () => {
    const a = api();
    const list = await a.get(`/api/workspaces/${WS}/influencers`);
    expect(list.body.influencers.length).toBeGreaterThan(0);
    const inf = { ...initialAIInfluencers[0], id: 'inf-test-1', name: 'Test Persona' };
    const created = await a.put(`/api/workspaces/${WS}/influencers/inf-test-1`).send(inf);
    expect(created.status).toBe(201);
    const again = await a.put(`/api/workspaces/${WS}/influencers/inf-test-1`).send({ ...inf, locked: !inf.locked });
    expect(again.status).toBe(200);
    expect((await a.put(`/api/workspaces/${WS}/influencers/other-id`).send(inf)).status).toBe(400); // id mismatch
    expect(
      (await a.put(`/api/workspaces/${WS}/influencers/inf-test-1`).send({ ...inf, avatarUrl: 'javascript:alert(1)' }))
        .status,
    ).toBe(400);
    expect((await a.put(`/api/workspaces/${WS}/influencers/inf-test-1`).send({ ...inf, isAdmin: true })).status).toBe(
      400,
    );
    expect((await a.get('/api/workspaces/ws-not-mine/influencers')).status).toBe(403);
    const audit = await a.get(`/api/workspaces/${WS}/audit-logs`);
    expect(audit.body.entries[0]).toMatchObject({ action: 'ai.influencer.create' });
  });

  it('Campaign OS: rejects invalid shapes, round-trips valid state per workspace', async () => {
    const a = api();
    expect((await a.get(`/api/workspaces/${WS}/campaign-os`)).body.state).toBeNull();
    expect((await a.put(`/api/workspaces/${WS}/campaign-os`).send({ state: { campaigns: 'bad' } })).status).toBe(400);
    const state = {
      ...emptyOs,
      leads: [{ id: 'l1', name: 'A', email: 'a@x.co', company: 'C', stage: 'New', score: 50, source: 'Manual' }],
    };
    expect((await a.put(`/api/workspaces/${WS}/campaign-os`).send({ state })).status).toBe(200);
    expect((await a.get(`/api/workspaces/${WS}/campaign-os`)).body.state).toEqual(state);
    expect((await a.get('/api/workspaces/ws-vantory-agency/campaign-os')).body.state).toBeNull();
  });

  it('audit log: server stamps actor/time; clients cannot write critical entries', async () => {
    const a = api();
    expect(
      (await a.post(`/api/workspaces/${WS}/audit-logs`).send({ action: 'x.y', details: 'd', severity: 'critical' }))
        .status,
    ).toBe(400);
    expect(
      (await a.post(`/api/workspaces/${WS}/audit-logs`).send({ action: 'Bad Action!', details: 'd' })).status,
    ).toBe(400);
    const ok = await a
      .post(`/api/workspaces/${WS}/audit-logs`)
      .send({ action: 'asset.status.approved', details: 'Approved X', actor: 'CEO' });
    expect(ok.status).toBe(400); // unknown field "actor" rejected: actor is always server-set
    const ok2 = await a
      .post(`/api/workspaces/${WS}/audit-logs`)
      .send({ action: 'asset.status.approved', details: 'Approved X' });
    expect(ok2.status).toBe(201);
    expect(ok2.body.entry).toMatchObject({ actor: 'Demo user', securitySeverity: 'info' });
  });

  it('GDPR: export, legal hold blocks erase, slug confirmation, erase deletes data but keeps ledger/audit', async () => {
    const a = api();
    const exp = await a.get(`/api/workspaces/${WS}/export`);
    expect(exp.status).toBe(200);
    expect(exp.headers['content-disposition']).toMatch(/attachment/);
    expect(exp.body.format).toBe('launchpad-workspace-export/v1');
    expect(JSON.stringify(exp.body)).not.toMatch(/whsec_[A-Za-z0-9_-]{20,}/); // no full secrets
    await a.put(`/api/workspaces/${WS}/legal-hold`).send({ active: true }).expect(200);
    const slug = (await a.get('/api/me/workspaces')).body.workspaces.find((w: { id: string }) => w.id === WS).slug;
    expect((await a.post(`/api/workspaces/${WS}/erase`).send({ confirmSlug: slug })).status).toBe(409);
    await a.put(`/api/workspaces/${WS}/legal-hold`).send({ active: false }).expect(200);
    expect((await a.post(`/api/workspaces/${WS}/erase`).send({ confirmSlug: 'nope' })).status).toBe(400);
    const erased = await a.post(`/api/workspaces/${WS}/erase`).send({ confirmSlug: slug });
    expect(erased.status).toBe(200);
    expect((await a.get(`/api/workspaces/${WS}/influencers`)).body.influencers).toEqual([]);
    expect((await a.get('/api/webhooks/endpoints').set('x-workspace-id', WS)).body.endpoints).toEqual([]);
    expect((await a.get('/api/billing/ledger').set('x-workspace-id', WS)).body.entries.length).toBeGreaterThan(0);
    expect((await a.get(`/api/workspaces/${WS}/audit-logs`)).body.entries[0]).toMatchObject({
      action: 'gdpr.workspace.erase',
      securitySeverity: 'critical',
    });
  });
});

describe('webhooks API', () => {
  it('blocks private/loopback/metadata targets with 403', async () => {
    const a = api();
    for (const url of [
      'http://localhost/',
      'http://169.254.169.254/latest',
      'http://[::ffff:127.0.0.1]/',
      'ftp://example.com/',
    ]) {
      const r = await a.post('/api/webhooks/deliver').set('x-workspace-id', WS).send({ url });
      expect(r.status, url).toBe(403);
      expect(r.body.status).toBe('blocked_ssrf');
    }
  });

  it('simulates delivery to a public IP by default (nothing sent)', async () => {
    const r = await api()
      .post('/api/webhooks/deliver')
      .set('x-workspace-id', WS)
      .send({ url: 'https://93.184.215.14/hook' });
    expect(r.body).toMatchObject({ success: true, simulated: true });
  });

  it('creates a receiver: secret returned once, never listed, audited', async () => {
    const a = api();
    const created = await a
      .post('/api/webhooks/endpoints')
      .send({ workspaceId: 'ws-vantory-agency', url: 'https://93.184.215.14/in' });
    expect(created.status).toBe(201);
    expect(created.body.secret).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
    expect(created.body.endpoint.secret).toBeUndefined();
    const list = await a.get('/api/webhooks/endpoints').set('x-workspace-id', 'ws-vantory-agency');
    expect(JSON.stringify(list.body)).not.toContain(created.body.secret);
    expect(
      (await a.post('/api/webhooks/endpoints').send({ workspaceId: 'ws-vantory-agency', url: 'http://10.0.0.1/' }))
        .status,
    ).toBe(400);
  });
});

describe('webhook test sends', () => {
  it('need a workspace the caller administers', async () => {
    const r = await api().post('/api/webhooks/deliver').send({ url: 'https://93.184.215.14/hook' });
    expect(r.status).toBe(400);
    const other = await api()
      .post('/api/webhooks/deliver')
      .set('x-workspace-id', 'ws-someone-else')
      .send({ url: 'https://93.184.215.14/hook' });
    expect(other.status).toBe(403);
  });
});
