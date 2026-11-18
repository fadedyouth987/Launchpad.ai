// Real-mode tests against Postgres + Neon Auth on the Neon test branch: JWT auth, transactional
// credits, refunds, persistence and GDPR erase. Run with: npm run test:db
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/app';
import { closeDb, db } from '../../server/db';
import { AUTH_CONFIGURED } from '../../server/auth';
import { addMember, as as asUser, balanceOf, createUser, signIn, type TestUser } from './helpers';
import { reserveCredits } from '../../server/credits';
import { initialAIInfluencers } from '../../src/data/initialData';
import type { AiClient } from '../../server/ai';

const failingAi: AiClient = {
  models: {
    generateContent: async () => {
      throw new Error('upstream down');
    },
  },
};
const app = createApp({ ai: failingAi });

let alice: TestUser;
let mallory: TestUser;
const WS = `ws-pg-${Date.now()}`;
const INF = `inf-pg-${Date.now()}`;

beforeAll(async () => {
  expect(AUTH_CONFIGURED).toBe(true);
  alice = await createUser('alice');
  mallory = await createUser('mallory');
  await db().query(
    `INSERT INTO workspaces (id, name, slug, owner_id, credits_remaining, total_credits_allocated)
     VALUES ($1, 'Emu', 'emu', $2, 100, 100)`,
    [WS, alice.uid],
  );
  await addMember(WS, alice.uid, 'owner');
  await db().query(
    `INSERT INTO ledger_entries (id, workspace_id, user_id, type, amount_credits, resulting_balance)
     VALUES ($1, $2, 'test', 'grant', 100, 100)`,
    [`grant-${WS}`, WS],
  );
});
afterAll(() => closeDb());

const as = (who: TestUser) => asUser(app, who);

describe('real mode (Postgres + Neon Auth)', () => {
  it('requires a valid Neon Auth JWT', async () => {
    expect((await request(app).get('/api/me/workspaces')).status).toBe(401);
    expect((await request(app).get('/api/me/workspaces').set('authorization', 'Bearer not-a-token')).status).toBe(401);
    const me = await as(alice).get('/api/me/workspaces');
    expect(me.status).toBe(200);
    expect(me.body.workspaces.map((w: { id: string }) => w.id)).toContain(WS);
    // Member names come from Neon Auth's user table.
    const ws = me.body.workspaces.find((w: { id: string }) => w.id === WS);
    expect(ws.members[0]).toMatchObject({ id: alice.uid, name: alice.name, email: alice.email, role: 'owner' });
    // Signing in again issues a fresh token that also works.
    const again = await signIn(alice.email);
    expect((await as({ ...alice, token: again }).get('/api/me/workspaces')).status).toBe(200);
  });

  it('isolates tenants', async () => {
    expect((await as(mallory).get('/api/me/workspaces')).body.workspaces).toEqual([]);
    expect((await as(mallory).get('/api/billing/ledger').set('x-workspace-id', WS)).status).toBe(403);
    expect((await as(mallory).post('/api/generate').send({ workspaceId: WS, prompt: 'x' })).status).toBe(403);
    expect((await as(mallory).get(`/api/workspaces/${WS}/export`)).status).toBe(403);
  });

  it('refunds in Postgres when the AI fails', async () => {
    const r = await as(alice).post('/api/generate').send({ workspaceId: WS, prompt: 'Launch' });
    expect(r.status).toBe(502);
    expect(r.body).toMatchObject({ refunded: true, newBalance: 100 });
    const ledger = await as(alice).get('/api/billing/ledger').set('x-workspace-id', WS);
    expect(ledger.body.entries.slice(0, 2).map((e: { type: string }) => e.type)).toEqual(['refund', 'reservation']);
    expect(await balanceOf(WS)).toBe(100);
  });

  it('never oversells credits under concurrent reservations (transactions)', async () => {
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => reserveCredits(alice.uid, WS, 15)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(6); // 6 x 15 = 90 <= 100
    expect(await balanceOf(WS)).toBe(10);
  });

  it('persists influencers, Campaign OS and audit entries; erase removes data but keeps ledger/audit', async () => {
    const inf = { ...initialAIInfluencers[0], id: INF };
    expect((await as(alice).put(`/api/workspaces/${WS}/influencers/${INF}`).send(inf)).status).toBe(201);
    const state = { campaigns: [], agents: [], leads: [], pages: [], emails: [], clients: [] };
    expect((await as(alice).put(`/api/workspaces/${WS}/campaign-os`).send({ state })).status).toBe(200);
    expect((await as(alice).get(`/api/workspaces/${WS}/campaign-os`)).body.state).toEqual(state);
    expect((await db().query('SELECT 1 FROM influencers WHERE id = $1', [INF])).rowCount).toBe(1);

    const audit = await as(alice).get(`/api/workspaces/${WS}/audit-logs`);
    expect(audit.body.entries[0]).toMatchObject({ action: 'ai.influencer.create' });
    expect(audit.body.entries[0].actor).toBe(alice.name);

    // Voice/video media, cloned voices, a connected social account + its history, and an API key.
    const tag = `${Date.now()}`;
    const keyId = randomUUID();
    await db().query(
      `INSERT INTO generated_media (id, workspace_id, user_id, kind, status, provider, mime_type, data)
       VALUES ($1, $2, $3, 'audio', 'ready', 'elevenlabs', 'audio/mpeg', '\\x00')`,
      [`med-gdpr-${tag}`, WS, alice.uid],
    );
    await db().query(
      `INSERT INTO workspace_voices (workspace_id, voice_id, name, consent_by) VALUES ($1, $2, 'Voice', $3)`,
      [WS, `gdpr-voice-${tag}`, alice.uid],
    );
    await db().query(
      `INSERT INTO social_accounts (id, workspace_id, provider, external_id, token_ciphertext, connected_by)
       VALUES ($1, $2, 'linkedin', 'member-gdpr', 'v1.x', $3)`,
      [`soc-gdpr-${tag}`, WS, alice.uid],
    );
    await db().query(
      `INSERT INTO social_posts (id, workspace_id, asset_id, provider, account_external_id, status, requested_by)
       VALUES ($1, $2, $3, 'linkedin', 'member-gdpr', 'published', $4)`,
      [`post-gdpr-${tag}`, WS, `asset-gdpr-${tag}`, alice.uid],
    );
    await db().query(
      `INSERT INTO api_keys (id, workspace_id, name, prefix, key_hash, scopes, created_by)
       VALUES ($1, $2, 'Zapier', 'lp_live_abcd', $3, ARRAY['write'], $4)`,
      [keyId, WS, 'a'.repeat(64 - tag.length) + tag, alice.uid],
    );
    await addMember(WS, `apikey_${keyId}`, 'creator');

    expect((await as(alice).post(`/api/workspaces/${WS}/erase`).send({ confirmSlug: 'emu' })).status).toBe(200);
    for (const table of ['generated_media', 'workspace_voices', 'social_accounts', 'social_posts']) {
      expect((await db().query(`SELECT 1 FROM ${table} WHERE workspace_id = $1`, [WS])).rowCount, table).toBe(0);
    }
    expect(
      (await db().query('SELECT 1 FROM api_keys WHERE id = $1 AND revoked_at IS NOT NULL', [keyId])).rowCount,
    ).toBe(1);
    expect((await db().query('SELECT 1 FROM workspace_members WHERE user_id = $1', [`apikey_${keyId}`])).rowCount).toBe(
      0,
    );
    expect((await db().query('SELECT 1 FROM influencers WHERE id = $1', [INF])).rowCount).toBe(0);
    expect((await db().query('SELECT 1 FROM campaign_os_states WHERE workspace_id = $1', [WS])).rowCount).toBe(0);
    expect((await db().query('SELECT 1 FROM ledger_entries WHERE workspace_id = $1', [WS])).rowCount).toBeGreaterThan(
      0,
    );
    const after = await as(alice).get(`/api/workspaces/${WS}/audit-logs`);
    expect(after.body.entries[0]).toMatchObject({ action: 'gdpr.workspace.erase', securitySeverity: 'critical' });
  });

  it('member roles: only owner/admin can change them', async () => {
    await addMember(WS, mallory.uid, 'creator');
    expect(
      (await as(mallory).put(`/api/workspaces/${WS}/members/${alice.uid}/role`).send({ role: 'viewer' })).status,
    ).toBe(403);
    expect(
      (await as(alice).put(`/api/workspaces/${WS}/members/${mallory.uid}/role`).send({ role: 'approver' })).status,
    ).toBe(200);
    expect(
      (await as(alice).put(`/api/workspaces/${WS}/members/${alice.uid}/role`).send({ role: 'viewer' })).status,
    ).toBe(400);
    expect((await as(mallory).post(`/api/workspaces/${WS}/erase`).send({ confirmSlug: 'emu' })).status).toBe(403);
    const ws = (await as(alice).get('/api/me/workspaces')).body.workspaces.find((w: { id: string }) => w.id === WS);
    expect(ws.members.find((m: { id: string }) => m.id === mallory.uid).role).toBe('approver');
  });
});
