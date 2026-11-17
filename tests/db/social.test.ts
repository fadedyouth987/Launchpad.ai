// LinkedIn publishing against Postgres: server-side approval, publish now, never-twice, scheduler.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/app';
import { closeDb, db } from '../../server/db';
import { saveAccount, publishDue } from '../../server/social/service';
import { initialCampaignAssets } from '../../src/data/initialData';
import { addMember, as as asUser, createUser, type TestUser } from './helpers';

vi.stubEnv('AI_KEYS_ENCRYPTION_KEY', 'b'.repeat(64));
vi.stubEnv('LINKEDIN_CLIENT_ID', 'cid');
vi.stubEnv('LINKEDIN_CLIENT_SECRET', 'csecret');
vi.stubEnv('LINKEDIN_REDIRECT_URI', 'https://api.example.com/api/social/linkedin/callback');
vi.stubEnv('CRON_SECRET', 'test-cron-secret-123456');

let postCount = 0;
let failNext = false;
const linkedinFetch = (async (url: string | URL) => {
  if (String(url).endsWith('/rest/posts')) {
    if (failNext) {
      failNext = false;
      return Response.json({ message: 'boom' }, { status: 500 });
    }
    postCount++;
    return new Response(null, { status: 201, headers: { 'x-restli-id': `urn:li:share:${postCount}` } });
  }
  return Response.json({});
}) as typeof fetch;

const app = createApp({ ai: null, socialFetch: linkedinFetch });
const as = (u: TestUser) => asUser(app, u);
let owner: TestUser, creator: TestUser, approver: TestUser;
let WS: string;

const asset = (id: string, extra: Record<string, unknown> = {}) => ({
  ...structuredClone(initialCampaignAssets[0]),
  id,
  platform: 'linkedin',
  imageId: undefined,
  ...extra,
});
const put = (u: TestUser, a: ReturnType<typeof asset>) =>
  as(u).put(`/api/workspaces/${WS}/campaign-assets/${a.id}`).send(a);
const statusOf = async (id: string) =>
  (await db().query("SELECT data->>'status' AS s FROM campaign_assets WHERE id = $1", [id])).rows[0]?.s;

beforeAll(async () => {
  [owner, creator, approver] = await Promise.all(['owner', 'creator', 'approver'].map((l) => createUser(`soc-${l}`)));
  WS = (await as(owner).post('/api/workspaces').send({ name: 'Social Co' })).body.workspace.id;
  await addMember(WS, creator.uid, 'creator');
  await addMember(WS, approver.uid, 'approver');
});
afterAll(() => closeDb());

describe('server-side approval', () => {
  it('creators cannot approve or schedule; approvers can; writers can reschedule an approved post', async () => {
    const id = `asset-soc-${Date.now()}-a`;
    expect((await put(creator, asset(id, { status: 'pending_review' }))).status).toBe(201);
    const denied = await put(creator, asset(id, { status: 'scheduled', scheduledTime: new Date().toISOString() }));
    expect(denied.status).toBe(403);
    expect(denied.body.error).toBe('APPROVAL_REQUIRED');
    expect((await put(creator, asset(`${id}-new`, { status: 'approved' }))).status).toBe(403);
    expect((await put(approver, asset(id, { status: 'approved' }))).status).toBe(200);
    expect(
      (await put(creator, asset(id, { status: 'scheduled', scheduledTime: '2030-01-01T09:00:00.000Z' }))).status,
    ).toBe(200);
  });
});

describe('LinkedIn publishing', () => {
  beforeAll(async () => {
    await saveAccount({
      workspaceId: WS,
      provider: 'linkedin',
      externalId: 'member123',
      displayName: 'Test Member',
      avatarUrl: '',
      accessToken: 'tok',
      expiresInSec: 3600,
      uid: owner.uid,
    });
  });

  it('lists the account without the token', async () => {
    const r = await as(creator).get(`/api/workspaces/${WS}/social/accounts`);
    expect(r.body.available.linkedin).toBe(true);
    expect(r.body.accounts[0]).toMatchObject({ provider: 'linkedin', displayName: 'Test Member', expired: false });
    expect(JSON.stringify(r.body)).not.toContain('tok');
    const raw = (await db().query('SELECT token_ciphertext FROM social_accounts WHERE workspace_id = $1', [WS]))
      .rows[0];
    expect(raw.token_ciphertext).toMatch(/^v1\./);
  });

  it('publish now: approvers only, approved posts only, and never twice', async () => {
    const id = `asset-soc-${Date.now()}-p`;
    await put(owner, asset(id, { status: 'pending_review' }));
    expect((await as(creator).post(`/api/workspaces/${WS}/campaign-assets/${id}/publish`)).status).toBe(403);
    const notApproved = await as(owner).post(`/api/workspaces/${WS}/campaign-assets/${id}/publish`);
    expect(notApproved.body.error).toBe('NOT_APPROVED');
    await put(owner, asset(id, { status: 'approved' }));
    const before = postCount;
    const ok = await as(approver).post(`/api/workspaces/${WS}/campaign-assets/${id}/publish`);
    expect(ok.status).toBe(200);
    expect(ok.body.url).toMatch(/^https:\/\/www\.linkedin\.com\/feed\/update\/urn:li:share:/);
    expect(await statusOf(id)).toBe('published');
    const again = await as(owner).post(`/api/workspaces/${WS}/campaign-assets/${id}/publish`);
    expect(again.body.error).toBe('ALREADY_PUBLISHED');
    expect(postCount).toBe(before + 1);
  });

  it('a failed post is recorded and can be retried by hand', async () => {
    const id = `asset-soc-${Date.now()}-f`;
    await put(owner, asset(id, { status: 'approved' }));
    failNext = true;
    const fail = await as(owner).post(`/api/workspaces/${WS}/campaign-assets/${id}/publish`);
    expect(fail.status).toBe(502);
    expect(fail.body.status).toBe('failed');
    const posts = (await as(creator).get(`/api/workspaces/${WS}/social/posts`)).body.posts;
    expect(posts.find((p: { assetId: string }) => p.assetId === id)).toMatchObject({ status: 'failed' });
    const retry = await as(owner).post(`/api/workspaces/${WS}/campaign-assets/${id}/publish`);
    expect(retry.status).toBe(200);
    expect(
      (await as(creator).get(`/api/workspaces/${WS}/social/posts`)).body.posts.find(
        (p: { assetId: string }) => p.assetId === id,
      ),
    ).toMatchObject({
      status: 'published',
      attempts: 2,
    });
  });

  it('the scheduler posts due scheduled posts once, skips future ones, and concurrent runs do not double-post', async () => {
    const due = `asset-soc-${Date.now()}-due`;
    const later = `asset-soc-${Date.now()}-later`;
    await put(owner, asset(due, { status: 'scheduled', scheduledTime: new Date(Date.now() - 60_000).toISOString() }));
    await put(
      owner,
      asset(later, { status: 'scheduled', scheduledTime: new Date(Date.now() + 3_600_000).toISOString() }),
    );
    const before = postCount;
    const runs = await Promise.all([
      publishDue({ fetchImpl: linkedinFetch }),
      publishDue({ fetchImpl: linkedinFetch }),
    ]);
    expect(runs.reduce((n, r) => n + r.published, 0)).toBe(1);
    expect(postCount).toBe(before + 1);
    expect(await statusOf(due)).toBe('published');
    expect(await statusOf(later)).toBe('scheduled');
    // The HTTP endpoint needs the cron secret.
    expect((await request(app).post('/api/internal/publish-due')).status).toBe(401);
    const ok = await request(app)
      .post('/api/internal/publish-due')
      .set('authorization', 'Bearer test-cron-secret-123456');
    expect(ok.body.success).toBe(true);
  });

  it('owners can disconnect; creators cannot', async () => {
    const acc = (await as(owner).get(`/api/workspaces/${WS}/social/accounts`)).body.accounts[0];
    expect((await as(creator).delete(`/api/workspaces/${WS}/social/accounts/${acc.id}`)).status).toBe(403);
    expect((await as(owner).delete(`/api/workspaces/${WS}/social/accounts/${acc.id}`)).status).toBe(200);
    expect((await as(owner).get(`/api/workspaces/${WS}/social/accounts`)).body.accounts).toEqual([]);
  });
});
